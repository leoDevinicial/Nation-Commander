// Fotografa as páginas da HUD compacta e mede quanto da tela a interface cobre (pontos que não caem no mapa)
const { chromium, devices } = require('playwright');
const path = require('path');
const [page, out, device] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext(device === 'cel' ? { ...devices['Pixel 7 landscape'] } : { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto('file://' + path.resolve(page));
  await p.waitForTimeout(700);
  const cover = await p.evaluate(() => {
    let hit = 0;
    for (let y = 0; y < 30; y++) for (let x = 0; x < 50; x++) {
      const el = document.elementFromPoint((x + 0.5) * innerWidth / 50, (y + 0.5) * innerHeight / 30);
      if (el && el.id !== 'bg' && !el.classList.contains('scrim')) hit++;
    }
    return Math.round((hit / 1500) * 100);
  });
  await p.screenshot({ path: out });
  console.log(path.basename(page), 'cobertura', cover + '%');
  await b.close();
})();
