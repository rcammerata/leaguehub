// A picture of the Settings tab for the guides: the real tab (built by the Apps Script code with the sample
// league's settings) drawn to look like Google Sheets. Used by tools/screenshots.js.
'use strict';
const { sampleWorld } = require('../tests/sample_feeds');

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function settingsTabHtml() {
  const w = sampleWorld('week5');
  const rows = w.__.sheets.Settings._data.rows;
  const withOptions = {};
  w.__.get('LH_SETTINGS').forEach(s => { if (s.key && s.options) withOptions[s.key] = true; });
  const arrow = '<span class="dd">▾</span>';
  const body = rows.map((r, i) => {
    const key = String(r[3] || '');
    const n = '<th class="rn">' + (i + 1) + '</th>';
    if (key === '#title') return '<tr class="title">' + n + '<td class="a">' + esc(r[0]) + '</td><td></td><td></td></tr>';
    if (key === '#note') return '<tr class="note">' + n + '<td colspan="3">' + esc(r[0]) + '</td></tr>';
    if (key === '#section') return '<tr class="section">' + n + '<td>' + esc(r[0]) + '</td><td></td><td></td></tr>';
    if (key === '#prize-head') return '<tr class="phead">' + n + '<td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>';
    if (key === '#prize') return '<tr class="prize">' + n + '<td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td class="v">' + esc(r[2]) + arrow + '</td></tr>';
    if (!key || key.charAt(0) === '#') return '<tr>' + n + '<td></td><td></td><td></td></tr>';
    return '<tr class="setting">' + n + '<td class="a">' + esc(r[0]) + '</td><td class="b v">' + esc(r[1]).replace(/\n/g, '<br>') + (withOptions[key] ? arrow : '') +
      '</td><td class="c">' + esc(r[2]) + '</td></tr>';
  }).join('');
  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0;background:#f9fbfd;font:13px Arial,Helvetica,sans-serif;color:#1f1f1f;width:1110px}' +
    '.top{padding:10px 16px 0}.doc{font-size:18px;margin-bottom:6px}' +
    '.menus{display:flex;gap:16px;font-size:14px;padding-bottom:8px}.menus b{background:#d3e3fd;border-radius:4px;padding:1px 7px;font-weight:600}' +
    '.grid{border-top:1px solid #dadce0;background:#fff}' +
    'table{border-collapse:collapse;table-layout:fixed}' +
    'td,th{border:1px solid #e2e3e3;padding:3px 6px;vertical-align:top;line-height:17px}' +
    'th{background:#f8f9fa;color:#5f6368;font-weight:normal;font-size:12px;text-align:center}' +
    'th.rn{width:34px}' +
    'td.v{position:relative;padding-right:18px}.dd{position:absolute;right:5px;top:3px;color:#5f6368;font-size:11px}' +
    'tr.title td.a{font-size:21px;font-weight:bold;line-height:28px}' +
    'tr.note td{color:#5f6b76;font-style:italic}' +
    'tr.section td{background:#1f2933;color:#fff;font-weight:bold}' +
    'tr.phead td{background:#e8edf2;font-weight:bold}' +
    'tr.prize td{background:#fff8e1}' +
    'tr.setting td.a{font-weight:bold}tr.setting td.b{background:#fff8e1}tr.setting td.c{color:#5f6b76}' +
    '.tabs{display:flex;gap:2px;padding:6px 16px;border-top:1px solid #dadce0;background:#f9fbfd;font-size:13px}' +
    '.tabs span{padding:6px 14px;border-radius:0 0 6px 6px;color:#444}.tabs .on{background:#e1e9f7;color:#0b57d0;font-weight:600}' +
    '</style></head><body><div class="top"><div class="doc">League Hub</div><div class="menus"><span>File</span><span>Edit</span><span>View</span>' +
    '<span>Insert</span><span>Format</span><span>Data</span><span>Tools</span><span>Extensions</span><span>Help</span><b>League Hub</b></div></div>' +
    '<div class="grid"><table><colgroup><col style="width:34px"><col style="width:250px"><col style="width:260px"><col style="width:520px"></colgroup>' +
    '<tr><th></th><th>A</th><th>B</th><th>C</th></tr>' + body + '</table></div>' +
    '<div class="tabs"><span class="on">Settings</span><span>Payments</span><span>Sheet1</span></div></body></html>';
}

module.exports = { settingsTabHtml };
