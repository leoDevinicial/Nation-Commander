const { chromium } = require('playwright');
const OUT = '/tmp/claude-0/-home-user-Nation-Commander/491961d5-5348-5425-87b1-25dae741dc2c/scratchpad/shots';
(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844, touch: true }]]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.touch, isMobile: !!vp.touch });
    await ctx.addInitScript(() => localStorage.setItem('nc.settings.v1', JSON.stringify({ quality: 'balanced', reducedMotion: true })));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
    await page.goto('http://localhost:5173');
    await page.fill('#guest', 'Tester');
    await page.click('text=Jogar');
    await page.click('text=Configurações');
    await page.click('button[role=radio]:has-text("Ultra+")');
    await page.waitForTimeout(600);
    console.log(name, 'diálogo:', await page.locator('[role=alertdialog]').count());
    await page.screenshot({ path: `${OUT}/ultraplus-aviso-${name}.png` });
    await page.click('text=Manter preset atual');
    console.log(name, 'após cancelar:', await page.evaluate(() => localStorage.getItem('nc.settings.v1')));
    await page.click('button[role=radio]:has-text("Ultra+")');
    await page.click('text=mesmo assim');
    await page.waitForTimeout(300);
    console.log(name, 'após confirmar:', await page.evaluate(() => localStorage.getItem('nc.settings.v1')));
    await ctx.close();
  }
  await browser.close();
})();
