/**
 * League Hub: the "League Hub" menu in the spreadsheet.
 *
 *   Set up (start here)          creates the Settings and Payments tabs, connects to ESPN, starts automatic updates
 *   Update now                   gets fresh data from ESPN right away
 *   ESPN cookies                 for private leagues (tested with ESPN before they're saved)
 *   Commissioner passcode        turns on Commissioner Tools on the website
 *   Status and website address   when the data last updated, and the website's address
 *   Pause / resume updates
 *   Help
 */

// The League Hub project page (shown in Help)
const LH_PROJECT_URL = 'https://github.com/rcammerata/leaguehub';

// The menu's actions only run from the spreadsheet. The website runs as your account too, and without this
// check a visitor could call them from the website.
function lhUiOnly_() {
  try { return SpreadsheetApp.getUi(); }
  catch (e) { throw new Error('This only works from the League Hub menu in the spreadsheet.'); }
}

function onOpen() {
  let paused = false;
  try { paused = lhProps_().getProperty('LH_PAUSED') === '1'; } catch (_) {}   // not readable before the first authorization
  SpreadsheetApp.getUi().createMenu('League Hub')
    .addItem('Set up (start here)', 'leagueHubSetup')
    .addItem('Update now', 'leagueHubUpdateNow')
    .addSeparator()
    .addItem('ESPN cookies (private leagues)', 'leagueHubCookies')
    .addItem('Commissioner passcode', 'leagueHubPasscode')
    .addSeparator()
    .addItem('Status and website address', 'leagueHubStatus')
    .addItem(paused ? 'Resume automatic updates' : 'Pause automatic updates', paused ? 'leagueHubResume' : 'leagueHubPause')
    .addItem('Help', 'leagueHubHelp')
    .addToUi();
}

// An edit on the Settings or Payments tab shows up on the website at the timer's next run (a few minutes)
function onEdit(e) {
  try {
    const name = e && e.range ? e.range.getSheet().getName() : '';
    if (name === LH_SETTINGS_SHEET || name === LH_PAYMENTS_SHEET) lhProps_().setProperty('LH_NEXT_DUE', '0');
  } catch (_) {}
}

function leagueHubSetup() {
  const ui = lhUiOnly_();
  const ss = SpreadsheetApp.getActive();
  lhBuildSettingsSheet_();
  lhBuildPaymentsSheet_(null);
  ss.setActiveSheet(ss.getSheetByName(LH_SETTINGS_SHEET));
  let settings = lhSettings_();

  if (!settings.leagueId) {
    const r = ui.prompt('League Hub setup',
      'Paste your ESPN league\'s web address (or just its league ID).\n\n' +
      'On ESPN, open your league\'s page and copy the address from the browser. It contains leagueId=...',
      ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) {
      ui.alert('Setup paused', 'The Settings tab is ready. When you have the league\'s address, run League Hub → Set up again.', ui.ButtonSet.OK);
      return;
    }
    const id = lhParseLeagueId_(r.getResponseText());
    if (!id) {
      ui.alert('That doesn\'t look like an ESPN league address', 'It should look like https://fantasy.espn.com/football/league?leagueId=12345678. ' +
        'Paste it into "ESPN league ID or link" on the Settings tab, then run League Hub → Set up again.', ui.ButtonSet.OK);
      return;
    }
    lhSetSetting_('league_id', id);
    settings = lhSettings_();
  }

  ss.toast('Checking your league on ESPN…', 'League Hub', 10);
  const test = lhEspnTest_(settings.leagueId);
  if (!test.ok && test.problem === 'auth') {
    const ans = ui.alert('Your league is private',
      'ESPN only shares private leagues with members, so League Hub needs two cookies from your ESPN login (espn_s2 and SWID). ' +
      'They\'re stored privately in this spreadsheet\'s script, never on the sheet or the website.\n\nAdd them now?',
      ui.ButtonSet.YES_NO);
    if (ans === ui.Button.YES) lhShowCookiesDialog_(true);
    return;
  }
  if (!test.ok) {
    ui.alert('Couldn\'t connect', test.message, ui.ButtonSet.OK);
    return;
  }
  lhFinishSetup_();
  lhShowNextSteps_(test.message);
}

