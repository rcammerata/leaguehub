/**
 * League Hub: the Money page.
 *
 * Money changes hands twice a season, like most leagues do it:
 *   Dues, before the season:   entry fee + keeper fees
 *   Settle-up, after it:       pickup fees (after the free pickups) + trade fees, against weekly high score prizes
 *                              and season prizes. The league pays each team the difference, or the team pays it.
 * With "Entry fee is due: At the end of the season", the dues are part of the settle-up instead.
 *
 * Payments tab: positive amounts = the team paid the league, negative = the league paid the team. Money a team
 * pays in covers its dues first; anything more counts toward the settle-up. Each payment belongs to one season
 * (its Season column, or else its date: January and February count toward the season before), so the tab can
 * keep every season's payments.
 *   balance   = won − dues − fees + paid        (everything; 0 when the team is square with the league)
 *   duesLeft  = dues not paid yet               (0 once paid, or when dues are part of the settle-up)
 *   settle    = balance + duesLeft              (the settle-up so far: above 0 the league owes the team)
 * The pot = every due plus every fee. A prize is a dollar amount (300) or a percent (50%). Percents split what's
 * left of the pot after the weekly prizes and the dollar prizes, so percents that add up to 100% pay out the pot.
 */

function lhMoney_(settings, feed, games, periods, regWeeks) {
  const M = settings.money;
  const payments = lhReadPayments_(feed.teams, feed.league.season);
  const keeperFees = {};
  ((feed.keepers && feed.keepers.list) || []).forEach(k => { keeperFees[k.team] = (keeperFees[k.team] || 0) + (k.fee || 0); });
  const weekly = {};
  (feed.highs || []).forEach(h => { if (h.prize) h.teams.forEach(id => { weekly[id] = (weekly[id] || 0) + h.prize; }); });

  const rows = feed.teams.map(t => {
    const pickups = Math.max(0, t.adds - M.freePickups);
    const pay = payments.byTeam[t.id] || { in: 0, out: 0, net: 0 };
    const r = {
      id: t.id,
      entry: M.entryFee,
      keeperFees: lhRound_(keeperFees[t.id] || 0, 2),
      pickups: M.pickupFee > 0 ? pickups : 0,
      pickupFees: lhRound_(pickups * M.pickupFee, 2),
      trades: M.tradeFee > 0 ? t.trades : 0,
      tradeFees: lhRound_(t.trades * M.tradeFee, 2),
      weekly: lhRound_(weekly[t.id] || 0, 2),
      prizes: 0,
      paidIn: lhRound_(pay.in, 2),
      paidOut: lhRound_(pay.out, 2),
      paid: lhRound_(pay.net, 2)
    };
    r.dues = lhRound_(r.entry + r.keeperFees, 2);
    r.fees = lhRound_(r.pickupFees + r.tradeFees, 2);
    r.owed = lhRound_(r.dues + r.fees, 2);
    return r;
  });
  const pot = lhRound_(rows.reduce((s, r) => s + r.owed, 0), 2);

  // Weekly prizes for the whole season (known in advance), then the dollar prizes; percents split the rest
  const prizeWeeks = Object.keys(periods).map(Number)
    .filter(mp => M.weeklyAllWeeks || mp <= regWeeks)
    .reduce((n, mp) => n + (periods[mp] || [mp]).length, 0);
  const weeklyTotal = M.weeklyPrize > 0 ? M.weeklyPrize * prizeWeeks : 0;
  const fixedTotal = M.prizes.reduce((s, p) => s + (p.amount.type === 'share' ? 0 : p.amount.value), 0);
  const shareBase = Math.max(0, pot - weeklyTotal - fixedTotal);

  // Season prizes: amount and winner(s) once decided
  const byId = {};
  rows.forEach(r => { byId[r.id] = r; });
  const prizes = M.prizes.map(p => {
    const amount = lhRound_(p.amount.type === 'share' ? p.amount.value * shareBase : p.amount.value, 2);
    const winners = p.rule ? lhPrizeWinners_(p.rule, feed) : lhTeamByName_(feed.teams, p.team);
    const out = { name: p.name, amount: amount, rule: p.rule || 'manual', winners: winners || [], label: p.rule ? '' : p.team };
    if (winners && winners.length) winners.forEach(id => { if (byId[id]) byId[id].prizes += amount / winners.length; });
    return out;
  });

  rows.forEach(r => {
    r.prizes = lhRound_(r.prizes, 2);
    r.won = lhRound_(r.weekly + r.prizes, 2);
    r.balance = lhRound_(r.won - r.owed + r.paid, 2);
    r.duesLeft = M.duesUpFront ? lhRound_(Math.max(0, r.dues - r.paidIn), 2) : 0;
    r.settle = lhRound_(r.balance + r.duesLeft, 2);
  });

  // Planned payouts vs the pot, so the commissioner can see if the prizes add up (League Hub → Status)
  const planned = lhRound_(weeklyTotal + prizes.reduce((s, p) => s + p.amount, 0), 2);
  const duesTotal = lhRound_(rows.reduce((s, r) => s + r.dues, 0), 2);

  return {
    pot: pot,
    duesUpFront: !!M.duesUpFront,
    dues: { total: duesTotal, left: lhRound_(rows.reduce((s, r) => s + r.duesLeft, 0), 2),
            teamsPaid: rows.filter(r => r.dues > 0 && r.duesLeft === 0).length },
    collected: lhRound_(payments.paidIn, 2),
    paidOut: lhRound_(payments.paidOut, 2),
    fees: {
      entry: M.entryFee, pickup: M.pickupFee, freePickups: M.freePickups, trade: M.tradeFee,
      keeper: M.keeperFee && M.keeperFee.byTag ? M.keeperFee.byTag : (M.keeperFee ? M.keeperFee.flat : 0)
    },
    weekly: { prize: M.weeklyPrize, allWeeks: M.weeklyAllWeeks, weeks: prizeWeeks },
    prizes: prizes,
    teams: rows,
    planned: planned,
    leftover: lhRound_(pot - planned, 2),
    unmatched: payments.unmatched.length
  };
}

