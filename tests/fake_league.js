// A made-up ESPN league (teams, managers and results are fictional; players are real NFL players) that answers
// League Hub's ESPN and NFL requests the way ESPN does, for tests and screenshots.
//   scenario 'week5'    Sunday of week 5, 3:10 PM ET: some NFL games final, some live, some not started
//   scenario 'week16'   playoff semifinals (week 16) in progress
//   scenario 'complete' the season is over (champion decided)
//   scenario 'predraft' next season created on ESPN, draft not done yet
'use strict';

const LEAGUE_ID = '24681357';
const SEASON = 2026;
const TEAM_NAMES = ['Touchdown Turtles', 'Gridiron Gurus', 'Blitz Brigade', 'End Zone Envy', 'Fourth and Long',
                    'Hail Mary Heroes', 'Pigskin Prophets', 'Red Zone Rebels', 'Sack Masters', 'The Replacements'];
const OWNERS = [['Jordan', 'Blake'], ['Casey', 'Morgan'], ['Taylor', 'Reed'], ['Riley', 'Carter'], ['Morgan', 'Hayes'],
                ['Avery', 'Brooks'], ['Jamie', 'Foster'], ['Drew', 'Parker'], ['Quinn', 'Ellis'], ['Sam', 'Rivera']];
const PRO = { ATL: 1, BUF: 2, CHI: 3, CIN: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8, GB: 9, TEN: 10, IND: 11, KC: 12, LV: 13, LAR: 14,
  MIA: 15, MIN: 16, NE: 17, NO: 18, NYG: 19, NYJ: 20, PHI: 21, ARI: 22, PIT: 23, LAC: 24, SF: 25, SEA: 26, TB: 27, WSH: 28,
  CAR: 29, JAX: 30, BAL: 33, HOU: 34 };