// Timer + first update
function lhFinishSetup_() {
  lhProps_().deleteProperty('LH_PAUSED');
  lhEnsureTrigger_(true);
  lhCache_().remove('LH_SEASON_' + lhSettings_().leagueId);
  lhClearFeed_();
  return lhRefresh_(true);
}

function lhShowNextSteps_(found) {
  const url = lhWebAppUrl_();
  const html =
    '<div style="font:14px/1.5 Arial,sans-serif;color:#1f2933">' +
    '<p style="margin:0 0 10px"><b>✓ Connected.</b> ' + lhHtml_(found || '') + ' Scores update automatically from now on.</p>' +
    (url
      ? '<p style="margin:0 0 6px"><b>Your league\'s website:</b></p><p style="margin:0 0 12px"><a href="' + lhHtml_(url) + '" target="_blank">' + lhHtml_(url) + '</a></p>' +
        '<p style="margin:0 0 12px;color:#5f6b76">After changing the script (for example when you install an update), publish a new version: ' +
        'Deploy → Manage deployments → pencil icon → Version: New version → Deploy. The address stays the same.</p>'
      : '<p style="margin:0 0 6px"><b>Last step: publish the website</b></p><ol style="margin:0 0 12px;padding-left:20px">' +
        '<li>Click <b>Extensions → Apps Script</b>.</li>' +
        '<li>Click <b>Deploy</b> (top right) → <b>New deployment</b>.</li>' +
        '<li>Click the gear icon next to "Select type" → <b>Web app</b>.</li>' +
        '<li>Set <b>Execute as</b> to <b>Me</b> and <b>Who has access</b> to <b>Anyone</b>.</li>' +
        '<li>Click <b>Deploy</b> (allow access if Google asks), then copy the <b>Web app</b> address. That\'s your league\'s website.</li></ol>' +
        '<p style="margin:0 0 12px;color:#5f6b76">Already published? The address is under Deploy → Manage deployments.</p>') +
    '<p style="margin:0;color:#5f6b76">Optional: League Hub → Commissioner passcode turns on Commissioner Tools on the website ' +
    '(record payments, update ESPN cookies). Everything else is on the Settings tab.</p></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(url ? 300 : 380), 'League Hub is set up');
}

function leagueHubUpdateNow() {
  lhUiOnly_();
  const ss = SpreadsheetApp.getActive();
  ss.toast('Getting fresh data from ESPN…', 'League Hub', 20);
  LH_SETTINGS_MEMO_ = null;
  lhCache_().remove('LH_SEASON_' + lhSettings_().leagueId);   // also notices a league renewed on ESPN minutes ago
  lhEnsureTrigger_(false);
  const st = lhRefresh_(true);
  ss.toast(st.ok ? 'Done. The website has the latest data.' : 'Update failed: ' + (st.message || 'unknown problem'), 'League Hub', 8);
}

// ===================== ESPN cookies =====================

function leagueHubCookies() {
  lhUiOnly_();
  lhShowCookiesDialog_(false);
}

