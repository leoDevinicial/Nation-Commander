const { chromium } = require('playwright');
const fs = require('fs');
async function openGame({ w = 1280, h = 720 } = {}) {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.addInitScript({ path: __dirname + '/fakeclock.js' });
  await p.addInitScript((q) => {
    try {
      localStorage.setItem('nc.settings.v1', JSON.stringify({ quality: q, shadows: true, adaptiveQuality: false, fpsTarget: 'auto', panSpeed: 1, edgeScroll: false, showFps: false, reducedMotion: false, autoFullscreen: false, lockLandscape: false, muted: false }));
    } catch {}
  }, process.env.QUALITY || 'ultra');
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:5180/');
  await p.waitForTimeout(1500);
  await p.mouse.click(w / 2, h / 2);
  await p.waitForSelector('#guest', { timeout: 90000 });
  await p.fill('#guest', 'Comandante');
  await p.getByRole('button', { name: /Jogar/ }).first().click();
  await p.waitForTimeout(2000);
  const skip = p.getByRole('button', { name: /Pular por agora/ });
  if (await skip.count()) { await skip.click(); await p.waitForTimeout(400); await p.getByRole('button', { name: /Pular mesmo assim/ }).click(); }
  await p.getByText('Modo Sandbox').first().click();
  await p.getByRole('button', { name: /Iniciar Operação/ }).click();
  await p.waitForFunction(() => window.__runtime && window.__runtime.snapshot, null, { timeout: 180000 });
  return { b, p };
}
async function step(n) {
  const r = await fetch('http://localhost:8790/step?n=' + n);
  return (await r.json()).tick;
}
module.exports = { openGame, step, fs };
