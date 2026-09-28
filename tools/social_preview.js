// Makes docs/images/social-preview.png (1280×640), the picture shown when someone shares a link to this repo.
// Upload it on GitHub: Settings → General → Social preview → Edit → Upload an image.
//   npm install && npm run social-preview     (FONT=/path/to/archivo.woff2 to use a local copy of the font)
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const IMG = path.join(ROOT, 'docs', 'images');
const dataUrl = f => 'data:image/png;base64,' + fs.readFileSync(path.join(IMG, f)).toString('base64');
const logo = fs.readFileSync(path.join(IMG, 'logo.svg'), 'utf8').replace(/width="64" height="64"/, 'width="104" height="104"');

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet">
<style>
html,body{margin:0;width:1280px;height:640px;overflow:hidden}
body{position:relative;color:#eef2f5;font-family:Archivo,Arial,sans-serif;
  background:radial-gradient(760px 520px at 88% 18%,rgba(59,142,234,.34),transparent 62%),linear-gradient(135deg,#0d131a 0%,#16202b 58%,#0f1720 100%)}
.left{position:absolute;left:84px;top:104px;width:620px}
.brand{display:flex;align-items:center;gap:26px}
.brand svg{display:block;flex:none;filter:drop-shadow(0 12px 32px rgba(0,0,0,.35))}
h1{font-weight:900;font-stretch:75%;font-size:104px;line-height:1;margin:0;letter-spacing:-.01em;white-space:nowrap}
p{font-size:31px;line-height:1.28;color:#c3cfdb;margin:38px 0 0;font-weight:500}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:32px}
.chip{font-size:21px;font-weight:700;padding:7px 16px;border-radius:999px;background:rgba(59,142,234,.15);color:#a3cbf6;border:1px solid rgba(59,142,234,.42)}
.foot{position:absolute;left:84px;bottom:50px;font-size:21px;color:#8a99a8;font-weight:600;letter-spacing:.01em}
.phone{position:absolute;width:258px;border-radius:32px;overflow:hidden;border:7px solid #2b3844;box-shadow:0 26px 60px rgba(0,0,0,.55);background:#161c23}
.phone img{display:block;width:100%}
.p1{left:742px;top:92px}.p2{left:1004px;top:44px}
</style></head><body>
<div class="left"><div class="brand">${logo}<h1>League Hub</h1></div>
<p>A website for your ESPN fantasy football league, run from a Google Sheet.</p>
<div class="chips"><span class="chip">Live scores</span><span class="chip">Standings</span><span class="chip">Playoffs</span><span class="chip">Dues and prizes</span><span class="chip">League history</span></div></div>
<div class="foot">Free · No server · No code</div>
<div class="phone p1"><img src="${dataUrl('phone-week.png')}"></div>
<div class="phone p2"><img src="${dataUrl('phone-matchup.png')}"></div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  if (process.env.FONT) {
    const css = "@font-face{font-family:'Archivo';font-weight:100 900;font-stretch:62% 125%;src:url(https://fonts.gstatic.com/archivo.woff2) format('woff2');}";
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: css }));
    await ctx.route('https://fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(process.env.FONT) }));
  }
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(IMG, 'social-preview.png');
  await page.screenshot({ path: out });
  await browser.close();
  console.log('  docs/images/social-preview.png  (' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
})();
