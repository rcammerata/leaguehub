// Browser tests: the real website running against the real Apps Script code (in the stand-ins from gas_mocks.js).
//   1. Apps Script mode: the page from doGet, with google.script.run wired to the scripts
//   2. Self-hosted mode: the page on another address, reading ?format=json and posting to doPost
//   3. The demo page
// Needs Playwright:  npm install  then  npm run test:browser   (or: npx playwright install chromium first)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { sampleWorld } = require('./sample_feeds');

const ROOT = path.join(__dirname, '..');
const PASS = 'touchdown-2026';
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) failures++; };

function world(scenario) {
  const w = sampleWorld(scenario, { world: { htmlFiles: { Index: fs.readFileSync(path.join(ROOT, 'dist/Index.html'), 'utf8') } } });
  w.lhRefresh_(true);
  w.lhSetPasscode_(PASS);
  return w;
}

// A page's JavaScript errors, collected
function watchErrors(page) {
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errs.push(m.text()); });
  return errs;
}
const blockFonts = ctx => ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));   // no web fonts in tests

async function appsScriptMode(browser) {
  console.log('Apps Script mode');
  const w = world('week5');
  const html = w.doGet({ parameter: {} }).getContent();
  check(!/<\?/.test(html), 'the template filled in the data');
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockFonts(ctx);
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  const calls = [];
  await page.exposeFunction('__gas', (fn, args) => { calls.push(fn); return w[fn].apply(null, args); });
  await page.addInitScript(() => {
    const runner = () => {
      let ok = null, fail = null;
      const r = new Proxy({}, { get: (_, k) => {
        if (k === 'withSuccessHandler') return f => { ok = f; return r; };
        if (k === 'withFailureHandler') return f => { fail = f; return r; };
        return (...args) => { window.__gas(k, args).then(v => ok && ok(v), e => fail && fail(e)); };
      } });
      return r;
    };
    window.__pushed = [];
    window.google = { script: {
      get run() { return runner(); },
      history: { push: (s, p, h) => window.__pushed.push(h), setChangeHandler: f => { window.__onHistory = f; } },
      url: { getLocation: cb => cb({ hash: '', parameter: {}, parameters: {} }) }
    } };
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.waitForSelector('#v-week h1');
  check(await page.textContent('#v-week h1') === 'Week 5', 'shows the built-in data right away');
  check(!calls.includes('lhGetFeed'), 'no extra request on load when the data is fresh');
  await page.click('#v-week a.match');
  await page.waitForSelector('#v-matchup .lineup');
  check((await page.evaluate(() => window.__pushed)).some(h => /^m\/\d+$/.test(h)), 'opening a matchup records it in the browser history');
  await page.evaluate(() => window.__onHistory({ location: { hash: 'standings' } }));
  check(!(await page.isHidden('#v-standings')), 'Back/Forward navigation works');

  // Commissioner Tools
  await page.evaluate(() => window.__onHistory({ location: { hash: 'commish' } }));
  await page.fill('#cm-pass', 'wrong-pass');
  await page.click('[data-cm="login"] button');
  await page.waitForSelector('.cm-msg.err');
  check(/Wrong passcode/.test(await page.textContent('.cm-msg.err')), 'a wrong passcode is refused');
  await page.fill('#cm-pass', PASS);
  await page.click('[data-cm="login"] button');
  await page.waitForSelector('#cm-team');
  check(true, 'the right passcode opens the tools');
  await page.selectOption('#cm-team', '7');
  await page.fill('#cm-amount', '100');
  await page.fill('#cm-note', '=IMPORTDATA("https://example.com")');
  await page.click('[data-cm="payment"] button');
  await page.waitForSelector('.cm-msg.ok');
  check(/Recorded Pigskin Prophets paid \$100/.test(await page.textContent('.cm-msg.ok')), 'records a payment: ' + await page.textContent('.cm-msg.ok'));
  const rows = w.__.sheets.Payments._data.rows;
  const last = rows[rows.length - 1];
  check(last[1] === 'Pigskin Prophets' && last[2] === 100, 'the payment is on the Payments tab');
  check(String(last[3]).charAt(0) === '\'', 'a note that looks like a formula is saved as plain text');
  await page.click('[data-cm-act="refresh"]');
  await page.waitForFunction(() => /Updated from ESPN/.test((document.querySelector('.cm-msg.ok') || {}).textContent || ''));
  check(true, 'Update Now works');
  await page.fill('#cm-swid', '{11111111-2222-3333-4444-555555555555}');
  await page.fill('#cm-s2', 'AEBexampleCookieValue');
  await page.click('[data-cm="cookies"] button');
  await page.waitForSelector('.cm-msg.ok, .cm-msg.err');
  check(/Saved/.test(await page.textContent('.cm-msg')), 'saves ESPN cookies after testing them');
  check(w.__.props.LH_ESPN_S2 === 'AEBexampleCookieValue', 'the cookies are in Script Properties');
  const answers = w.lhCommish({ pass: PASS, action: 'login' }) + w.lhGetFeed() + w.doGet({ parameter: {} }).getContent();
  check(answers.indexOf('AEBexampleCookieValue') < 0 && answers.indexOf('11111111-2222') < 0, 'saved cookies are never sent back to the website');
  await page.click('[data-cm-act="lock"]');
  check(await page.isVisible('#cm-pass'), 'Lock asks for the passcode again');
  check(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
  await ctx.close();
  server.close();
}

async function selfHostedMode(browser) {
  console.log('Self-hosted mode');
  const w = world('week16');
  const site = fs.readFileSync(path.join(ROOT, 'dist/self-hosted/index.html'), 'utf8');
  let standardScoring = false;   // switched on below to check a league where catches don't score
  // One server plays Apps Script (doGet/doPost), another hosts the page, like on a different website
  const gas = http.createServer((req, res) => {
    const cors = { 'access-control-allow-origin': '*' };
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => { res.writeHead(200, Object.assign({ 'content-type': 'application/json' }, cors)); res.end(w.doPost({ postData: { contents: body } }).getContent()); });
      return;
    }
    const q = new URL(req.url, 'http://x').searchParams;
    let out = w.doGet({ parameter: Object.fromEntries(q) }).getContent();
    if (standardScoring && !q.get('callback')) { const f = JSON.parse(out); f.league.ppr = false; out = JSON.stringify(f); }
    res.writeHead(200, Object.assign({ 'content-type': q.get('callback') ? 'text/javascript' : 'application/json' }, cors));
    res.end(out);
  }).listen(0);
  const feedUrl = 'http://127.0.0.1:' + gas.address().port + '/exec';
  const html = site.replace("var LEAGUE_HUB_FEED_URL = '';", "var LEAGUE_HUB_FEED_URL = '" + feedUrl + "';");
  const web = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await blockFonts(ctx);
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  await page.goto('http://127.0.0.1:' + web.address().port + '/');
  await page.waitForFunction(() => document.querySelector('#v-week h1') && document.querySelector('#v-week h1').textContent === 'Semifinals');
  check(true, 'loads the data from the Apps Script address');
  await page.goto('http://127.0.0.1:' + web.address().port + '/#playoffs');
  await page.waitForSelector('#v-playoffs .bracket');
  check(await page.isVisible('#v-playoffs .bracket'), 'links to a page work (#playoffs)');
  check((await page.textContent('#v-playoffs')).indexOf('Bye') > -1, 'the bracket shows first-round byes');
  await page.goto('http://127.0.0.1:' + web.address().port + '/#m/8');
  await page.waitForSelector('#v-matchup .lineup');
  check(/\d REC/.test(await page.textContent('#v-matchup .lineup')), 'PPR league: player cards show catches');
  standardScoring = true;
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#v-matchup .lineup');
  check(!/\d REC/.test(await page.textContent('#v-matchup .lineup')), 'standard scoring: no catches on player cards');
  standardScoring = false;
  await page.goto('http://127.0.0.1:' + web.address().port + '/#commish');
  await page.fill('#cm-pass', PASS);
  await page.click('[data-cm="login"] button');
  await page.waitForSelector('#cm-team');
  check(true, 'Commissioner Tools work from another website (POST to doPost)');
  // JSONP fallback, for browsers or hosts where reading the data directly is blocked
  const jsonp = w.doGet({ parameter: { format: 'json', callback: 'cb_1' } }).getContent();
  check(/^cb_1\(\{/.test(jsonp), 'JSONP answer for ?callback=');
  check(w.doGet({ parameter: { format: 'json', callback: 'alert(1)//' } }).getContent().charAt(0) === '{', 'a bad callback name gets plain JSON');
  check(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
  await ctx.close();
  gas.close(); web.close();
}

async function demo(browser) {
  console.log('Demo page');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blockFonts(ctx);
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  await page.goto('file://' + path.join(ROOT, 'docs/demo/index.html'));
  await page.waitForSelector('#v-week h1');
  check(await page.textContent('#v-week h1') === 'Week 5', 'starts on the Week 5 sample');
  await page.click('[data-sample="predraft"]');
  await page.waitForSelector('#v-draft h1');
  check(/2027 Draft/.test(await page.textContent('#v-draft h1')), 'switches to the pre-draft sample');
  check(/Starts In/.test(await page.textContent('#v-draft')), 'the sample draft is always upcoming');
  await page.click('[data-sample="complete"]');
  await page.waitForSelector('.champ-card');
  check(/Red Zone Rebels/.test(await page.textContent('.champ-card')), 'switches to the season-over sample');
  check(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await appsScriptMode(browser);
    await selfHostedMode(browser);
    await demo(browser);
  } finally {
    await browser.close();
  }
  console.log(failures ? failures + ' FAILED' : 'All browser tests passed');
  process.exit(failures ? 1 : 0);
})();
