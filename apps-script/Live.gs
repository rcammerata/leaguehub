/**
 * League Hub: players and live projections for the current week.
 *
 * For every player on a roster:
 *   A = points so far this week, P = ESPN's projection for the week,
 *   r = fraction of his NFL game left (1 before kickoff, 0 once it's final; from the game clock, see Nfl.gs).
 * Live projection:
 *   offense and kickers   A + r × P
 *   team defenses (D/ST)  (1 − r) × A + r × P   (a defense's points can still drop, so it moves between A and P)
 * Team projection = the sum over starters. It never drops below the team's actual score, except while one of
 * its defenses is playing (a defense can lose points).
 */

const LH_POSITIONS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 7: 'P', 9: 'DT', 10: 'DE', 11: 'LB', 12: 'CB', 13: 'S', 14: 'HC', 16: 'DEF' };
const LH_BENCH_SLOTS = [20, 21];   // BE, IR
const LH_DEF_SLOT = 16;
// Stats kept for the website's stat lines: passing 3 yds, 4 TD, 20 INT; rushing 24 yds, 25 TD; receiving 42 yds,
// 43 TD, 53 catches; kicking 83/84 FG made/att, 86/87 XP made/att; defense 95 INT, 96 fumble rec, 99 sacks,
// 120 points allowed, 127 yards allowed
const LH_STAT_IDS = [3, 4, 20, 24, 25, 42, 43, 53, 83, 84, 86, 87, 95, 96, 99, 120, 127];
const LH_INJURY_TAGS = {
  QUESTIONABLE: 'Q', DOUBTFUL: 'D', OUT: 'O', INJURY_RESERVE: 'IR', INJURED_RESERVE: 'IR', SUSPENSION: 'SSPD',
  SUSPENDED: 'SSPD', DAY_TO_DAY: 'DTD', Q: 'Q', D: 'D', O: 'O', IR: 'IR', SSPD: 'SSPD', DTD: 'DTD'
};

function lhFirstNum_(list) {
  for (let i = 0; i < list.length; i++) {
    const n = Number(list[i]);
    if (list[i] != null && list[i] !== '' && isFinite(n)) return n;
  }
  return null;
}

function lhInjuryTag_(raw) {
  return LH_INJURY_TAGS[lhStr_(raw).toUpperCase().replace(/[\s-]+/g, '_')] || '';
}

function lhStatEntry_(player, spid, source) {
  const list = (player && Array.isArray(player.stats)) ? player.stats : [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s || Number(s.scoringPeriodId) !== Number(spid)) continue;
    if (source === 1 ? Number(s.statSourceId) === 1 : (s.statSourceId == null || Number(s.statSourceId) === 0)) return s;
  }
  return null;
}

/**
 * One roster entry → the player as the website shows it, plus the numbers the team totals need.
 * `nfl` is lhNflWeek_()'s { at, teams }; `injuries` (optional) maps player id → tag from the roster view.
 */
function lhPlayer_(entry, spid, nfl, injuries, now) {
  const ppe = (entry && entry.playerPoolEntry) || {};
  const pl = ppe.player || {};
  const slot = entry.lineupSlotId != null ? Number(entry.lineupSlotId) : null;
  const isDef = slot === LH_DEF_SLOT || Number(pl.defaultPositionId) === 16;

  const proj = lhStatEntry_(pl, spid, 1);
  const actual = lhStatEntry_(pl, spid, 0);
  const P = lhFirstNum_([proj && proj.appliedTotal, proj && proj.appliedStatTotal]) || 0;
  const liveA = lhFirstNum_([entry.appliedStatTotalLive, entry.totalPointsLive, ppe.appliedStatTotalLive]);
  const A = liveA != null ? liveA
    : (lhFirstNum_([actual && actual.appliedTotal, actual && actual.appliedStatTotal, entry.appliedStatTotal]) || 0);
  const started = liveA != null || !!actual;

  const tm = LH_PRO_TEAMS[Number(pl.proTeamId)] || '';
  let r = null;
  if (nfl && nfl.teams) {
    const g = nfl.teams[tm];
    r = g ? lhFracLeft_(g, nfl.at, now) : (tm && tm !== 'FA' ? 0 : null);   // not on the scoreboard = bye week
  }
  if (r == null) r = started ? 0.5 : 1;

  const live = isDef ? (1 - r) * A + r * P : A + r * P;

  const x = {};
  if (actual && actual.stats) {
    LH_STAT_IDS.forEach(id => {
      const v = Number(actual.stats[id]);
      if (isFinite(v) && (v !== 0 || id === 120 || id === 127)) x[id] = Math.round(v * 10) / 10;
    });
  }
  const tag = injuries && pl.id != null && injuries[pl.id] != null ? injuries[pl.id] : lhInjuryTag_(pl.injuryStatus);
  const out = {
    id: pl.id != null ? Number(pl.id) : null,
    n: lhStr_(pl.fullName || [pl.firstName, pl.lastName].filter(Boolean).join(' ')) || 'Unknown player',
    pos: isDef ? 'DEF' : (LH_POSITIONS[Number(pl.defaultPositionId)] || ''),
    slot: slot,
    tm: tm,
    inj: tag,
    a: lhRound_(A, 2),
    p: lhRound_(P, 2),
    lp: lhRound_(live, 2),
    r: lhRound_(r, 3),
    st: started ? 1 : 0,
    b: slot != null && LH_BENCH_SLOTS.indexOf(slot) > -1 ? 1 : 0
  };
  if (Object.keys(x).length) out.x = x;
  return { player: out, A: A, P: P, live: live, r: r, started: started, isDef: isDef };
}

// A team's lineup this week → { actual, proj, starters, bench }
function lhLineup_(entries, spid, nfl, injuries, now) {
  let actual = 0, projected = 0, defensePlaying = false;
  const starters = [], bench = [];
  (entries || []).forEach(e => {
    const x = lhPlayer_(e, spid, nfl, injuries, now);
    if (x.player.b) { bench.push(x.player); return; }
    starters.push(x.player);
    actual += x.A;
    projected += x.live;
    if (x.isDef && x.started && x.r > 0) defensePlaying = true;
  });
  const order = p => { const i = LH_SLOT_ORDER.indexOf(p.slot); return i < 0 ? 99 : i; };
  starters.sort((a, b) => order(a) - order(b));
  bench.sort((a, b) => order(a) - order(b));
  const proj = defensePlaying ? projected : Math.max(actual, projected);
  return { actual: lhRound_(actual, 2), proj: lhRound_(proj, 2), starters: starters, bench: bench };
}

// Lineup slots in the order the website lists them, with their labels
const LH_SLOT_ORDER = [0, 1, 2, 3, 4, 5, 6, 23, 7, 8, 9, 10, 11, 12, 13, 14, 15, 24, 16, 17, 18, 19, 20, 21];
const LH_SLOT_LABELS = {
  0: 'QB', 1: 'TQB', 2: 'RB', 3: 'RB/WR', 4: 'WR', 5: 'WR/TE', 6: 'TE', 7: 'OP', 8: 'DT', 9: 'DE', 10: 'LB', 11: 'DL',
  12: 'CB', 13: 'S', 14: 'DB', 15: 'DP', 16: 'D/ST', 17: 'K', 18: 'P', 19: 'HC', 20: 'Bench', 21: 'IR', 23: 'FLEX', 24: 'ER'
};
