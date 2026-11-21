// Gera out_cover.pdf e out_body.pdf de um idioma: node pdf.cjs [pt|en|es] (padrão pt; en/es usam guia.<l>.html e cover.<l>.html)
const { chromium } = require('playwright');
const path = require('path');
const lang = process.argv[2] ?? 'pt';
const sfx = lang === 'pt' ? '' : `.${lang}`;
const FOOT = { pt: 'GUIA DO COMANDANTE', en: "COMMANDER'S GUIDE", es: 'GUÍA DEL COMANDANTE' };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const foot = `<div style="width:100%;font-family:Inter,sans-serif;font-size:7.5pt;color:#8a93a3;padding:0 17mm;display:flex;justify-content:space-between"><span>${FOOT[lang]} · 3D Modern Geopolitical RTS</span><span><span class="pageNumber"></span></span></div>`;
  await p.goto('file://' + path.resolve(`cover${sfx}.html`), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: `out_cover${sfx}.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await p.goto('file://' + path.resolve(`guia${sfx}.html`), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: `out_body${sfx}.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: foot });
  await b.close();
})();