function lhShowCookiesDialog_(duringSetup) {
  // A one-time key only this window knows, so the save below can't be called from anywhere else
  const key = Utilities.getUuid();
  lhCache_().put('LH_COOKIE_KEY', key, 1800);
  const html =
    '<div style="font:14px/1.45 Arial,sans-serif;color:#1f2933">' +
    '<p style="margin:0 0 8px">On a computer, open your league on <b>fantasy.espn.com</b> and log in. Then open the browser\'s developer tools ' +
    '(Chrome: View → Developer → Developer Tools; Safari: Develop → Show Web Inspector), go to <b>Application</b> (Chrome) or <b>Storage</b> (Safari) ' +
    '→ <b>Cookies</b> → <b>https://fantasy.espn.com</b>, and copy these two values:</p>' +
    '<label style="display:block;font-weight:bold;margin:10px 0 4px">SWID (with the curly brackets)</label>' +
    '<input id="swid" style="width:100%;box-sizing:border-box;padding:6px;font:13px monospace" placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}">' +
    '<label style="display:block;font-weight:bold;margin:10px 0 4px">espn_s2</label>' +
    '<textarea id="s2" style="width:100%;box-sizing:border-box;padding:6px;font:12px monospace;height:84px" placeholder="AEB…"></textarea>' +
    '<p style="margin:10px 0 0;color:#5f6b76">They\'re tested with ESPN before they\'re saved, and kept privately in this spreadsheet\'s script. ' +
    'They usually last a year; if the website stops updating, paste fresh ones.</p>' +
    '<p style="margin:12px 0 0"><button id="save" style="padding:7px 16px;font-weight:bold">Save</button> <span id="msg"></span></p>' +
    '<script>' +
    'document.getElementById("save").onclick=function(){var b=this,m=document.getElementById("msg");b.disabled=true;m.textContent="Testing with ESPN…";' +
    'google.script.run.withSuccessHandler(function(r){r=JSON.parse(r);m.textContent=r.ok?r.message:r.error;m.style.color=r.ok?"#1a7a44":"#b3432a";b.disabled=false;' +
    'if(r.ok)setTimeout(function(){google.script.host.close();},2500);}).withFailureHandler(function(e){m.textContent=String(e.message||e);b.disabled=false;})' +
    '.leagueHubSaveCookies(document.getElementById("swid").value,document.getElementById("s2").value,' + (duringSetup ? 'true' : 'false') + ',"' + key + '");};' +
    '</script></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(420), 'ESPN cookies (private leagues)');
}

// Called by the cookies window
function leagueHubSaveCookies(swid, s2, duringSetup, key) {
  const want = lhCache_().get('LH_COOKIE_KEY');
  if (!want || key !== want) return JSON.stringify({ ok: false, error: 'This window has expired. Close it and open League Hub → ESPN cookies again.' });
  const res = lhSaveCookies_(swid, s2);
  if (res.ok) {
    const st = lhFinishSetup_();
    if (duringSetup) res.message += ' Setup is finished. Run League Hub → Status and website address for the next step.';
    else if (!st.ok) res.message += ' (The update after saving didn\'t work: ' + st.message + ')';
  }
  return JSON.stringify(res);
}

// ===================== Commissioner passcode =====================

