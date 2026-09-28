/**
 * League Hub 1.0.0: a website for an ESPN fantasy football league, run from a Google Sheet.
 *
 * To install or update League Hub, paste this whole file over Code.gs (Extensions → Apps Script).
 * Your settings live on the spreadsheet's Settings tab, so updating never loses them.
 * Built from the apps-script/ folder with "node build.js". Not affiliated with ESPN.
 *
 * @OnlyCurrentDoc
 */

// ============================== Util.gs ==============================

/**
 * League Hub: small helpers shared by every file.
 *
 * @OnlyCurrentDoc  League Hub only needs the spreadsheet it's in, so Google asks for that access only.
 */

const LH_VERSION = '1.0.0';

function lhStr_(v) {
  return String(v == null ? '' : v).replace(/ /g, ' ').trim();
}

function lhNum_(v, fallback) {
  if (typeof v === 'number') return isFinite(v) ? v : (fallback == null ? 0 : fallback);
  const s = lhStr_(v).replace(/[$,\s]/g, '');
  if (!s || s === '-') return fallback == null ? 0 : fallback;
  const n = Number(s);
  return isFinite(n) ? n : (fallback == null ? 0 : fallback);
}

function lhRound_(x, digits) {
  const m = Math.pow(10, digits == null ? 2 : digits);
  return Math.round((Number(x) || 0) * m) / m;
}

function lhKey_(v) {
  return lhStr_(v).toLowerCase();
}

function lhJson_(s, fallback) {
  try { return s ? JSON.parse(s) : (fallback === undefined ? null : fallback); }
  catch (_) { return fallback === undefined ? null : fallback; }
}

function lhNow_() {
  return new Date().getTime();
}

function lhProps_() {
  return PropertiesService.getScriptProperties();
}

function lhCache_() {
  return CacheService.getScriptCache();
}

// Stores a long string in the script cache in pieces (each cache value is limited to 100 KB)
function lhCachePutBig_(key, text, seconds) {
  const size = 90000, obj = {};
  let n = 0;
  for (let i = 0; i < text.length; i += size) obj[key + '_' + (n++)] = text.slice(i, i + size);
  obj[key + '_N'] = String(n);
  lhCache_().putAll(obj, seconds);
}

function lhCacheGetBig_(key) {
  const cache = lhCache_();
  const n = Number(cache.get(key + '_N'));
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  const parts = cache.getAll(keys);
  let out = '';
  for (let i = 0; i < n; i++) {
    if (parts[key + '_' + i] == null) return null;
    out += parts[key + '_' + i];
  }
  return out;
}

function lhCacheRemoveBig_(key) {
  const cache = lhCache_();
  const n = Number(cache.get(key + '_N')) || 0;
  const keys = [key + '_N'];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  cache.removeAll(keys);
}

// JSON that is safe to put inside a <script> tag
function lhScriptJson_(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function lhLog_(message, err) {
  console.log('[League Hub] ' + message + (err ? ': ' + (err && err.stack ? err.stack : err) : ''));
}

// "Jordan Smith" → "Jordan S."
function lhShortName_(first, last) {
  first = lhStr_(first);
  last = lhStr_(last);
  if (!first) return last;
  return first + (last ? ' ' + last.charAt(0).toUpperCase() + '.' : '');
}

function lhSha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// Text for a spreadsheet cell that is never read as a formula (team names come from ESPN and anyone can pick them)
function lhCellText_(s) {
  s = lhStr_(s);
  return /^[=+\-@]/.test(s) ? '\'' + s : s;
}

function lhPlural_(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

// ============================== Config.gs ==============================

/**
 * League Hub: the Settings tab.
 *
 * Every setting lives on the "Settings" tab of the spreadsheet: column A is the name, column B the value
 * you edit, column C explains it, and hidden column D holds the setting's key (so renaming column A is
 * harmless). Running League Hub → Set up again rebuilds the tab and keeps every value you entered.
 *
 * Secrets never go on the sheet: ESPN cookies and the commissioner passcode are kept in Script Properties.
 */

const LH_SETTINGS_SHEET = 'Settings';
const LH_PAYMENTS_SHEET = 'Payments';

const LH_ACCENTS = {
  blue: '#3b8eea', green: '#2fb36b', red: '#e5484d', purple: '#8e6cef',
  orange: '#f5812a', teal: '#14b8a6', pink: '#e8579b', gold: '#ffb612'
};

// The picture in the website's corner (drawn by the website in the accent color)
const LH_LOGOS = { 'football': 'football', 'trophy': 'trophy', 'goal post': 'goalpost', 'first letter': 'letter' };

const LH_NAME_STYLES = {
  'first name + last initial': 'initial', 'full name': 'full', 'espn username': 'username', 'hide': 'hide'
};

// Who wins a prize. A prize's winner cell can also hold a team name typed by the commissioner.
const LH_PRIZE_RULES = {
  'champion': 'champion',
  'runner-up': 'runnerUp',
  'third place': 'third',
  'most points (regular season)': 'pointsRegular',
  'most points (all season)': 'pointsAll',
  'best regular-season record': 'bestRecord',
  'last place': 'lastPlace'
};

const LH_SETTINGS = [
  { section: 'ESPN league' },
  { key: 'league_id', label: 'ESPN league ID or link', def: '',
    help: 'Paste your league\'s ESPN web address, or just the number after leagueId=. Private leagues also need ESPN cookies (League Hub menu → ESPN cookies).' },
  { key: 'season', label: 'Season', def: 'Auto',
    help: 'Auto follows the current season. Type a year (like 2025) to show that season instead.' },

  { section: 'Website' },
  { key: 'league_name', label: 'League name', def: '', help: 'Leave blank to use the name on ESPN.' },
  { key: 'accent', label: 'Accent color', def: 'Blue', options: ['Blue', 'Green', 'Red', 'Purple', 'Orange', 'Teal', 'Pink', 'Gold'], allowOther: true,
    help: 'The highlight color of the website. Pick one, or type a color code like #1e90ff.' },
  { key: 'logo', label: 'Logo', def: 'Football', options: ['Football', 'Trophy', 'Goal post', 'First letter'],
    help: 'The picture in the top corner of the website, on your accent color. First letter uses the first letter of the league name.' },
  { key: 'manager_names', label: 'Manager names', def: 'First name + last initial',
    options: ['First name + last initial', 'Full name', 'ESPN username', 'Hide'],
    help: 'How managers are named on the website. Names come from ESPN.' },
  { key: 'founded', label: 'Year the league started', def: '', help: 'Optional. Shown with the league history.' },
  { key: 'rules', label: 'League rules', def: '',
    help: 'Optional. Shown on the League page. Put each rule on its own line (Ctrl+Enter or ⌘+Enter starts a new line in a cell).' },
  { key: 'show_win_prob', label: 'Show win probability', def: 'Yes', options: ['Yes', 'No'], help: 'On each matchup page.' },
  { key: 'show_bench', label: 'Show bench players', def: 'Yes', options: ['Yes', 'No'], help: 'On each matchup page.' },
  { key: 'show_history', label: 'Show league history', def: 'Yes', options: ['Yes', 'No'],
    help: 'Past champions and top scorers, read from ESPN (seasons before 2018 need ESPN cookies).' },

  { section: 'Money' },
  { key: 'money_page', label: 'Money page', def: 'No', options: ['Yes', 'No'],
    help: 'Yes adds a page with dues, fees, prizes and who owes what. Record payments on the Payments tab or in Commissioner Tools on the website.' },
  { key: 'entry_fee', label: 'Entry fee per team', def: 0, money: true, help: 'What each team pays to join.' },
  { key: 'keeper_fee', label: 'Keeper fees', def: '',
    help: 'Optional. One amount for every keeper (like 20), or amounts by the round the player went in last season\'s draft, like 1:50, 2:40, 3:30, K:50, UD:0 (K = kept last season too, UD = undrafted). Rounds you leave out are free.' },
  { key: 'dues_when', label: 'Entry fee is due', def: 'Before the season', options: ['Before the season', 'At the end of the season'],
    help: 'Before the season: teams pay the entry fee and keeper fees up front, and the rest (pickup and trade fees against prizes) is settled after the season. At the end of the season: everything is settled then.' },
  { key: 'pickup_fee', label: 'Fee per player pickup', def: 0, money: true, help: 'Charged for each player a team adds (free agents and waiver claims). Settled after the season.' },
  { key: 'free_pickups', label: 'Free pickups per team', def: 0, help: 'How many pickups each team gets before the pickup fee starts.' },
  { key: 'trade_fee', label: 'Fee per trade', def: 0, money: true, help: 'Charged to each team in a trade. Settled after the season.' },
  { key: 'weekly_prize', label: 'Weekly high score prize', def: 0, money: true, help: 'Paid to the top scorer each week. Ties split it.' },
  { key: 'weekly_prize_weeks', label: 'Weekly prize weeks', def: 'Regular season', options: ['Regular season', 'Every week'],
    help: 'Every week includes the playoff weeks (every team that played counts).' },

  { prizes: true },

  { section: 'Updates' },
  { key: 'refresh_minutes', label: 'Update every (minutes)', def: '5', options: ['5', '10', '15', '30'],
    help: 'How often scores update while NFL games are on. When no games are on, updates are less frequent.' },
  { key: 'alert_email', label: 'Email me when something breaks', def: 'Yes', options: ['Yes', 'No'],
    help: 'At most one email a day, for example when ESPN cookies expire. It goes to the Google account that owns this sheet.' }
];

const LH_DEFAULT_PRIZES = [
  ['Champion', '50%', 'Champion'],
  ['Runner-up', '25%', 'Runner-up'],
  ['Third place', '10%', 'Third place'],
  ['Most points', '15%', 'Most points (regular season)']
];
const LH_PRIZE_ROWS = 8;

// ===================== Reading =====================

var LH_SETTINGS_MEMO_ = null;

// The spreadsheet this script belongs to (League Hub only ever touches its own spreadsheet)
function lhSpreadsheet_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActive(); } catch (_) {}
  if (!ss) throw new Error('League Hub can\'t find its spreadsheet. It has to be added from the spreadsheet: Extensions → Apps Script.');
  return ss;
}

// The raw values on the Settings tab: { values: {key: value}, prizes: [[name, amount, winner]] }
function lhReadSettingsRaw_() {
  const sh = lhSpreadsheet_().getSheetByName(LH_SETTINGS_SHEET);
  const values = {}, prizes = [];
  if (!sh) return { values: values, prizes: prizes, missing: true };
  const last = sh.getLastRow();
  if (last < 1) return { values: values, prizes: prizes, missing: true };
  const rows = sh.getRange(1, 1, last, 4).getValues();
  rows.forEach(r => {
    const key = lhStr_(r[3]);
    if (!key) return;
    if (key === '#prize') { prizes.push([r[0], r[1], r[2]]); return; }
    if (key.charAt(0) !== '#') values[key] = r[1];
  });
  return { values: values, prizes: prizes, missing: false };
}

