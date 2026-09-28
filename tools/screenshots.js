// Takes the screenshots in docs/images from the made-up sample league.
//   npm install && npm run screenshots
// Needs internet for the web font (or FONT=/path/to/archivo.woff2 to use a local copy).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { sampleFeed } = require('../tests/sample_feeds');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'images');
const SITE = fs.readFileSync(path.join(ROOT, 'dist', 'self-hosted', 'index.html'), 'utf8');

const SHOTS = [
  { file: 'phone-week.png', scenario: 'week5', hash: 'week', size: 'phone', scheme: 'dark' },
  { file: 'phone-matchup.png', scenario: 'week5', hash: 'm/1', size: 'phone', scheme: 'dark' },
  { file: 'phone-playoffs.png', scenario: 'week16', hash: 'playoffs', size: 'phone', scheme: 'light' },
  { file: 'phone-money.png', scenario: 'complete', hash: 'money', size: 'phone', scheme: 'light' },
  { file: 'phone-draft.png', scenario: 'predraft', hash: 'draft', size: 'phone', scheme: 'dark' },
  { file: 'desktop-standings.png', scenario: 'week5', hash: 'standings', size: 'desktop', scheme: 'dark' },
  { file: 'desktop-league.png', scenario: 'complete', hash: 'league', size: 'desktop', scheme: 'light' }
];
const SIZES = { phone: { width: 390, height: 844, deviceScaleFactor: 2 }, desktop: { width: 1280, height: 860, deviceScaleFactor: 1 } };

(async () => {
  const feeds = {};
  const feedFor = s => {
    if (!feeds[s]) {
      const f = sampleFeed(s);
      f.league.espnUrl = 'https://fantasy.espn.com/football/';
      feeds[s] = f;
    }
    // As if it was updated two minutes ago; the draft is always a couple of days away
    const f = JSON.parse(JSON.stringify(feeds[s]));
    f.generatedAt = new Date(Date.now() - 2 * 60000).toISOString();
    if (f.status) f.status.at = Date.now() - 2 * 60000;
    if (f.draft && f.draft.date) f.draft.date = Date.now() + (2 * 24 + 5) * 3600000 + 17 * 60000;
    return f;
  };
  const server = http.createServer((req, res) => {
    const m = req.url.match(/^\/(\w+)\/(exec)?/);
    if (!m) { res.writeHead(404); res.end(); return; }
    if (m[2]) {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(feedFor(m[1])));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(SITE.replace("var LEAGUE_HUB_FEED_URL = '';", "var LEAGUE_HUB_FEED_URL = 'http://127.0.0.1:" + server.address().port + "/" + m[1] + "/exec';"));
  }).listen(0);

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const shot of SHOTS) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: SIZES[shot.size].width, height: SIZES[shot.size].height },
      colorScheme: shot.scheme, timezoneId: 'America/New_York', reducedMotion: 'reduce' }, { deviceScaleFactor: SIZES[shot.size].deviceScaleFactor }));
    if (process.env.FONT) {
      const font = fs.readFileSync(process.env.FONT);
      const css = "@font-face{font-family:'Archivo';font-weight:100 900;font-stretch:62% 125%;src:url(https://fonts.gstatic.com/archivo.woff2) format('woff2');}";
      await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: css }));
      await ctx.route('https://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: font }));
    }
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port + '/' + shot.scenario + '/#' + shot.hash);
    await page.waitForFunction(() => document.querySelector('main > section:not([hidden]) h1, main > section:not([hidden]) .mh'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, shot.file) });
    console.log('  docs/images/' + shot.file);
    await ctx.close();
  }
  // The Settings tab, drawn from the real tab
  const tabPage = await (await browser.newContext({ viewport: { width: 1110, height: 800 } })).newPage();
  await tabPage.setContent(require('./settings_tab').settingsTabHtml());
  await tabPage.screenshot({ path: path.join(OUT, 'settings-tab.png'), fullPage: true });
  console.log('  docs/images/settings-tab.png');
  await browser.close();
  server.close();
})();
