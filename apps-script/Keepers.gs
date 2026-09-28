/**
 * League Hub: keepers and the draft.
 *
 * Keepers (only in leagues where ESPN's keeper count is above 0):
 *   after the draft, the picks ESPN marks as keepers; before it, each team's keeper choices if ESPN shares them.
 *   Each keeper gets a tag from last season's draft: K = kept last season too, R3 = drafted in round 3,
 *   UD = undrafted. Keeper fees on the Money page can use these tags.
 * Draft page (before the draft): date, type and order. The order is ESPN's when the commissioner has set it,
 *   otherwise the reverse of last season's final standings.
 */

// Player id → { n: name, pos, tm, team, inj } for every rostered player (ESPN roster view), cached 15 minutes.
// inj is the injury tag ('' when healthy), or null when ESPN didn't say.
function lhRosterIndex_(leagueId, season) {
  const key = 'LH_ROSTER_' + leagueId + '_' + season;
  const cache = lhCache_();
  const saved = lhJson_(lhCacheGetBig_(key));
  if (saved && lhNow_() - saved.at < 15 * 60 * 1000) return saved.players;
  const r = lhEspnRosters_(leagueId, season, 0);
  if (!r.ok) return saved ? saved.players : {};
  const players = {};
  (r.data.teams || []).forEach(t => ((t.roster || {}).entries || []).forEach(e => {
    const pl = (e.playerPoolEntry || {}).player || {};
    if (pl.id == null) return;
    players[pl.id] = { n: lhStr_(pl.fullName), pos: LH_POSITIONS[Number(pl.defaultPositionId)] || '',
                       tm: LH_PRO_TEAMS[Number(pl.proTeamId)] || '', team: t.id,
                       inj: typeof pl.injuryStatus === 'string' && pl.injuryStatus ? lhInjuryTag_(pl.injuryStatus) : null };
  }));
  lhCachePutBig_(key, JSON.stringify({ at: lhNow_(), players: players }), 6 * 3600);
  return players;
}

// Names for players who aren't on a roster any more (one ESPN request for all of them), kept in Script Properties
function lhPlayerNames_(season, ids) {
  const key = 'LH_NAMES_' + season;
  const props = lhProps_();
  const known = lhJson_(props.getProperty(key), {}) || {};
  const missing = ids.filter(id => known[id] == null);
  if (missing.length) {
    const settings = lhSettings_();
    const filter = JSON.stringify({ players: { filterIds: { value: missing.slice(0, 100) }, limit: 100 } });
    const r = lhEspnGet_(settings.leagueId, season, 'view=kona_player_info', { 'X-Fantasy-Filter': filter });
    if (r.ok) {
      (r.data.players || []).forEach(x => {
        const pl = x.player || x;
        if (pl && pl.id != null) known[pl.id] = { n: lhStr_(pl.fullName), pos: LH_POSITIONS[Number(pl.defaultPositionId)] || '',
                                                  tm: LH_PRO_TEAMS[Number(pl.proTeamId)] || '' };
      });
      const json = JSON.stringify(known);
      if (json.length < 8500) props.setProperty(key, json);
    }
  }
  return known;
}

// A season's draft: { drafted, picks: [{ team, player, round, keeper }] }, kept in Script Properties once complete
function lhDraftPicks_(leagueId, season) {
  const key = 'LH_DRAFT_' + leagueId + '_' + season;
  const props = lhProps_();
  const saved = lhJson_(props.getProperty(key));
  if (saved) return saved;
  const cacheKey = key + '_TRY';
  const recent = lhJson_(lhCache_().get(cacheKey));
  if (recent) return recent;
  const r = lhEspnDraft_(leagueId, season);
  if (!r.ok) { lhCache_().put(cacheKey, JSON.stringify({ drafted: false, picks: [] }), 1800); return { drafted: false, picks: [] }; }
  const dd = r.data.draftDetail || {};
  const picks = (dd.picks || []).map(p => ({
    t: p.teamId, p: p.playerId, r: Number(p.roundId) || 0,
    k: p.keeper === true || p.isKeeper === true || /keeper/i.test(lhStr_(p.pickType)) ? 1 : 0
  })).filter(p => p.p != null && p.p > 0);
  const out = { drafted: dd.drafted === true, picks: picks };
  const json = JSON.stringify(out);
  if (out.drafted && json.length < 8500) props.setProperty(key, json);
  else lhCache_().put(cacheKey, json, out.drafted ? 6 * 3600 : 600);
  return out;
}