// Settings with defaults filled in and every value checked. Problems are listed in `problems`.
function lhSettings_() {
  if (LH_SETTINGS_MEMO_) return LH_SETTINGS_MEMO_;
  const raw = lhReadSettingsRaw_();
  const problems = [];
  const val = key => {
    const spec = LH_SETTINGS.filter(s => s.key === key)[0];
    const v = raw.values[key];
    return (v === '' || v == null) ? (spec ? spec.def : '') : v;
  };
  const yes = key => /^(yes|y|true|on|1)$/i.test(lhStr_(val(key)));
  const money = key => {
    const n = lhNum_(val(key), NaN);
    if (!isFinite(n) || n < 0) { problems.push(lhLabel_(key) + ' should be a dollar amount like 100.'); return 0; }
    return n;
  };

  const leagueId = lhParseLeagueId_(val('league_id'));
  if (!leagueId) problems.push('Add your ESPN league ID (or the league\'s web address) on the Settings tab.');

  let season = 'auto';
  const seasonText = lhStr_(val('season'));
  if (seasonText && !/^auto$/i.test(seasonText)) {
    const y = Number(seasonText);
    if (y >= 2004 && y <= 2100) season = y;
    else problems.push('Season should be Auto or a year like 2025.');
  }

  let accent = LH_ACCENTS[lhKey_(val('accent'))];
  if (!accent) {
    const hex = lhStr_(val('accent'));
    if (/^#?[0-9a-f]{6}$/i.test(hex)) accent = hex.charAt(0) === '#' ? hex : '#' + hex;
    else { accent = LH_ACCENTS.blue; problems.push('Accent color should be one of the listed colors or a code like #1e90ff.'); }
  }
  const logo = LH_LOGOS[lhKey_(val('logo'))] || 'football';

  const nameStyle = LH_NAME_STYLES[lhKey_(val('manager_names'))] || 'initial';
  const refresh = [5, 10, 15, 30].indexOf(Number(val('refresh_minutes'))) > -1 ? Number(val('refresh_minutes')) : 5;

  const keeper = lhParseKeeperFees_(val('keeper_fee'));
  if (keeper.error) problems.push(keeper.error);

  const prizes = [];
  raw.prizes.forEach(p => {
    const name = lhStr_(p[0]);
    const amountText = lhStr_(p[1]);
    const who = lhStr_(p[2]);
    if (!name && !amountText) return;
    const amount = lhParseAmount_(amountText);
    if (!amount) { problems.push('Prize "' + (name || '?') + '": the amount should be dollars (300) or a percent (50%).'); return; }
    const rule = LH_PRIZE_RULES[lhKey_(who)] || '';
    prizes.push({ name: name || who || 'Prize', amount: amount, rule: rule, team: rule ? '' : who });
  });
  if (raw.missing) LH_DEFAULT_PRIZES.forEach(p => prizes.push({ name: p[0], amount: lhParseAmount_(p[1]), rule: LH_PRIZE_RULES[lhKey_(p[2])], team: '' }));
  const shares = prizes.reduce((s, p) => s + (p.amount.type === 'share' ? p.amount.value : 0), 0);
  if (yes('money_page') && shares > 1.0001) problems.push('The prize percents add up to ' + lhRound_(shares * 100, 1) + '%. They should add up to 100% or less.');

  const moneyOn = yes('money_page');
  const settings = {
    leagueId: leagueId,
    season: season,
    leagueName: lhStr_(val('league_name')),
    accent: accent,
    logo: logo,
    managerNames: nameStyle,
    founded: lhNum_(val('founded'), 0) || null,
    rules: lhStr_(val('rules')).split(/\r?\n/).map(s => lhStr_(s).replace(/^[-•*]\s*/, '')).filter(Boolean),
    showWinProb: yes('show_win_prob'),
    showBench: yes('show_bench'),
    showHistory: yes('show_history'),
    money: {
      enabled: moneyOn,
      entryFee: moneyOn ? money('entry_fee') : 0,
      duesUpFront: !/^at the end/i.test(lhStr_(val('dues_when'))),
      pickupFee: moneyOn ? money('pickup_fee') : 0,
      freePickups: Math.max(0, Math.floor(lhNum_(val('free_pickups'), 0))),
      tradeFee: moneyOn ? money('trade_fee') : 0,
      keeperFee: keeper,
      weeklyPrize: moneyOn ? money('weekly_prize') : 0,
      weeklyAllWeeks: /^every/i.test(lhStr_(val('weekly_prize_weeks'))),
      prizes: moneyOn ? prizes : []
    },
    refreshMinutes: refresh,
    alertEmail: yes('alert_email'),
    problems: problems
  };
  LH_SETTINGS_MEMO_ = settings;
  return settings;
}

function lhLabel_(key) {
  const spec = LH_SETTINGS.filter(s => s.key === key)[0];
  return spec ? spec.label : key;
}

// "https://fantasy.espn.com/football/league?leagueId=12345678&seasonId=2025" or "12345678" → "12345678"
function lhParseLeagueId_(v) {
  const s = lhStr_(v);
  if (!s) return '';
  const m = s.match(/leagueId=(\d+)/i) || s.match(/^(\d{3,12})$/) || s.match(/leagues\/(\d+)/i);
  return m ? m[1] : '';
}

// "300" or "$300" → { type: 'fixed', value: 300 }; "50%" → { type: 'share', value: 0.5 }
function lhParseAmount_(text) {
  const s = lhStr_(text).replace(/[$,\s]/g, '');
  if (!s) return null;
  if (/^\d+(\.\d+)?%$/.test(s)) return { type: 'share', value: Number(s.slice(0, -1)) / 100 };
  if (typeof text === 'number' && text > 0 && text < 1 && String(text).indexOf('.') > -1 && lhStr_(text).indexOf('%') < 0) {
    // A cell formatted as a percent reads as 0.5 → treat as 50%
    return { type: 'share', value: text };
  }
  if (/^\d+(\.\d+)?$/.test(s)) return { type: 'fixed', value: Number(s) };
  return null;
}

// "20" → every keeper costs 20; "1:50, 2:40, K:50, UD:0" → by last season's round
function lhParseKeeperFees_(v) {
  const s = lhStr_(v);
  if (!s) return { flat: 0, byTag: null };
  if (/^\$?\d+(\.\d+)?$/.test(s.replace(/,/g, ''))) return { flat: lhNum_(s), byTag: null };
  const byTag = {};
  let bad = false;
  s.split(/[,;\n]+/).forEach(part => {
    const m = lhStr_(part).match(/^(k|ud|r?\d{1,2})\s*[:=]\s*\$?(\d+(?:\.\d+)?)$/i);
    if (!m) { if (lhStr_(part)) bad = true; return; }
    const tag = m[1].toUpperCase().replace(/^(\d)/, 'R$1');
    byTag[tag] = Number(m[2]);
  });
  if (bad) return { flat: 0, byTag: byTag, error: 'Keeper fees should look like 20, or like 1:50, 2:40, K:50, UD:0.' };
  return { flat: 0, byTag: byTag };
}

// ===================== Writing (Set up) =====================

// Builds (or rebuilds) the Settings tab, keeping every value already entered
function lhBuildSettingsSheet_() {
  const ss = lhSpreadsheet_();
  const old = lhReadSettingsRaw_();
  let sh = ss.getSheetByName(LH_SETTINGS_SHEET);
  if (!sh) sh = ss.insertSheet(LH_SETTINGS_SHEET, 0);

  const rows = [];     // [A, B, C, D]
  const styles = [];   // per row: 'title' | 'note' | 'section' | 'setting' | 'prizeHead' | 'prize' | 'blank'
  const validations = [];
  const push = (r, style, validation) => { rows.push(r); styles.push(style); validations.push(validation || null); };

  push(['League Hub settings', '', '', '#title'], 'title');
  push(['Change the values in column B. The website picks up changes within a few minutes (or use League Hub → Update now).', '', '', '#note'], 'note');

  LH_SETTINGS.forEach(spec => {
    if (spec.section) { push(['', '', '', '#blank'], 'blank'); push([spec.section, '', '', '#section'], 'section'); return; }
    if (spec.prizes) {
      push(['', '', '', '#blank'], 'blank');
      push(['Prizes', '', '', '#section'], 'section');
      push(['Prize', 'Amount', 'Winner', '#prize-head'], 'prizeHead');
      push(['Amount: dollars (like 300) or a percent (like 50%). The pot is every entry fee plus every fee. Percents split what\'s left ' +
            'of the pot after the weekly prizes and the dollar prizes, so percents that add up to 100% pay out everything. ' +
            'Winner: pick a rule, or type a team name for a prize you award yourself.', '', '', '#note'], 'note');
      const list = old.missing ? LH_DEFAULT_PRIZES : old.prizes.filter(p => lhStr_(p[0]) || lhStr_(p[1]) || lhStr_(p[2]));
      for (let i = 0; i < Math.max(LH_PRIZE_ROWS, list.length); i++) {
        const p = list[i] || ['', '', ''];
        push([p[0], p[1], p[2], '#prize'], 'prize', 'prize');
      }
      return;
    }
    const has = Object.prototype.hasOwnProperty.call(old.values, spec.key);
    const value = has ? old.values[spec.key] : spec.def;
    push([spec.label, value, spec.help || '', spec.key], 'setting', spec.options ? spec : null);
  });

  sh.clear();
  try { sh.getRange(1, 1, sh.getMaxRows(), 4).clearDataValidations(); } catch (_) {}
  sh.getRange(1, 1, rows.length, 4).setValues(rows);

  // Look and feel
  sh.setColumnWidth(1, 250);
  sh.setColumnWidth(2, 260);
  sh.setColumnWidth(3, 520);
  sh.hideColumns(4);
  sh.setFrozenRows(2);
  sh.getRange(1, 1, rows.length, 3).setVerticalAlignment('top').setWrap(true);
  styles.forEach((style, i) => {
    const r = i + 1;
    const line = sh.getRange(r, 1, 1, 3);
    if (style === 'title') sh.getRange(r, 1).setFontSize(16).setFontWeight('bold');
    else if (style === 'note') { line.merge().setFontColor('#5f6b76').setFontStyle('italic'); }
    else if (style === 'section') line.setBackground('#1f2933').setFontColor('#ffffff').setFontWeight('bold');
    else if (style === 'prizeHead') line.setFontWeight('bold').setBackground('#e8edf2');
    else if (style === 'setting') { sh.getRange(r, 1).setFontWeight('bold'); sh.getRange(r, 2).setBackground('#fff8e1'); sh.getRange(r, 3).setFontColor('#5f6b76'); }
    else if (style === 'prize') sh.getRange(r, 1, 1, 3).setBackground('#fff8e1');
  });

  // Dropdowns
  validations.forEach((spec, i) => {
    if (!spec) return;
    const r = i + 1;
    if (spec === 'prize') {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Champion', 'Runner-up', 'Third place', 'Most points (regular season)', 'Most points (all season)',
                             'Best regular-season record', 'Last place'], true)
        .setAllowInvalid(true).setHelpText('Pick a rule, or type a team name.').build();
      sh.getRange(r, 3).setDataValidation(rule);
      return;
    }
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(spec.options, true)
      .setAllowInvalid(!!spec.allowOther).build();
    sh.getRange(r, 2).setDataValidation(rule);
  });
  sh.getRange(1, 2, rows.length, 1).setNumberFormat('@');   // keep what's typed (e.g. 50%) as text
  LH_SETTINGS_MEMO_ = null;
  return sh;
}

