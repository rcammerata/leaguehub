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
