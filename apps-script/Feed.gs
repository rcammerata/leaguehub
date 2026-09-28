/**
 * League Hub: keeping the website's data up to date.
 *
 * A timer (installed by Set up) runs refreshLeague every few minutes. Each run decides whether an update is due:
 *   NFL games on (or kicking off soon)  every "Update every (minutes)" from the Settings tab
 *   during the season otherwise          every 30 minutes, and right after each kickoff
 *   draft day                             every 5 minutes around the draft
 *   otherwise                             every 2 hours
 * The finished data is kept in the script cache, so visitors never wait for ESPN.
 */

const LH_FEED_KEY = 'LH_FEED';
const LH_FEED_SECONDS = 6 * 3600;

// The timer's function (don't rename it; the timer calls it by name)
function refreshLeague() {
  lhRefresh_(false);
}

// Builds fresh data now if an update is due (or always when force is true). Returns the status.
function lhRefresh_(force) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(force ? 25000 : 500)) return { ok: false, message: 'Another update is running. Try again in a minute.' };
  try {
    const props = lhProps_();
    if (!force && props.getProperty('LH_PAUSED') === '1') return { ok: true, skipped: true, message: 'Automatic updates are paused.' };
    const due = Number(props.getProperty('LH_NEXT_DUE')) || 0;
    if (!force && lhNow_() < due && lhCacheGetBig_(LH_FEED_KEY)) return { ok: true, skipped: true };

    LH_SETTINGS_MEMO_ = null;
    let feed;
    try { feed = lhBuildFeed_(); }
    catch (e) { lhLog_('Update failed', e); feed = { ok: false, problem: 'other', error: 'Something went wrong while updating.' }; }

    const status = { at: lhNow_(), ok: !!feed.ok, message: feed.ok ? 'Updated.' : feed.error, problem: feed.problem || '',
                     season: feed.league ? feed.league.season : feed.season || null,
                     league: feed.league ? feed.league.name : '', teams: feed.teams ? feed.teams.length : 0 };
    if (feed.ok) {
      const json = JSON.stringify(feed);
      lhCachePutBig_(LH_FEED_KEY, json, LH_FEED_SECONDS);
      lhSaveLastGood_(feed, force);
      props.setProperty('LH_NEXT_DUE', String(lhNextDue_(feed)));
      lhSyncPaymentTeams_(feed);
    } else {
      // Keep showing the last good data (cached, or the saved copy); try again in 10 minutes
      props.setProperty('LH_NEXT_DUE', String(lhNow_() + 10 * 60000));
      const cached = lhJson_(lhCacheGetBig_(LH_FEED_KEY));
      if (!cached || !cached.ok) {
        const last = lhLastGood_();
        lhCachePutBig_(LH_FEED_KEY, JSON.stringify(last || feed), 600);
      }
      lhMaybeAlert_(status);
    }
    props.setProperty('LH_STATUS', JSON.stringify(status));
    try { lhEnsureTrigger_(false); } catch (e) { lhLog_('Timer check skipped', e); }
    return status;
  } finally {
    lock.releaseLock();
  }
}

// When the timer should build new data next (ms)
function lhNextDue_(feed) {
  const now = lhNow_();
  const settings = lhSettings_();
  const margin = 45 * 1000;   // the timer runs every few minutes; don't miss a run by a few seconds
  const nfl = feed.detail && feed.detail.nfl;
  if (nfl) {
    const games = Object.keys(nfl).map(k => nfl[k]);
    if (games.some(g => g.s === 'in' || (g.s === 'pre' && g.k && g.k - now < 15 * 60000 && g.k > now - 4 * 3600000))) {
      return now + settings.refreshMinutes * 60000 - margin;
    }
    const next = games.filter(g => g.s === 'pre' && g.k > now).reduce((m, g) => Math.min(m, g.k), Infinity);
    const base = now + 30 * 60000 - margin;
    return next < base ? Math.max(now + 60000, next - 10 * 60000) : base;
  }
  if (feed.draft && feed.draft.date && (feed.draft.inProgress || Math.abs(feed.draft.date - now) < 3 * 3600000)) return now + 5 * 60000 - margin;
  if (feed.league.phase === 'season') return now + 30 * 60000 - margin;
  return now + 120 * 60000 - margin;
}

// The website asks for data here (google.script.run and ?format=json). Uses the saved copy; builds one if there's
// none yet. Adds `status` so the page can say when the last update from ESPN failed.
function lhGetFeed() {
  let json = lhCacheGetBig_(LH_FEED_KEY);
  if (!json) {
    lhRefresh_(true);
    json = lhCacheGetBig_(LH_FEED_KEY);
  }
  const feed = lhJson_(json) || { ok: false, error: 'No data yet. Try again in a minute.' };
  const st = lhStatus_();
  if (st) feed.status = { ok: st.ok, at: st.at, problem: st.problem || '' };
  return JSON.stringify(feed);
}