// Writes one setting's value (used by the setup dialog)
function lhSetSetting_(key, value) {
  const sh = lhSpreadsheet_().getSheetByName(LH_SETTINGS_SHEET);
  if (!sh) return false;
  const keys = sh.getRange(1, 4, sh.getLastRow(), 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    if (lhStr_(keys[i][0]) === key) { sh.getRange(i + 1, 2).setValue(value); LH_SETTINGS_MEMO_ = null; return true; }
  }
  return false;
}

// The Payments tab: one row per payment. Positive = the team paid the league; negative = the league paid the team.
function lhBuildPaymentsSheet_(teamNames) {
  const ss = lhSpreadsheet_();
  let sh = ss.getSheetByName(LH_PAYMENTS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LH_PAYMENTS_SHEET);
    sh.getRange(2, 1, 1, 5).setValues([['', '', '', 'Positive amount = the team paid the league. Negative = the league paid the team (the settle-up, refunds).', '']]);
    sh.getRange(2, 4).setFontColor('#5f6b76').setFontStyle('italic');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 110); sh.setColumnWidth(2, 240); sh.setColumnWidth(3, 110); sh.setColumnWidth(4, 420);
    sh.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
    sh.getRange('C2:C').setNumberFormat('$#,##0.00;-$#,##0.00');
  }
  // The Season column (added in 1.0; sheets from before it get it here)
  if (lhStr_(sh.getRange(1, 5).getValue()) !== 'Season') {
    sh.getRange(1, 1, 1, 5).setValues([['Date', 'Team', 'Amount', 'Note', 'Season']]).setFontWeight('bold').setBackground('#e8edf2');
    sh.getRange(1, 5).setNote('The season a payment counts toward. Leave it blank to go by the date: January and February count toward the season before.');
    sh.setColumnWidth(5, 80);
  }
  if (teamNames && teamNames.length) lhSetPaymentTeams_(sh, teamNames);
  return sh;
}

function lhSetPaymentTeams_(sh, teamNames) {
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(teamNames, true).setAllowInvalid(true).build();
  sh.getRange('B2:B').setDataValidation(rule);
}

// ============================== Espn.gs ==============================

/**
 * League Hub: talking to ESPN.
 *
 * ESPN's fantasy data comes from its (unofficial, undocumented) API at lm-api-reads.fantasy.espn.com. Public
 * leagues can be read by anyone. Private leagues need two cookies from a logged-in ESPN account, espn_s2 and
 * SWID (League Hub menu → ESPN cookies). They're kept in Script Properties, never on the sheet or the website.
 *
 * Requests used (each one is a single call):
 *   League      ?view=mSettings&view=mTeam&view=mStandings&view=mMatchupScore   (every update)
 *   Box score   ?view=mBoxscore&scoringPeriodId=N&matchupPeriodId=M             (every update during the season)
 *   Rosters     ?view=mRoster&scoringPeriodId=N                                 (injury tags, at most every 15 minutes)
 *   Draft       ?view=mDraftDetail&view=mSettings&view=mTeam                     (draft season and keeper leagues)
 * Seasons before 2018 use ESPN's leagueHistory address.
 */

const LH_ESPN_HOST = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

function lhEspnCookies_() {
  const p = lhProps_();
  const s2 = lhStr_(p.getProperty('LH_ESPN_S2'));
  const swid = lhStr_(p.getProperty('LH_ESPN_SWID'));
  return s2 && swid ? { s2: s2, swid: swid } : null;
}

function lhEspnHeaders_(cookies) {
  const h = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Origin': 'https://fantasy.espn.com',
    'Referer': 'https://fantasy.espn.com/',
    'X-Fantasy-Source': 'kona',
    'Cache-Control': 'no-cache'
  };
  const c = cookies === undefined ? lhEspnCookies_() : cookies;
  if (c) h['Cookie'] = 'espn_s2=' + c.s2 + '; SWID=' + c.swid;
  return h;
}

function lhEspnUrl_(leagueId, season, query) {
  if (Number(season) < 2018) {
    return LH_ESPN_HOST + '/leagueHistory/' + leagueId + '?seasonId=' + season + (query ? '&' + query : '');
  }
  return LH_ESPN_HOST + '/seasons/' + season + '/segments/0/leagues/' + leagueId + (query ? '?' + query : '');
}

/**
 * One ESPN request. Returns { ok, code, data, problem } where problem is
 *   'auth'     ESPN wants a login (private league without cookies, or expired cookies)
 *   'notFound' no league with this ID for this season
 *   'other'    anything else (ESPN down, unexpected answer)
 */
function lhEspnGet_(leagueId, season, query, extraHeaders, cookies) {
  const url = lhEspnUrl_(leagueId, season, query);
  const headers = lhEspnHeaders_(cookies);
  if (extraHeaders) Object.keys(extraHeaders).forEach(k => { headers[k] = extraHeaders[k]; });
  let r;
  try {
    r = UrlFetchApp.fetch(url, { method: 'get', headers: headers, muteHttpExceptions: true, followRedirects: true });
  } catch (e) {
    lhLog_('ESPN request failed', e);
    return { ok: false, code: 0, data: null, problem: 'other' };
  }
  const code = r.getResponseCode();
  const text = lhStr_(r.getContentText());
  if (code === 401 || code === 403) return { ok: false, code: code, data: null, problem: 'auth' };
  if (code === 404) return { ok: false, code: code, data: null, problem: 'notFound' };
  if (code !== 200 || !(text.charAt(0) === '{' || text.charAt(0) === '[')) {
    return { ok: false, code: code, data: null, problem: /login|sign in|not authorized/i.test(text) ? 'auth' : 'other' };
  }
  let data = lhJson_(text);
  if (Array.isArray(data)) data = data[0] || null;      // leagueHistory answers with a list
  if (!data) return { ok: false, code: code, data: null, problem: 'other' };
  return { ok: true, code: code, data: data, problem: '' };
}

// Settings, teams, records and every matchup of the season
function lhEspnLeague_(leagueId, season) {
  return lhEspnGet_(leagueId, season, 'view=mSettings&view=mTeam&view=mStandings&view=mMatchupScore');
}

// Every roster with this week's player stats, for the matchups of one matchup period
function lhEspnBoxscore_(leagueId, season, scoringPeriod, matchupPeriod) {
  return lhEspnGet_(leagueId, season, 'view=mBoxscore&scoringPeriodId=' + scoringPeriod + '&matchupPeriodId=' + matchupPeriod);
}

// Every roster (with each player's injury status)
function lhEspnRosters_(leagueId, season, scoringPeriod) {
  return lhEspnGet_(leagueId, season, 'view=mRoster' + (scoringPeriod ? '&scoringPeriodId=' + scoringPeriod : ''));
}

function lhEspnDraft_(leagueId, season) {
  return lhEspnGet_(leagueId, season, 'view=mDraftDetail&view=mSettings&view=mTeam');
}

/**
 * Which season to show. "Auto": this calendar year's season once the league has been renewed on ESPN,
 * otherwise last year's. Remembered for 6 hours.
 * (A season that doesn't exist yet can answer "not found" or "not authorized", so last year is always tried.)
 */
function lhResolveSeason_(settings) {
  if (settings.season !== 'auto') return { season: Number(settings.season), fixed: true };
  const cacheKey = 'LH_SEASON_' + settings.leagueId;
  const hit = lhJson_(lhCache_().get(cacheKey));
  if (hit && hit.season) return hit;
  const year = new Date().getFullYear();
  let out = null;
  const now = lhEspnGet_(settings.leagueId, year, 'view=mSettings');
  if (now.ok && now.data && now.data.settings) out = { season: year, fixed: false };
  else {
    const prev = lhEspnGet_(settings.leagueId, year - 1, 'view=mSettings');
    if (prev.ok && prev.data && prev.data.settings) out = { season: year - 1, fixed: false };
    else out = { season: year, fixed: false, problem: now.problem === 'auth' || prev.problem === 'auth' ? 'auth' : (prev.problem || now.problem) };
  }
  if (!out.problem) lhCache_().put(cacheKey, JSON.stringify(out), 6 * 3600);
  return out;
}

/**
 * Checks the league ID (and cookies, if any) with one request. Used by Set up and by Commissioner Tools.
 * Returns { ok, message, name, season, teams }.
 */
function lhEspnTest_(leagueId, cookies) {
  const year = new Date().getFullYear();
  const problems = [];
  for (const season of [year, year - 1]) {
    const r = lhEspnGet_(leagueId, season, 'view=mSettings&view=mTeam', null, cookies);
    if (r.ok && r.data && r.data.settings) {
      return { ok: true, season: season, name: lhStr_(r.data.settings.name), teams: (r.data.teams || []).length,
               message: 'Found "' + lhStr_(r.data.settings.name) + '" (' + season + ', ' + (r.data.teams || []).length + ' teams).' };
    }
    problems.push(r.problem);
  }
  const lastProblem = problems.indexOf('auth') > -1 ? 'auth' : problems.indexOf('notFound') > -1 ? 'notFound' : 'other';
  if (lastProblem === 'auth') {
    return { ok: false, problem: 'auth', message: cookies
      ? 'ESPN didn\'t accept these cookies. Copy espn_s2 and SWID again (while logged in to ESPN) and retry.'
      : 'This league is private. Add your ESPN cookies: League Hub menu → ESPN cookies.' };
  }
  if (lastProblem === 'notFound') return { ok: false, problem: 'notFound', message: 'ESPN has no league with ID ' + leagueId + '. Check the league ID.' };
  return { ok: false, problem: 'other', message: 'Couldn\'t reach ESPN right now. Try again in a few minutes.' };
}

