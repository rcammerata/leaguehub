/**
 * League Hub: talking to ESPN.
 *
 * ESPN's fantasy data comes from its (unofficial, undocumented) API at lm-api-reads.fantasy.espn.com. Public
 * leagues can be read by anyone. Private leagues need two cookies from a logged-in ESPN account, espn_s2 and
 * SWID (League Hub menu → ESPN cookies). They're kept in Script Properties, never on the sheet or the website.
 *
 * Requests used (each one is a single call):
 *   League      ?view=mSettings&view=mTeam&view=mStandings&view=mMatchupScore   (every update)
 *   Box score   ?view=mBoxscore&scoringPeriodId=N&matchupPeriodId=M             (every update during the season)
 *   Rosters     ?view=mRoster&scoringPeriodId=N                                 (injury tags, at most every 15 minutes)
 *   Draft       ?view=mDraftDetail&view=mSettings&view=mTeam                     (draft season and keeper leagues)
 * Seasons before 2018 use ESPN's leagueHistory address.
 */

const LH_ESPN_HOST = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

function lhEspnCookies_() {
  const p = lhProps_();
  const s2 = lhStr_(p.getProperty('LH_ESPN_S2'));
  const swid = lhStr_(p.getProperty('LH_ESPN_SWID'));
  return s2 && swid ? { s2: s2, swid: swid } : null;
}

function lhEspnHeaders_(cookies) {
  const h = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Origin': 'https://fantasy.espn.com',
    'Referer': 'https://fantasy.espn.com/',
    'X-Fantasy-Source': 'kona',
    'Cache-Control': 'no-cache'
  };
  const c = cookies === undefined ? lhEspnCookies_() : cookies;
  if (c) h['Cookie'] = 'espn_s2=' + c.s2 + '; SWID=' + c.swid;
  return h;
}

function lhEspnUrl_(leagueId, season, query) {
  if (Number(season) < 2018) {
    return LH_ESPN_HOST + '/leagueHistory/' + leagueId + '?seasonId=' + season + (query ? '&' + query : '');
  }
  return LH_ESPN_HOST + '/seasons/' + season + '/segments/0/leagues/' + leagueId + (query ? '?' + query : '');
}

/**
 * One ESPN request. Returns { ok, code, data, problem } where problem is
 *   'auth'     ESPN wants a login (private league without cookies, or expired cookies)
 *   'notFound' no league with this ID for this season
 *   'other'    anything else (ESPN down, unexpected answer)
 */
function lhEspnGet_(leagueId, season, query, extraHeaders, cookies) {
  const url = lhEspnUrl_(leagueId, season, query);
  const headers = lhEspnHeaders_(cookies);
  if (extraHeaders) Object.keys(extraHeaders).forEach(k => { headers[k] = extraHeaders[k]; });
  let r;
  try {
    r = UrlFetchApp.fetch(url, { method: 'get', headers: headers, muteHttpExceptions: true, followRedirects: true });
  } catch (e) {
    lhLog_('ESPN request failed', e);
    return { ok: false, code: 0, data: null, problem: 'other' };
  }
  const code = r.getResponseCode();
  const text = lhStr_(r.getContentText());
  if (code === 401 || code === 403) return { ok: false, code: code, data: null, problem: 'auth' };
  if (code === 404) return { ok: false, code: code, data: null, problem: 'notFound' };
  if (code !== 200 || !(text.charAt(0) === '{' || text.charAt(0) === '[')) {
    return { ok: false, code: code, data: null, problem: /login|sign in|not authorized/i.test(text) ? 'auth' : 'other' };
  }
  let data = lhJson_(text);
  if (Array.isArray(data)) data = data[0] || null;      // leagueHistory answers with a list
  if (!data) return { ok: false, code: code, data: null, problem: 'other' };
  return { ok: true, code: code, data: data, problem: '' };
}

// Settings, teams, records and every matchup of the season
function lhEspnLeague_(leagueId, season) {
  return lhEspnGet_(leagueId, season, 'view=mSettings&view=mTeam&view=mStandings&view=mMatchupScore');
}

// Every roster with this week's player stats, for the matchups of one matchup period
function lhEspnBoxscore_(leagueId, season, scoringPeriod, matchupPeriod) {
  return lhEspnGet_(leagueId, season, 'view=mBoxscore&scoringPeriodId=' + scoringPeriod + '&matchupPeriodId=' + matchupPeriod);
}

