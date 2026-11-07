// Gera as cartelas: PNGs transparentes (frases, eras, contagem) e a sequência do logo final (24 qps).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT || '/home/user/trailer_work/cards';
const URL = (process.env.VITE_URL || 'http://localhost:5181/') + 'scripts/video/trailer/cards.html';
(async () => {
  fs.mkdirSync(OUT + '/end', { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto(URL);
  await p.evaluate(() => window.ready);
  const png = async (name, mode, o) => { await p.evaluate(([m, o]) => window.show(m, o), [mode, o]); await p.screenshot({ path: `${OUT}/${name}.png`, omitBackground: true }); };
  await png('tag_build', 'tag', { kick: 'Nations Commander', text: 'Build your nation.' });
  await png('tag_tech', 'tag', { kick: 'Nations Commander', text: 'Advance your technology.' });
  await png('tag_world', 'tag', { kick: 'Nations Commander', text: 'Command the world.' });
  const eras = [['ERA I', 'Cold War', ''], ['ERA II', 'Post-Cold War', ''], ['ERA III', 'Digital Age', ''], ['ERA IV', 'Near Future', '']];
  for (let i = 0; i < eras.length; i++) await png(`era${i + 1}`, 'era', { kick: eras[i][0], text: eras[i][1], years: eras[i][2] });
  for (let n = 10; n >= 0; n--) await png(`tm${n}`, 'tm', { text: n > 0 ? `T-${String(n).padStart(2, '0')}` : 'LIFTOFF' });
  const DUR = Number(process.env.END_DUR || 7);
  for (let f = 0; f < DUR * 24; f++) {
    await p.evaluate(([t, d]) => window.show('end', { t, dur: d }), [f / 24, DUR]);
    await p.screenshot({ path: `${OUT}/end/${String(f).padStart(4, '0')}.png` });
  }
  await b.close();
  console.log('ok');
})();