// Winners of a prize rule, or null while it isn't decided yet
function lhPrizeWinners_(rule, feed) {
  const teams = feed.teams;
  const regularOver = feed.league.phase === 'complete' || (feed.week && feed.week.playoffs);
  const top = (list, key) => {
    if (!list.length) return null;
    const best = list.reduce((m, t) => Math.max(m, t[key]), -Infinity);
    return list.filter(t => t[key] === best).map(t => t.id);
  };
  const f = feed.final;
  if (rule === 'champion') return f && f.champion != null ? [f.champion] : null;
  if (rule === 'runnerUp') return f && f.runnerUp != null ? [f.runnerUp] : null;
  if (rule === 'third') return f && f.third != null ? [f.third] : null;
  if (rule === 'pointsRegular') return regularOver ? top(teams, 'pf') : null;
  if (rule === 'pointsAll') return feed.league.phase === 'complete' ? top(teams, 'total') : null;
  if (rule === 'bestRecord') return regularOver && feed.standings.length ? [feed.standings[0]] : null;
  if (rule === 'lastPlace') {
    if (feed.league.phase === 'complete' && teams.some(t => t.rank > 0)) {
      const worst = teams.reduce((m, t) => Math.max(m, t.rank), 0);
      return teams.filter(t => t.rank === worst).map(t => t.id);
    }
    return regularOver && feed.standings.length ? [feed.standings[feed.standings.length - 1]] : null;
  }
  return null;
}

function lhTeamByName_(teams, name) {
  const key = lhKey_(name);
  if (!key) return null;
  const hit = teams.filter(t => lhKey_(t.name) === key || lhKey_(t.abbrev) === key || (t.manager && lhKey_(t.manager) === key));
  return hit.length ? [hit[0].id] : null;
}

// A payment's season: its Season cell, or else its date (January and February count toward the season before).
// Payments with neither count toward the season on the website.
function lhPaymentSeason_(seasonCell, dateCell, current) {
  const typed = Math.floor(lhNum_(seasonCell, 0));
  if (typed >= 2004 && typed <= 2100) return typed;
  let d = dateCell && typeof dateCell.getTime === 'function' ? dateCell : null;
  if (!d) {
    const s = lhStr_(dateCell);
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) d = new Date(Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  }
  if (!d || isNaN(d.getTime())) return current;
  return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear();
}

// This season's payments on the Payments tab → { byTeam: { id: { in, out, net } }, paidIn, paidOut, unmatched, list }
function lhReadPayments_(teams, season) {
  const out = { byTeam: {}, paidIn: 0, paidOut: 0, unmatched: [], list: [] };
  let sh = null;
  try { sh = lhSpreadsheet_().getSheetByName(LH_PAYMENTS_SHEET); } catch (_) {}
  if (!sh || sh.getLastRow() < 2) return out;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  rows.forEach((r, i) => {
    const team = lhStr_(r[1]);
    const amount = lhNum_(r[2], NaN);
    if (!team || !isFinite(amount) || amount === 0) return;
    if (season && lhPaymentSeason_(r[4], r[0], season) !== Number(season)) return;
    const hit = lhTeamByName_(teams, team);
    const item = { row: i + 2, date: r[0] instanceof Date ? r[0].getTime() : lhStr_(r[0]), team: team, amount: lhRound_(amount, 2), note: lhStr_(r[3]) };
    out.list.push(item);
    if (!hit) { out.unmatched.push(item); return; }
    const id = hit[0];
    const b = out.byTeam[id] = out.byTeam[id] || { in: 0, out: 0, net: 0 };
    if (amount > 0) { b.in += amount; out.paidIn += amount; } else { b.out += -amount; out.paidOut += -amount; }
    b.net += amount;
  });
  return out;
}

// Adds one payment row (Commissioner Tools)
function lhAddPayment_(teamName, amount, note, season) {
  const sh = lhBuildPaymentsSheet_(null);
  const row = [new Date(), lhCellText_(teamName), lhRound_(amount, 2), lhCellText_(lhStr_(note).slice(0, 200)), season || ''];
  sh.appendRow(row);
  return row;
}
