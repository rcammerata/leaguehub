/**
 * League Hub: NFL games (opponent, kickoff, score, quarter and clock) from ESPN's public NFL scoreboard.
 *
 * No login needed. Fetched at most once per update: every update while a game is on or about to start,
 * otherwise once an hour. The game clock gives each player's fraction of game left for the live projections.
 *
 * Since August 2026 site.api.espn.com refuses Google's servers ("You don't have permission to access"), so
 * site.web.api.espn.com (same data) is asked first.
 */

const LH_NFL_HOSTS = ['site.web.api.espn.com', 'site.api.espn.com'];
const LH_NFL_REFRESH_MS = 60 * 60 * 1000;   // no game on: refresh once an hour
const LH_NFL_SOON_MS = 15 * 60 * 1000;      // a game kicking off within 15 minutes counts as on
const LH_CLOCK_FRESH_MS = 12 * 60 * 1000;   // an older game clock isn't trusted (the kickoff countdown is used)
const LH_MIN_LEFT = 0.01;                   // a game in progress keeps at least 1% left until it's final
const LH_GAME_MS = (3 * 60 + 15) * 60 * 1000;   // fallback countdown: a game lasts about 3h15

// ESPN pro team ids (fantasy and scoreboard use the same ids)
const LH_PRO_TEAMS = {
  0: 'FA', 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB',
  10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO',
  19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB',
  28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
};

var LH_NFL_MEMO_ = {};

/**
 * NFL games of one week by team: { at: fetch time, teams: { NE: { o: '@JAX', k: kickoff ms, s: 'pre'|'in'|'post',
 * d: 'Q3 4:12' | 'Half' | 'Final' | 'Final/OT' | '', sc: [team, opponent] | null, p: quarter, c: clock seconds } } }
 */
function lhNflWeek_(season, week) {
  const key = 'LH_NFL_' + season + '_' + week;
  if (LH_NFL_MEMO_[key]) return LH_NFL_MEMO_[key];
  const cache = lhCache_();
  const saved = lhJson_(cache.get(key));
  const now = lhNow_();
  const games = (saved && saved.teams) || {};
  const gameOn = Object.keys(games).some(t => games[t].s === 'in' ||
    (games[t].s === 'pre' && games[t].k && games[t].k - now <= LH_NFL_SOON_MS));
  let out = saved && saved.teams ? saved : { at: 0, teams: null };
  if (!(saved && !gameOn && now - Number(saved.at) < LH_NFL_REFRESH_MS)) {
    let fresh = null;
    try { fresh = lhNflFetch_(season, week); } catch (e) { lhLog_('NFL scoreboard failed', e); }
    if (fresh) {
      out = { at: now, teams: fresh };
      cache.put(key, JSON.stringify(out), 6 * 3600);
    }
  }
  LH_NFL_MEMO_[key] = out;
  return out;
}

function lhNflFetch_(season, week) {
  const path = '/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=' + Number(week) + '&dates=' + Number(season);
  let d = null;
  for (let i = 0; i < LH_NFL_HOSTS.length && !d; i++) d = lhNflGet_(LH_NFL_HOSTS[i], path);
  if (!d) return null;
  if (d.week && d.week.number != null && Number(d.week.number) !== Number(week)) return null;

  const fix = { WAS: 'WSH', JAC: 'JAX', LA: 'LAR' };
  const abbr = c => {
    const t = (c && c.team) || {};
    return LH_PRO_TEAMS[Number(t.id)] || fix[String(t.abbreviation || '').toUpperCase()] || String(t.abbreviation || '').toUpperCase();
  };
  const score = c => { const s = c && c.score; return Number(s && typeof s === 'object' ? s.value : s) || 0; };

  const teams = {};
  (d.events || []).forEach(ev => {
    const c = (ev.competitions || [])[0];
    if (!c || !Array.isArray(c.competitors) || c.competitors.length !== 2) return;
    const status = c.status || ev.status || {};
    const type = status.type || {};
    const state = ['pre', 'in', 'post'].indexOf(type.state) > -1 ? type.state : 'pre';
    const ko = Date.parse(c.date || ev.date) || null;
    const short = lhNflStatus_(state, type, status);
    const period = Number(status.period) || 0, clock = lhNflClockSecs_(status);
    c.competitors.forEach((me, i) => {
      const opp = c.competitors[1 - i], ab = abbr(me);
      if (!ab) return;
      teams[ab] = { o: (me.homeAway === 'home' ? 'vs ' : '@') + abbr(opp), k: ko, tbd: c.timeValid === false, s: state, d: short,
                    sc: state === 'pre' ? null : [score(me), score(opp)], p: period, c: clock };
    });
  });
  return Object.keys(teams).length ? teams : null;
}

