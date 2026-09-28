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
