const { chromium } = require('playwright');
(async () => { const [file, out, w, h, dpr] = process.argv.slice(2); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(dpr || 1) });
  await p.goto('file://' + require('path').resolve(file)); await p.waitForTimeout(600); await p.screenshot({ path: out, fullPage: true }); await b.close(); })();
