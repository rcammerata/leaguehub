/**
 * League Hub: builds the website's data (the "feed") from ESPN.
 *
 * Phases:
 *   predraft  the season exists on ESPN but hasn't been drafted: the Draft page leads
 *   season    drafted and not finished: live scores, standings, playoffs
 *   complete  the championship is decided: final results until next season's league shows up on ESPN
 */

function lhBuildFeed_() {
  const settings = lhSettings_();
  const base = { v: 1, version: LH_VERSION, generatedAt: new Date().toISOString() };
  if (!settings.leagueId) {
    return Object.assign(base, { ok: false, setup: true, error: 'This website isn\'t connected to an ESPN league yet.' });
  }
  const seasonInfo = lhResolveSeason_(settings);
  const season = seasonInfo.season;
  const L = lhEspnLeague_(settings.leagueId, season);
  if (!L.ok) {
    return Object.assign(base, { ok: false, problem: L.problem || seasonInfo.problem || 'other', season: season,
      error: L.problem === 'auth' ? 'ESPN needs a login to read this league.'
        : L.problem === 'notFound' ? 'ESPN has no league with ID ' + settings.leagueId + ' for ' + season + '.'
        : 'ESPN isn\'t answering right now.' });
  }
  const now = lhNow_();
  const d = L.data;
  const es = d.settings || {};
  const status = d.status || {};
  const sched = es.scheduleSettings || {};
  const members = {};
  (d.members || []).forEach(m => { members[m.id] = m; });

  // ---- League shape ----
  const regWeeks = Number(sched.matchupPeriodCount) || 14;
  const playoffTeams = Number(sched.playoffTeamCount) || 0;
  const periods = lhMatchupPeriods_(sched, status);
  const lastMp = Object.keys(periods).map(Number).reduce((a, b) => Math.max(a, b), regWeeks);
  const currentMp = Number(status.currentMatchupPeriod) || 0;
  const latestSp = Number(status.latestScoringPeriod) || 0;
  const drafted = !!(d.draftDetail && d.draftDetail.drafted);

  // ---- Teams ----
  const teams = (d.teams || []).map(t => ({
    id: t.id,
    name: lhEspnTeamName_(t),
    abbrev: lhStr_(t.abbrev),
    logo: /^https:\/\//.test(lhStr_(t.logo)) ? lhStr_(t.logo) : '',
    manager: lhManagerName_(t, members, settings.managerNames),
    div: t.divisionId != null ? Number(t.divisionId) : null,
    seed: Number(t.playoffSeed) || 0,
    rank: Number(t.rankCalculatedFinal || t.rankFinal) || 0,
    adds: Number((t.transactionCounter || {}).acquisitions) || 0,
    trades: Number((t.transactionCounter || {}).trades) || 0,
    faab: (t.transactionCounter || {}).acquisitionBudgetSpent != null ? Number(t.transactionCounter.acquisitionBudgetSpent) : null,
    _rec: (t.record || {}).overall || null
  }));
  const byId = {};
  teams.forEach(t => { byId[t.id] = t; });

  // ---- Every matchup of the season ----
  const games = (d.schedule || []).map(g => lhGame_(g)).filter(g => g.a != null);
  const champGame = lhChampionshipGame_(games, regWeeks, playoffTeams);
  const complete = drafted && (teams.some(t => t.rank > 0) || !!(champGame && champGame.w));
  const phase = !drafted ? 'predraft' : complete ? 'complete' : 'season';

  lhRecords_(teams, games, regWeeks, phase === 'complete' ? Infinity : currentMp);
  const standings = lhStandingsOrder_(teams);

  const feed = Object.assign(base, {
    ok: true,
    league: {
      id: settings.leagueId,
      name: settings.leagueName || lhStr_(es.name) || 'Fantasy League',
      season: season,
      size: teams.length,
      phase: phase,
      espnUrl: 'https://fantasy.espn.com/football/league?leagueId=' + settings.leagueId + (seasonInfo.fixed ? '&seasonId=' + season : ''),
      founded: settings.founded,
      accent: settings.accent,
      logo: settings.logo,
      scoring: lhScoringType_(es.scoringSettings),
      ppr: lhCatchPoints_(es.scoringSettings) > 0,   // catches score points: player cards show receptions
      keepers: Number((es.draftSettings || {}).keeperCount) || 0,
      managers: settings.managerNames !== 'hide'
    },
    schedule: { regularWeeks: regWeeks, playoffTeams: playoffTeams, lastMp: lastMp, periods: periods },
    teams: teams.map(t => { const c = Object.assign({}, t); delete c._rec; return c; }),
    divisions: ((sched.divisions || []).length > 1 ? sched.divisions : []).map(x => ({ id: Number(x.id), name: lhStr_(x.name) })),
    standings: standings,
    week: null,
    current: null,
    detail: null,
    results: [],
    highs: [],
    playoffs: null,
    money: null,
    keepers: null,
    draft: null,
    history: [],
    rules: { summary: lhRulesSummary_(es, teams.length, periods, regWeeks, playoffTeams), custom: settings.rules },
    options: { winProb: settings.showWinProb, bench: settings.showBench, history: settings.showHistory, money: settings.money.enabled },
    refresh: { minutes: 30 }
  });

  // ---- This week (live) ----
  if (phase === 'season' && currentMp >= 1) {
    const spList = periods[currentMp] || [currentMp];
    const sp = spList.indexOf(latestSp) > -1 ? latestSp : spList[spList.length - 1];
    feed.week = lhWeekInfo_(currentMp, spList, regWeeks, lastMp, playoffTeams);
    try { lhLiveWeek_(feed, settings, season, currentMp, sp, spList, games, now); }
    catch (e) { lhLog_('Live week skipped', e); }
  }

  // ---- Results, weekly high scores, playoffs ----
  feed.results = lhResults_(games, periods, currentMp, phase);
  feed.highs = lhWeeklyHighs_(games, periods, regWeeks, currentMp, phase, settings.money);
  feed.playoffs = lhPlayoffs_(teams, games, periods, regWeeks, playoffTeams, currentMp, phase, standings);
  if (phase === 'complete') feed.final = lhFinalPlaces_(teams, champGame, games, regWeeks, playoffTeams);

  // ---- Keepers, draft, money, history (each can fail on its own without breaking the page) ----
  try { feed.keepers = lhKeepers_(settings, season, d, phase, feed); } catch (e) { lhLog_('Keepers skipped', e); }
  if (phase === 'predraft') {
    try { feed.draft = lhDraftInfo_(settings, season, d, feed); } catch (e) { lhLog_('Draft info skipped', e); }
  }
  if (settings.money.enabled) {
    try { feed.money = lhMoney_(settings, feed, games, periods, regWeeks); } catch (e) { lhLog_('Money skipped', e); }
  }
  if (settings.showHistory) {
    try { feed.history = lhHistory_(settings, season, status, feed); } catch (e) { lhLog_('History skipped', e); }
  }
  feed.refresh.minutes = lhNextRefreshMinutes_(feed, settings);
  return feed;
}