// Team name as ESPN shows it (newer answers have `name`, older ones `location` + `nickname`)
function lhEspnTeamName_(t) {
  return lhStr_(t.name || [t.location, t.nickname].filter(Boolean).join(' ')) || ('Team ' + t.id);
}

// Manager name for a team, styled by the "Manager names" setting
function lhManagerName_(team, membersById, style) {
  if (style === 'hide') return '';
  const names = (team.owners || []).map(id => {
    const m = membersById[id];
    if (!m) return '';
    if (style === 'username') return lhStr_(m.displayName);
    if (style === 'full') return lhStr_([m.firstName, m.lastName].filter(Boolean).join(' ')) || lhStr_(m.displayName);
    return lhShortName_(m.firstName, m.lastName) || lhStr_(m.displayName);
  }).filter(Boolean);
  return names.slice(0, 2).join(' & ');
}

// ============================== Nfl.gs ==============================

/**
 * League Hub: NFL games (opponent, kickoff, score, quarter and clock) from ESPN's public NFL scoreboard.
 *
 * No login needed. Fetched at most once per update: every update while a game is on or about to start,
 * otherwise once an hour. The game clock gives each player's fraction of game left for the live projections.
 *
 * Since August 2026 site.api.espn.com refuses Google's servers ("You don't have permission to access"), so
 * site.web.api.espn.com (same data) is asked first.
 */

const LH_NFL_HOSTS = ['site.web.api.espn.com', 'site.api.espn.com'];
const LH_NFL_REFRESH_MS = 60 * 60 * 1000;   // no game on: refresh once an hour
const LH_NFL_SOON_MS = 15 * 60 * 1000;      // a game kicking off within 15 minutes counts as on
const LH_CLOCK_FRESH_MS = 12 * 60 * 1000;   // an older game clock isn't trusted (the kickoff countdown is used)
const LH_MIN_LEFT = 0.01;                   // a game in progress keeps at least 1% left until it's final
const LH_GAME_MS = (3 * 60 + 15) * 60 * 1000;   // fallback countdown: a game lasts about 3h15

// ESPN pro team ids (fantasy and scoreboard use the same ids)
const LH_PRO_TEAMS = {
  0: 'FA', 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB',
  10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO',
  19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB',
  28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
};

var LH_NFL_MEMO_ = {};

/**
 * NFL games of one week by team: { at: fetch time, teams: { NE: { o: '@JAX', k: kickoff ms, s: 'pre'|'in'|'post',
 * d: 'Q3 4:12' | 'Half' | 'Final' | 'Final/OT' | '', sc: [team, opponent] | null, p: quarter, c: clock seconds } } }
 */
function lhNflWeek_(season, week) {
  const key = 'LH_NFL_' + season + '_' + week;
  if (LH_NFL_MEMO_[key]) return LH_NFL_MEMO_[key];
  const cache = lhCache_();
  const saved = lhJson_(cache.get(key));
  const now = lhNow_();
  const games = (saved && saved.teams) || {};
  const gameOn = Object.keys(games).some(t => games[t].s === 'in' ||
    (games[t].s === 'pre' && games[t].k && games[t].k - now <= LH_NFL_SOON_MS));
  let out = saved && saved.teams ? saved : { at: 0, teams: null };
  if (!(saved && !gameOn && now - Number(saved.at) < LH_NFL_REFRESH_MS)) {
    let fresh = null;
    try { fresh = lhNflFetch_(season, week); } catch (e) { lhLog_('NFL scoreboard failed', e); }
    if (fresh) {
      out = { at: now, teams: fresh };
      cache.put(key, JSON.stringify(out), 6 * 3600);
    }
  }
  LH_NFL_MEMO_[key] = out;
  return out;
}

function lhNflFetch_(season, week) {
  const path = '/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=' + Number(week) + '&dates=' + Number(season);
  let d = null;
  for (let i = 0; i < LH_NFL_HOSTS.length && !d; i++) d = lhNflGet_(LH_NFL_HOSTS[i], path);
  if (!d) return null;
  if (d.week && d.week.number != null && Number(d.week.number) !== Number(week)) return null;

  const fix = { WAS: 'WSH', JAC: 'JAX', LA: 'LAR' };
  const abbr = c => {
    const t = (c && c.team) || {};
    return LH_PRO_TEAMS[Number(t.id)] || fix[String(t.abbreviation || '').toUpperCase()] || String(t.abbreviation || '').toUpperCase();
  };
  const score = c => { const s = c && c.score; return Number(s && typeof s === 'object' ? s.value : s) || 0; };

  const teams = {};
  (d.events || []).forEach(ev => {
    const c = (ev.competitions || [])[0];
    if (!c || !Array.isArray(c.competitors) || c.competitors.length !== 2) return;
    const status = c.status || ev.status || {};
    const type = status.type || {};
    const state = ['pre', 'in', 'post'].indexOf(type.state) > -1 ? type.state : 'pre';
    const ko = Date.parse(c.date || ev.date) || null;
    const short = lhNflStatus_(state, type, status);
    const period = Number(status.period) || 0, clock = lhNflClockSecs_(status);
    c.competitors.forEach((me, i) => {
      const opp = c.competitors[1 - i], ab = abbr(me);
      if (!ab) return;
      teams[ab] = { o: (me.homeAway === 'home' ? 'vs ' : '@') + abbr(opp), k: ko, tbd: c.timeValid === false, s: state, d: short,
                    sc: state === 'pre' ? null : [score(me), score(opp)], p: period, c: clock };
    });
  });
  return Object.keys(teams).length ? teams : null;
}

function lhNflGet_(host, path) {
  try {
    const r = UrlFetchApp.fetch('https://' + host + path, { method: 'get', muteHttpExceptions: true, followRedirects: true,
                                                            headers: { 'Accept': 'application/json' } });
    if (r.getResponseCode() === 200) return JSON.parse(r.getContentText()) || null;
    lhLog_('NFL scoreboard: ' + host + ' answered HTTP ' + r.getResponseCode());
  } catch (e) {
    lhLog_('NFL scoreboard: ' + host + ' failed', e);
  }
  return null;
}

// Short game status like the ESPN app: "Q3 4:12", "Half", "End Q1", "Final", "Final/OT"
function lhNflStatus_(state, type, status) {
  const name = String(type.name || '').toUpperCase();
  const period = Number(status.period) || 0;
  const q = p => p <= 4 ? 'Q' + p : (p === 5 ? 'OT' : (p - 4) + 'OT');
  if (/POSTPONED/.test(name)) return 'Postponed';
  if (/CANCEL/.test(name)) return 'Canceled';
  if (/SUSPENDED/.test(name)) return 'Suspended';
  if (state === 'post') return period > 4 ? 'Final/OT' : 'Final';
  if (/DELAY/.test(name)) return 'Delayed';
  if (state !== 'in') return '';
  if (/HALFTIME/.test(name)) return 'Half';
  if (/END_PERIOD/.test(name)) return 'End ' + q(period);
  return (q(period) + ' ' + String(status.displayClock || '')).trim();
}

// "4:12" → 252
function lhNflClockSecs_(status) {
  const m = /^(\d+):(\d{1,2})$/.exec(lhStr_(status && status.displayClock));
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(status && status.clock);
  return status && status.clock != null && isFinite(n) ? Math.round(n) : null;
}

/**
 * Fraction of a game left, 1 (not started) … 0 (final).
 * From the game clock: regulation time left ÷ 60 minutes, never below 1% until the game is marked final
 * (so the end of the 4th quarter and all of overtime stay at 1%).
 * If the clock is missing or old: a 3h15 countdown from kickoff. null when nothing is known.
 */
function lhFracLeft_(g, clockAt, now) {
  if (!g) return null;
  if (g.s === 'post') return /^Final/.test(g.d || '') ? 0 : null;
  const fresh = clockAt && now - clockAt <= LH_CLOCK_FRESH_MS;
  if (fresh && g.s === 'pre') return 1;
  if (fresh && g.s === 'in') {
    const p = Number(g.p), c = Number(g.c);
    if (p > 4) return LH_MIN_LEFT;
    if (p >= 1 && g.c != null && isFinite(c)) {
      return Math.max(LH_MIN_LEFT, Math.min(1, ((4 - p) * 900 + Math.max(0, Math.min(900, c))) / 3600));
    }
  }
  if (g.k && !g.tbd) {
    if (now < g.k) return 1;
    return Math.max(LH_MIN_LEFT, 1 - (now - g.k) / LH_GAME_MS);
  }
  return null;
}

// ============================== Live.gs ==============================

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

// ============================== Model.gs ==============================

/**
 * League Hub: builds the website's data (the "feed") from ESPN.
 *
 * Phases:
 *   predraft  the season exists on ESPN but hasn't been drafted: the Draft page leads
 *   season    drafted and not finished: live scores, standings, playoffs
 *   complete  the championship is decided: final results until next season's league shows up on ESPN
 */

