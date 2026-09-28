// League Hub tests: the Apps Script code running in Node against a made-up ESPN league (tests/fake_league.js).
// Run from the league-hub folder:  node tests/run_tests.js      (Node 18 or newer, no packages needed)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { makeWorld } = require('./gas_mocks');
const fake = require('./fake_league');
const { sampleWorld, sampleFeed, SAMPLE_SETTINGS } = require('./sample_feeds');
const { SCRIPT_FILES, version, buildCode, buildAppsScriptPage, buildSelfHosted, buildDemo } = require('../build');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const feeds = {};
const feedOf = scenario => feeds[scenario] || (feeds[scenario] = sampleFeed(scenario));
const teamId = (feed, name) => feed.teams.find(t => t.name === name).id;
const allPlayers = feed => [].concat(...Object.values(feed.detail.teams).map(t => t.starters.concat(t.bench)));
// Objects made inside the Apps Script stand-in come from another JavaScript realm; compare them as plain data
const plain = x => JSON.parse(JSON.stringify(x));
const deepEqual = (a, b, msg) => assert.deepEqual(plain(a), plain(b), msg);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, (msg || '') + ' ' + a + ' ≈ ' + b);

// A world whose ESPN can be switched off (to test what happens when ESPN is down)
function switchableWorld(scenario, fetchOpts, world) {
  const real = fake.makeFetch(scenario, fetchOpts || {});
  const net = { down: false };
  const w = makeWorld(Object.assign({ now: fake.NOW[scenario], fetch: (u, o) => net.down ? { code: 503, body: 'Service Unavailable' } : real(u, o) }, world || {}));
  w.lhBuildSettingsSheet_();
  w.lhSetSetting_('league_id', fake.LEAGUE_ID);
  return { w, net };
}

// ===================== Code structure =====================

test('every file loads, in any order (no file depends on another at load time)', () => {
  const w = makeWorld({ files: SCRIPT_FILES.slice().reverse() });
  assert.equal(typeof w.doGet, 'function');
});

