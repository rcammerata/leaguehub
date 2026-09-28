// Small stand-ins for the Google Apps Script services League Hub uses, so the scripts can run in Node for tests.
// Not a full emulator: only what League Hub calls. Formatting calls on the sheet are accepted and ignored.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');

const SCRIPT_DIR = path.join(__dirname, '..', 'apps-script');
const { SCRIPT_FILES } = require('../build');

function colNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function parseA1(a1, sheet) {
  let m = a1.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+)?)?$/);
  if (!m) throw new Error('A1 not supported in mocks: ' + a1);
  const r1 = +m[2], c1 = colNum(m[1]);
  const c2 = m[3] ? colNum(m[3]) : c1;
  const r2 = m[3] ? (m[4] ? +m[4] : Math.max(sheet.rows.length, r1)) : r1;
  return { r1, c1, r2, c2 };
}

// Utilities.formatDate for the patterns League Hub uses
function formatDate(date, tz, pattern) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hourCycle: 'h23', weekday: 'long' }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const H = Number(parts.hour) % 24, M = Number(parts.month);
  const tok = {
    yyyy: parts.year, MMMM: months[M - 1], MMM: months[M - 1].slice(0, 3), MM: String(M).padStart(2, '0'), M: String(M),
    dd: String(parts.day).padStart(2, '0'), d: String(Number(parts.day)), EEEE: parts.weekday, EEE: parts.weekday.slice(0, 3),
    HH: String(H).padStart(2, '0'), H: String(H), hh: String(H % 12 || 12).padStart(2, '0'), h: String(H % 12 || 12),
    mm: parts.minute, a: H < 12 ? 'AM' : 'PM'
  };
  return pattern.replace(/yyyy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|a/g, t => tok[t]);
}