function lhBuildFeed_() {
  const settings = lhSettings_();
  const base = { v: 1, version: LH_VERSION, generatedAt: new Date().toISOString() };
  if (!settings.leagueId) {
    return Object.assign(base, { ok: false, setup: true, error: 'This website isn\'t connected to an ESPN league yet.' });
  }
  const seasonInfo = lhResolveSeason_(settings);
  const season = seasonInfo.season;
  const L = lhEspnLeague_(settings.leagueId, season);
  if (!L.ok) {
    return Object.assign(base, { ok: false, problem: L.problem || seasonInfo.problem || 'other', season: season,
      error: L.problem === 'auth' ? 'ESPN needs a login to read this league.'
        : L.problem === 'notFound' ? 'ESPN has no league with ID ' + settings.leagueId + ' for ' + season + '.'
        : 'ESPN isn\'t answering right now.' });
  }
  const now = lhNow_();
  const d = L.data;
  const es = d.settings || {};
  const status = d.status || {};
  const sched = es.scheduleSettings || {};
  const members = {};
  (d.members || []).forEach(m => { members[m.id] = m; });

  // ---- League shape ----
  const regWeeks = Number(sched.matchupPeriodCount) || 14;
  const playoffTeams = Number(sched.playoffTeamCount) || 0;
  const periods = lhMatchupPeriods_(sched, status);
  const lastMp = Object.keys(periods).map(Number).reduce((a, b) => Math.max(a, b), regWeeks);
  const currentMp = Number(status.currentMatchupPeriod) || 0;
  const latestSp = Number(status.latestScoringPeriod) || 0;
  const drafted = !!(d.draftDetail && d.draftDetail.drafted);

  // ---- Teams ----
  const teams = (d.teams || []).map(t => ({
    id: t.id,
    name: lhEspnTeamName_(t),
    abbrev: lhStr_(t.abbrev),
    logo: /^https:\/\//.test(lhStr_(t.logo)) ? lhStr_(t.logo) : '',
    manager: lhManagerName_(t, members, settings.managerNames),
    div: t.divisionId != null ? Number(t.divisionId) : null,
    seed: Number(t.playoffSeed) || 0,
    rank: Number(t.rankCalculatedFinal || t.rankFinal) || 0,
    adds: Number((t.transactionCounter || {}).acquisitions) || 0,
    trades: Number((t.transactionCounter || {}).trades) || 0,
    faab: (t.transactionCounter || {}).acquisitionBudgetSpent != null ? Number(t.transactionCounter.acquisitionBudgetSpent) : null,
    _rec: (t.record || {}).overall || null
  }));
  const byId = {};
  teams.forEach(t => { byId[t.id] = t; });

  // ---- Every matchup of the season ----
  const games = (d.schedule || []).map(g => lhGame_(g)).filter(g => g.a != null);
  const champGame = lhChampionshipGame_(games, regWeeks, playoffTeams);
  const complete = drafted && (teams.some(t => t.rank > 0) || !!(champGame && champGame.w));
  const phase = !drafted ? 'predraft' : complete ? 'complete' : 'season';

  lhRecords_(teams, games, regWeeks, phase === 'complete' ? Infinity : currentMp);
  const standings = lhStandingsOrder_(teams);

  const feed = Object.assign(base, {
    ok: true,
    league: {
      id: settings.leagueId,
      name: settings.leagueName || lhStr_(es.name) || 'Fantasy League',
      season: season,
      size: teams.length,
      phase: phase,
      espnUrl: 'https://fantasy.espn.com/football/league?leagueId=' + settings.leagueId + (seasonInfo.fixed ? '&seasonId=' + season : ''),
      founded: settings.founded,
      accent: settings.accent,
      logo: settings.logo,
      scoring: lhScoringType_(es.scoringSettings),
      ppr: lhCatchPoints_(es.scoringSettings) > 0,   // catches score points: player cards show receptions
      keepers: Number((es.draftSettings || {}).keeperCount) || 0,
      managers: settings.managerNames !== 'hide'
    },
    schedule: { regularWeeks: regWeeks, playoffTeams: playoffTeams, lastMp: lastMp, periods: periods },
    teams: teams.map(t => { const c = Object.assign({}, t); delete c._rec; return c; }),
    divisions: ((sched.divisions || []).length > 1 ? sched.divisions : []).map(x => ({ id: Number(x.id), name: lhStr_(x.name) })),
    standings: standings,
    week: null,
    current: null,
    detail: null,
    results: [],
    highs: [],
    playoffs: null,
    money: null,
    keepers: null,
    draft: null,
    history: [],
    rules: { summary: lhRulesSummary_(es, teams.length, periods, regWeeks, playoffTeams), custom: settings.rules },
    options: { winProb: settings.showWinProb, bench: settings.showBench, history: settings.showHistory, money: settings.money.enabled },
    refresh: { minutes: 30 }
  });

  // ---- This week (live) ----
  if (phase === 'season' && currentMp >= 1) {
    const spList = periods[currentMp] || [currentMp];
    const sp = spList.indexOf(latestSp) > -1 ? latestSp : spList[spList.length - 1];
    feed.week = lhWeekInfo_(currentMp, spList, regWeeks, lastMp, playoffTeams);
    try { lhLiveWeek_(feed, settings, season, currentMp, sp, spList, games, now); }
    catch (e) { lhLog_('Live week skipped', e); }
  }

  // ---- Results, weekly high scores, playoffs ----
  feed.results = lhResults_(games, periods, currentMp, phase);
  feed.highs = lhWeeklyHighs_(games, periods, regWeeks, currentMp, phase, settings.money);
  feed.playoffs = lhPlayoffs_(teams, games, periods, regWeeks, playoffTeams, currentMp, phase, standings);
  if (phase === 'complete') feed.final = lhFinalPlaces_(teams, champGame, games, regWeeks, playoffTeams);

  // ---- Keepers, draft, money, history (each can fail on its own without breaking the page) ----
  try { feed.keepers = lhKeepers_(settings, season, d, phase, feed); } catch (e) { lhLog_('Keepers skipped', e); }
  if (phase === 'predraft') {
    try { feed.draft = lhDraftInfo_(settings, season, d, feed); } catch (e) { lhLog_('Draft info skipped', e); }
  }
  if (settings.money.enabled) {
    try { feed.money = lhMoney_(settings, feed, games, periods, regWeeks); } catch (e) { lhLog_('Money skipped', e); }
  }
  if (settings.showHistory) {
    try { feed.history = lhHistory_(settings, season, status, feed); } catch (e) { lhLog_('History skipped', e); }
  }
  feed.refresh.minutes = lhNextRefreshMinutes_(feed, settings);
  return feed;
}

// ===================== Schedule =====================

// Matchup period → its scoring periods (NFL weeks). ESPN lists them in scheduleSettings.matchupPeriods.
function lhMatchupPeriods_(sched, status) {
  const out = {};
  const mp = sched.matchupPeriods || {};
  Object.keys(mp).forEach(k => {
    const list = (mp[k] || []).map(Number).filter(n => n > 0);
    if (list.length) out[Number(k)] = list;
  });
  if (Object.keys(out).length) return out;
  // Older answers: one week per regular season period, playoffMatchupPeriodLength weeks per playoff round
  const reg = Number(sched.matchupPeriodCount) || 14;
  const len = Math.max(1, Number(sched.playoffMatchupPeriodLength) || 1);
  const finalSp = Number(status.finalScoringPeriod) || (reg + 3);
  for (let p = 1; p <= reg; p++) out[p] = [p];
  let sp = reg + 1, p = reg + 1;
  while (sp <= finalSp) { const list = []; for (let i = 0; i < len && sp <= finalSp; i++) list.push(sp++); out[p++] = list; }
  return out;
}

function lhGame_(g) {
  const side = s => s && s.teamId != null ? s : null;
  const home = side(g.home), away = side(g.away);
  const w = g.winner === 'HOME' ? 'a' : g.winner === 'AWAY' ? 'b' : g.winner === 'TIE' ? 'tie' : '';
  const byWeek = s => {
    const out = {};
    const m = (s && s.pointsByScoringPeriod) || {};
    Object.keys(m).forEach(k => { out[Number(k)] = Number(m[k]) || 0; });
    return out;
  };
  return {
    id: g.id,
    mp: Number(g.matchupPeriodId) || 0,
    a: home ? home.teamId : (away ? away.teamId : null),
    b: home && away ? away.teamId : null,
    sa: lhRound_(lhFirstNum_([(home || away || {}).totalPointsLive, (home || away || {}).totalPoints]) || 0, 2),
    sb: home && away ? lhRound_(lhFirstNum_([away.totalPointsLive, away.totalPoints]) || 0, 2) : null,
    wa: byWeek(home || away),
    wb: home && away ? byWeek(away) : {},
    w: w,
    tier: lhStr_(g.playoffTierType) || 'NONE'
  };
}

// Wins, losses, ties and points: ESPN's record when it has one, otherwise counted from the results.
// total = points from every finished week (matchup periods before doneBefore), playoffs included.
function lhRecords_(teams, games, regWeeks, doneBefore) {
  const calc = {};
  teams.forEach(t => { calc[t.id] = { w: 0, l: 0, t: 0, pf: 0, pa: 0, total: 0, streak: [] }; });
  games.slice().sort((x, y) => x.mp - y.mp).forEach(g => {
    const A = calc[g.a], B = g.b != null ? calc[g.b] : null;
    if (g.mp < doneBefore) {
      if (A) A.total += g.sa;
      if (B) B.total += g.sb || 0;
    }
    if (g.mp > regWeeks || !g.w || !A) return;
    A.pf += g.sa;
    if (!B) return;
    B.pf += g.sb; A.pa += g.sb; B.pa += g.sa;
    if (g.w === 'a') { A.w++; B.l++; A.streak.push('W'); B.streak.push('L'); }
    else if (g.w === 'b') { A.l++; B.w++; A.streak.push('L'); B.streak.push('W'); }
    else { A.t++; B.t++; A.streak.push('T'); B.streak.push('T'); }
  });
  teams.forEach(t => {
    const c = calc[t.id], r = t._rec;
    const streakOf = list => {
      if (!list.length) return '';
      const last = list[list.length - 1];
      let n = 0;
      for (let i = list.length - 1; i >= 0 && list[i] === last; i--) n++;
      return last + n;
    };
    if (r && r.wins != null) {
      t.w = Number(r.wins) || 0; t.l = Number(r.losses) || 0; t.t = Number(r.ties) || 0;
      t.pf = lhRound_(Number(r.pointsFor) || c.pf, 2); t.pa = lhRound_(Number(r.pointsAgainst) || c.pa, 2);
      const type = { WIN: 'W', LOSS: 'L', TIE: 'T' }[lhStr_(r.streakType).toUpperCase()];
      t.streak = type && Number(r.streakLength) ? type + Number(r.streakLength) : streakOf(c.streak);
    } else {
      t.w = c.w; t.l = c.l; t.t = c.t; t.pf = lhRound_(c.pf, 2); t.pa = lhRound_(c.pa, 2); t.streak = streakOf(c.streak);
    }
    t.total = lhRound_(c.total, 2);   // every game, playoffs included
    const games = t.w + t.l + t.t;
    t.pct = games ? lhRound_((t.w + 0.5 * t.t) / games, 4) : 0;
  });
}

// Overall standings: ESPN's playoff seeds when every team has one, otherwise win % then points
function lhStandingsOrder_(teams) {
  const seeds = teams.map(t => t.seed).filter(s => s > 0);
  const useSeeds = seeds.length === teams.length && new Set(seeds).size === seeds.length && teams.some(t => t.w + t.l + t.t > 0);
  return teams.slice().sort((a, b) => useSeeds ? a.seed - b.seed : (b.pct - a.pct) || (b.pf - a.pf) || a.name.localeCompare(b.name))
    .map(t => t.id);
}

function lhWeekInfo_(mp, spList, regWeeks, lastMp, playoffTeams) {
  const playoffs = mp > regWeeks;
  const rounds = lhRoundNames_(playoffTeams, lastMp - regWeeks);
  const weeks = spList.length > 1 ? 'Weeks ' + spList[0] + '–' + spList[spList.length - 1] : 'Week ' + spList[0];
  return { mp: mp, sp: spList, label: weeks, playoffs: playoffs, round: playoffs ? (rounds[mp - regWeeks - 1] || '') : '' };
}

