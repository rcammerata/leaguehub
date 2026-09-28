// Builds League Hub data for the fictional sample league (tests/fake_league.js) by running the real Apps Script
// code against the Apps Script stand-ins in tests/gas_mocks.js. Used by the tests, the demo page and the screenshots.
'use strict';
const { makeWorld } = require('./gas_mocks');
const fake = require('./fake_league');

const SCENARIOS = ['week5', 'week16', 'complete', 'predraft'];

// Settings for the sample league: every feature turned on
const SAMPLE_SETTINGS = {
  league_id: fake.LEAGUE_ID,
  founded: 2015,
  rules: 'Entry fee is due before the draft.\nThe last-place team buys the trophy engraving.',
  money_page: 'Yes',
  entry_fee: 100,
  pickup_fee: 2,
  free_pickups: 5,
  trade_fee: 5,
  keeper_fee: '1:50, 2:40, 3:30, K:50',
  weekly_prize: 20
};

// The sample league's payments over two seasons: dues in late summer (a few teams slow to pay), the rest of the
// dues during the season, part of the settle-up in January, then the next season's first dues. Each point of the
// season sees the payments made by then.
const SAMPLE_PAYMENTS = [
  ['2026-08-30', 'Touchdown Turtles', 140, 'Dues (entry and keeper fee)'],
  ['2026-08-30', 'Gridiron Gurus', 130, 'Dues'],
  ['2026-08-31', 'Blitz Brigade', 100, 'Entry fee'],
  ['2026-09-01', 'End Zone Envy', 100, 'Dues'],
  ['2026-09-02', 'Fourth and Long', 100, 'Dues'],
  ['2026-09-02', 'Hail Mary Heroes', 130, 'Dues'],
  ['2026-09-03', 'Red Zone Rebels', 100, 'Dues'],
  ['2026-09-05', 'Sack Masters', 100, 'Dues'],
  ['2026-09-06', 'The Replacements', 50, 'Half now, half in October'],
  ['2026-10-12', 'The Replacements', 80, 'Rest of the dues'],
  ['2026-11-02', 'Blitz Brigade', 40, 'Keeper fee'],
  ['2026-12-01', 'Pigskin Prophets', 140, 'Dues, finally'],
  ['2027-01-05', 'Sack Masters', 5, 'Settle-up'],
  ['2027-01-06', 'Touchdown Turtles', -100, 'Settle-up'],
  ['2027-08-10', 'Touchdown Turtles', 140, 'Dues'],
  ['2027-08-12', 'Red Zone Rebels', 100, 'Dues']
];

function sampleWorld(scenario, opts = {}) {
  const w = makeWorld(Object.assign({ now: fake.NOW[scenario], fetch: fake.makeFetch(scenario, opts.fetchOpts || {}) }, opts.world || {}));
  w.lhBuildSettingsSheet_();
  const settings = Object.assign({}, SAMPLE_SETTINGS, opts.settings || {});
  Object.keys(settings).forEach(k => w.lhSetSetting_(k, settings[k]));
  if (opts.payments !== false) {
    const sh = w.lhBuildPaymentsSheet_(null);
    (opts.payments || SAMPLE_PAYMENTS.filter(r => Date.parse(r[0]) <= fake.NOW[scenario])).forEach(r => sh.appendRow(r));
  }
  return w;
}

// League history is read from ESPN a couple of seasons per update, so update a few times to get all of it
function sampleFeed(scenario, opts) {
  const w = sampleWorld(scenario, opts);
  for (let i = 0; i < 4; i++) w.lhRefresh_(true);
  return JSON.parse(w.lhGetFeed());
}

module.exports = { SCENARIOS, SAMPLE_SETTINGS, SAMPLE_PAYMENTS, sampleWorld, sampleFeed };

if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  SCENARIOS.forEach(s => {
    const json = JSON.stringify(sampleFeed(s));
    fs.writeFileSync(path.join(out, 'feed_' + s + '.json'), json);
    console.log(s, (json.length / 1024).toFixed(0) + ' KB');
  });
}
