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
