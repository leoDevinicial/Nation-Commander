const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const foot = '<div style="width:100%;font-family:Inter,sans-serif;font-size:7.5pt;color:#8a93a3;padding:0 17mm;display:flex;justify-content:space-between"><span>GUIA DO COMANDANTE · 3D Modern Geopolitical RTS</span><span><span class="pageNumber"></span></span></div>';
  await p.goto('file://' + path.resolve('cover.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: 'out_cover.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
  await p.goto('file://' + path.resolve('guia.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: 'out_body.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: foot });
  await b.close();
})();