// ===================== Schedule =====================

// Matchup period → its scoring periods (NFL weeks). ESPN lists them in scheduleSettings.matchupPeriods.
function lhMatchupPeriods_(sched, status) {
  const out = {};
  const mp = sched.matchupPeriods || {};
  Object.keys(mp).forEach(k => {
    const list = (mp[k] || []).map(Number).filter(n => n > 0);
    if (list.length) out[Number(k)] = list;
  });
  if (Object.keys(out).length) return out;
  // Older answers: one week per regular season period, playoffMatchupPeriodLength weeks per playoff round
  const reg = Number(sched.matchupPeriodCount) || 14;
  const len = Math.max(1, Number(sched.playoffMatchupPeriodLength) || 1);
  const finalSp = Number(status.finalScoringPeriod) || (reg + 3);
  for (let p = 1; p <= reg; p++) out[p] = [p];
  let sp = reg + 1, p = reg + 1;
  while (sp <= finalSp) { const list = []; for (let i = 0; i < len && sp <= finalSp; i++) list.push(sp++); out[p++] = list; }
  return out;
}

function lhGame_(g) {
  const side = s => s && s.teamId != null ? s : null;
  const home = side(g.home), away = side(g.away);
  const w = g.winner === 'HOME' ? 'a' : g.winner === 'AWAY' ? 'b' : g.winner === 'TIE' ? 'tie' : '';
  const byWeek = s => {
    const out = {};
    const m = (s && s.pointsByScoringPeriod) || {};
    Object.keys(m).forEach(k => { out[Number(k)] = Number(m[k]) || 0; });
    return out;
  };
  return {
    id: g.id,
    mp: Number(g.matchupPeriodId) || 0,
    a: home ? home.teamId : (away ? away.teamId : null),
    b: home && away ? away.teamId : null,
    sa: lhRound_(lhFirstNum_([(home || away || {}).totalPointsLive, (home || away || {}).totalPoints]) || 0, 2),
    sb: home && away ? lhRound_(lhFirstNum_([away.totalPointsLive, away.totalPoints]) || 0, 2) : null,
    wa: byWeek(home || away),
    wb: home && away ? byWeek(away) : {},
    w: w,
    tier: lhStr_(g.playoffTierType) || 'NONE'
  };
}