// Round names by how many rounds the bracket has (6 teams → 3 rounds: first round with byes, semifinals, final)
function lhRoundNames_(playoffTeams, roundCount) {
  const n = roundCount || Math.max(1, Math.ceil(Math.log(Math.max(2, playoffTeams)) / Math.log(2)));
  const names = { 1: ['Championship'], 2: ['Semifinals', 'Championship'], 3: ['Quarterfinals', 'Semifinals', 'Championship'],
                  4: ['First Round', 'Quarterfinals', 'Semifinals', 'Championship'] }[n];
  if (names) return names;
  const out = [];
  for (let i = 1; i <= n; i++) out.push(i === n ? 'Championship' : 'Round ' + i);
  return out;
}

// ===================== Live week =====================

function lhLiveWeek_(feed, settings, season, mp, sp, spList, games, now) {
  const B = lhEspnBoxscore_(settings.leagueId, season, sp, mp);
  const nfl = lhNflWeek_(season, sp);
  const injuries = lhInjuryTags_(settings.leagueId, season);
  const lineups = {};
  if (B.ok) {
    (B.data.schedule || []).forEach(g => {
      if (Number(g.matchupPeriodId) !== mp) return;
      [g.home, g.away].forEach(s => {
        if (!s || s.teamId == null) return;
        const entries = (s.rosterForCurrentScoringPeriod && s.rosterForCurrentScoringPeriod.entries) || [];
        if (entries.length) lineups[s.teamId] = lhLineup_(entries, sp, nfl, injuries, now);
      });
    });
  }

  // Earlier weeks of a multi-week matchup count toward it; later weeks are estimated from this week's projection
  const idx = spList.indexOf(sp);
  const earlier = spList.slice(0, Math.max(0, idx));
  const laterWeeks = Math.max(0, spList.length - idx - 1);

  const weekGames = games.filter(g => g.mp === mp);
  const sideOf = (id, wk, fallbackScore) => {
    const lu = lineups[id];
    const before = earlier.reduce((s, w) => s + (Number((wk || {})[w]) || 0), 0);
    if (!lu) return { score: fallbackScore, proj: fallbackScore, done: false };
    const future = laterWeeks * lu.starters.reduce((s, p) => s + p.p, 0);
    const allFinal = lu.starters.every(p => p.r === 0) && !laterWeeks;
    return { score: lhRound_(before + lu.actual, 2), proj: lhRound_(before + lu.proj + future, 2), done: allFinal };
  };
  const matchups = weekGames.map(g => {
    const A = sideOf(g.a, g.wa, g.sa);
    const Bs = g.b != null ? sideOf(g.b, g.wb, g.sb) : null;
    return { a: g.a, b: g.b, sa: A.score, sb: Bs ? Bs.score : null, pa: A.proj, pb: Bs ? Bs.proj : null,
             da: A.done, db: Bs ? Bs.done : true, tier: g.tier };
  });
  feed.current = { mp: mp, sp: sp, matchups: matchups };

  if (Object.keys(lineups).length) {
    const detail = { teams: {}, at: new Date(now).toISOString(), nfl: null };
    Object.keys(lineups).forEach(id => {
      const lu = lineups[id];
      detail.teams[id] = { starters: lu.starters, bench: settings.showBench ? lu.bench : [] };
    });
    if (nfl && nfl.teams) {
      detail.nfl = {};
      Object.keys(nfl.teams).forEach(t => {
        const g = nfl.teams[t];
        detail.nfl[t] = { o: g.o, k: g.k, tbd: g.tbd ? 1 : 0, s: g.s, d: g.d, sc: g.sc };
      });
    }
    feed.detail = detail;
  }
}

// Injury tags by player id from ESPN's roster view (the box score doesn't carry them), at most every 15 minutes
function lhInjuryTags_(leagueId, season) {
  const index = lhRosterIndex_(leagueId, season);
  const tags = {};
  let n = 0;
  Object.keys(index).forEach(id => { if (index[id].inj != null) { tags[id] = index[id].inj; n++; } });
  return n ? tags : null;
}

// ===================== Results and weekly high scores =====================

function lhResults_(games, periods, currentMp, phase) {
  const byMp = {};
  games.forEach(g => {
    const played = g.w || (phase === 'complete') || g.mp < currentMp;
    if (!played || g.mp > (phase === 'complete' ? 999 : currentMp - 1)) return;
    (byMp[g.mp] = byMp[g.mp] || []).push({ a: g.a, b: g.b, sa: g.sa, sb: g.sb, w: g.w, tier: g.tier });
  });
  return Object.keys(byMp).map(Number).sort((x, y) => x - y)
    .map(mp => ({ mp: mp, weeks: periods[mp] || [mp], games: byMp[mp] }));
}

// Top score of every finished week (ties share it), and the current week's leader so far
function lhWeeklyHighs_(games, periods, regWeeks, currentMp, phase, money) {
  const out = [];
  const lastDoneMp = phase === 'complete' ? 999 : currentMp - 1;
  Object.keys(periods).map(Number).sort((x, y) => x - y).forEach(mp => {
    if (mp > lastDoneMp) return;
    const list = games.filter(g => g.mp === mp);
    if (!list.length) return;
    (periods[mp] || [mp]).forEach(sp => {
      const scores = [];
      list.forEach(g => {
        const multi = (periods[mp] || []).length > 1;
        const a = multi ? g.wa[sp] : g.sa, b = multi ? g.wb[sp] : g.sb;
        if (a != null) scores.push({ id: g.a, s: Number(a) || 0 });
        if (g.b != null && b != null) scores.push({ id: g.b, s: Number(b) || 0 });
      });
      if (!scores.length) return;
      const top = scores.reduce((m, x) => Math.max(m, x.s), -Infinity);
      if (!(top > 0)) return;
      const winners = scores.filter(x => x.s === top).map(x => x.id);
      const paid = money && money.enabled && money.weeklyPrize > 0 && (money.weeklyAllWeeks || mp <= regWeeks);
      out.push({ sp: sp, mp: mp, teams: winners, score: lhRound_(top, 2), prize: paid ? lhRound_(money.weeklyPrize / winners.length, 2) : 0 });
    });
  });
  return out;
}

// ===================== Playoffs =====================

function lhChampionshipGame_(games, regWeeks, playoffTeams) {
  const bracket = games.filter(g => g.mp > regWeeks && g.tier === 'WINNERS_BRACKET');
  if (!bracket.length) return null;
  const lastMp = bracket.reduce((m, g) => Math.max(m, g.mp), 0);
  const finals = bracket.filter(g => g.mp === lastMp);
  const rounds = Math.ceil(Math.log(Math.max(2, playoffTeams)) / Math.log(2));
  return finals.length === 1 && lastMp - regWeeks >= rounds ? finals[0] : null;
}

function lhPlayoffs_(teams, games, periods, regWeeks, playoffTeams, currentMp, phase, standings) {
  if (!playoffTeams || phase === 'predraft') return null;
  const byId = {};
  teams.forEach(t => { byId[t.id] = t; });
  const inPlayoffs = phase === 'complete' || currentMp > regWeeks;
  const seedOf = id => (byId[id] && byId[id].seed) || 0;

  // Regular season: who'd be in if the season ended today
  if (!inPlayoffs) {
    return { picture: true, teams: playoffTeams, seeds: standings.slice(0, playoffTeams).map((id, i) => ({ seed: i + 1, id: id })), rounds: [] };
  }

  const roundCount = Math.max(1, Math.ceil(Math.log(Math.max(2, playoffTeams)) / Math.log(2)));
  const names = lhRoundNames_(playoffTeams, roundCount);
  const bracket = games.filter(g => g.mp > regWeeks && (g.tier === 'WINNERS_BRACKET' || g.tier === 'WINNERS_CONSOLATION_LADDER'));
  const side = (id, score) => id == null ? null : { id: id, seed: seedOf(id), score: score };
  const rounds = [];
  for (let i = 0; i < roundCount; i++) {
    const mp = regWeeks + 1 + i;
    const list = bracket.filter(g => g.mp === mp);
    const main = list.filter(g => g.tier === 'WINNERS_BRACKET').map(g => ({
      kind: i === roundCount - 1 ? 'final' : 'bracket', a: side(g.a, g.sa), b: side(g.b, g.sb), w: g.w
    }));
    const round = { mp: mp, weeks: periods[mp] || [mp], name: names[i] || 'Round ' + (i + 1), games: main };
    if (i === roundCount - 1 && roundCount > 1) {
      // Third place game: the two semifinal losers, if ESPN schedules it
      const semis = rounds[i - 1] ? rounds[i - 1].games : [];
      const losers = semis.map(g => g.w === 'a' ? g.b && g.b.id : g.w === 'b' ? g.a && g.a.id : null).filter(x => x != null);
      const third = list.filter(g => g.tier === 'WINNERS_CONSOLATION_LADDER' && losers.indexOf(g.a) > -1 && losers.indexOf(g.b) > -1)[0];
      if (third) round.games.push({ kind: 'third', a: side(third.a, third.sa), b: side(third.b, third.sb), w: third.w });
    }
    rounds.push(round);
  }
  const seeds = teams.filter(t => t.seed > 0 && t.seed <= playoffTeams).sort((a, b) => a.seed - b.seed).map(t => ({ seed: t.seed, id: t.id }));
  return { picture: false, teams: playoffTeams, seeds: seeds.length ? seeds : standings.slice(0, playoffTeams).map((id, i) => ({ seed: i + 1, id: id })), rounds: rounds };
}

// Champion, runner-up and third place once the season is over
function lhFinalPlaces_(teams, champGame, games, regWeeks, playoffTeams) {
  const ranked = teams.filter(t => t.rank > 0).sort((a, b) => a.rank - b.rank);
  if (ranked.length) return { champion: ranked[0] ? ranked[0].id : null, runnerUp: ranked[1] ? ranked[1].id : null, third: ranked[2] ? ranked[2].id : null };
  if (!champGame || !champGame.w || champGame.w === 'tie') return null;
  return { champion: champGame.w === 'a' ? champGame.a : champGame.b, runnerUp: champGame.w === 'a' ? champGame.b : champGame.a, third: null };
}

// ===================== League summary =====================

function lhScoringType_(scoring) {
  const items = (scoring && scoring.scoringItems) || [];
  const rec = items.filter(x => Number(x.statId) === 53)[0];
  const ppr = rec ? Number(rec.points) || 0 : 0;
  if (ppr === 1) return 'PPR';
  if (ppr === 0.5) return 'Half PPR';
  if (ppr > 0) return ppr + ' points per catch';
  if (lhCatchPoints_(scoring) > 0) return 'Partial PPR';   // catches score only for some positions (like TE premium)
  return 'Standard';
}