function lhClearFeed_() {
  lhCacheRemoveBig_(LH_FEED_KEY);
  lhProps_().deleteProperty('LH_NEXT_DUE');
}

// A copy of the last good data in Script Properties (without player details), saved at most every 30 minutes,
// so the website still has something to show if ESPN is unreachable for hours
function lhSaveLastGood_(feed, force) {
  const props = lhProps_();
  const last = Number(props.getProperty('LH_LAST_GOOD_AT')) || 0;
  if (!force && lhNow_() - last < 30 * 60000) return;
  const slim = Object.assign({}, feed, { detail: null });
  const json = JSON.stringify(slim);
  const size = 8000, obj = {};
  let n = 0;
  for (let i = 0; i < json.length; i += size) obj['LH_LAST_GOOD_' + (n++)] = json.slice(i, i + size);
  if (n > 25) return;   // too big to keep; skip rather than fill Script Properties (500 KB in all)
  const oldN = Number(props.getProperty('LH_LAST_GOOD_N')) || 0;
  obj['LH_LAST_GOOD_N'] = String(n);
  obj['LH_LAST_GOOD_AT'] = String(lhNow_());
  props.setProperties(obj, false);
  for (let i = n; i < oldN; i++) props.deleteProperty('LH_LAST_GOOD_' + i);
}

function lhLastGood_() {
  const all = lhProps_().getProperties();
  const n = Number(all.LH_LAST_GOOD_N) || 0;
  if (!n) return null;
  let json = '';
  for (let i = 0; i < n; i++) {
    if (all['LH_LAST_GOOD_' + i] == null) return null;
    json += all['LH_LAST_GOOD_' + i];
  }
  const feed = lhJson_(json);
  if (feed) feed.stale = true;
  return feed;
}

// One email a day at most, for problems the commissioner has to fix (cookies, league ID)
function lhMaybeAlert_(status) {
  if (status.problem !== 'auth' && status.problem !== 'notFound') return;
  let settings;
  try { settings = lhSettings_(); } catch (_) { return; }
  if (!settings.alertEmail) return;
  const props = lhProps_();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd');
  if (props.getProperty('LH_ALERT_DAY') === today) return;
  const to = Session.getEffectiveUser().getEmail();
  if (!to) return;
  const fix = status.problem === 'auth'
    ? 'ESPN needs a login to read your league. If it\'s a private league, the ESPN cookies probably expired.\n\n' +
      'To fix it: open the spreadsheet, click League Hub → ESPN cookies, and paste fresh espn_s2 and SWID values ' +
      '(or use Commissioner Tools on the website).'
    : 'ESPN says there\'s no league with the ID on your Settings tab. Check "ESPN league ID or link" on the Settings tab.';
  try {
    MailApp.sendEmail(to, 'League Hub: your league website can\'t update', fix +
      '\n\nThe website keeps showing the last scores it had until this is fixed.\n\n(League Hub sends at most one of these a day. ' +
      'You can turn them off on the Settings tab: "Email me when something breaks".)');
    props.setProperty('LH_ALERT_DAY', today);
  } catch (e) { lhLog_('Alert email failed', e); }
}

// Keeps the Payments tab's team dropdown in step with ESPN's team names
function lhSyncPaymentTeams_(feed) {
  const names = feed.teams.map(t => t.name).sort();
  const sig = lhSha256Hex_(names.join('|'));
  const props = lhProps_();
  if (props.getProperty('LH_PAY_TEAMS') === sig) return;
  try {
    const sh = lhSpreadsheet_().getSheetByName(LH_PAYMENTS_SHEET);
    if (sh) lhSetPaymentTeams_(sh, names);
    props.setProperty('LH_PAY_TEAMS', sig);
  } catch (e) { lhLog_('Payments dropdown skipped', e); }
}

// Makes sure exactly one timer runs refreshLeague at the chosen interval
function lhEnsureTrigger_(forceReinstall) {
  const settings = lhSettings_();
  const props = lhProps_();
  const want = String(settings.refreshMinutes);
  const mine = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'refreshLeague');
  if (!forceReinstall && mine.length === 1 && props.getProperty('LH_TRIGGER_MINUTES') === want) return false;
  mine.forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshLeague').timeBased().everyMinutes(Number(want)).create();
  props.setProperty('LH_TRIGGER_MINUTES', want);
  return true;
}

function lhStatus_() {
  return lhJson_(lhProps_().getProperty('LH_STATUS'), null);
}
