#!/usr/bin/env node
/**
 * League Hub build: turns the source files into the files people copy.
 *
 *   dist/Code.gs                 every file in apps-script/, in order. Paste into Apps Script as Code.gs
 *   dist/Index.html              the website for Apps Script. Paste into an HTML file named Index
 *   dist/self-hosted/index.html  the website for hosting it yourself (docs/hosting.md)
 *   docs/demo/index.html         the website with a made-up league built in (no Apps Script needed)
 *
 * Run from this folder:  node build.js      (Node 18 or newer, no packages needed)
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Apps Script runs every file in one shared scope; this is the order they're joined in Code.gs
const SCRIPT_FILES = ['Util.gs', 'Config.gs', 'Espn.gs', 'Nfl.gs', 'Live.gs', 'Model.gs', 'Keepers.gs', 'Money.gs',
                      'History.gs', 'Feed.gs', 'WebApp.gs', 'Commissioner.gs', 'Setup.gs'];

const ROOT = __dirname;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, text) => {
  fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, f), text);
  console.log('  ' + f + '  (' + Math.round(Buffer.byteLength(text) / 1024) + ' KB)');
};

// JSON that is safe inside a <script> tag
const scriptJson = obj => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function version() {
  const m = read('apps-script/Util.gs').match(/LH_VERSION = '([^']+)'/);
  if (!m) throw new Error('LH_VERSION not found in apps-script/Util.gs');
  return m[1];
}

function buildCode(v) {
  const head = [
    '/**',
    ' * League Hub ' + v + ': a website for an ESPN fantasy football league, run from a Google Sheet.',
    ' *',
    ' * To install or update League Hub, paste this whole file over Code.gs (Extensions → Apps Script).',
    ' * Your settings live on the spreadsheet\'s Settings tab, so updating never loses them.',
    ' * Built from the apps-script/ folder with "node build.js". Not affiliated with ESPN.',
    ' *',
    ' * @OnlyCurrentDoc',
    ' */',
    ''
  ].join('\n');
  const body = SCRIPT_FILES.map(f => {
    const text = read('apps-script/' + f).trim();
    return '\n// ' + '='.repeat(30) + ' ' + f + ' ' + '='.repeat(30) + '\n\n' + text + '\n';
  }).join('');
  return head + body;
}

function withoutConfig(html) {
  const out = html.replace(/<!--CONFIG-->[\s\S]*?<!--\/CONFIG-->\n?/, '');
  if (out === html) throw new Error('site/index.html: the <!--CONFIG--> block is missing');
  return out;
}

function buildAppsScriptPage(site) {
  let html = withoutConfig(site);
  if (/<\?/.test(html)) throw new Error('site/index.html contains "<?", which Apps Script templates would treat as code');
  if (html.indexOf('/*BOOT*/null') < 0) throw new Error('site/index.html: /*BOOT*/null is missing');
  return html.replace('/*BOOT*/null', '<?!= boot ?>');
}

function buildSelfHosted(site) {
  return site.replace('<!--CONFIG-->\n', '').replace('<!--/CONFIG-->\n', '');
}

function buildDemo(site) {
  const { sampleFeed } = require('./tests/sample_feeds');
  const samples = [
    { id: 'week5', label: 'Week 5' },
    { id: 'week16', label: 'Playoffs' },
    { id: 'complete', label: 'Season over' },
    { id: 'predraft', label: 'Before the draft' }
  ].map(x => {
    const feed = sampleFeed(x.id);
    feed.league.espnUrl = 'https://fantasy.espn.com/football/';   // the sample league isn't on ESPN
    delete feed.status;
    return { id: x.id, label: x.label, feed: feed };
  });
  let html = withoutConfig(site)
    .replace('<title>League Hub</title>', '<title>League Hub demo</title>')
    .replace('/*SAMPLES*/null', scriptJson(samples));
  return html;
}

function build() {
  const v = version();
  console.log('League Hub ' + v);
  const site = read('site/index.html');
  write('dist/Code.gs', buildCode(v));
  write('dist/Index.html', buildAppsScriptPage(site));
  write('dist/self-hosted/index.html', buildSelfHosted(site));
  write('docs/demo/index.html', buildDemo(site));
}

module.exports = { SCRIPT_FILES, version, build, buildCode, buildAppsScriptPage, buildSelfHosted, buildDemo };

if (require.main === module) build();