// The most a catch (stat 53) is worth at any position, counting per-position overrides; 0 in standard scoring
function lhCatchPoints_(scoring) {
  const items = (scoring && scoring.scoringItems) || [];
  return items.filter(x => Number(x.statId) === 53).reduce((best, x) => {
    const overrides = Object.keys(x.pointsOverrides || {}).map(k => Number(x.pointsOverrides[k]) || 0);
    return Math.max(best, Number(x.points) || 0, ...overrides);
  }, 0);
}

function lhRulesSummary_(es, size, periods, regWeeks, playoffTeams) {
  const out = [];
  out.push(size + ' teams, ' + lhScoringType_(es.scoringSettings) + ' scoring');

  const counts = ((es.rosterSettings || {}).lineupSlotCounts) || {};
  const starters = [];
  let bench = 0;
  LH_SLOT_ORDER.forEach(slot => {
    const n = Number(counts[slot]) || 0;
    if (!n) return;
    if (slot === 20) { bench = n; return; }
    if (slot === 21) return;
    const label = LH_SLOT_LABELS[slot];
    starters.push(n > 1 ? n + ' ' + label : label);
  });
  if (starters.length) out.push('Starting lineup: ' + starters.join(', ') + (bench ? ' (plus ' + lhPlural_(bench, 'bench spot', 'bench spots') + ')' : ''));

  const divisions = ((es.scheduleSettings || {}).divisions || []);
  if (divisions.length > 1) out.push(divisions.length + ' divisions: ' + divisions.map(x => lhStr_(x.name)).join(', '));

  const playoffMps = Object.keys(periods).map(Number).filter(p => p > regWeeks).sort((a, b) => a - b);
  out.push('Regular season: weeks 1–' + ((periods[regWeeks] || [regWeeks]).slice(-1)[0]));
  if (playoffTeams && playoffMps.length) {
    const first = periods[playoffMps[0]][0], last = periods[playoffMps[playoffMps.length - 1]].slice(-1)[0];
    const twoWeek = playoffMps.some(p => (periods[p] || []).length > 1);
    out.push('Playoffs: ' + playoffTeams + ' teams, weeks ' + first + '–' + last + (twoWeek ? ' (some rounds last two weeks)' : ''));
  }

  const acq = es.acquisitionSettings || {};
  if (acq.isUsingAcquisitionBudget) out.push('Waivers: free agent budget of $' + (Number(acq.acquisitionBudget) || 0));
  const deadline = Number((es.tradeSettings || {}).deadlineDate) || 0;
  if (deadline > 0) out.push('Trade deadline: ' + Utilities.formatDate(new Date(deadline), 'America/New_York', 'MMMM d'));
  const keepers = Number((es.draftSettings || {}).keeperCount) || 0;
  if (keepers) out.push('Keepers: ' + keepers + ' per team');
  const ds = es.draftSettings || {};
  const type = lhStr_(ds.type).toUpperCase();
  if (type === 'AUCTION') out.push('Draft: auction' + (ds.auctionBudget ? ' ($' + ds.auctionBudget + ' budget)' : ''));
  else if (type === 'SNAKE') out.push('Draft: snake');
  return out;
}

// How often the website should check for new data (minutes)
function lhNextRefreshMinutes_(feed, settings) {
  const nfl = feed.detail && feed.detail.nfl;
  if (nfl) {
    const now = lhNow_();
    const soon = Object.keys(nfl).some(t => nfl[t].s === 'in' || (nfl[t].s === 'pre' && nfl[t].k && nfl[t].k - now < 30 * 60000 && nfl[t].k > now - 4 * 3600000));
    if (soon) return settings.refreshMinutes;
  }
  if (feed.draft && feed.draft.date && Math.abs(feed.draft.date - lhNow_()) < 6 * 3600000) return 5;
  return feed.league.phase === 'season' ? 30 : 120;
}

// ============================== Keepers.gs ==============================

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

// ============================== Money.gs ==============================

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

// ============================== History.gs ==============================

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

// ============================== Feed.gs ==============================

/**
 * League Hub: keeping the website's data up to date.
 *
 * A timer (installed by Set up) runs refreshLeague every few minutes. Each run decides whether an update is due:
 *   NFL games on (or kicking off soon)  every "Update every (minutes)" from the Settings tab
 *   during the season otherwise          every 30 minutes, and right after each kickoff
 *   draft day                             every 5 minutes around the draft
 *   otherwise                             every 2 hours
 * The finished data is kept in the script cache, so visitors never wait for ESPN.
 */

const LH_FEED_KEY = 'LH_FEED';
const LH_FEED_SECONDS = 6 * 3600;

// The timer's function (don't rename it; the timer calls it by name)
function refreshLeague() {
  lhRefresh_(false);
}

// Builds fresh data now if an update is due (or always when force is true). Returns the status.
function lhRefresh_(force) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(force ? 25000 : 500)) return { ok: false, message: 'Another update is running. Try again in a minute.' };
  try {
    const props = lhProps_();
    if (!force && props.getProperty('LH_PAUSED') === '1') return { ok: true, skipped: true, message: 'Automatic updates are paused.' };
    const due = Number(props.getProperty('LH_NEXT_DUE')) || 0;
    if (!force && lhNow_() < due && lhCacheGetBig_(LH_FEED_KEY)) return { ok: true, skipped: true };

    LH_SETTINGS_MEMO_ = null;
    let feed;
    try { feed = lhBuildFeed_(); }
    catch (e) { lhLog_('Update failed', e); feed = { ok: false, problem: 'other', error: 'Something went wrong while updating.' }; }

    const status = { at: lhNow_(), ok: !!feed.ok, message: feed.ok ? 'Updated.' : feed.error, problem: feed.problem || '',
                     season: feed.league ? feed.league.season : feed.season || null,
                     league: feed.league ? feed.league.name : '', teams: feed.teams ? feed.teams.length : 0 };
    if (feed.ok) {
      const json = JSON.stringify(feed);
      lhCachePutBig_(LH_FEED_KEY, json, LH_FEED_SECONDS);
      lhSaveLastGood_(feed, force);
      props.setProperty('LH_NEXT_DUE', String(lhNextDue_(feed)));
      lhSyncPaymentTeams_(feed);
    } else {
      // Keep showing the last good data (cached, or the saved copy); try again in 10 minutes
      props.setProperty('LH_NEXT_DUE', String(lhNow_() + 10 * 60000));
      const cached = lhJson_(lhCacheGetBig_(LH_FEED_KEY));
      if (!cached || !cached.ok) {
        const last = lhLastGood_();
        lhCachePutBig_(LH_FEED_KEY, JSON.stringify(last || feed), 600);
      }
      lhMaybeAlert_(status);
    }
    props.setProperty('LH_STATUS', JSON.stringify(status));
    try { lhEnsureTrigger_(false); } catch (e) { lhLog_('Timer check skipped', e); }
    return status;
  } finally {
    lock.releaseLock();
  }
}

// When the timer should build new data next (ms)
function lhNextDue_(feed) {
  const now = lhNow_();
  const settings = lhSettings_();
  const margin = 45 * 1000;   // the timer runs every few minutes; don't miss a run by a few seconds
  const nfl = feed.detail && feed.detail.nfl;
  if (nfl) {
    const games = Object.keys(nfl).map(k => nfl[k]);
    if (games.some(g => g.s === 'in' || (g.s === 'pre' && g.k && g.k - now < 15 * 60000 && g.k > now - 4 * 3600000))) {
      return now + settings.refreshMinutes * 60000 - margin;
    }
    const next = games.filter(g => g.s === 'pre' && g.k > now).reduce((m, g) => Math.min(m, g.k), Infinity);
    const base = now + 30 * 60000 - margin;
    return next < base ? Math.max(now + 60000, next - 10 * 60000) : base;
  }
  if (feed.draft && feed.draft.date && (feed.draft.inProgress || Math.abs(feed.draft.date - now) < 3 * 3600000)) return now + 5 * 60000 - margin;
  if (feed.league.phase === 'season') return now + 30 * 60000 - margin;
  return now + 120 * 60000 - margin;
}

// The website asks for data here (google.script.run and ?format=json). Uses the saved copy; builds one if there's
// none yet. Adds `status` so the page can say when the last update from ESPN failed.
function lhGetFeed() {
  let json = lhCacheGetBig_(LH_FEED_KEY);
  if (!json) {
    lhRefresh_(true);
    json = lhCacheGetBig_(LH_FEED_KEY);
  }
  const feed = lhJson_(json) || { ok: false, error: 'No data yet. Try again in a minute.' };
  const st = lhStatus_();
  if (st) feed.status = { ok: st.ok, at: st.at, problem: st.problem || '' };
  return JSON.stringify(feed);
}

function lhClearFeed_() {
  lhCacheRemoveBig_(LH_FEED_KEY);
  lhProps_().deleteProperty('LH_NEXT_DUE');
}

// A copy of the last good data in Script Properties (without player details), saved at most every 30 minutes,
// so the website still has something to show if ESPN is unreachable for hours
function lhSaveLastGood_(feed, force) {
  const props = lhProps_();
  const last = Number(props.getProperty('LH_LAST_GOOD_AT')) || 0;
  if (!force && lhNow_() - last < 30 * 60000) return;
  const slim = Object.assign({}, feed, { detail: null });
  const json = JSON.stringify(slim);
  const size = 8000, obj = {};
  let n = 0;
  for (let i = 0; i < json.length; i += size) obj['LH_LAST_GOOD_' + (n++)] = json.slice(i, i + size);
  if (n > 25) return;   // too big to keep; skip rather than fill Script Properties (500 KB in all)
  const oldN = Number(props.getProperty('LH_LAST_GOOD_N')) || 0;
  obj['LH_LAST_GOOD_N'] = String(n);
  obj['LH_LAST_GOOD_AT'] = String(lhNow_());
  props.setProperties(obj, false);
  for (let i = n; i < oldN; i++) props.deleteProperty('LH_LAST_GOOD_' + i);
}

function lhLastGood_() {
  const all = lhProps_().getProperties();
  const n = Number(all.LH_LAST_GOOD_N) || 0;
  if (!n) return null;
  let json = '';
  for (let i = 0; i < n; i++) {
    if (all['LH_LAST_GOOD_' + i] == null) return null;
    json += all['LH_LAST_GOOD_' + i];
  }
  const feed = lhJson_(json);
  if (feed) feed.stale = true;
  return feed;
}

