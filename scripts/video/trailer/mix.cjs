const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [events, dur, out] = [JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), Number(process.argv[3]), process.argv[4]];
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('console', (m) => /ERR/.test(m.text()) && console.log(m.text()));
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto((process.env.VITE_URL || 'http://localhost:5181/') + 'scripts/video/trailer/audio.html');
  await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const r = await p.evaluate(([e, d]) => window.renderMix(e, d), [events, dur]);
  fs.writeFileSync(out, Buffer.from(r.wav, 'base64'));
  console.log('peak', r.peak.toFixed(3), 'events', events.length);
  await b.close();
})();