// [name, position id, team, typical points]
const POOL = {
  1: [['Josh Allen', 'BUF', 23], ['Lamar Jackson', 'BAL', 22], ['Jalen Hurts', 'PHI', 21], ['Jayden Daniels', 'WSH', 21], ['Joe Burrow', 'CIN', 20],
      ['Patrick Mahomes', 'KC', 19], ['Baker Mayfield', 'TB', 19], ['Bo Nix', 'DEN', 18], ['Brock Purdy', 'SF', 18], ['Justin Herbert', 'LAC', 17],
      ['Jared Goff', 'DET', 17], ['Kyler Murray', 'ARI', 17], ['Drake Maye', 'NE', 17], ['C.J. Stroud', 'HOU', 16], ['Caleb Williams', 'CHI', 16],
      ['Dak Prescott', 'DAL', 17], ['Jordan Love', 'GB', 16], ['Trevor Lawrence', 'JAX', 15], ['Matthew Stafford', 'LAR', 16], ['Tua Tagovailoa', 'MIA', 15]],
  2: [['Bijan Robinson', 'ATL', 19], ['Saquon Barkley', 'PHI', 18], ['Jahmyr Gibbs', 'DET', 18], ['Christian McCaffrey', 'SF', 18], ["De'Von Achane", 'MIA', 17],
      ['Derrick Henry', 'BAL', 16], ['Josh Jacobs', 'GB', 16], ['Jonathan Taylor', 'IND', 16], ['Kyren Williams', 'LAR', 15], ['Bucky Irving', 'TB', 15],
      ['James Cook', 'BUF', 15], ['Chase Brown', 'CIN', 14], ['Ashton Jeanty', 'LV', 15], ['Omarion Hampton', 'LAC', 13], ['Breece Hall', 'NYJ', 13],
      ['Kenneth Walker III', 'SEA', 13], ['Alvin Kamara', 'NO', 13], ['Chuba Hubbard', 'CAR', 12], ['James Conner', 'ARI', 12], ['David Montgomery', 'DET', 11],
      ['TreVeyon Henderson', 'NE', 11], ['Tony Pollard', 'TEN', 11], ['Aaron Jones Sr.', 'MIN', 11], ['Isiah Pacheco', 'KC', 10], ["D'Andre Swift", 'CHI', 11],
      ['Travis Etienne Jr.', 'JAX', 10], ['RJ Harvey', 'DEN', 10], ['Jaylen Warren', 'PIT', 9], ['Tyrone Tracy Jr.', 'NYG', 9], ['Javonte Williams', 'DAL', 10],
      ['Zach Charbonnet', 'SEA', 8], ['Kaleb Johnson', 'PIT', 8], ['Quinshon Judkins', 'CLE', 9], ['Cam Skattebo', 'NYG', 9], ['Rhamondre Stevenson', 'NE', 8],
      ['Rachaad White', 'TB', 7], ['Tank Bigsby', 'JAX', 6], ['Jordan Mason', 'MIN', 8], ['Nick Chubb', 'HOU', 7], ['Tyler Allgeier', 'ATL', 6]],
  3: [["Ja'Marr Chase", 'CIN', 20], ['Justin Jefferson', 'MIN', 18], ['CeeDee Lamb', 'DAL', 18], ['Puka Nacua', 'LAR', 18], ['Amon-Ra St. Brown', 'DET', 17],
      ['Malik Nabers', 'NYG', 17], ['Nico Collins', 'HOU', 16], ['Brian Thomas Jr.', 'JAX', 15], ['A.J. Brown', 'PHI', 15], ['Drake London', 'ATL', 15],
      ['Ladd McConkey', 'LAC', 14], ['Jaxon Smith-Njigba', 'SEA', 15], ['Tyreek Hill', 'MIA', 14], ['Garrett Wilson', 'NYJ', 14], ['Tee Higgins', 'CIN', 13],
      ['Mike Evans', 'TB', 13], ['Davante Adams', 'LAR', 13], ['Terry McLaurin', 'WSH', 13], ['Marvin Harrison Jr.', 'ARI', 12], ['DK Metcalf', 'PIT', 12],
      ['Tetairoa McMillan', 'CAR', 12], ['Zay Flowers', 'BAL', 12], ['Rashee Rice', 'KC', 12], ['DJ Moore', 'CHI', 11], ['Jaylen Waddle', 'MIA', 11],
      ['George Pickens', 'DAL', 12], ['Xavier Worthy', 'KC', 10], ['Courtland Sutton', 'DEN', 11], ['Jameson Williams', 'DET', 10], ['Chris Olave', 'NO', 10],
      ['DeVonta Smith', 'PHI', 10], ['Jordan Addison', 'MIN', 10], ['Travis Hunter', 'JAX', 10], ['Rome Odunze', 'CHI', 10], ['Deebo Samuel', 'WSH', 10],
      ['Stefon Diggs', 'NE', 9], ['Khalil Shakir', 'BUF', 9], ['Jauan Jennings', 'SF', 9], ['Emeka Egbuka', 'TB', 9], ['Josh Downs', 'IND', 9],
      ['Michael Pittman Jr.', 'IND', 9], ['Jakobi Meyers', 'LV', 9], ['Jerry Jeudy', 'CLE', 8], ['Calvin Ridley', 'TEN', 8], ['Keon Coleman', 'BUF', 8],
      ['Ricky Pearsall', 'SF', 8], ['Chris Godwin', 'TB', 8], ['Cooper Kupp', 'SEA', 8], ['Rashod Bateman', 'BAL', 7], ['Darnell Mooney', 'ATL', 7]],
  4: [['Brock Bowers', 'LV', 13], ['Trey McBride', 'ARI', 13], ['George Kittle', 'SF', 11], ['Sam LaPorta', 'DET', 10], ['Travis Kelce', 'KC', 10],
      ['Mark Andrews', 'BAL', 9], ['T.J. Hockenson', 'MIN', 9], ['Tyler Warren', 'IND', 9], ['David Njoku', 'CLE', 8], ['Dalton Kincaid', 'BUF', 8],
      ['Jake Ferguson', 'DAL', 8], ['Tucker Kraft', 'GB', 8], ['Kyle Pitts', 'ATL', 7], ['Evan Engram', 'DEN', 7], ['Dallas Goedert', 'PHI', 7],
      ['Hunter Henry', 'NE', 7], ['Colston Loveland', 'CHI', 6], ['Pat Freiermuth', 'PIT', 6], ['Cole Kmet', 'CHI', 5], ['Isaiah Likely', 'BAL', 6]],
  5: [['Brandon Aubrey', 'DAL', 10], ['Cameron Dicker', 'LAC', 9], ['Jake Bates', 'DET', 9], ["Ka'imi Fairbairn", 'HOU', 9], ['Chris Boswell', 'PIT', 9],
      ['Wil Lutz', 'DEN', 8], ['Jason Myers', 'SEA', 8], ['Tyler Bass', 'BUF', 8], ['Harrison Butker', 'KC', 8], ['Evan McPherson', 'CIN', 8]],
  16: [['Steelers D/ST', 'PIT', 8], ['Broncos D/ST', 'DEN', 8], ['Ravens D/ST', 'BAL', 7], ['Eagles D/ST', 'PHI', 7], ['Texans D/ST', 'HOU', 7],
       ['Vikings D/ST', 'MIN', 7], ['Bills D/ST', 'BUF', 7], ['Chiefs D/ST', 'KC', 6], ['Lions D/ST', 'DET', 6], ['Seahawks D/ST', 'SEA', 6]]
};