function lhNflGet_(host, path) {
  try {
    const r = UrlFetchApp.fetch('https://' + host + path, { method: 'get', muteHttpExceptions: true, followRedirects: true,
                                                            headers: { 'Accept': 'application/json' } });
    if (r.getResponseCode() === 200) return JSON.parse(r.getContentText()) || null;
    lhLog_('NFL scoreboard: ' + host + ' answered HTTP ' + r.getResponseCode());
  } catch (e) {
    lhLog_('NFL scoreboard: ' + host + ' failed', e);
  }
  return null;
}

// Short game status like the ESPN app: "Q3 4:12", "Half", "End Q1", "Final", "Final/OT"
function lhNflStatus_(state, type, status) {
  const name = String(type.name || '').toUpperCase();
  const period = Number(status.period) || 0;
  const q = p => p <= 4 ? 'Q' + p : (p === 5 ? 'OT' : (p - 4) + 'OT');
  if (/POSTPONED/.test(name)) return 'Postponed';
  if (/CANCEL/.test(name)) return 'Canceled';
  if (/SUSPENDED/.test(name)) return 'Suspended';
  if (state === 'post') return period > 4 ? 'Final/OT' : 'Final';
  if (/DELAY/.test(name)) return 'Delayed';
  if (state !== 'in') return '';
  if (/HALFTIME/.test(name)) return 'Half';
  if (/END_PERIOD/.test(name)) return 'End ' + q(period);
  return (q(period) + ' ' + String(status.displayClock || '')).trim();
}

// "4:12" → 252
function lhNflClockSecs_(status) {
  const m = /^(\d+):(\d{1,2})$/.exec(lhStr_(status && status.displayClock));
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(status && status.clock);
  return status && status.clock != null && isFinite(n) ? Math.round(n) : null;
}

/**
 * Fraction of a game left, 1 (not started) … 0 (final).
 * From the game clock: regulation time left ÷ 60 minutes, never below 1% until the game is marked final
 * (so the end of the 4th quarter and all of overtime stay at 1%).
 * If the clock is missing or old: a 3h15 countdown from kickoff. null when nothing is known.
 */
function lhFracLeft_(g, clockAt, now) {
  if (!g) return null;
  if (g.s === 'post') return /^Final/.test(g.d || '') ? 0 : null;
  const fresh = clockAt && now - clockAt <= LH_CLOCK_FRESH_MS;
  if (fresh && g.s === 'pre') return 1;
  if (fresh && g.s === 'in') {
    const p = Number(g.p), c = Number(g.c);
    if (p > 4) return LH_MIN_LEFT;
    if (p >= 1 && g.c != null && isFinite(c)) {
      return Math.max(LH_MIN_LEFT, Math.min(1, ((4 - p) * 900 + Math.max(0, Math.min(900, c))) / 3600));
    }
  }
  if (g.k && !g.tbd) {
    if (now < g.k) return 1;
    return Math.max(LH_MIN_LEFT, 1 - (now - g.k) / LH_GAME_MS);
  }
  return null;
}