// Player id → tag from a season's draft: 'K' (a keeper pick) or 'R' + round
function lhDraftTags_(leagueId, season) {
  const tags = {};
  lhDraftPicks_(leagueId, season).picks.forEach(p => { tags[p.p] = p.k ? 'K' : 'R' + p.r; });
  return tags;
}

function lhKeepers_(settings, season, d, phase, feed) {
  const count = feed.league.keepers;
  if (!count) return null;
  const leagueId = settings.leagueId;
  const lastTags = lhDraftTags_(leagueId, season - 1);
  const keeperIds = [];   // [{ team, player }]

  if (phase === 'predraft') {
    // Keeper choices ESPN shares before the draft (varies by league settings)
    (d.teams || []).forEach(t => {
      const ids = [];
      const scan = v => { if (Array.isArray(v)) v.forEach(x => { const n = Number(x && x.playerId != null ? x.playerId : x); if (n > 0) ids.push(n); }); };
      const ds = t.draftStrategy || {};
      scan(ds.keeperPlayerIds);
      scan(t.keeperPlayerIds);
      ids.slice(0, count).forEach(id => keeperIds.push({ team: t.id, player: id }));
    });
  } else {
    lhDraftPicks_(leagueId, season).picks.filter(p => p.k).forEach(p => keeperIds.push({ team: p.t, player: p.p }));
  }

  const describe = list => {
    if (!list.length) return [];
    const index = lhRosterIndex_(leagueId, season);
    const missing = list.map(k => k.player).filter(id => !index[id]);
    const extra = missing.length ? lhPlayerNames_(season, missing) : {};
    return list.map(k => {
      const info = index[k.player] || extra[k.player] || {};
      const tag = lastTags[k.player] || 'UD';
      return { team: k.team, player: info.n || 'Player ' + k.player, pos: info.pos || '', tm: info.tm || '', tag: tag,
               fee: lhKeeperFee_(settings.money.keeperFee, tag) };
    });
  };
  const out = { season: season, perTeam: count, list: describe(keeperIds), last: null };

  // During draft season, last season's keepers too (many leagues don't allow keeping the same player twice)
  if (phase === 'predraft') {
    const prev = lhDraftPicks_(leagueId, season - 1).picks.filter(p => p.k).map(p => ({ team: p.t, player: p.p }));
    if (prev.length) {
      const before = lhDraftTags_(leagueId, season - 2);
      const names = lhPlayerNames_(season - 1, prev.map(k => k.player));
      const index = lhRosterIndex_(leagueId, season);
      out.last = { season: season - 1, list: prev.map(k => {
        const info = index[k.player] || names[k.player] || {};
        return { team: k.team, player: info.n || 'Player ' + k.player, pos: info.pos || '', tm: info.tm || '', tag: before[k.player] || 'UD' };
      }) };
    }
  }
  return out;
}

function lhKeeperFee_(keeperFee, tag) {
  if (!keeperFee) return 0;
  if (keeperFee.byTag) return Number(keeperFee.byTag[tag]) || 0;
  return Number(keeperFee.flat) || 0;
}

function lhDraftInfo_(settings, season, d, feed) {
  const ds = (d.settings || {}).draftSettings || {};
  const detail = d.draftDetail || {};
  const ids = feed.teams.map(t => t.id);
  let order = (ds.pickOrder || []).map(Number).filter(id => ids.indexOf(id) > -1);
  let source = 'espn';
  if (order.length !== ids.length) {
    // Reverse of last season's final standings (team ids stay the same from season to season on ESPN)
    const last = (feed.history || []).filter(h => h.season === season - 1)[0] || lhHistorySeason_(settings, season - 1);
    const ranks = (last && last.ranks) || {};
    const ranked = ids.filter(id => ranks[id] > 0).sort((a, b) => ranks[b] - ranks[a]);
    order = ranked.length === ids.length ? ranked : [];
    source = order.length ? 'lastSeason' : '';
  }
  return {
    season: season,
    date: Number(ds.date) || null,
    type: lhStr_(ds.type).toUpperCase(),
    pickSeconds: Number(ds.timePerSelection) || null,
    auctionBudget: Number(ds.auctionBudget) || null,
    inProgress: detail.inProgress === true,
    order: order.map((id, i) => ({ pick: i + 1, id: id })),
    orderSource: source
  };
}
