// Uso: com o Vite no ar (npx vite --port 5191), node scripts/sfx/calibrar.cjs — imprime o ganho que deixa cada gravação
// nova (lote 33) com a mesma energia do sintetizado que ela substitui.
const { chromium } = require('playwright');
const URL = (process.env.VITE_URL || 'http://localhost:5191/') + 'scripts/sfx/calibrar.html';
const cases = [
  { name: 'flak', call: "a.playAt('flak', 0, 0)", dur: 3 },
  { name: 'agm_launch', call: "a.playAt('agm_launch', 0, 0)", dur: 3.5 },
  { name: 'drone_pass', call: "a.playAt('drone_pass', 0, 0)", dur: 5 },
  { name: 'thunder', call: 'a.thunder(0, 0.8)', dur: 7 },
  { name: 'silo_prepare', call: "a.missileCue('prepare', 1)", dur: 4.5 },
  { name: 'silo_authorize', call: "a.missileCue('authorize', 1)", dur: 3 },
  ...['click', 'confirm', 'error', 'alert', 'success', 'herald', 'hold', 'warning'].map((u) => ({ name: 'ui_' + u, call: `a.ui('${u}')`, dur: 2.5 })),
  { name: 'drone_fpv', call: 'a.setDroneFpv(true, 7)', dur: 6 },
  { name: 'rain', call: 'a.setWeather(1, 0)', dur: 9 },
  { name: 'snow_wind', call: 'a.setWeather(0, 1)', dur: 9 },
  ...['saw', 'quarry', 'mine', 'factory', 'pump', 'farm', 'jet_idle', 'port', 'office', 'hum'].map((k) => ({ name: 'prod_' + k, call: `a.setProduction('${k}')`, dur: 6 })),
];
// ONLY=rain,prod_saw limita os casos
const only = process.env.ONLY?.split(',');
if (only) cases.splice(0, cases.length, ...cases.filter((c) => only.includes(c.name)));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto(URL);
  await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const r = await p.evaluate((c) => window.calibrate(c), cases);
  for (const x of r) console.log(x.name.padEnd(16), 'sintetizado', x.synth.energy.toExponential(2), 'gravado', x.rec.energy.toExponential(2), 'pico', x.rec.peak.toFixed(2), '→ ganho', x.gain === null ? '—' : x.gain.toFixed(2));
  await b.close();
})();