function makeSheet(name) {
  const sheet = { name, rows: [], validations: {} };
  const ensure = (r, c) => { while (sheet.rows.length < r) sheet.rows.push([]); const row = sheet.rows[r - 1]; while (row.length < c) row.push(''); };
  const range = (r1, c1, r2, c2) => {
    let proxy = null;
    const self = {
      getValues: () => { const out = []; for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) { const v = (sheet.rows[r - 1] || [])[c - 1]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
      getDisplayValues: () => self.getValues().map(r => r.map(v => v instanceof Date ? v.toISOString() : String(v))),
      getValue: () => self.getValues()[0][0],
      setValues: vals => { vals.forEach((row, i) => row.forEach((v, j) => { ensure(r1 + i, c1 + j); sheet.rows[r1 + i - 1][c1 + j - 1] = v; })); return proxy; },
      setValue: v => { ensure(r1, c1); sheet.rows[r1 - 1][c1 - 1] = v; return proxy; },
      setDataValidation: rule => { for (let r = r1; r <= Math.min(r2, r1 + 5); r++) sheet.validations[r + ':' + c1] = rule; return proxy; },
      clearDataValidations: () => proxy,
      getRow: () => r1, getColumn: () => c1
    };
    proxy = new Proxy(self, { get: (t, k) => k in t ? t[k] : () => proxy });   // formatting calls: accepted, ignored
    return proxy;
  };
  const api = {
    getName: () => name,
    getRange: (a, b, c, d) => {
      if (typeof a === 'string') { const x = parseA1(a, sheet); return range(x.r1, x.c1, x.r2, x.c2); }
      return range(a, b, a + (c || 1) - 1, b + (d || 1) - 1);
    },
    getLastRow: () => { for (let r = sheet.rows.length; r >= 1; r--) if ((sheet.rows[r - 1] || []).some(v => v !== '' && v != null)) return r; return 0; },
    getMaxRows: () => Math.max(1000, sheet.rows.length),
    clear: () => { sheet.rows = []; sheet.validations = {}; return api; },
    appendRow: row => { const r = api.getLastRow() + 1; range(r, 1, r, row.length).setValues([row]); return api; },
    _data: sheet
  };
  const sheetProxy = new Proxy(api, { get: (t, k) => k in t ? t[k] : () => sheetProxy });
  return sheetProxy;
}

/**
 * A fresh Apps Script world.
 *   fetch(url, options) → { code, body } or a response-like object
 *   now: frozen clock (ms); props / cache: shared objects to carry state between runs
 *   ui: answers for prompts/alerts, e.g. { prompts: ['12345678'], alerts: ['YES'] }
 */
function makeWorld(opts = {}) {
  const now = opts.now || Date.parse('2026-10-04T19:10:00Z');
  const props = opts.props || {};
  const cache = opts.cache || {};
  const sheets = opts.sheets || {};
  const logs = [], mails = [], fetches = [], uiLog = [], toasts = [];
  const triggers = opts.triggers || [];
  const uiAnswers = Object.assign({ prompts: [], alerts: [] }, opts.ui || {});
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(now); }
    static now() { return now; }
  }
  const spreadsheet = {
    getId: () => 'sheet-id-for-tests',
    getSheetByName: n => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = makeSheet(n); return sheets[n]; },
    getSheets: () => Object.values(sheets),
    setActiveSheet: s => s,
    toast: (msg) => { toasts.push(msg); }
  };
  const button = { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO' };
  const ui = {
    Button: button,
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' },
    prompt: (title, msg) => {
      uiLog.push({ type: 'prompt', title, msg });
      const a = uiAnswers.prompts.shift();
      return { getSelectedButton: () => a == null ? button.CANCEL : button.OK, getResponseText: () => a == null ? '' : String(a) };
    },
    alert: (title, msg) => { uiLog.push({ type: 'alert', title, msg }); const a = uiAnswers.alerts.shift(); return a ? button[a] : button.OK; },
    showModalDialog: (html, title) => { uiLog.push({ type: 'dialog', title, html: html.getContent ? html.getContent() : '' }); },
    createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; }
  };
  const htmlOut = content => {
    const o = { _content: content, _title: '', getContent: () => o._content, setTitle: t => { o._title = t; return o; }, getTitle: () => o._title,
                addMetaTag: () => o, setXFrameOptionsMode: () => o, setWidth: () => o, setHeight: () => o, setFaviconUrl: () => o };
    return o;
  };
  const respond = r => {
    if (r && typeof r.getResponseCode === 'function') return r;
    const code = r ? r.code : 404, body = r ? r.body : '';
    return { getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body) };
  };

  const ctx = {
    console: { log: (...a) => logs.push(a.map(String).join(' ')), error: (...a) => logs.push('ERROR ' + a.map(String).join(' ')) },
    Date: FixedDate, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, isFinite, isNaN, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, Infinity, NaN, Intl, Symbol, Promise,
    SpreadsheetApp: {
      getActive: () => spreadsheet, getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet,
      getUi: () => { if (opts.noUi) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); return ui; },
      newDataValidation: () => { const b = { rule: {}, requireValueInList: (l, s) => { b.rule.list = l; return b; }, setAllowInvalid: v => { b.rule.allowInvalid = v; return b; },
                                             setHelpText: () => b, build: () => b.rule }; return b; }
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => props[k] == null ? null : props[k],
      setProperty: (k, v) => { props[k] = String(v); },
      setProperties: (o) => { Object.keys(o).forEach(k => { props[k] = String(o[k]); }); },
      deleteProperty: k => { delete props[k]; },
      getProperties: () => Object.assign({}, props)
    }) },
    CacheService: { getScriptCache: () => ({
      get: k => cache[k] == null ? null : cache[k],
      put: (k, v) => { cache[k] = String(v); },
      getAll: ks => { const o = {}; ks.forEach(k => { if (cache[k] != null) o[k] = cache[k]; }); return o; },
      putAll: o => { Object.keys(o).forEach(k => { cache[k] = String(o[k]); }); },
      remove: k => { delete cache[k]; },
      removeAll: ks => ks.forEach(k => { delete cache[k]; })
    }) },
    UrlFetchApp: { fetch: (url, o) => { fetches.push({ url, headers: (o && o.headers) || {} }); return respond(opts.fetch ? opts.fetch(url, o || {}) : null); } },
    Utilities: {
      formatDate, DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
      getUuid: () => crypto.randomUUID()
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'America/New_York', getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => { const i = triggers.indexOf(t); if (i > -1) triggers.splice(i, 1); },
      newTrigger: fn => { const t = { fn, minutes: 0, getHandlerFunction: () => fn }; const b = { timeBased: () => b, everyMinutes: m => { t.minutes = m; return b; }, create: () => { triggers.push(t); return t; } }; return b; },
      getService: () => ({ getUrl: () => opts.webAppUrl || '' })
    },
    MailApp: { sendEmail: (to, subject, body) => mails.push({ to, subject, body }) },
    HtmlService: {
      createHtmlOutput: c => htmlOut(c || ''),
      createTemplateFromFile: name => {
        const file = opts.htmlFiles && opts.htmlFiles[name];
        const tpl = {};
        tpl.evaluate = () => htmlOut(String(file || '').replace(/<\?!=\s*(\w+)\s*\?>/g, (m, k) => tpl[k] == null ? '' : tpl[k]));
        return tpl;
      },
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
    },
    ContentService: {
      createTextOutput: t => { const o = { text: t, mime: '', setMimeType: m => { o.mime = m; return o; }, getContent: () => t }; return o; },
      MimeType: { JSON: 'application/json', JAVASCRIPT: 'text/javascript' }
    }
  };
  vm.createContext(ctx);
  const files = opts.files || SCRIPT_FILES;
  vm.runInContext(files.map(f => fs.readFileSync(path.join(SCRIPT_DIR, f), 'utf8')).join('\n'), ctx);
  // get('LH_SETTINGS'): read a top-level const (consts aren't properties of the global object)
  ctx.__ = { props, cache, sheets, logs, mails, fetches, ui: uiLog, toasts, triggers, spreadsheet, get: expr => vm.runInContext(expr, ctx) };
  return ctx;
}

module.exports = { makeWorld, makeSheet, formatDate, SCRIPT_FILES };