// Wins, losses, ties and points: ESPN's record when it has one, otherwise counted from the results.
// total = points from every finished week (matchup periods before doneBefore), playoffs included.
function lhRecords_(teams, games, regWeeks, doneBefore) {
  const calc = {};
  teams.forEach(t => { calc[t.id] = { w: 0, l: 0, t: 0, pf: 0, pa: 0, total: 0, streak: [] }; });
  games.slice().sort((x, y) => x.mp - y.mp).forEach(g => {
    const A = calc[g.a], B = g.b != null ? calc[g.b] : null;
    if (g.mp < doneBefore) {
      if (A) A.total += g.sa;
      if (B) B.total += g.sb || 0;
    }
    if (g.mp > regWeeks || !g.w || !A) return;
    A.pf += g.sa;
    if (!B) return;
    B.pf += g.sb; A.pa += g.sb; B.pa += g.sa;
    if (g.w === 'a') { A.w++; B.l++; A.streak.push('W'); B.streak.push('L'); }
    else if (g.w === 'b') { A.l++; B.w++; A.streak.push('L'); B.streak.push('W'); }
    else { A.t++; B.t++; A.streak.push('T'); B.streak.push('T'); }
  });
  teams.forEach(t => {
    const c = calc[t.id], r = t._rec;
    const streakOf = list => {
      if (!list.length) return '';
      const last = list[list.length - 1];
      let n = 0;
      for (let i = list.length - 1; i >= 0 && list[i] === last; i--) n++;
      return last + n;
    };
    if (r && r.wins != null) {
      t.w = Number(r.wins) || 0; t.l = Number(r.losses) || 0; t.t = Number(r.ties) || 0;
      t.pf = lhRound_(Number(r.pointsFor) || c.pf, 2); t.pa = lhRound_(Number(r.pointsAgainst) || c.pa, 2);
      const type = { WIN: 'W', LOSS: 'L', TIE: 'T' }[lhStr_(r.streakType).toUpperCase()];
      t.streak = type && Number(r.streakLength) ? type + Number(r.streakLength) : streakOf(c.streak);
    } else {
      t.w = c.w; t.l = c.l; t.t = c.t; t.pf = lhRound_(c.pf, 2); t.pa = lhRound_(c.pa, 2); t.streak = streakOf(c.streak);
    }
    t.total = lhRound_(c.total, 2);   // every game, playoffs included
    const games = t.w + t.l + t.t;
    t.pct = games ? lhRound_((t.w + 0.5 * t.t) / games, 4) : 0;
  });
}

