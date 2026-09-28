/**
 * League Hub: Commissioner Tools (the website's Commissioner page).
 *
 * Turned on by setting a passcode from the spreadsheet (League Hub → Commissioner passcode). Only a salted
 * SHA-256 fingerprint of the passcode is stored. 10 wrong tries lock the tools for 15 minutes.
 * With the passcode the website can: record a payment (adds a row to the Payments tab), update the ESPN cookies
 * (tested with ESPN before they're saved) and start an update right away.
 */

const LH_MAX_FAILS = 10;
const LH_LOCK_SECONDS = 900;

// Called by the website (google.script.run)
function lhCommish(req) {
  try { return JSON.stringify(lhCommishHandle_(req || {})); }
  catch (e) { lhLog_('Commissioner request failed', e); return JSON.stringify({ ok: false, error: 'Something went wrong. Try again.' }); }
}

function lhCommishHandle_(req) {
  const stored = lhProps_().getProperty('LH_PASS');
  if (!stored) {
    return { ok: false, noPass: true, error: 'Commissioner Tools are off. To turn them on, open the spreadsheet and click League Hub → Commissioner passcode.' };
  }
  const cache = lhCache_();
  const fails = Number(cache.get('LH_FAILS')) || 0;
  if (fails >= LH_MAX_FAILS) return { ok: false, locked: true, error: 'Too many wrong passcodes. Try again in 15 minutes.' };
  if (!lhPassOk_(req.pass, stored)) {
    cache.put('LH_FAILS', String(fails + 1), LH_LOCK_SECONDS);
    return { ok: false, badPass: true, error: 'Wrong passcode.' };
  }
  switch (String(req.action || '')) {
    case 'login': return lhCommishOverview_();
    case 'payment': return lhCommishPayment_(req);
    case 'cookies': return lhCommishCookies_(req.swid, req.s2);
    case 'refresh': {
      const st = lhRefresh_(true);
      return Object.assign(lhCommishOverview_(), { message: st.ok ? 'Updated from ESPN.' : 'The update didn\'t work: ' + (st.message || 'unknown problem') });
    }
    default: return { ok: false, error: 'Unknown request.' };
  }
}

// ===================== Passcode =====================

function lhSetPasscode_(pass) {
  const salt = Utilities.getUuid();
  lhProps_().setProperty('LH_PASS', salt + ':' + lhSha256Hex_(salt + ':' + pass));
  lhCache_().remove('LH_FAILS');
}

function lhPassOk_(pass, stored) {
  if (typeof pass !== 'string' || !pass || pass.length > 200) return false;
  const i = stored.indexOf(':');
  if (i < 0) return false;
  const salt = stored.slice(0, i), hash = stored.slice(i + 1);
  return lhSha256Hex_(salt + ':' + pass) === hash;
}

// ===================== Actions =====================

function lhCommishOverview_() {
  const feed = lhJson_(lhGetFeed()) || {};
  const st = lhStatus_() || {};
  const money = feed.money || null;
  const balance = {};
  if (money) money.teams.forEach(r => { balance[r.id] = r; });
  const payments = lhReadPayments_(feed.teams || [], feed.league ? feed.league.season : null);
  return {
    ok: true,
    league: feed.league ? feed.league.name : '',
    moneyOn: !!money,
    duesUpFront: !!(money && money.duesUpFront),
    teams: (feed.teams || []).map(t => ({
      id: t.id, name: t.name, manager: t.manager,
      balance: balance[t.id] ? balance[t.id].balance : null,
      duesLeft: balance[t.id] ? balance[t.id].duesLeft : null,
      settle: balance[t.id] ? balance[t.id].settle : null,
      owed: balance[t.id] ? balance[t.id].owed : null,
      won: balance[t.id] ? balance[t.id].won : null,
      paid: balance[t.id] ? balance[t.id].paid : null
    })).sort((a, b) => a.name.localeCompare(b.name)),
    payments: payments.list.slice(-15).reverse(),
    unmatched: payments.unmatched.length,
    status: { ok: st.ok !== false, at: st.at || null, problem: st.problem || '', message: st.message || '' },
    cookies: !!lhEspnCookies_()
  };
}

function lhCommishPayment_(req) {
  const feed = lhJson_(lhGetFeed()) || {};
  const team = (feed.teams || []).filter(t => String(t.id) === String(req.team))[0];
  if (!team) return { ok: false, error: 'Pick a team.' };
  const amount = Number(req.amount);
  if (!isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) return { ok: false, error: 'Enter an amount like 100 (paid in) or -250 (paid out).' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'The sheet is busy. Try again in a minute.' };
  try {
    lhAddPayment_(team.name, amount, req.note, feed.league ? feed.league.season : '');
  } finally {
    lock.releaseLock();
  }
  lhRefresh_(true);
  return Object.assign(lhCommishOverview_(), {
    message: 'Recorded ' + (amount > 0 ? team.name + ' paid $' + lhRound_(amount, 2) : '$' + lhRound_(-amount, 2) + ' paid to ' + team.name) + '.'
  });
}

// Tests the new cookies with ESPN first; saves them only if ESPN accepts them
function lhCommishCookies_(swidIn, s2In) {
  const res = lhSaveCookies_(swidIn, s2In);
  if (!res.ok) return res;
  lhRefresh_(true);
  return Object.assign(lhCommishOverview_(), { message: res.message });
}

function lhSaveCookies_(swidIn, s2In) {
  let swid = lhStr_(swidIn), s2 = lhStr_(s2In);
  if (!swid || !s2) return { ok: false, error: 'Paste both SWID and espn_s2.' };
  if (swid.length > 100 || s2.length > 2000 || /\s/.test(swid + s2)) return { ok: false, error: 'Those don\'t look like ESPN cookies.' };
  s2 = s2.replace(/^espn_s2=/i, '');
  swid = swid.replace(/^SWID=/i, '');
  if (swid.charAt(0) !== '{') swid = '{' + swid;
  if (swid.charAt(swid.length - 1) !== '}') swid = swid + '}';
  const settings = lhSettings_();
  if (!settings.leagueId) return { ok: false, error: 'Add the ESPN league ID on the Settings tab first.' };
  const test = lhEspnTest_(settings.leagueId, { s2: s2, swid: swid });
  if (!test.ok && test.problem === 'auth') return { ok: false, error: 'ESPN didn\'t accept these cookies, so nothing was saved. Copy them again while logged in to ESPN, then retry.' };
  if (!test.ok && test.problem !== 'notFound') return { ok: false, error: 'Couldn\'t reach ESPN to test the cookies, so nothing was saved. Try again in a few minutes.' };
  lhProps_().setProperties({ LH_ESPN_S2: s2, LH_ESPN_SWID: swid }, false);
  lhCache_().remove('LH_SEASON_' + settings.leagueId);
  return { ok: true, message: test.ok ? 'Saved. ESPN accepted the cookies. ' + test.message : 'Saved the cookies.' };
}