// One email a day at most, for problems the commissioner has to fix (cookies, league ID)
function lhMaybeAlert_(status) {
  if (status.problem !== 'auth' && status.problem !== 'notFound') return;
  let settings;
  try { settings = lhSettings_(); } catch (_) { return; }
  if (!settings.alertEmail) return;
  const props = lhProps_();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd');
  if (props.getProperty('LH_ALERT_DAY') === today) return;
  const to = Session.getEffectiveUser().getEmail();
  if (!to) return;
  const fix = status.problem === 'auth'
    ? 'ESPN needs a login to read your league. If it\'s a private league, the ESPN cookies probably expired.\n\n' +
      'To fix it: open the spreadsheet, click League Hub → ESPN cookies, and paste fresh espn_s2 and SWID values ' +
      '(or use Commissioner Tools on the website).'
    : 'ESPN says there\'s no league with the ID on your Settings tab. Check "ESPN league ID or link" on the Settings tab.';
  try {
    MailApp.sendEmail(to, 'League Hub: your league website can\'t update', fix +
      '\n\nThe website keeps showing the last scores it had until this is fixed.\n\n(League Hub sends at most one of these a day. ' +
      'You can turn them off on the Settings tab: "Email me when something breaks".)');
    props.setProperty('LH_ALERT_DAY', today);
  } catch (e) { lhLog_('Alert email failed', e); }
}

// Keeps the Payments tab's team dropdown in step with ESPN's team names
function lhSyncPaymentTeams_(feed) {
  const names = feed.teams.map(t => t.name).sort();
  const sig = lhSha256Hex_(names.join('|'));
  const props = lhProps_();
  if (props.getProperty('LH_PAY_TEAMS') === sig) return;
  try {
    const sh = lhSpreadsheet_().getSheetByName(LH_PAYMENTS_SHEET);
    if (sh) lhSetPaymentTeams_(sh, names);
    props.setProperty('LH_PAY_TEAMS', sig);
  } catch (e) { lhLog_('Payments dropdown skipped', e); }
}

// Makes sure exactly one timer runs refreshLeague at the chosen interval
function lhEnsureTrigger_(forceReinstall) {
  const settings = lhSettings_();
  const props = lhProps_();
  const want = String(settings.refreshMinutes);
  const mine = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'refreshLeague');
  if (!forceReinstall && mine.length === 1 && props.getProperty('LH_TRIGGER_MINUTES') === want) return false;
  mine.forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshLeague').timeBased().everyMinutes(Number(want)).create();
  props.setProperty('LH_TRIGGER_MINUTES', want);
  return true;
}

function lhStatus_() {
  return lhJson_(lhProps_().getProperty('LH_STATUS'), null);
}

// ============================== WebApp.gs ==============================

/**
 * League Hub: the website.
 *
 * Deploy once from the Apps Script editor: Deploy → New deployment → gear icon → Web app,
 * Execute as: Me, Who has access: Anyone → Deploy. The "Web app" address is your league's website.
 *
 *   <web app address>                 the website (with the latest data built in, so it shows up right away)
 *   <web app address>?format=json     the data only, for hosting the page somewhere else (docs/hosting.md)
 *
 * Nothing private is ever sent: no ESPN cookies, no passcode, no email addresses, no spreadsheet link.
 */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const json = lhGetFeed();
  if (p.format === 'json') {
    const cb = lhStr_(p.callback);
    if (/^[A-Za-z_$][\w$]{0,60}$/.test(cb)) {
      return ContentService.createTextOutput(cb + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }
  const feed = lhJson_(json) || {};
  const page = HtmlService.createTemplateFromFile('Index');
  page.boot = json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return page.evaluate()
    .setTitle(feed.league && feed.league.name ? feed.league.name : 'League Hub')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Commissioner Tools when the page is hosted somewhere else (the page posts JSON here)
function doPost(e) {
  let out;
  try {
    out = lhCommishHandle_(JSON.parse((e && e.postData && e.postData.contents) || '{}'));
  } catch (err) {
    lhLog_('Commissioner request failed', err);
    out = { ok: false, error: 'Something went wrong. Try again.' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ============================== Commissioner.gs ==============================

/**
 * League Hub: Commissioner Tools (the website's Commissioner page).
 *
 * Turned on by setting a passcode from the spreadsheet (League Hub → Commissioner passcode). Only a salted
 * SHA-256 fingerprint of the passcode is stored. 10 wrong tries lock the tools for 15 minutes.
 * With the passcode the website can: record a payment (adds a row to the Payments tab), update the ESPN cookies
 * (tested with ESPN before they're saved) and start an update right away.
 */

const LH_MAX_FAILS = 10;
const LH_LOCK_SECONDS = 900;

// Called by the website (google.script.run)
function lhCommish(req) {
  try { return JSON.stringify(lhCommishHandle_(req || {})); }
  catch (e) { lhLog_('Commissioner request failed', e); return JSON.stringify({ ok: false, error: 'Something went wrong. Try again.' }); }
}

function lhCommishHandle_(req) {
  const stored = lhProps_().getProperty('LH_PASS');
  if (!stored) {
    return { ok: false, noPass: true, error: 'Commissioner Tools are off. To turn them on, open the spreadsheet and click League Hub → Commissioner passcode.' };
  }
  const cache = lhCache_();
  const fails = Number(cache.get('LH_FAILS')) || 0;
  if (fails >= LH_MAX_FAILS) return { ok: false, locked: true, error: 'Too many wrong passcodes. Try again in 15 minutes.' };
  if (!lhPassOk_(req.pass, stored)) {
    cache.put('LH_FAILS', String(fails + 1), LH_LOCK_SECONDS);
    return { ok: false, badPass: true, error: 'Wrong passcode.' };
  }
  switch (String(req.action || '')) {
    case 'login': return lhCommishOverview_();
    case 'payment': return lhCommishPayment_(req);
    case 'cookies': return lhCommishCookies_(req.swid, req.s2);
    case 'refresh': {
      const st = lhRefresh_(true);
      return Object.assign(lhCommishOverview_(), { message: st.ok ? 'Updated from ESPN.' : 'The update didn\'t work: ' + (st.message || 'unknown problem') });
    }
    default: return { ok: false, error: 'Unknown request.' };
  }
}

// ===================== Passcode =====================

function lhSetPasscode_(pass) {
  const salt = Utilities.getUuid();
  lhProps_().setProperty('LH_PASS', salt + ':' + lhSha256Hex_(salt + ':' + pass));
  lhCache_().remove('LH_FAILS');
}

function lhPassOk_(pass, stored) {
  if (typeof pass !== 'string' || !pass || pass.length > 200) return false;
  const i = stored.indexOf(':');
  if (i < 0) return false;
  const salt = stored.slice(0, i), hash = stored.slice(i + 1);
  return lhSha256Hex_(salt + ':' + pass) === hash;
}

// ===================== Actions =====================

function lhCommishOverview_() {
  const feed = lhJson_(lhGetFeed()) || {};
  const st = lhStatus_() || {};
  const money = feed.money || null;
  const balance = {};
  if (money) money.teams.forEach(r => { balance[r.id] = r; });
  const payments = lhReadPayments_(feed.teams || [], feed.league ? feed.league.season : null);
  return {
    ok: true,
    league: feed.league ? feed.league.name : '',
    moneyOn: !!money,
    duesUpFront: !!(money && money.duesUpFront),
    teams: (feed.teams || []).map(t => ({
      id: t.id, name: t.name, manager: t.manager,
      balance: balance[t.id] ? balance[t.id].balance : null,
      duesLeft: balance[t.id] ? balance[t.id].duesLeft : null,
      settle: balance[t.id] ? balance[t.id].settle : null,
      owed: balance[t.id] ? balance[t.id].owed : null,
      won: balance[t.id] ? balance[t.id].won : null,
      paid: balance[t.id] ? balance[t.id].paid : null
    })).sort((a, b) => a.name.localeCompare(b.name)),
    payments: payments.list.slice(-15).reverse(),
    unmatched: payments.unmatched.length,
    status: { ok: st.ok !== false, at: st.at || null, problem: st.problem || '', message: st.message || '' },
    cookies: !!lhEspnCookies_()
  };
}

function lhCommishPayment_(req) {
  const feed = lhJson_(lhGetFeed()) || {};
  const team = (feed.teams || []).filter(t => String(t.id) === String(req.team))[0];
  if (!team) return { ok: false, error: 'Pick a team.' };
  const amount = Number(req.amount);
  if (!isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) return { ok: false, error: 'Enter an amount like 100 (paid in) or -250 (paid out).' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'The sheet is busy. Try again in a minute.' };
  try {
    lhAddPayment_(team.name, amount, req.note, feed.league ? feed.league.season : '');
  } finally {
    lock.releaseLock();
  }
  lhRefresh_(true);
  return Object.assign(lhCommishOverview_(), {
    message: 'Recorded ' + (amount > 0 ? team.name + ' paid $' + lhRound_(amount, 2) : '$' + lhRound_(-amount, 2) + ' paid to ' + team.name) + '.'
  });
}

// Tests the new cookies with ESPN first; saves them only if ESPN accepts them
function lhCommishCookies_(swidIn, s2In) {
  const res = lhSaveCookies_(swidIn, s2In);
  if (!res.ok) return res;
  lhRefresh_(true);
  return Object.assign(lhCommishOverview_(), { message: res.message });
}

function lhSaveCookies_(swidIn, s2In) {
  let swid = lhStr_(swidIn), s2 = lhStr_(s2In);
  if (!swid || !s2) return { ok: false, error: 'Paste both SWID and espn_s2.' };
  if (swid.length > 100 || s2.length > 2000 || /\s/.test(swid + s2)) return { ok: false, error: 'Those don\'t look like ESPN cookies.' };
  s2 = s2.replace(/^espn_s2=/i, '');
  swid = swid.replace(/^SWID=/i, '');
  if (swid.charAt(0) !== '{') swid = '{' + swid;
  if (swid.charAt(swid.length - 1) !== '}') swid = swid + '}';
  const settings = lhSettings_();
  if (!settings.leagueId) return { ok: false, error: 'Add the ESPN league ID on the Settings tab first.' };
  const test = lhEspnTest_(settings.leagueId, { s2: s2, swid: swid });
  if (!test.ok && test.problem === 'auth') return { ok: false, error: 'ESPN didn\'t accept these cookies, so nothing was saved. Copy them again while logged in to ESPN, then retry.' };
  if (!test.ok && test.problem !== 'notFound') return { ok: false, error: 'Couldn\'t reach ESPN to test the cookies, so nothing was saved. Try again in a few minutes.' };
  lhProps_().setProperties({ LH_ESPN_S2: s2, LH_ESPN_SWID: swid }, false);
  lhCache_().remove('LH_SEASON_' + settings.leagueId);
  return { ok: true, message: test.ok ? 'Saved. ESPN accepted the cookies. ' + test.message : 'Saved the cookies.' };
}

// ============================== Setup.gs ==============================

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