// Overall standings: ESPN's playoff seeds when every team has one, otherwise win % then points
function lhStandingsOrder_(teams) {
  const seeds = teams.map(t => t.seed).filter(s => s > 0);
  const useSeeds = seeds.length === teams.length && new Set(seeds).size === seeds.length && teams.some(t => t.w + t.l + t.t > 0);
  return teams.slice().sort((a, b) => useSeeds ? a.seed - b.seed : (b.pct - a.pct) || (b.pf - a.pf) || a.name.localeCompare(b.name))
    .map(t => t.id);
}

function lhWeekInfo_(mp, spList, regWeeks, lastMp, playoffTeams) {
  const playoffs = mp > regWeeks;
  const rounds = lhRoundNames_(playoffTeams, lastMp - regWeeks);
  const weeks = spList.length > 1 ? 'Weeks ' + spList[0] + '–' + spList[spList.length - 1] : 'Week ' + spList[0];
  return { mp: mp, sp: spList, label: weeks, playoffs: playoffs, round: playoffs ? (rounds[mp - regWeeks - 1] || '') : '' };
}

// Round names by how many rounds the bracket has (6 teams → 3 rounds: first round with byes, semifinals, final)
function lhRoundNames_(playoffTeams, roundCount) {
  const n = roundCount || Math.max(1, Math.ceil(Math.log(Math.max(2, playoffTeams)) / Math.log(2)));
  const names = { 1: ['Championship'], 2: ['Semifinals', 'Championship'], 3: ['Quarterfinals', 'Semifinals', 'Championship'],
                  4: ['First Round', 'Quarterfinals', 'Semifinals', 'Championship'] }[n];
  if (names) return names;
  const out = [];
  for (let i = 1; i <= n; i++) out.push(i === n ? 'Championship' : 'Round ' + i);
  return out;
}

// ===================== Live week =====================

function lhLiveWeek_(feed, settings, season, mp, sp, spList, games, now) {
  const B = lhEspnBoxscore_(settings.leagueId, season, sp, mp);
  const nfl = lhNflWeek_(season, sp);
  const injuries = lhInjuryTags_(settings.leagueId, season);
  const lineups = {};
  if (B.ok) {
    (B.data.schedule || []).forEach(g => {
      if (Number(g.matchupPeriodId) !== mp) return;
      [g.home, g.away].forEach(s => {
        if (!s || s.teamId == null) return;
        const entries = (s.rosterForCurrentScoringPeriod && s.rosterForCurrentScoringPeriod.entries) || [];
        if (entries.length) lineups[s.teamId] = lhLineup_(entries, sp, nfl, injuries, now);
      });
    });
  }

  // Earlier weeks of a multi-week matchup count toward it; later weeks are estimated from this week's projection
  const idx = spList.indexOf(sp);
  const earlier = spList.slice(0, Math.max(0, idx));
  const laterWeeks = Math.max(0, spList.length - idx - 1);

  const weekGames = games.filter(g => g.mp === mp);
  const sideOf = (id, wk, fallbackScore) => {
    const lu = lineups[id];
    const before = earlier.reduce((s, w) => s + (Number((wk || {})[w]) || 0), 0);
    if (!lu) return { score: fallbackScore, proj: fallbackScore, done: false };
    const future = laterWeeks * lu.starters.reduce((s, p) => s + p.p, 0);
    const allFinal = lu.starters.every(p => p.r === 0) && !laterWeeks;
    return { score: lhRound_(before + lu.actual, 2), proj: lhRound_(before + lu.proj + future, 2), done: allFinal };
  };
  const matchups = weekGames.map(g => {
    const A = sideOf(g.a, g.wa, g.sa);
    const Bs = g.b != null ? sideOf(g.b, g.wb, g.sb) : null;
    return { a: g.a, b: g.b, sa: A.score, sb: Bs ? Bs.score : null, pa: A.proj, pb: Bs ? Bs.proj : null,
             da: A.done, db: Bs ? Bs.done : true, tier: g.tier };
  });
  feed.current = { mp: mp, sp: sp, matchups: matchups };

  if (Object.keys(lineups).length) {
    const detail = { teams: {}, at: new Date(now).toISOString(), nfl: null };
    Object.keys(lineups).forEach(id => {
      const lu = lineups[id];
      detail.teams[id] = { starters: lu.starters, bench: settings.showBench ? lu.bench : [] };
    });
    if (nfl && nfl.teams) {
      detail.nfl = {};
      Object.keys(nfl.teams).forEach(t => {
        const g = nfl.teams[t];
        detail.nfl[t] = { o: g.o, k: g.k, tbd: g.tbd ? 1 : 0, s: g.s, d: g.d, sc: g.sc };
      });
    }
    feed.detail = detail;
  }
}

