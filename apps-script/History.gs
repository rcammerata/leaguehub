/**
 * League Hub: league history.
 *
 * Every past season ESPN lists for the league is read once (at most two per update) and saved in Script
 * Properties: champion, runner-up, third place, the regular season's top scorer and every team's final place.
 * Seasons before 2018 come from ESPN's leagueHistory address, which needs ESPN cookies even for public leagues.
 */

function lhHistory_(settings, season, status, feed) {
  const years = (status.previousSeasons || []).map(Number).filter(y => y >= 2004 && y < season).sort((a, b) => b - a);
  const list = [];
  if (feed.league.phase === 'complete') {
    const now = lhSummaryFromFeed_(feed);
    if (now) list.push(now);
  }
  let fetched = 0;
  years.forEach(y => {
    let s = lhHistoryStored_(settings.leagueId, y);
    if (!s && fetched < 2) { fetched++; s = lhHistoryFetch_(settings, y); }
    if (s) list.push(s);
  });
  return list.map(s => lhHistoryForFeed_(s, settings.managerNames));
}

// One past season (saved copy, or read from ESPN now)
function lhHistorySeason_(settings, year) {
  return lhHistoryStored_(settings.leagueId, year) || lhHistoryFetch_(settings, year);
}

function lhHistoryStored_(leagueId, year) {
  return lhJson_(lhProps_().getProperty('LH_HIST_' + leagueId + '_' + year));
}

function lhHistoryFetch_(settings, year) {
  const tryKey = 'LH_HIST_TRY_' + settings.leagueId + '_' + year;
  if (lhCache_().get(tryKey)) return null;
  const r = lhEspnGet_(settings.leagueId, year, 'view=mTeam&view=mMatchupScore&view=mSettings');
  const summary = r.ok ? lhSeasonSummary_(year, r.data) : null;
  if (!summary) { lhCache_().put(tryKey, '1', r.problem === 'auth' ? 24 * 3600 : 6 * 3600); return null; }
  const json = JSON.stringify(summary);
  if (json.length < 8500) lhProps_().setProperty('LH_HIST_' + settings.leagueId + '_' + year, json);
  return summary;
}

// A finished season from ESPN's data, with each place's team and owner (names formatted later)
function lhSeasonSummary_(year, d) {
  const members = {};
  (d.members || []).forEach(m => { members[m.id] = { f: lhStr_(m.firstName), l: lhStr_(m.lastName), u: lhStr_(m.displayName) }; });
  const regWeeks = Number(((d.settings || {}).scheduleSettings || {}).matchupPeriodCount) || 14;
  const pf = {};
  (d.schedule || []).forEach(g => {
    if (Number(g.matchupPeriodId) > regWeeks) return;
    ['home', 'away'].forEach(k => { const s = g[k]; if (s && s.teamId != null) pf[s.teamId] = (pf[s.teamId] || 0) + (Number(s.totalPoints) || 0); });
  });
  const teams = (d.teams || []).map(t => {
    const rec = (t.record || {}).overall || {};
    return {
      id: t.id, name: lhEspnTeamName_(t), rank: Number(t.rankCalculatedFinal || t.rankFinal) || 0,
      pf: lhRound_(Number(rec.pointsFor) || pf[t.id] || 0, 2),
      owners: (t.owners || []).slice(0, 2).map(id => members[id]).filter(Boolean)
    };
  });
  if (!teams.some(t => t.rank > 0)) return null;   // not finished on ESPN
  const at = rank => { const t = teams.filter(x => x.rank === rank)[0]; return t ? { id: t.id, name: t.name, owners: t.owners } : null; };
  const most = teams.slice().sort((a, b) => b.pf - a.pf)[0];
  const ranks = {};
  teams.forEach(t => { ranks[t.id] = t.rank; });
  return { season: year, teams: teams.length, champion: at(1), runnerUp: at(2), third: at(3),
           mostPoints: most ? { id: most.id, name: most.name, owners: most.owners, points: most.pf } : null, ranks: ranks };
}

// This season, once it's over, from the feed itself
function lhSummaryFromFeed_(feed) {
  const f = feed.final;
  if (!f) return null;
  const byId = {};
  feed.teams.forEach(t => { byId[t.id] = t; });
  const place = id => id != null && byId[id] ? { id: id, name: byId[id].name, manager: byId[id].manager } : null;
  const most = feed.teams.slice().sort((a, b) => b.pf - a.pf)[0];
  const ranks = {};
  feed.teams.forEach(t => { ranks[t.id] = t.rank; });
  return { season: feed.league.season, teams: feed.teams.length, champion: place(f.champion), runnerUp: place(f.runnerUp),
           third: place(f.third), mostPoints: most ? { id: most.id, name: most.name, manager: most.manager, points: most.pf } : null,
           ranks: ranks, current: true };
}

// Saved summaries keep ESPN's owner names; the website gets them in the style the Settings tab asks for
function lhHistoryForFeed_(s, style) {
  const fmt = p => {
    if (!p) return null;
    const out = { id: p.id, name: p.name };
    if (p.points != null) out.points = p.points;
    if (p.manager != null) { out.manager = style === 'hide' ? '' : p.manager; return out; }
    out.manager = style === 'hide' ? '' : (p.owners || []).map(o => style === 'username' ? o.u
      : style === 'full' ? lhStr_([o.f, o.l].filter(Boolean).join(' ')) || o.u
      : lhShortName_(o.f, o.l) || o.u).filter(Boolean).join(' & ');
    return out;
  };
  return { season: s.season, teams: s.teams, champion: fmt(s.champion), runnerUp: fmt(s.runnerUp), third: fmt(s.third),
           mostPoints: fmt(s.mostPoints), ranks: s.ranks || {} };
}
