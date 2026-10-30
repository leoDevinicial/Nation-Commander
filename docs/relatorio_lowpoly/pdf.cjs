// Gera o relatório low poly: junta _head.html + _corpo.html em relatorio.html e imprime capa e corpo em PDF.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  fs.writeFileSync('relatorio.html', fs.readFileSync('_head.html', 'utf8') + fs.readFileSync('_corpo.html', 'utf8'));
  const b = await chromium.launch();
  const p = await b.newPage();
  const foot = '<div style="width:100%;font-family:Inter,sans-serif;font-size:7.5pt;color:#8a93a3;padding:0 17mm;display:flex;justify-content:space-between"><span>LOW POLY: A NOSSA IDENTIDADE · Nation Commander</span><span><span class="pageNumber"></span></span></div>';
  await p.goto('file://' + path.resolve('capa.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: 'out_capa.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
  await p.goto('file://' + path.resolve('relatorio.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: 'out_corpo.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: foot });
  await b.close();
})();