// Injury tags by player id from ESPN's roster view (the box score doesn't carry them), at most every 15 minutes
function lhInjuryTags_(leagueId, season) {
  const index = lhRosterIndex_(leagueId, season);
  const tags = {};
  let n = 0;
  Object.keys(index).forEach(id => { if (index[id].inj != null) { tags[id] = index[id].inj; n++; } });
  return n ? tags : null;
}

// ===================== Results and weekly high scores =====================

function lhResults_(games, periods, currentMp, phase) {
  const byMp = {};
  games.forEach(g => {
    const played = g.w || (phase === 'complete') || g.mp < currentMp;
    if (!played || g.mp > (phase === 'complete' ? 999 : currentMp - 1)) return;
    (byMp[g.mp] = byMp[g.mp] || []).push({ a: g.a, b: g.b, sa: g.sa, sb: g.sb, w: g.w, tier: g.tier });
  });
  return Object.keys(byMp).map(Number).sort((x, y) => x - y)
    .map(mp => ({ mp: mp, weeks: periods[mp] || [mp], games: byMp[mp] }));
}

// Top score of every finished week (ties share it), and the current week's leader so far
function lhWeeklyHighs_(games, periods, regWeeks, currentMp, phase, money) {
  const out = [];
  const lastDoneMp = phase === 'complete' ? 999 : currentMp - 1;
  Object.keys(periods).map(Number).sort((x, y) => x - y).forEach(mp => {
    if (mp > lastDoneMp) return;
    const list = games.filter(g => g.mp === mp);
    if (!list.length) return;
    (periods[mp] || [mp]).forEach(sp => {
      const scores = [];
      list.forEach(g => {
        const multi = (periods[mp] || []).length > 1;
        const a = multi ? g.wa[sp] : g.sa, b = multi ? g.wb[sp] : g.sb;
        if (a != null) scores.push({ id: g.a, s: Number(a) || 0 });
        if (g.b != null && b != null) scores.push({ id: g.b, s: Number(b) || 0 });
      });
      if (!scores.length) return;
      const top = scores.reduce((m, x) => Math.max(m, x.s), -Infinity);
      if (!(top > 0)) return;
      const winners = scores.filter(x => x.s === top).map(x => x.id);
      const paid = money && money.enabled && money.weeklyPrize > 0 && (money.weeklyAllWeeks || mp <= regWeeks);
      out.push({ sp: sp, mp: mp, teams: winners, score: lhRound_(top, 2), prize: paid ? lhRound_(money.weeklyPrize / winners.length, 2) : 0 });
    });
  });
  return out;
}

// ===================== Playoffs =====================

function lhChampionshipGame_(games, regWeeks, playoffTeams) {
  const bracket = games.filter(g => g.mp > regWeeks && g.tier === 'WINNERS_BRACKET');
  if (!bracket.length) return null;
  const lastMp = bracket.reduce((m, g) => Math.max(m, g.mp), 0);
  const finals = bracket.filter(g => g.mp === lastMp);
  const rounds = Math.ceil(Math.log(Math.max(2, playoffTeams)) / Math.log(2));
  return finals.length === 1 && lastMp - regWeeks >= rounds ? finals[0] : null;
}