test('no function is defined twice across files', () => {
  const seen = {};
  SCRIPT_FILES.forEach(f => {
    const text = fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');
    for (const m of text.matchAll(/^function (\w+)\s*\(/gm)) {
      assert.ok(!seen[m[1]], m[1] + ' is in both ' + seen[m[1]] + ' and ' + f);
      seen[m[1]] = f;
    }
  });
});

test('Code.gs (all files in one) runs and has every entry point', () => {
  const vm = require('vm');
  const w = makeWorld();
  const ctx = vm.createContext(Object.assign({}, w, { __: undefined }));
  vm.runInContext(buildCode('test'), ctx);
  ['doGet', 'doPost', 'onOpen', 'refreshLeague', 'lhGetFeed', 'lhCommish', 'leagueHubSetup', 'leagueHubUpdateNow',
   'leagueHubCookies', 'leagueHubSaveCookies', 'leagueHubPasscode', 'leagueHubStatus', 'leagueHubPause', 'leagueHubResume', 'leagueHubHelp']
    .forEach(fn => assert.equal(typeof ctx[fn], 'function', fn));
  assert.match(buildCode('test'), /@OnlyCurrentDoc/);
});

test('the Apps Script page template has exactly one data slot and no other template tags', () => {
  const html = buildAppsScriptPage(fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8'));
  assert.equal(html.match(/<\?/g).length, 1);
  assert.match(html, /var BOOT = <\?!= boot \?>;/);
  assert.doesNotMatch(html, /LEAGUE_HUB_FEED_URL = '/);
});

test('dist/ and the demo are up to date (run node build.js after changing the code)', () => {
  const site = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
  const same = (file, text) => assert.ok(fs.readFileSync(path.join(ROOT, file), 'utf8') === text, file + ' is out of date: run node build.js');
  same('dist/Code.gs', buildCode(version()));
  same('dist/Index.html', buildAppsScriptPage(site));
  same('dist/self-hosted/index.html', buildSelfHosted(site));
  same('docs/demo/index.html', buildDemo(site));
});

// ===================== Settings tab =====================

test('Settings tab: built with every setting, and rebuilding keeps what was entered', () => {
  const w = makeWorld();
  w.lhBuildSettingsSheet_();
  const keys = w.__.sheets.Settings._data.rows.map(r => r[3]);
  w.__.get('LH_SETTINGS').filter(s => s.key).forEach(s => assert.ok(keys.includes(s.key), s.key));
  assert.equal(keys.filter(k => k === '#prize').length, w.__.get('LH_PRIZE_ROWS'));
  w.lhSetSetting_('entry_fee', 75);
  w.lhSetSetting_('league_name', 'The Big Game');
  w.lhBuildSettingsSheet_();
  const s = w.lhSettings_();
  assert.equal(s.leagueName, 'The Big Game');
  assert.equal(w.lhReadSettingsRaw_().values.entry_fee, 75);
  deepEqual(w.lhReadSettingsRaw_().prizes.filter(p => p[0]).map(p => p[0]), ['Champion', 'Runner-up', 'Third place', 'Most points']);
});

test('league ID from a link or a number', () => {
  const w = makeWorld();
  assert.equal(w.lhParseLeagueId_('https://fantasy.espn.com/football/league?leagueId=12345678&seasonId=2025'), '12345678');
  assert.equal(w.lhParseLeagueId_('https://fantasy.espn.com/football/team?leagueId=987654&teamId=3'), '987654');
  assert.equal(w.lhParseLeagueId_(' 12345678 '), '12345678');
  assert.equal(w.lhParseLeagueId_(12345678), '12345678');
  assert.equal(w.lhParseLeagueId_('my league'), '');
});

test('prize amounts: dollars or percents', () => {
  const w = makeWorld();
  deepEqual({ ...w.lhParseAmount_('300') }, { type: 'fixed', value: 300 });
  deepEqual({ ...w.lhParseAmount_('$1,200') }, { type: 'fixed', value: 1200 });
  deepEqual({ ...w.lhParseAmount_('50%') }, { type: 'share', value: 0.5 });
  deepEqual({ ...w.lhParseAmount_(0.25) }, { type: 'share', value: 0.25 });   // a cell formatted as a percent
  assert.equal(w.lhParseAmount_('half'), null);
});

test('keeper fees: one amount, or amounts by round', () => {
  const w = makeWorld();
  assert.equal(w.lhParseKeeperFees_('20').flat, 20);
  const byTag = w.lhParseKeeperFees_('1:50, 2:40, R3=30, K:50, UD:0').byTag;
  deepEqual({ ...byTag }, { R1: 50, R2: 40, R3: 30, K: 50, UD: 0 });
  assert.ok(w.lhParseKeeperFees_('round one fifty').error);
  assert.equal(w.lhKeeperFee_(w.lhParseKeeperFees_('1:50, 2:40'), 'R3'), 0);   // rounds left out are free
  assert.equal(w.lhKeeperFee_(w.lhParseKeeperFees_('25'), 'UD'), 25);
});

test('settings problems are listed for the Status window', () => {
  const w = makeWorld();
  w.lhBuildSettingsSheet_();
  w.lhSetSetting_('accent', 'sparkly');
  w.lhSetSetting_('season', 'last year');
  w.lhSetSetting_('money_page', 'Yes');
  w.lhSetSetting_('entry_fee', 'a lot');
  const p = w.lhSettings_().problems.join(' | ');
  assert.match(p, /league ID/);
  assert.match(p, /Accent color/);
  assert.match(p, /Season should be/);
  assert.match(p, /Entry fee/);
  w.lhSetSetting_('accent', '1e90ff');
  assert.equal(w.lhSettings_().accent, '#1e90ff');
});

test('prize percents over 100% are flagged', () => {
  const w = makeWorld();
  w.lhBuildSettingsSheet_();
  w.lhSetSetting_('money_page', 'Yes');
  const rows = w.__.sheets.Settings._data.rows;
  const i = rows.findIndex(r => r[3] === '#prize');
  rows[i][1] = '80%';
  w.LH_SETTINGS_MEMO_ = null;
  assert.match(w.lhSettings_().problems.join(' '), /add up to 130%/);   // 80 + 25 + 10 + 15
});

// ===================== Set up =====================

test('Set up, public league: asks for the league, connects, starts updates, shows the next steps', () => {
  const w = makeWorld({ now: fake.NOW.week5, fetch: fake.makeFetch('week5'), ui: { prompts: ['https://fantasy.espn.com/football/league?leagueId=' + fake.LEAGUE_ID] } });
  w.leagueHubSetup();
  assert.ok(w.__.sheets.Settings && w.__.sheets.Payments, 'Settings and Payments tabs');
  assert.equal(w.lhSettings_().leagueId, fake.LEAGUE_ID);
  deepEqual(w.__.triggers.map(t => [t.fn, t.minutes]), [['refreshLeague', 5]]);
  const dialog = w.__.ui.find(u => u.type === 'dialog');
  assert.equal(dialog.title, 'League Hub is set up');
  assert.match(dialog.html, /Sunday Funday League/);
  assert.match(dialog.html, /New deployment/);
  assert.equal(JSON.parse(w.lhGetFeed()).ok, true);
  // Again: keeps the settings, still one timer
  w.leagueHubSetup();
  assert.equal(w.__.triggers.length, 1);
  assert.equal(w.lhSettings_().leagueId, fake.LEAGUE_ID);
});

test('Set up shows the website address once the web app is published', () => {
  const w = makeWorld({ now: fake.NOW.week5, fetch: fake.makeFetch('week5'), webAppUrl: 'https://script.google.com/macros/s/abc/exec',
                        ui: { prompts: [fake.LEAGUE_ID] } });
  w.leagueHubSetup();
  assert.match(w.__.ui.find(u => u.type === 'dialog').html, /macros\/s\/abc\/exec/);
  const dev = makeWorld({ webAppUrl: 'https://script.google.com/macros/s/abc/dev' });
  assert.equal(dev.lhWebAppUrl_(), '', 'the private /dev address is never shown as the website');
});

test('Set up with a bad link changes nothing', () => {
  const w = makeWorld({ fetch: fake.makeFetch('week5'), ui: { prompts: ['my league'] } });
  w.leagueHubSetup();
  assert.equal(w.lhSettings_().leagueId, '');
  assert.equal(w.__.triggers.length, 0);
  assert.match(w.__.ui.map(u => u.title).join('|'), /doesn't look like an ESPN league address/);
});

test('Set up, private league: asks for ESPN cookies, tests them, then finishes', () => {
  const w = makeWorld({ now: fake.NOW.week5, fetch: fake.makeFetch('week5', { private: true }), ui: { prompts: [fake.LEAGUE_ID], alerts: ['YES'] } });
  w.leagueHubSetup();
  assert.ok(w.__.ui.find(u => u.title === 'Your league is private'));
  assert.equal(w.__.ui.find(u => u.type === 'dialog').title, 'ESPN cookies (private leagues)');
  assert.equal(w.__.triggers.length, 0, 'no timer until the cookies work');
  const key = w.__.cache.LH_COOKIE_KEY;
  assert.ok(w.__.ui.find(u => u.type === 'dialog').html.indexOf(key) > -1, 'the window carries its one-time key');
  const res = JSON.parse(w.leagueHubSaveCookies('{ABCDEF01-2345-6789-ABCD-EF0123456789}', 'AEBexampleS2cookie', true, key));
  assert.equal(res.ok, true, res.error);
  assert.equal(w.__.props.LH_ESPN_SWID, '{ABCDEF01-2345-6789-ABCD-EF0123456789}');
  assert.equal(w.__.triggers.length, 1);
  assert.equal(JSON.parse(w.lhGetFeed()).ok, true);
});

test('ESPN cookies that ESPN rejects are not saved', () => {
  const w = makeWorld({ now: fake.NOW.week5, fetch: fake.makeFetch('week5', { private: true, cookieOk: false }) });
  w.lhBuildSettingsSheet_();
  w.lhSetSetting_('league_id', fake.LEAGUE_ID);
  w.leagueHubCookies();
  const res = JSON.parse(w.leagueHubSaveCookies('ABCDEF01-2345-6789-ABCD-EF0123456789', 'AEBexpired', false, w.__.cache.LH_COOKIE_KEY));
  assert.equal(res.ok, false);
  assert.match(res.error, /didn't accept/);
  assert.equal(w.__.props.LH_ESPN_S2, undefined);
  const brackets = makeWorld({ now: fake.NOW.week5, fetch: fake.makeFetch('week5', { private: true }) });
  brackets.lhBuildSettingsSheet_();
  brackets.lhSetSetting_('league_id', fake.LEAGUE_ID);
  brackets.leagueHubCookies();
  JSON.parse(brackets.leagueHubSaveCookies('SWID=ABCDEF01-2345-6789-ABCD-EF0123456789', 'espn_s2=AEBgood', false, brackets.__.cache.LH_COOKIE_KEY));
  assert.equal(brackets.__.props.LH_ESPN_SWID, '{ABCDEF01-2345-6789-ABCD-EF0123456789}', 'adds the curly brackets and drops "SWID="');
  assert.equal(brackets.__.props.LH_ESPN_S2, 'AEBgood');
});

test('the menu\'s actions can\'t be run from the website', () => {
  // The website runs as the owner, and google.script.run can call any function without _ at the end
  const w = makeWorld({ now: fake.NOW.week5, fetch: fake.makeFetch('week5'), noUi: true });
  w.lhBuildSettingsSheet_();
  w.lhSetSetting_('league_id', fake.LEAGUE_ID);
  ['leagueHubSetup', 'leagueHubUpdateNow', 'leagueHubCookies', 'leagueHubPasscode', 'leagueHubStatus', 'leagueHubPause', 'leagueHubResume', 'leagueHubHelp']
    .forEach(fn => assert.throws(() => w[fn](), /only works from the League Hub menu/, fn));
  assert.equal(w.__.props.LH_PAUSED, undefined);
  assert.equal(w.__.triggers.length, 0);
  const res = JSON.parse(w.leagueHubSaveCookies('{ABCDEF01-2345-6789-ABCD-EF0123456789}', 'AEBattacker', false, 'guess'));
  assert.equal(res.ok, false);
  assert.equal(w.__.props.LH_ESPN_S2, undefined);
  assert.equal(JSON.parse(w.leagueHubSaveCookies('{ABCDEF01-2345-6789-ABCD-EF0123456789}', 'AEBattacker', false)).ok, false, 'no key');
  w.onEdit({ range: 'not a range' });   // harmless
});

test('Commissioner passcode: set, change, turn off', () => {
  const w = makeWorld({ ui: { prompts: ['short', 'longenough1', 'longenough1', 'OFF'] } });
  w.leagueHubPasscode();
  assert.equal(w.__.props.LH_PASS, undefined, 'too short');
  w.leagueHubPasscode();
  assert.match(w.__.props.LH_PASS, /^[0-9a-f-]{36}:[0-9a-f]{64}$/, 'only a salted fingerprint is stored');
  assert.ok(w.lhPassOk_('longenough1', w.__.props.LH_PASS));
  assert.ok(!w.lhPassOk_('longenough2', w.__.props.LH_PASS));
  w.leagueHubPasscode();
  assert.equal(w.__.props.LH_PASS, undefined);
});

// ===================== The website's data, through a season =====================

test('Week 5: live scores, projections, injuries, standings, playoff picture', () => {
  const f = feedOf('week5');
  fs.writeFileSync(path.join(OUT, 'feed_week5.json'), JSON.stringify(f, null, 1));
  assert.equal(f.ok, true);
  assert.equal(f.league.phase, 'season');
  deepEqual({ ...f.week, sp: [...f.week.sp] }, { mp: 5, sp: [5], label: 'Week 5', playoffs: false, round: '' });
  assert.equal(f.current.matchups.length, 5);
  assert.equal(Object.keys(f.detail.teams).length, 10);
  assert.equal(f.standings.length, 10);
  assert.equal(f.highs.length, 4, 'weeks 1–4');
  assert.ok(f.highs.every(h => h.prize === 20));
  assert.equal(f.playoffs.picture, true);
  assert.equal(f.playoffs.seeds.length, 6);
  assert.equal(f.refresh.minutes, 5, 'games are on');
  deepEqual(f.divisions.map(d => d.name), ['East', 'West']);
  assert.match(f.rules.summary.join(' | '), /10 teams, PPR scoring \| Starting lineup: QB, 2 RB, 2 WR, TE, FLEX, D\/ST, K \(plus 6 bench spots\)/);
  deepEqual(f.rules.custom, SAMPLE_SETTINGS.rules.split('\n'));
});

test('injury tags come from the roster view', () => {
  const players = allPlayers(feedOf('week5'));
  const tag = name => players.find(p => p.n === name).inj;
  assert.equal(tag('Puka Nacua'), 'O');
  assert.equal(tag('Mike Evans'), 'Q');
  assert.equal(tag('Rashee Rice'), 'SSPD');
  assert.equal(tag('Patrick Mahomes'), '');
});

test('live projection math', () => {
  const players = allPlayers(feedOf('week5'));
  players.forEach(p => {
    if (p.pos === 'DEF') close(p.lp, (1 - p.r) * p.a + p.r * p.p, p.n + ' (defense)');
    else close(p.lp, p.a + p.r * p.p, p.n);
  });
  const done = players.filter(p => p.r === 0 && p.st);
  assert.ok(done.length > 0);
  done.forEach(p => close(p.lp, p.a, p.n + ' finished'));
  players.filter(p => ['NYG', 'TEN'].includes(p.tm)).forEach(p => { assert.equal(p.r, 0, p.n + ' bye'); assert.equal(p.p, 0); });
  const buf = players.find(p => p.tm === 'BUF' && p.pos !== 'DEF');   // BUF at NE, 3rd quarter 4:12 left
  close(buf.r, (900 + 252) / 3600, 'fraction of the game left from the clock');
});

test('a team projection never drops below its score (unless its defense is playing)', () => {
  const f = feedOf('week5');
  f.current.matchups.forEach(m => {
    [[m.a, m.sa, m.pa], [m.b, m.sb, m.pb]].forEach(([id, s, p]) => {
      const defPlaying = f.detail.teams[id].starters.some(x => x.pos === 'DEF' && x.st && x.r > 0);
      if (!defPlaying) assert.ok(p >= s - 0.01, 'team ' + id + ': ' + p + ' < ' + s);
      const sum = f.detail.teams[id].starters.reduce((t, x) => t + x.a, 0);
      close(s, sum, 'score is the starters\' points');
    });
  });
});

test('Week 16: playoffs with byes, live semifinals', () => {
  const f = feedOf('week16');
  fs.writeFileSync(path.join(OUT, 'feed_week16.json'), JSON.stringify(f, null, 1));
  assert.equal(f.week.round, 'Semifinals');
  assert.equal(f.week.playoffs, true);
  assert.equal(f.playoffs.picture, false);
  deepEqual(f.playoffs.rounds.map(r => r.name), ['Quarterfinals', 'Semifinals', 'Championship']);
  const qf = f.playoffs.rounds[0].games;
  assert.equal(qf.length, 2);
  const inQf = [].concat(...qf.map(g => [g.a.seed, g.b.seed])).sort();
  deepEqual(inQf, [3, 4, 5, 6], 'seeds 1 and 2 have byes');
  assert.ok(qf.every(g => g.w === 'a' || g.w === 'b'));
  assert.equal(f.current.matchups.filter(m => m.tier === 'WINNERS_BRACKET').length, 2);
  assert.ok(f.highs.every(h => h.mp <= 14 ? h.prize === 20 : h.prize === 0), 'weekly prize: regular season only');
});

test('season over: champion, places, prize winners, history', () => {
  const f = feedOf('complete');
  fs.writeFileSync(path.join(OUT, 'feed_complete.json'), JSON.stringify(f, null, 1));
  assert.equal(f.league.phase, 'complete');
  assert.equal(f.league.season, 2026, 'in January, Auto still shows the season that just ended');
  deepEqual({ ...f.final }, { champion: teamId(f, 'Red Zone Rebels'), runnerUp: teamId(f, 'Blitz Brigade'), third: teamId(f, 'Hail Mary Heroes') });
  const final = f.playoffs.rounds[2].games;
  deepEqual(final.map(g => g.kind), ['final', 'third']);
  const prize = name => f.money.prizes.find(p => p.name === name);
  deepEqual(prize('Champion').winners, [teamId(f, 'Red Zone Rebels')]);
  deepEqual(prize('Most points').winners, [f.teams.slice().sort((a, b) => b.pf - a.pf)[0].id]);
  assert.equal(f.history[0].season, 2026);
  assert.equal(f.history[0].champion.name, 'Red Zone Rebels');
  assert.equal(f.refresh.minutes, 120);
  assert.equal(f.current, null);
});

test('before the draft: next season, draft order, keepers', () => {
  const f = feedOf('predraft');
  fs.writeFileSync(path.join(OUT, 'feed_predraft.json'), JSON.stringify(f, null, 1));
  assert.equal(f.league.phase, 'predraft');
  assert.equal(f.league.season, 2027);
  assert.equal(f.playoffs, null);
  assert.equal(f.draft.orderSource, 'lastSeason');
  const last = feedOf('complete');
  const byRank = last.teams.slice().sort((a, b) => b.rank - a.rank).map(t => t.id);
  deepEqual(f.draft.order.map(o => o.id), byRank, 'reverse of last season\'s final standings');
  assert.equal(f.draft.order[9].id, last.final.champion, 'the champion picks last');
  assert.equal(f.keepers.list.length, 7, 'keepers ESPN shares before the draft');
  assert.equal(f.keepers.last.season, 2026);
  assert.equal(f.keepers.last.list.length, 10);
  assert.equal(f.history[0].champion.name, 'Red Zone Rebels');
});

test('keeper tags and fees', () => {
  const f = feedOf('week5');
  const tags = f.keepers.list.map(k => k.tag);
  assert.ok(tags.every(t => /^(K|R\d+|UD)$/.test(t)), tags.join(','));
  f.keepers.list.forEach(k => assert.equal(k.fee, { R1: 50, R2: 40, R3: 30, K: 50 }[k.tag] || 0, k.player + ' ' + k.tag));
});

test('catches: PPR leagues get receptions on player cards, standard leagues don\'t', () => {
  const w = makeWorld();
  assert.equal(w.lhCatchPoints_({ scoringItems: [{ statId: 53, points: 1 }] }), 1);
  assert.equal(w.lhCatchPoints_({ scoringItems: [{ statId: 53, points: 0, pointsOverrides: { 6: 0.5 } }] }), 0.5, 'TE premium only');
  assert.equal(w.lhCatchPoints_({ scoringItems: [{ statId: 42, points: 0.1 }] }), 0, 'standard');
  assert.equal(w.lhScoringType_({ scoringItems: [{ statId: 53, points: 0.5 }] }), 'Half PPR');
  assert.equal(w.lhScoringType_({ scoringItems: [{ statId: 53, points: 0, pointsOverrides: { 6: 1 } }] }), 'Partial PPR');
  assert.equal(w.lhScoringType_({ scoringItems: [] }), 'Standard');
  assert.equal(feedOf('week5').league.ppr, true);
  assert.ok(allPlayers(feedOf('week5')).some(p => p.x && p.x[53] > 0), 'catches are in the stats');
});

test('multi-week matchups: earlier weeks count, later weeks are projected', () => {
  const w = makeWorld();
  deepEqual(JSON.parse(JSON.stringify(w.lhMatchupPeriods_({ matchupPeriodCount: 14, playoffMatchupPeriodLength: 2 }, { finalScoringPeriod: 17 }))),
    { 1: [1], 2: [2], 3: [3], 4: [4], 5: [5], 6: [6], 7: [7], 8: [8], 9: [9], 10: [10], 11: [11], 12: [12], 13: [13], 14: [14], 15: [15, 16], 16: [17] });
  assert.equal(w.lhWeekInfo_(15, [15, 16], 14, 16, 4).label, 'Weeks 15–16');
  assert.equal(w.lhWeekInfo_(15, [15, 16], 14, 16, 4).round, 'Semifinals');
});

test('round names by bracket size', () => {
  const w = makeWorld();
  deepEqual([...w.lhRoundNames_(4)], ['Semifinals', 'Championship']);
  deepEqual([...w.lhRoundNames_(6)], ['Quarterfinals', 'Semifinals', 'Championship']);
  deepEqual([...w.lhRoundNames_(8)], ['Quarterfinals', 'Semifinals', 'Championship']);
  deepEqual([...w.lhRoundNames_(12)], ['First Round', 'Quarterfinals', 'Semifinals', 'Championship']);
});

test('game clock → fraction of the game left', () => {
  const w = makeWorld();
  const now = Date.parse('2026-10-04T19:00:00Z');
  const g = (s, p, c, d) => ({ s, p, c, d: d || '', k: Date.parse('2026-10-04T17:00:00Z') });
  assert.equal(w.lhFracLeft_(g('pre', 0, 0), now, now), 1);
  close(w.lhFracLeft_(g('in', 1, 900), now, now), 1);
  close(w.lhFracLeft_(g('in', 2, 0, 'Half'), now, now), 0.5);
  close(w.lhFracLeft_(g('in', 4, 30), now, now), 30 / 3600 < 0.01 ? 0.01 : 30 / 3600);
  close(w.lhFracLeft_(g('in', 5, 300, 'OT'), now, now), 0.01, 'overtime stays at 1% until final');
  assert.equal(w.lhFracLeft_(g('post', 4, 0, 'Final'), now, now), 0);
  close(w.lhFracLeft_(g('in', 3, 100), now - 30 * 60000, now), 1 - 2 * 3600000 / w.__.get('LH_GAME_MS'), 'an old clock falls back to the kickoff countdown');
});

// ===================== Settings change the website =====================

test('manager names: first name + initial, full, ESPN username, hidden', () => {
  const name = style => {
    const f = sampleFeed('week5', { settings: { manager_names: style } });
    return [f.teams.find(t => t.id === 1).manager, f.league.managers, f.history[0].champion.manager];
  };
  deepEqual(name('First name + last initial'), ['Jordan B.', true, 'Riley C.']);
  deepEqual(name('Full name'), ['Jordan Blake', true, 'Riley Carter']);
  deepEqual(name('ESPN username'), ['jordanblake26', true, 'rileycarter25']);
  deepEqual(name('Hide'), ['', false, '']);
});

test('switches: bench, history, money page, league name', () => {
  const f = sampleFeed('week5', { settings: { show_bench: 'No', show_history: 'No', money_page: 'No', league_name: 'Our League' } });
  assert.ok(Object.values(f.detail.teams).every(t => t.bench.length === 0));
  deepEqual(f.history, []);
  assert.equal(f.money, null);
  assert.equal(f.league.name, 'Our League');
  deepEqual({ ...f.options }, { winProb: true, bench: false, history: false, money: false });
});

test('a fixed season shows that season', () => {
  const f = sampleFeed('predraft', { settings: { season: '2026' } });
  assert.equal(f.league.season, 2026);
  assert.equal(f.league.phase, 'complete');
  assert.match(f.league.espnUrl, /seasonId=2026/);
});

test('private league before it is renewed: Auto falls back to last season', () => {
  // ESPN can answer "not authorized" (not "not found") for a private league's next season before it exists
  const w = makeWorld({ now: fake.NOW.complete, fetch: fake.makeFetch('complete', { private: true, futureAuth: true }) });
  w.lhBuildSettingsSheet_();
  w.lhSetSetting_('league_id', fake.LEAGUE_ID);
  w.__.props.LH_ESPN_S2 = 'AEBgood';
  w.__.props.LH_ESPN_SWID = '{ABCDEF01-2345-6789-ABCD-EF0123456789}';
  const f = JSON.parse(w.lhGetFeed());
  assert.equal(f.ok, true, f.error);
  assert.equal(f.league.season, 2026);
});

// ===================== Money =====================

test('money: fees, pot, percent prizes and balances', () => {
  const f = feedOf('week5'), M = f.money;
  const t3 = f.teams.find(t => t.id === 3), r3 = M.teams.find(r => r.id === 3);
  assert.equal(r3.pickups, Math.max(0, t3.adds - 5));
  assert.equal(r3.pickupFees, r3.pickups * 2);
  assert.equal(r3.tradeFees, t3.trades * 5);
  M.teams.forEach(r => {
    close(r.owed, r.entry + r.pickupFees + r.tradeFees + r.keeperFees, 'owed');
    close(r.balance, r.won - r.owed + r.paid, 'balance');
  });
  close(M.pot, M.teams.reduce((s, r) => s + r.owed, 0), 'pot');
  close(M.planned, M.pot, 'percents that add up to 100% pay out the whole pot');
  const weeklyTotal = 20 * 14;
  close(M.prizes.find(p => p.name === 'Champion').amount, 0.5 * (M.pot - weeklyTotal), 'percents split what is left after weekly prizes');
  assert.equal(M.collected, 950);
  assert.equal(M.unmatched, 0);
});

test('money: dues before the season, settle-up after it', () => {
  const f = feedOf('week5'), M = f.money;
  assert.equal(M.duesUpFront, true);
  M.teams.forEach(r => {
    close(r.dues, r.entry + r.keeperFees, 'dues = entry + keeper fees');
    close(r.fees, r.pickupFees + r.tradeFees, 'fees settled after the season');
    close(r.duesLeft, Math.max(0, r.dues - r.paidIn), 'dues left');
    close(r.settle, r.won - r.fees + (r.paidIn - Math.min(r.paidIn, r.dues)) - r.paidOut, 'settle-up');
    close(r.balance, r.settle - r.duesLeft, 'everything together');
  });
  const byName = name => M.teams.find(r => r.id === teamId(f, name));
  assert.equal(byName('The Replacements').duesLeft, 80, 'paid $50 of $130');
  assert.equal(byName('Pigskin Prophets').duesLeft, 140, 'paid nothing');
  assert.equal(byName('Blitz Brigade').duesLeft, 40, 'paid the entry fee but not the keeper fee');
  assert.equal(byName('Touchdown Turtles').duesLeft, 0);
  assert.equal(M.dues.teamsPaid, 7);
  // Leagues that settle everything after the season
  const end = sampleFeed('week5', { settings: { dues_when: 'At the end of the season' } }).money;
  assert.equal(end.duesUpFront, false);
  end.teams.forEach(r => { assert.equal(r.duesLeft, 0); close(r.settle, r.balance); });
});

test('payments belong to a season: the Season column, or else the date', () => {
  const w = makeWorld();
  const day = (y, m, d) => new w.Date(y, m - 1, d);   // a date made inside the Apps Script stand-in
  assert.equal(w.lhPaymentSeason_('', day(2026, 9, 1), 2026), 2026);
  assert.equal(w.lhPaymentSeason_('', day(2027, 1, 15), 2027), 2026, 'January counts toward the season before');
  assert.equal(w.lhPaymentSeason_('', '2027-02-28', 2027), 2026, 'so does February');
  assert.equal(w.lhPaymentSeason_('', '3/1/2027', 2026), 2027);
  assert.equal(w.lhPaymentSeason_(2025, '2027-01-01', 2027), 2025, 'a typed season wins');
  assert.equal(w.lhPaymentSeason_('', '', 2027), 2027, 'no date: this season');
  const next = feedOf('predraft').money;
  assert.equal(next.collected, 240, 'before the 2027 draft only 2027 payments count');
  assert.equal(next.dues.teamsPaid, 2);
  const over = feedOf('complete');
  const byName = name => over.money.teams.find(r => r.id === teamId(over, name));
  assert.equal(byName('Touchdown Turtles').balance, 0, 'paid its settle-up');
  assert.equal(byName('Sack Masters').balance, 0, 'paid its settle-up');
  assert.equal(byName('Pigskin Prophets').duesLeft, 0, 'paid its dues in December');
});

test('money: dollar prizes, ties, unknown teams on the Payments tab', () => {
  const w = sampleWorld('complete', { payments: [['2026-09-01', 'Nobody Special', 100, ''], ['2026-09-01', 'red zone rebels', 100, 'lowercase is fine']] });
  const rows = w.__.sheets.Settings._data.rows;
  const i = rows.findIndex(r => r[3] === '#prize');
  rows[i][1] = '400';
  rows[i + 1][0] = 'Best record'; rows[i + 1][1] = '10%'; rows[i + 1][2] = 'Best regular-season record';
  w.LH_SETTINGS_MEMO_ = null;
  w.lhRefresh_(true);
  const f = JSON.parse(w.lhGetFeed()), M = f.money;
  assert.equal(M.unmatched, 1);
  assert.equal(M.teams.find(r => r.id === teamId(f, 'Red Zone Rebels')).paid, 100);
  const champ = M.prizes.find(p => p.name === 'Champion');
  assert.equal(champ.amount, 400);
  const best = M.prizes.find(p => p.name === 'Best record');
  close(best.amount, 0.1 * (M.pot - 20 * 14 - 400));
  deepEqual(best.winners, [f.standings[0]]);
  const h = w.lhWeeklyHighs_([{ mp: 1, a: 1, b: 2, sa: 100, sb: 100, wa: {}, wb: {} }], { 1: [1] }, 14, 2, 'season', { enabled: true, weeklyPrize: 20 });
  deepEqual({ ...h[0], teams: [...h[0].teams] }, { sp: 1, mp: 1, teams: [1, 2], score: 100, prize: 10 }, 'a tie splits the weekly prize');
});

// ===================== Commissioner Tools =====================

test('Commissioner Tools: off, wrong passcode, lockout, payments, update', () => {
  const w = sampleWorld('week5');
  w.lhRefresh_(true);
  const call = req => JSON.parse(w.lhCommish(req));
  assert.equal(call({ pass: 'x', action: 'login' }).noPass, true);
  w.lhSetPasscode_('correct horse');
  assert.equal(call({ pass: 'wrong', action: 'login' }).badPass, true);
  const ok = call({ pass: 'correct horse', action: 'login' });
  assert.equal(ok.ok, true);
  assert.equal(ok.teams.length, 10);
  assert.equal(ok.moneyOn, true);
  assert.equal(call({ pass: 'correct horse', action: 'payment', team: 999, amount: 5 }).error, 'Pick a team.');
  assert.match(call({ pass: 'correct horse', action: 'payment', team: 7, amount: 0 }).error, /Enter an amount/);
  const paid = call({ pass: 'correct horse', action: 'payment', team: 7, amount: -45.5, note: 'refund' });
  assert.match(paid.message, /\$45\.5 paid to Pigskin Prophets/);
  assert.equal(paid.payments[0].amount, -45.5);
  assert.match(call({ pass: 'correct horse', action: 'refresh' }).message, /Updated from ESPN/);
  for (let i = 0; i < 10; i++) call({ pass: 'guess' + i, action: 'login' });
  const locked = call({ pass: 'correct horse', action: 'login' });
  assert.equal(locked.locked, true, 'locked after 10 wrong passcodes, even with the right one');
});

test('team names that look like formulas are written as text', () => {
  const w = makeWorld();
  assert.equal(w.lhCellText_('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.equal(w.lhCellText_('+1 Club'), '\'+1 Club');
  assert.equal(w.lhCellText_('Regular Name'), 'Regular Name');
});

// ===================== The web app =====================

test('web app: page with the data built in, JSON, JSONP, POST', () => {
  const w = sampleWorld('week5', { world: { htmlFiles: { Index: fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8').replace('/*BOOT*/null', '<?!= boot ?>') } } });
  w.lhRefresh_(true);
  const page = w.doGet({ parameter: {} });
  assert.equal(page.getTitle(), 'Sunday Funday League');
  assert.match(page.getContent(), /var BOOT = \{"v":1/);
  assert.doesNotMatch(page.getContent(), /<\/script><script>alert/);
  const json = w.doGet({ parameter: { format: 'json' } });
  assert.equal(json.mime, 'application/json');
  assert.equal(JSON.parse(json.getContent()).ok, true);
  assert.match(w.doGet({ parameter: { format: 'json', callback: 'cb' } }).getContent(), /^cb\(\{/);
  assert.match(w.doGet({ parameter: { format: 'json', callback: 'x);alert(1' } }).getContent(), /^\{/);
  assert.equal(JSON.parse(w.doPost({ postData: { contents: 'not json' } }).getContent()).ok, false);
  assert.equal(JSON.parse(w.doPost({ postData: { contents: '{"action":"login","pass":"x"}' } }).getContent()).noPass, true);
});

test('nothing private is ever sent to the website', () => {
  const w = sampleWorld('week5', { settings: { manager_names: 'First name + last initial' } });
  w.__.props.LH_ESPN_S2 = 'AEBsecretS2value';
  w.__.props.LH_ESPN_SWID = '{SECRET00-0000-0000-0000-000000000000}';
  w.lhSetPasscode_('super secret passcode');
  w.lhRefresh_(true);
  const text = w.lhGetFeed() + w.doGet({ parameter: { format: 'json' } }).getContent();
  ['AEBsecretS2value', 'SECRET00', 'super secret', w.__.props.LH_PASS.split(':')[1], 'owner@example.com', 'sheet-id-for-tests', 'Blake', 'Carter']
    .forEach(s => assert.ok(text.indexOf(s) < 0, 'feed contains ' + s));
  assert.ok(!/espn_s2|SWID/i.test(text));
});

// ===================== When ESPN is down =====================

test('ESPN down: the website keeps the last data and says it is out of date', () => {
  const { w, net } = switchableWorld('week5');
  assert.equal(w.lhRefresh_(true).ok, true);
  net.down = true;
  const st = w.lhRefresh_(true);
  assert.equal(st.ok, false);
  const f = JSON.parse(w.lhGetFeed());
  assert.equal(f.ok, true, 'still the last good data');
  assert.equal(f.status.ok, false, 'marked as not updating');
  // Hours later the cached copy is gone: the saved copy (without player details) is used
  Object.keys(w.__.cache).filter(k => k.indexOf('LH_FEED') === 0).forEach(k => delete w.__.cache[k]);
  w.lhRefresh_(true);
  const g = JSON.parse(w.lhGetFeed());
  assert.equal(g.ok, true);
  assert.equal(g.stale, true);
  assert.equal(g.detail, null);
});

test('expired cookies: one email a day to the commissioner, and none when turned off', () => {
  const { w } = switchableWorld('week5', { private: true });
  w.lhRefresh_(true);
  w.lhRefresh_(true);
  assert.equal(w.__.mails.length, 1);
  assert.equal(w.__.mails[0].to, 'owner@example.com');
  assert.match(w.__.mails[0].body, /ESPN cookies/);
  const quiet = switchableWorld('week5', { private: true }).w;
  quiet.lhSetSetting_('alert_email', 'No');
  quiet.lhRefresh_(true);
  assert.equal(quiet.__.mails.length, 0);
  assert.equal(JSON.parse(quiet.lhGetFeed()).problem, 'auth');
});

test('NFL scoreboard down: scores still update, players just have no game info', () => {
  const w = makeWorld({ now: fake.NOW.week5, fetch: fake.makeFetch('week5', { nflDown: true }) });
  w.lhBuildSettingsSheet_();
  w.lhSetSetting_('league_id', fake.LEAGUE_ID);
  const f = JSON.parse(w.lhGetFeed());
  assert.equal(f.ok, true);
  assert.equal(f.detail.nfl, null);
  assert.ok(allPlayers(f).every(p => p.r === (p.st ? 0.5 : 1)));
});

// ===================== Update timing =====================

test('update timing: often during games, rarely otherwise', () => {
  const w = sampleWorld('week5');
  w.lhRefresh_(true);
  const due = Number(w.__.props.LH_NEXT_DUE);
  assert.ok(due - fake.NOW.week5 <= 5 * 60000 && due - fake.NOW.week5 >= 4 * 60000, 'every 5 minutes during games');
  assert.equal(w.lhRefresh_(false).skipped, true, 'the timer skips runs until the next update is due');
  const off = sampleWorld('complete');
  off.lhRefresh_(true);
  assert.ok(Number(off.__.props.LH_NEXT_DUE) - fake.NOW.complete > 100 * 60000, 'every 2 hours after the season');
  off.lhSetSetting_('refresh_minutes', '15');
  assert.equal(off.lhEnsureTrigger_(false), true, 'a new "Update every" setting replaces the timer');
  deepEqual(off.__.triggers.map(t => t.minutes), [15]);
  off.lhRefresh_(true);
  assert.equal(off.lhRefresh_(false).skipped, true);
  off.onEdit({ range: { getSheet: () => ({ getName: () => 'Settings' }) } });
  assert.notEqual(off.lhRefresh_(false).skipped, true, 'an edit on the Settings tab is picked up at the next timer run');
  off.onEdit({ range: { getSheet: () => ({ getName: () => 'Sheet1' }) } });
  assert.equal(off.lhRefresh_(false).skipped, true, 'edits elsewhere are ignored');
  off.lhProps_().setProperty('LH_PAUSED', '1');
  off.__.props.LH_NEXT_DUE = '0';
  assert.equal(off.lhRefresh_(false).skipped, true, 'paused');
});