function leagueHubPasscode() {
  const ui = lhUiOnly_();
  const has = !!lhProps_().getProperty('LH_PASS');
  const r1 = ui.prompt('Commissioner passcode',
    (has ? 'Commissioner Tools are on. Type a new passcode to change it, or type OFF to turn the tools off.\n\n'
         : 'Pick a passcode for Commissioner Tools on the website (record payments, update ESPN cookies, update now). ') +
    'Use at least 8 characters. Anyone with the passcode can use the tools, so share it only with co-commissioners.',
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const pass = r1.getResponseText();
  if (/^off$/i.test(lhStr_(pass))) {
    lhProps_().deleteProperty('LH_PASS');
    ui.alert('Commissioner Tools are off.');
    return;
  }
  if (pass.length < 8) { ui.alert('The passcode needs at least 8 characters. Nothing was changed.'); return; }
  const r2 = ui.prompt('Commissioner passcode', 'Type the same passcode again.', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  if (r2.getResponseText() !== pass) { ui.alert('The two passcodes didn\'t match. Nothing was changed.'); return; }
  lhSetPasscode_(pass);
  ui.alert('Commissioner Tools are on', 'Open the website, scroll to the bottom and click "Commissioner Tools".', ui.ButtonSet.OK);
}

// ===================== Status =====================

function leagueHubStatus() {
  lhUiOnly_();
  const st = lhStatus_();
  const url = lhWebAppUrl_();
  const tz = Session.getScriptTimeZone() || 'America/New_York';
  const props = lhProps_();
  const lines = [];
  if (st) {
    lines.push('Last update: ' + Utilities.formatDate(new Date(st.at), tz, 'EEE MMM d, h:mm a') + ' — ' + (st.ok ? 'worked' : 'failed: ' + st.message));
    if (st.league) lines.push('League: ' + st.league + (st.season ? ' (' + st.season + ', ' + st.teams + ' teams)' : ''));
  } else {
    lines.push('No update yet. Run League Hub → Set up.');
  }
  lines.push('Automatic updates: ' + (props.getProperty('LH_PAUSED') === '1' ? 'paused' : (props.getProperty('LH_TRIGGER_MINUTES') ? 'on' : 'not started (run Set up)')));
  lines.push('ESPN cookies: ' + (lhEspnCookies_() ? 'saved' : 'none (only needed for private leagues)'));
  lines.push('Commissioner Tools: ' + (props.getProperty('LH_PASS') ? 'on' : 'off'));
  const problems = lhSettings_().problems.slice();
  const feed = lhJson_(lhCacheGetBig_(LH_FEED_KEY));
  if (feed && feed.money && feed.money.leftover < -0.005) {
    problems.push('The prizes (' + lhMoneyText_(feed.money.planned) + ' in all) add up to more than the pot (' + lhMoneyText_(feed.money.pot) + ').');
  }
  if (problems.length) lines.push('', 'Check the Settings tab:', ...problems.map(p => '• ' + p));
  lines.push('', url ? 'Website: ' + url : 'Website: in Extensions → Apps Script, click Deploy → Manage deployments and copy the Web app URL. ' +
    'Not published yet? Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone) → Deploy.');
  SpreadsheetApp.getUi().alert('League Hub status', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function leagueHubPause() {
  lhUiOnly_();
  lhProps_().setProperty('LH_PAUSED', '1');
  onOpen();
  SpreadsheetApp.getActive().toast('Automatic updates are paused. The website keeps the last data it had.', 'League Hub', 8);
}

function leagueHubResume() {
  lhUiOnly_();
  lhProps_().deleteProperty('LH_PAUSED');
  onOpen();
  leagueHubUpdateNow();
}

function leagueHubHelp() {
  lhUiOnly_();
  const html =
    '<div style="font:14px/1.5 Arial,sans-serif;color:#1f2933">' +
    '<p style="margin:0 0 8px"><b>Change how the website looks or works:</b> edit column B of the Settings tab. Changes show up within a few minutes, or right away with League Hub → Update now.</p>' +
    '<p style="margin:0 0 8px"><b>Record a payment:</b> add a row on the Payments tab (positive = the team paid, negative = the league paid the team), or use Commissioner Tools on the website.</p>' +
    '<p style="margin:0 0 8px"><b>Website not updating?</b> League Hub → Status and website address shows the last update and what went wrong. ' +
    'Private leagues: expired ESPN cookies are the usual cause (League Hub → ESPN cookies).</p>' +
    '<p style="margin:0 0 8px"><b>Installed a new version of League Hub?</b> In Extensions → Apps Script: Deploy → Manage deployments → pencil icon → Version: New version → Deploy. ' +
    'Then run League Hub → Set up once more (it keeps your settings).</p>' +
    (LH_PROJECT_URL ? '<p style="margin:0">Full guide: <a href="' + lhHtml_(LH_PROJECT_URL) + '" target="_blank">' + lhHtml_(LH_PROJECT_URL) + '</a></p>' : '') +
    '<p style="margin:8px 0 0;color:#5f6b76">League Hub ' + LH_VERSION + '. Not affiliated with ESPN.</p></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(360), 'League Hub help');
}

// ===================== Helpers =====================

// The website's address once it's published (only a public /exec address; the editor's /dev address is private)
function lhWebAppUrl_() {
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (_) {}
  return /\/exec$/.test(url) ? url : '';
}

function lhMoneyText_(n) {
  return '$' + lhRound_(n, 2).toFixed(2).replace(/\.00$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function lhHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