function lhPlayoffs_(teams, games, periods, regWeeks, playoffTeams, currentMp, phase, standings) {
  if (!playoffTeams || phase === 'predraft') return null;
  const byId = {};
  teams.forEach(t => { byId[t.id] = t; });
  const inPlayoffs = phase === 'complete' || currentMp > regWeeks;
  const seedOf = id => (byId[id] && byId[id].seed) || 0;

  // Regular season: who'd be in if the season ended today
  if (!inPlayoffs) {
    return { picture: true, teams: playoffTeams, seeds: standings.slice(0, playoffTeams).map((id, i) => ({ seed: i + 1, id: id })), rounds: [] };
  }

  const roundCount = Math.max(1, Math.ceil(Math.log(Math.max(2, playoffTeams)) / Math.log(2)));
  const names = lhRoundNames_(playoffTeams, roundCount);
  const bracket = games.filter(g => g.mp > regWeeks && (g.tier === 'WINNERS_BRACKET' || g.tier === 'WINNERS_CONSOLATION_LADDER'));
  const side = (id, score) => id == null ? null : { id: id, seed: seedOf(id), score: score };
  const rounds = [];
  for (let i = 0; i < roundCount; i++) {
    const mp = regWeeks + 1 + i;
    const list = bracket.filter(g => g.mp === mp);
    const main = list.filter(g => g.tier === 'WINNERS_BRACKET').map(g => ({
      kind: i === roundCount - 1 ? 'final' : 'bracket', a: side(g.a, g.sa), b: side(g.b, g.sb), w: g.w
    }));
    const round = { mp: mp, weeks: periods[mp] || [mp], name: names[i] || 'Round ' + (i + 1), games: main };
    if (i === roundCount - 1 && roundCount > 1) {
      // Third place game: the two semifinal losers, if ESPN schedules it
      const semis = rounds[i - 1] ? rounds[i - 1].games : [];
      const losers = semis.map(g => g.w === 'a' ? g.b && g.b.id : g.w === 'b' ? g.a && g.a.id : null).filter(x => x != null);
      const third = list.filter(g => g.tier === 'WINNERS_CONSOLATION_LADDER' && losers.indexOf(g.a) > -1 && losers.indexOf(g.b) > -1)[0];
      if (third) round.games.push({ kind: 'third', a: side(third.a, third.sa), b: side(third.b, third.sb), w: third.w });
    }
    rounds.push(round);
  }
  const seeds = teams.filter(t => t.seed > 0 && t.seed <= playoffTeams).sort((a, b) => a.seed - b.seed).map(t => ({ seed: t.seed, id: t.id }));
  return { picture: false, teams: playoffTeams, seeds: seeds.length ? seeds : standings.slice(0, playoffTeams).map((id, i) => ({ seed: i + 1, id: id })), rounds: rounds };
}

// Champion, runner-up and third place once the season is over
function lhFinalPlaces_(teams, champGame, games, regWeeks, playoffTeams) {
  const ranked = teams.filter(t => t.rank > 0).sort((a, b) => a.rank - b.rank);
  if (ranked.length) return { champion: ranked[0] ? ranked[0].id : null, runnerUp: ranked[1] ? ranked[1].id : null, third: ranked[2] ? ranked[2].id : null };
  if (!champGame || !champGame.w || champGame.w === 'tie') return null;
  return { champion: champGame.w === 'a' ? champGame.a : champGame.b, runnerUp: champGame.w === 'a' ? champGame.b : champGame.a, third: null };
}

// ===================== League summary =====================

function lhScoringType_(scoring) {
  const items = (scoring && scoring.scoringItems) || [];
  const rec = items.filter(x => Number(x.statId) === 53)[0];
  const ppr = rec ? Number(rec.points) || 0 : 0;
  if (ppr === 1) return 'PPR';
  if (ppr === 0.5) return 'Half PPR';
  if (ppr > 0) return ppr + ' points per catch';
  if (lhCatchPoints_(scoring) > 0) return 'Partial PPR';   // catches score only for some positions (like TE premium)
  return 'Standard';
}