// Deterministic random numbers
function rng(seed) {   // mulberry32
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Players and rosters ----------
function buildPlayers() {
  const players = [];
  let id = 4100001;
  Object.keys(POOL).forEach(pos => POOL[pos].forEach(([name, tm, pts]) => {
    const pid = Number(pos) === 16 ? -16000 - PRO[tm] : id++;
    players.push({ id: pid, name, pos: Number(pos), tm, pro: PRO[tm], base: pts });
  }));
  return players;
}
const PLAYERS = buildPlayers();
const byPos = pos => PLAYERS.filter(p => p.pos === pos);

// 15 players per team: QB×2, RB×4, WR×5, TE×2, K, D/ST. Starters: QB, RB, RB, WR, WR, TE, FLEX, D/ST, K.
function buildRosters() {
  const need = [[1, 2], [2, 4], [3, 5], [4, 2], [5, 1], [16, 1]];
  const rosters = {};
  for (let t = 1; t <= 10; t++) rosters[t] = [];
  need.forEach(([pos, n]) => {
    const list = byPos(pos);
    let k = 0;
    for (let round = 0; round < n; round++) {
      for (let i = 0; i < 10; i++) {
        const t = round % 2 === 0 ? i + 1 : 10 - i;   // snake so strength spreads out
        if (k < list.length) rosters[t].push(list[k++]);
      }
    }
  });
  const slots = {};
  Object.keys(rosters).forEach(t => {
    const r = rosters[t];
    const qb = r.filter(p => p.pos === 1), rb = r.filter(p => p.pos === 2), wr = r.filter(p => p.pos === 3), te = r.filter(p => p.pos === 4);
    const k = r.filter(p => p.pos === 5), d = r.filter(p => p.pos === 16);
    const flex = [rb[2], wr[2]].sort((a, b) => b.base - a.base)[0];
    const starters = [[qb[0], 0], [rb[0], 2], [rb[1], 2], [wr[0], 4], [wr[1], 4], [te[0], 6], [flex, 23], [d[0], 16], [k[0], 17]];
    const used = new Set(starters.map(s => s[0].id));
    slots[t] = starters.concat(r.filter(p => !used.has(p.id)).map(p => [p, 20]));
  });
  return slots;
}
const LINEUPS = buildRosters();
const INJURIES = { 'Puka Nacua': 'OUT', 'Mike Evans': 'QUESTIONABLE', 'Travis Kelce': 'QUESTIONABLE', 'Rashee Rice': 'SUSPENSION',
                   'Chris Godwin': 'INJURY_RESERVE', 'Nick Chubb': 'DOUBTFUL' };

// ---------- Schedule ----------
// Circle method: 9 rounds for 10 teams, weeks 10–14 repeat rounds 1–5
function regularPairs() {
  const teams = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const rounds = [];
  let arr = teams.slice();
  for (let r = 0; r < 9; r++) {
    const pairs = [];
    for (let i = 0; i < 5; i++) pairs.push(r % 2 ? [arr[i], arr[9 - i]] : [arr[9 - i], arr[i]]);
    rounds.push(pairs);
    arr = [arr[0]].concat([arr[9]], arr.slice(1, 9));
  }
  const out = {};
  for (let w = 1; w <= 14; w++) out[w] = rounds[(w - 1) % 9];
  return out;
}
const PAIRS = regularPairs();
const STRENGTH = { 1: 118, 2: 111, 3: 124, 4: 103, 5: 107, 6: 115, 7: 98, 8: 121, 9: 101, 10: 109 };
function weekScore(team, week, season) {
  const r = rng(team * 1000 + week * 17 + season)();
  return Math.round((STRENGTH[team] - 12 + r * 34 + (season - SEASON) * 3) * 100) / 100;
}

// ---------- NFL games ----------
// [away, home, kickoff UTC, state, status name, period, clock, away score, home score]
const NFL = {
  5: { now: '2026-10-04T19:10:00Z', byes: ['NYG', 'TEN'], games: [
    ['LAR', 'SF', '2026-10-02T00:15Z', 'post', 'STATUS_FINAL', 4, '0:00', 23, 27],
    ['MIN', 'CLE', '2026-10-04T13:30Z', 'post', 'STATUS_FINAL', 5, '0:00', 26, 20],
    ['BUF', 'NE', '2026-10-04T17:00Z', 'in', 'STATUS_IN_PROGRESS', 3, '4:12', 17, 24],
    ['MIA', 'CAR', '2026-10-04T17:00Z', 'in', 'STATUS_IN_PROGRESS', 4, '11:32', 13, 20],
    ['PHI', 'DEN', '2026-10-04T17:00Z', 'in', 'STATUS_HALFTIME', 2, '0:00', 10, 14],
    ['HOU', 'BAL', '2026-10-04T17:00Z', 'in', 'STATUS_IN_PROGRESS', 4, '2:05', 16, 13],
    ['DAL', 'NYJ', '2026-10-04T17:00Z', 'in', 'STATUS_END_PERIOD', 3, '0:00', 21, 10],
    ['LV', 'IND', '2026-10-04T17:00Z', 'in', 'STATUS_IN_PROGRESS', 3, '1:15', 14, 14],
    ['CIN', 'DET', '2026-10-04T17:00Z', 'in', 'STATUS_IN_PROGRESS', 4, '6:40', 24, 17],
    ['NO', 'ATL', '2026-10-04T17:00Z', 'in', 'STATUS_IN_PROGRESS', 3, '9:03', 10, 17],
    ['PIT', 'SEA', '2026-10-04T20:05Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0],
    ['KC', 'JAX', '2026-10-04T20:25Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0],
    ['LAC', 'WSH', '2026-10-04T20:25Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0],
    ['GB', 'TB', '2026-10-05T00:20Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0],
    ['ARI', 'CHI', '2026-10-06T00:15Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0]
  ] },
  16: { now: '2026-12-20T20:30:00Z', byes: [], games: [
    ['DEN', 'KC', '2026-12-19T21:30Z', 'post', 'STATUS_FINAL', 4, '0:00', 20, 23],
    ['BAL', 'CLE', '2026-12-20T01:15Z', 'post', 'STATUS_FINAL', 4, '0:00', 31, 17],
    ['BUF', 'MIA', '2026-12-20T18:00Z', 'in', 'STATUS_IN_PROGRESS', 3, '7:41', 20, 13],
    ['DET', 'CHI', '2026-12-20T18:00Z', 'in', 'STATUS_IN_PROGRESS', 3, '2:20', 24, 21],
    ['PHI', 'WSH', '2026-12-20T18:00Z', 'in', 'STATUS_HALFTIME', 2, '0:00', 14, 10],
    ['CIN', 'PIT', '2026-12-20T18:00Z', 'in', 'STATUS_IN_PROGRESS', 4, '12:02', 17, 20],
    ['HOU', 'TEN', '2026-12-20T18:00Z', 'in', 'STATUS_IN_PROGRESS', 3, '0:48', 21, 3],
    ['MIN', 'NYG', '2026-12-20T18:00Z', 'in', 'STATUS_IN_PROGRESS', 3, '5:55', 13, 10],
    ['ATL', 'CAR', '2026-12-20T18:00Z', 'in', 'STATUS_IN_PROGRESS', 4, '9:30', 27, 24],
    ['JAX', 'IND', '2026-12-20T18:00Z', 'in', 'STATUS_IN_PROGRESS', 3, '10:14', 10, 17],
    ['SF', 'LAR', '2026-12-20T21:25Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0],
    ['SEA', 'ARI', '2026-12-20T21:25Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0],
    ['LAC', 'LV', '2026-12-20T21:05Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0],
    ['DAL', 'TB', '2026-12-21T01:20Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0],
    ['NE', 'NYJ', '2026-12-21T18:00Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0],
    ['GB', 'NO', '2026-12-22T01:15Z', 'pre', 'STATUS_SCHEDULED', 0, '0:00', 0, 0]
  ] }
};
function gameOf(week, tm) {
  const w = NFL[week];
  if (!w) return null;
  const g = w.games.find(x => x[0] === tm || x[1] === tm);
  return g ? { ko: Date.parse(g[2]), state: g[3], period: g[5], clock: g[6] } : null;
}
function scoreboard(week) {
  const w = NFL[week];
  return { season: { year: SEASON, type: 2 }, week: { number: week }, events: w.games.map((g, i) => {
    const [aw, hm, ko, state, name, period, clock, as, hs] = g;
    const [m, s] = clock.split(':').map(Number);
    const status = { clock: m * 60 + s, displayClock: clock, period, type: { name, state, completed: state === 'post' } };
    const side = (ab, homeAway, score) => ({ id: String(PRO[ab]), homeAway, score: String(score), team: { id: String(PRO[ab]), abbreviation: ab } });
    return { id: String(401700000 + week * 100 + i), date: ko, name: aw + ' at ' + hm, status,
      competitions: [{ date: ko, timeValid: true, status, competitors: [side(hm, 'home', hs), side(aw, 'away', as)] }] };
  }) };
}

// ---------- Player stats for a week ----------
function progress(week, tm) {
  const g = gameOf(week, tm);
  if (!g || g.state === 'pre') return null;
  if (g.state === 'post') return 1;
  if (g.period > 4) return 1;
  const [m, s] = g.clock.split(':').map(Number);
  return ((g.period - 1) * 900 + (900 - (m * 60 + s))) / 3600;
}
function statsFor(p, week, frac) {
  const r = rng(Math.abs(p.id) + week * 31);
  const f = frac * (0.55 + r() * 1.1);
  const st = {};
  if (p.pos === 1) { st[3] = Math.round(250 * f + r() * 20); st[4] = Math.round(2 * f); st[20] = r() < 0.3 * frac ? 1 : 0; st[24] = Math.round(18 * f); st[25] = r() < 0.15 * frac ? 1 : 0; }
  else if (p.pos === 2) { st[24] = Math.round(70 * f); st[25] = r() < 0.45 * f ? 1 : 0; st[53] = Math.round(3 * f); st[42] = Math.round(22 * f); }
  else if (p.pos === 3 || p.pos === 4) { const k = p.pos === 3 ? 1 : 0.7; st[53] = Math.round(6 * f * k); st[42] = Math.round(75 * f * k); st[43] = r() < 0.4 * f ? 1 : 0; }
  else if (p.pos === 5) { st[84] = Math.round(2.4 * frac); st[83] = Math.max(0, st[84] - (r() < 0.2 ? 1 : 0)); st[87] = Math.round(2.6 * frac); st[86] = st[87]; }
  else { st[99] = Math.round(3 * f); st[95] = r() < 0.4 * f ? 1 : 0; st[96] = r() < 0.2 * f ? 1 : 0; st[120] = Math.round(22 * frac * (0.4 + r())); st[127] = Math.round(320 * frac * (0.6 + r() * 0.7)); }
  Object.keys(st).forEach(k => { if (!st[k]) delete st[k]; });
  if (p.pos === 16) { if (st[120] == null) st[120] = 0; if (st[127] == null) st[127] = 0; }
  return st;
}
function pointsFor(p, st, frac) {
  const v = id => st[id] || 0;
  if (p.pos === 5) return v(83) * 3 + v(86);
  if (p.pos === 16) {
    const pa = v(120);
    const paPts = frac < 1 ? 0 : pa === 0 ? 5 : pa <= 6 ? 4 : pa <= 13 ? 3 : pa <= 17 ? 1 : pa <= 27 ? 0 : pa <= 34 ? -1 : -3;
    return v(99) + 2 * v(95) + 2 * v(96) + paPts;
  }
  return Math.round((0.04 * v(3) + 4 * v(4) - 2 * v(20) + 0.1 * (v(24) + v(42)) + 6 * (v(25) + v(43)) + v(53)) * 10) / 10;
}
function projection(p, week) { return Math.round((p.base * (0.85 + rng(Math.abs(p.id) * 7 + week)() * 0.3)) * 100) / 100; }

function entry(p, slot, week, opts = {}) {
  const frac = opts.allFinal ? 1 : progress(week, p.tm);
  const bye = !!(NFL[week] && NFL[week].byes.indexOf(p.tm) > -1);
  const stats = [{ scoringPeriodId: week, statSourceId: 1, statSplitTypeId: 1, appliedTotal: opts.out || bye ? 0 : projection(p, week), stats: {} }];
  stats.push({ scoringPeriodId: 0, statSourceId: 0, statSplitTypeId: 0, appliedTotal: p.base * (week - 1), stats: { 3: 9999 } });   // season totals, must be ignored
  if (frac != null && !opts.out) {
    const st = statsFor(p, week, frac);
    stats.push({ scoringPeriodId: week, statSourceId: 0, statSplitTypeId: 1, appliedTotal: pointsFor(p, st, frac), stats: st });
  } else if (frac != null && opts.out) {
    stats.push({ scoringPeriodId: week, statSourceId: 0, statSplitTypeId: 1, appliedTotal: 0, stats: {} });   // ESPN starts a line at kickoff
  }
  return { lineupSlotId: slot, playerId: p.id, injuryStatus: 'NORMAL', playerPoolEntry: { id: p.id, player: {
    id: p.id, fullName: p.name, defaultPositionId: p.pos, proTeamId: p.pro, stats } } };
}
function teamEntries(team, week, opts) {
  return LINEUPS[team].map(([p, slot]) => entry(p, slot, week, Object.assign({}, opts, { out: INJURIES[p.name] === 'OUT' || INJURIES[p.name] === 'SUSPENSION' })));
}
function lineupPoints(team, week, opts) {
  return Math.round(teamEntries(team, week, opts).filter(e => e.lineupSlotId !== 20 && e.lineupSlotId !== 21)
    .reduce((s, e) => { const a = e.playerPoolEntry.player.stats.find(x => x.statSourceId === 0 && x.scoringPeriodId === week); return s + (a ? a.appliedTotal : 0); }, 0) * 100) / 100;
}

// ---------- League answers ----------
function settings(season, opts = {}) {
  const periods = {};
  for (let w = 1; w <= 17; w++) periods[w] = [w];
  return {
    name: 'Sunday Funday League', size: 10, isPublic: false,
    scheduleSettings: { matchupPeriodCount: 14, matchupPeriodLength: 1, playoffTeamCount: 6, playoffMatchupPeriodLength: 1,
      divisions: [{ id: 0, name: 'East', size: 5 }, { id: 1, name: 'West', size: 5 }], matchupPeriods: periods },
    scoringSettings: { scoringType: 'H2H_POINTS', scoringItems: [{ statId: 53, points: 1 }, { statId: 42, points: 0.1 }] },
    rosterSettings: { lineupSlotCounts: { 0: 1, 2: 2, 4: 2, 6: 1, 16: 1, 17: 1, 20: 6, 21: 1, 23: 1 } },
    acquisitionSettings: { isUsingAcquisitionBudget: true, acquisitionBudget: 100 },
    tradeSettings: { deadlineDate: Date.parse(season + '-11-18T17:00:00Z') },
    draftSettings: Object.assign({ keeperCount: 1, type: 'SNAKE', timePerSelection: 90, date: Date.parse(season + '-09-02T23:00:00Z'), pickOrder: [] }, opts.draft || {})
  };
}
function members(season) {
  return OWNERS.map((o, i) => ({ id: '{00000000-0000-4000-8000-0000000000' + String(i + 1).padStart(2, '0') + '}',
    firstName: o[0], lastName: o[1], displayName: (o[0] + o[1]).toLowerCase() + (season % 100) }));
}
function teamObj(i, extra) {
  return Object.assign({ id: i, name: TEAM_NAMES[i - 1], abbrev: TEAM_NAMES[i - 1].split(' ').map(w => w[0]).join('').slice(0, 4).toUpperCase(),
    owners: ['{00000000-0000-4000-8000-0000000000' + String(i).padStart(2, '0') + '}'], divisionId: i <= 5 ? 0 : 1, playoffSeed: 0,
    rankCalculatedFinal: 0, transactionCounter: { acquisitions: (i * 3) % 11, trades: i % 3 === 0 ? 1 : 0, acquisitionBudgetSpent: (i * 7) % 60 },
    logo: 'https://g.espncdn.com/lm-static/logo-packs/core/example-' + i + '.svg' }, extra || {});
}

// Every game of `season`, as ESPN lists them in mMatchupScore, up to the scenario's point in time
function schedule(season, upToWeek, live) {
  const games = [];
  let id = 1;
  for (let w = 1; w <= 14; w++) {
    PAIRS[w].forEach(([h, a]) => {
      let sh = 0, sa = 0, winner = 'UNDECIDED';
      if (w < upToWeek) { sh = weekScore(h, w, season); sa = weekScore(a, w, season); winner = sh > sa ? 'HOME' : sa > sh ? 'AWAY' : 'TIE'; }
      else if (w === upToWeek && live) { sh = lineupPoints(h, w); sa = lineupPoints(a, w); }
      games.push({ id: id++, matchupPeriodId: w, playoffTierType: 'NONE', winner,
        home: { teamId: h, totalPoints: sh, pointsByScoringPeriod: { [w]: sh } }, away: { teamId: a, totalPoints: sa, pointsByScoringPeriod: { [w]: sa } } });
    });
  }
  return games;
}
function regularRecords(season) {
  const rec = {};
  for (let t = 1; t <= 10; t++) rec[t] = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, streak: [] };
  schedule(season, 15, false).forEach(g => {
    const H = rec[g.home.teamId], A = rec[g.away.teamId];
    H.pointsFor += g.home.totalPoints; A.pointsFor += g.away.totalPoints; H.pointsAgainst += g.away.totalPoints; A.pointsAgainst += g.home.totalPoints;
    if (g.winner === 'HOME') { H.wins++; A.losses++; H.streak.push('WIN'); A.streak.push('LOSS'); }
    else { A.wins++; H.losses++; A.streak.push('WIN'); H.streak.push('LOSS'); }
  });
  return rec;
}
function seeds(season) {
  const rec = regularRecords(season);
  return Object.keys(rec).map(Number).sort((a, b) => (rec[b].wins - rec[a].wins) || (rec[b].pointsFor - rec[a].pointsFor));
}
function recordOf(r) {
  const last = r.streak[r.streak.length - 1];
  let n = 0;
  for (let i = r.streak.length - 1; i >= 0 && r.streak[i] === last; i--) n++;
  return { overall: { wins: r.wins, losses: r.losses, ties: 0, pointsFor: Math.round(r.pointsFor * 100) / 100,
    pointsAgainst: Math.round(r.pointsAgainst * 100) / 100, streakType: last || 'WIN', streakLength: n, percentage: r.wins / Math.max(1, r.wins + r.losses) } };
}

// Playoffs: 6 teams; seeds 1 and 2 have byes. Week 15: 3v6, 4v5. Week 16: 1 vs lower winner, 2 vs higher winner. Week 17: final + third.
function playoffGames(season, upToWeek, liveWeek) {
  const order = seeds(season);
  const seed = n => order[n - 1];
  const g = [];
  let id = 100;
  const score = (t, w) => weekScore(t, w, season) + 4;
  const play = (w, h, a, tier) => {
    const done = w < upToWeek;
    const live = w === liveWeek;
    const sh = done ? score(h, w) : live ? lineupPoints(h, w) : 0, sa = done ? score(a, w) : live ? lineupPoints(a, w) : 0;
    const winner = done ? (sh >= sa ? 'HOME' : 'AWAY') : 'UNDECIDED';
    g.push({ id: id++, matchupPeriodId: w, playoffTierType: tier, winner,
      home: { teamId: h, totalPoints: sh, pointsByScoringPeriod: { [w]: sh } }, away: { teamId: a, totalPoints: sa, pointsByScoringPeriod: { [w]: sa } } });
    return done ? (sh >= sa ? [h, a] : [a, h]) : null;
  };
  if (upToWeek < 15) return g;
  const q1 = play(15, seed(3), seed(6), 'WINNERS_BRACKET');
  const q2 = play(15, seed(4), seed(5), 'WINNERS_BRACKET');
  play(15, seed(7), seed(10), 'LOSERS_CONSOLATION_LADDER');
  play(15, seed(8), seed(9), 'LOSERS_CONSOLATION_LADDER');
  if (upToWeek < 16 || !q1 || !q2) return g;
  const lowWin = order.indexOf(q1[0]) > order.indexOf(q2[0]) ? q1[0] : q2[0];
  const highWin = lowWin === q1[0] ? q2[0] : q1[0];
  const s1 = play(16, seed(1), lowWin, 'WINNERS_BRACKET');
  const s2 = play(16, seed(2), highWin, 'WINNERS_BRACKET');
  play(16, q1[1], q2[1], 'WINNERS_CONSOLATION_LADDER');
  if (upToWeek < 17 || !s1 || !s2) return g;
  play(17, s1[0], s2[0], 'WINNERS_BRACKET');
  play(17, s1[1], s2[1], 'WINNERS_CONSOLATION_LADDER');
  return g;
}

function league(scenario) {
  if (scenario === 'predraft') {
    const s = settings(2027, { draft: { pickOrder: [], date: Date.parse('2027-09-02T23:00:00Z') } });
    const keepers = {};
    [1, 2, 3, 5, 6, 8, 9].forEach(t => { keepers[t] = [keeperOf(t, 2027).id]; });
    return { id: Number(LEAGUE_ID), seasonId: 2027, draftDetail: { drafted: false, inProgress: false },
      status: { currentMatchupPeriod: 1, latestScoringPeriod: 1, finalScoringPeriod: 17, firstScoringPeriod: 1, previousSeasons: [2022, 2023, 2024, 2025, 2026] },
      settings: s, members: members(2027),
      teams: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => teamObj(i, { record: { overall: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, streakType: 'NONE', streakLength: 0 } },
        transactionCounter: { acquisitions: 0, trades: 0 }, draftStrategy: keepers[i] ? { keeperPlayerIds: keepers[i] } : {} })),
      schedule: schedule(2027, 0, false) };
  }
  const week = { week5: 5, week16: 16, complete: 18 }[scenario];
  const rec = week > 14 ? regularRecords(SEASON) : null;
  const order = seeds(SEASON);
  let games = schedule(SEASON, Math.min(week, 15), week === 5);
  if (week > 14) games = games.concat(playoffGames(SEASON, week, week === 16 ? 16 : 0));
  const partial = {};
  if (week === 5) {   // records through week 4
    for (let t = 1; t <= 10; t++) partial[t] = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, streak: [] };
    games.filter(g => g.matchupPeriodId < 5).forEach(g => {
      const H = partial[g.home.teamId], A = partial[g.away.teamId];
      H.pointsFor += g.home.totalPoints; A.pointsFor += g.away.totalPoints; H.pointsAgainst += g.away.totalPoints; A.pointsAgainst += g.home.totalPoints;
      if (g.winner === 'HOME') { H.wins++; A.losses++; H.streak.push('WIN'); A.streak.push('LOSS'); } else { A.wins++; H.losses++; A.streak.push('WIN'); H.streak.push('LOSS'); }
    });
  }
  const partialOrder = week === 5 ? Object.keys(partial).map(Number).sort((a, b) => (partial[b].wins - partial[a].wins) || (partial[b].pointsFor - partial[a].pointsFor)) : [];
  const finalRank = {};
  if (scenario === 'complete') {
    const f = games.filter(g => g.matchupPeriodId === 17);
    const fin = f.find(g => g.playoffTierType === 'WINNERS_BRACKET'), third = f.find(g => g.playoffTierType === 'WINNERS_CONSOLATION_LADDER');
    const wl = g => g.winner === 'HOME' ? [g.home.teamId, g.away.teamId] : [g.away.teamId, g.home.teamId];
    const [c, ru] = wl(fin), [t3, t4] = wl(third);
    let r = 5;
    [c, ru, t3, t4].forEach((t, i) => { finalRank[t] = i + 1; });
    order.forEach(t => { if (!finalRank[t]) finalRank[t] = r++; });
  }
  return {
    id: Number(LEAGUE_ID), seasonId: SEASON, draftDetail: { drafted: true, inProgress: false },
    status: { currentMatchupPeriod: Math.min(week, 17), latestScoringPeriod: Math.min(week, 17), finalScoringPeriod: 17, firstScoringPeriod: 1,
              previousSeasons: [2022, 2023, 2024, 2025] },
    settings: settings(SEASON), members: members(SEASON),
    teams: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => teamObj(i, {
      record: recordOf(rec ? rec[i] : partial[i]),
      playoffSeed: week > 14 ? order.indexOf(i) + 1 : week === 5 ? partialOrder.indexOf(i) + 1 : 0,
      rankCalculatedFinal: finalRank[i] || 0
    })),
    schedule: games
  };
}

// mBoxscore for the current matchup period: the same games with every roster's week
function boxscore(scenario) {
  const L = league(scenario);
  const week = L.status.currentMatchupPeriod;
  return { schedule: L.schedule.filter(g => g.matchupPeriodId === week).map(g => ({
    matchupPeriodId: g.matchupPeriodId, id: g.id,
    home: Object.assign({}, g.home, { rosterForCurrentScoringPeriod: { entries: teamEntries(g.home.teamId, week) } }),
    away: Object.assign({}, g.away, { rosterForCurrentScoringPeriod: { entries: teamEntries(g.away.teamId, week) } })
  })) };
}

// mRoster: every team's players with injury status (the box score has none)
function rosters(season) {
  return { teams: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(t => ({ id: t, roster: { entries: LINEUPS[t].map(([p, slot]) => ({
    lineupSlotId: slot, playerId: p.id, injuryStatus: 'NORMAL', playerPoolEntry: { player: { id: p.id, fullName: p.name,
      defaultPositionId: p.pos, proTeamId: p.pro, injured: !!INJURIES[p.name], injuryStatus: INJURIES[p.name] || 'ACTIVE' } } })) } })) };
}

// A season's draft: 15 rounds. Each team's keeper is its round-1 pick; next season's keeper is drafted in an early
// round (or is the same player again, which makes its tag K).
function keeperOf(t, season) { return LINEUPS[t][(t + season) % 6][0]; }
function draft(season) {
  const picks = [];
  const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const early = { 1: 2, 2: 3, 3: 2, 4: 4, 5: 5, 6: 3, 7: 2, 8: 6, 9: 4, 10: 3 };
  let overall = 1;
  const plan = {};
  order.forEach(t => {
    const keep = keeperOf(t, season), next = keeperOf(t, season + 1);
    plan[t] = { 1: keep };
    if (next.id !== keep.id) plan[t][early[t]] = next;
  });
  const used = new Set();
  order.forEach(t => Object.values(plan[t]).forEach(p => used.add(p.id)));
  for (let round = 1; round <= 15; round++) {
    const list = round % 2 ? order : order.slice().reverse();
    list.forEach(t => {
      let pick = plan[t][round];
      if (!pick) { pick = LINEUPS[t].map(x => x[0]).find(p => !used.has(p.id)) || PLAYERS.find(p => !used.has(p.id)); used.add(pick.id); }
      picks.push({ overallPickNumber: overall++, roundId: round, teamId: t, playerId: pick.id, keeper: round === 1 && season >= 2025 });
    });
  }
  return { draftDetail: { drafted: true, inProgress: false, picks }, settings: settings(season) };
}

// A past season, as ESPN answers mTeam + mMatchupScore + mSettings
function pastSeason(season) {
  const games = schedule(season, 15, false);
  const rec = regularRecords(season);
  const order = seeds(season);
  const ranks = {};
  const rot = (season - 2022) % 10;
  order.forEach((t, i) => { ranks[t] = ((i + rot) % 10) + 1; });
  const names = season < 2024 ? TEAM_NAMES.map((n, i) => i === 3 ? 'Envy of the League' : n) : TEAM_NAMES;
  return { id: Number(LEAGUE_ID), seasonId: season, settings: settings(season), members: members(season),
    status: { previousSeasons: [] },
    teams: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => teamObj(i, { name: names[i - 1], record: recordOf(rec[i]), rankCalculatedFinal: ranks[i] })),
    schedule: games };
}

// Routes League Hub's requests to the answers above
function makeFetch(scenario, opts = {}) {
  const calls = [];
  const cookieOk = opts.cookieOk !== false;
  const fn = (url, o) => {
    calls.push(url);
    if (/site\.(web\.)?api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/scoreboard/.test(url)) {
      if (opts.nflDown) return { code: 503, body: '' };
      if (/^https:\/\/site\.api\.espn\.com/.test(url)) return { code: 403, body: 'Access Denied' };
      const wk = Number((url.match(/week=(\d+)/) || [])[1]);
      return NFL[wk] ? { code: 200, body: scoreboard(wk) } : { code: 200, body: { week: { number: wk }, events: [] } };
    }
    if (url.indexOf('lm-api-reads.fantasy.espn.com') < 0) return { code: 404, body: '' };
    const cookie = (o.headers || {}).Cookie || '';
    if (opts.private && !(cookieOk && /espn_s2=/.test(cookie))) return { code: 401, body: { messages: ['You are not authorized to view this League.'] } };
    const m = url.match(/seasons\/(\d{4})\/segments\/0\/leagues\/(\d+)/);
    if (!m || m[2] !== LEAGUE_ID) return { code: 404, body: { messages: ['Not Found'] } };
    const season = Number(m[1]);
    const current = scenario === 'predraft' ? 2027 : SEASON;
    if (season > current) return opts.futureAuth ? { code: 401, body: { messages: ['You are not authorized to view this League.'] } }
                                                 : { code: 404, body: { messages: ['Not Found'] } };
    if (/view=kona_player_info/.test(url)) {
      const ids = (JSON.parse(o.headers['X-Fantasy-Filter'] || '{}').players || {}).filterIds || { value: [] };
      return { code: 200, body: { players: PLAYERS.filter(p => ids.value.indexOf(p.id) > -1).map(p => ({ id: p.id, player: { id: p.id, fullName: p.name, defaultPositionId: p.pos, proTeamId: p.pro } })) } };
    }
    if (/view=mDraftDetail/.test(url)) {
      if (season === current && scenario === 'predraft') return { code: 200, body: { draftDetail: { drafted: false, picks: [] }, settings: settings(season) } };
      return { code: 200, body: draft(season) };
    }
    if (/view=mRoster/.test(url)) return { code: 200, body: rosters(season) };
    if (/view=mBoxscore/.test(url)) return { code: 200, body: boxscore(scenario) };
    if (season < current) return { code: 200, body: season === SEASON ? league('complete') : pastSeason(season) };   // before the 2027 draft, 2026 is over
    return { code: 200, body: league(scenario) };
  };
  fn.calls = calls;
  return fn;
}

const NOW = { week5: Date.parse(NFL[5].now), week16: Date.parse(NFL[16].now), complete: Date.parse('2027-01-06T15:00:00Z'), predraft: Date.parse('2027-08-20T16:00:00Z') };

module.exports = { LEAGUE_ID, SEASON, TEAM_NAMES, PLAYERS, LINEUPS, INJURIES, league, boxscore, rosters, draft, pastSeason, scoreboard, makeFetch, NOW, seeds };