// Every roster (with each player's injury status)
function lhEspnRosters_(leagueId, season, scoringPeriod) {
  return lhEspnGet_(leagueId, season, 'view=mRoster' + (scoringPeriod ? '&scoringPeriodId=' + scoringPeriod : ''));
}

function lhEspnDraft_(leagueId, season) {
  return lhEspnGet_(leagueId, season, 'view=mDraftDetail&view=mSettings&view=mTeam');
}

/**
 * Which season to show. "Auto": this calendar year's season once the league has been renewed on ESPN,
 * otherwise last year's. Remembered for 6 hours.
 * (A season that doesn't exist yet can answer "not found" or "not authorized", so last year is always tried.)
 */
function lhResolveSeason_(settings) {
  if (settings.season !== 'auto') return { season: Number(settings.season), fixed: true };
  const cacheKey = 'LH_SEASON_' + settings.leagueId;
  const hit = lhJson_(lhCache_().get(cacheKey));
  if (hit && hit.season) return hit;
  const year = new Date().getFullYear();
  let out = null;
  const now = lhEspnGet_(settings.leagueId, year, 'view=mSettings');
  if (now.ok && now.data && now.data.settings) out = { season: year, fixed: false };
  else {
    const prev = lhEspnGet_(settings.leagueId, year - 1, 'view=mSettings');
    if (prev.ok && prev.data && prev.data.settings) out = { season: year - 1, fixed: false };
    else out = { season: year, fixed: false, problem: now.problem === 'auth' || prev.problem === 'auth' ? 'auth' : (prev.problem || now.problem) };
  }
  if (!out.problem) lhCache_().put(cacheKey, JSON.stringify(out), 6 * 3600);
  return out;
}

/**
 * Checks the league ID (and cookies, if any) with one request. Used by Set up and by Commissioner Tools.
 * Returns { ok, message, name, season, teams }.
 */
function lhEspnTest_(leagueId, cookies) {
  const year = new Date().getFullYear();
  const problems = [];
  for (const season of [year, year - 1]) {
    const r = lhEspnGet_(leagueId, season, 'view=mSettings&view=mTeam', null, cookies);
    if (r.ok && r.data && r.data.settings) {
      return { ok: true, season: season, name: lhStr_(r.data.settings.name), teams: (r.data.teams || []).length,
               message: 'Found "' + lhStr_(r.data.settings.name) + '" (' + season + ', ' + (r.data.teams || []).length + ' teams).' };
    }
    problems.push(r.problem);
  }
  const lastProblem = problems.indexOf('auth') > -1 ? 'auth' : problems.indexOf('notFound') > -1 ? 'notFound' : 'other';
  if (lastProblem === 'auth') {
    return { ok: false, problem: 'auth', message: cookies
      ? 'ESPN didn\'t accept these cookies. Copy espn_s2 and SWID again (while logged in to ESPN) and retry.'
      : 'This league is private. Add your ESPN cookies: League Hub menu → ESPN cookies.' };
  }
  if (lastProblem === 'notFound') return { ok: false, problem: 'notFound', message: 'ESPN has no league with ID ' + leagueId + '. Check the league ID.' };
  return { ok: false, problem: 'other', message: 'Couldn\'t reach ESPN right now. Try again in a few minutes.' };
}

// Team name as ESPN shows it (newer answers have `name`, older ones `location` + `nickname`)
function lhEspnTeamName_(t) {
  return lhStr_(t.name || [t.location, t.nickname].filter(Boolean).join(' ')) || ('Team ' + t.id);
}

// Manager name for a team, styled by the "Manager names" setting
function lhManagerName_(team, membersById, style) {
  if (style === 'hide') return '';
  const names = (team.owners || []).map(id => {
    const m = membersById[id];
    if (!m) return '';
    if (style === 'username') return lhStr_(m.displayName);
    if (style === 'full') return lhStr_([m.firstName, m.lastName].filter(Boolean).join(' ')) || lhStr_(m.displayName);
    return lhShortName_(m.firstName, m.lastName) || lhStr_(m.displayName);
  }).filter(Boolean);
  return names.slice(0, 2).join(' & ');
}