// The most a catch (stat 53) is worth at any position, counting per-position overrides; 0 in standard scoring
function lhCatchPoints_(scoring) {
  const items = (scoring && scoring.scoringItems) || [];
  return items.filter(x => Number(x.statId) === 53).reduce((best, x) => {
    const overrides = Object.keys(x.pointsOverrides || {}).map(k => Number(x.pointsOverrides[k]) || 0);
    return Math.max(best, Number(x.points) || 0, ...overrides);
  }, 0);
}

function lhRulesSummary_(es, size, periods, regWeeks, playoffTeams) {
  const out = [];
  out.push(size + ' teams, ' + lhScoringType_(es.scoringSettings) + ' scoring');

  const counts = ((es.rosterSettings || {}).lineupSlotCounts) || {};
  const starters = [];
  let bench = 0;
  LH_SLOT_ORDER.forEach(slot => {
    const n = Number(counts[slot]) || 0;
    if (!n) return;
    if (slot === 20) { bench = n; return; }
    if (slot === 21) return;
    const label = LH_SLOT_LABELS[slot];
    starters.push(n > 1 ? n + ' ' + label : label);
  });
  if (starters.length) out.push('Starting lineup: ' + starters.join(', ') + (bench ? ' (plus ' + lhPlural_(bench, 'bench spot', 'bench spots') + ')' : ''));

  const divisions = ((es.scheduleSettings || {}).divisions || []);
  if (divisions.length > 1) out.push(divisions.length + ' divisions: ' + divisions.map(x => lhStr_(x.name)).join(', '));

  const playoffMps = Object.keys(periods).map(Number).filter(p => p > regWeeks).sort((a, b) => a - b);
  out.push('Regular season: weeks 1–' + ((periods[regWeeks] || [regWeeks]).slice(-1)[0]));
  if (playoffTeams && playoffMps.length) {
    const first = periods[playoffMps[0]][0], last = periods[playoffMps[playoffMps.length - 1]].slice(-1)[0];
    const twoWeek = playoffMps.some(p => (periods[p] || []).length > 1);
    out.push('Playoffs: ' + playoffTeams + ' teams, weeks ' + first + '–' + last + (twoWeek ? ' (some rounds last two weeks)' : ''));
  }

  const acq = es.acquisitionSettings || {};
  if (acq.isUsingAcquisitionBudget) out.push('Waivers: free agent budget of $' + (Number(acq.acquisitionBudget) || 0));
  const deadline = Number((es.tradeSettings || {}).deadlineDate) || 0;
  if (deadline > 0) out.push('Trade deadline: ' + Utilities.formatDate(new Date(deadline), 'America/New_York', 'MMMM d'));
  const keepers = Number((es.draftSettings || {}).keeperCount) || 0;
  if (keepers) out.push('Keepers: ' + keepers + ' per team');
  const ds = es.draftSettings || {};
  const type = lhStr_(ds.type).toUpperCase();
  if (type === 'AUCTION') out.push('Draft: auction' + (ds.auctionBudget ? ' ($' + ds.auctionBudget + ' budget)' : ''));
  else if (type === 'SNAKE') out.push('Draft: snake');
  return out;
}

// How often the website should check for new data (minutes)
function lhNextRefreshMinutes_(feed, settings) {
  const nfl = feed.detail && feed.detail.nfl;
  if (nfl) {
    const now = lhNow_();
    const soon = Object.keys(nfl).some(t => nfl[t].s === 'in' || (nfl[t].s === 'pre' && nfl[t].k && nfl[t].k - now < 30 * 60000 && nfl[t].k > now - 4 * 3600000));
    if (soon) return settings.refreshMinutes;
  }
  if (feed.draft && feed.draft.date && Math.abs(feed.draft.date - lhNow_()) < 6 * 3600000) return 5;
  return feed.league.phase === 'season' ? 30 : 120;
}
