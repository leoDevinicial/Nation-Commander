const { step } = require('../common.cjs');
const setupUrl = (plan) => 'http://localhost:8790/setup?plan=' + encodeURIComponent(JSON.stringify(plan));
/** Cena do vídeo do drone: Era Digital+, base aérea com 4 drones, base inimiga com tropas paradas. */
async function setupDroneScene(p, log = console.log) {
  const send = (cmd) => p.evaluate((c) => window.__runtime.send(c), cmd);
  const pump = async (ticks) => { for (let i = 0; i < ticks; i += 20) await step(Math.min(20, ticks - i)); await p.waitForTimeout(150); };
  const snap = () => p.evaluate(() => window.__runtime.snapshot);
  await send({ type: 'sandbox_toggle', key: 'reveal', value: true });
  for (let k = 0; k < 4; k++) { await send({ type: 'advance_era' }); await pump(20); }
  const base = [['hq', 43, 19], ['barracks', 38, 18], ['factory', 48, 18], ['warehouse', 38, 22], ['house', 48, 22], ['house', 50, 22], ['tower', 46, 23]];
  const r = await (await fetch(setupUrl({ base }))).json();
  log('setup', JSON.stringify(r));
  await pump(4);
  const cands = [];
  for (let cy = 6; cy <= 30; cy += 2) for (let cx = 6; cx <= 30; cx += 2) cands.push([cx, cy]);
  let ab = null;
  for (let i = 0; i < cands.length && !ab; i += 12) {
    for (const [cx, cy] of cands.slice(i, i + 12)) await send({ type: 'build', buildingType: 'airbase', cx, cy });
    await pump(2);
    ab = (await snap()).buildings.find((b) => b.type === 'airbase' && b.owner === 0);
  }
  await pump(60);
  for (let k = 0; k < 4; k++) await send({ type: 'build_aircraft', buildingId: ab.id, aircraftType: 'drone' });
  await pump(600);
  // defensores inimigos parados na frente da base (alvos à vista no FPV)
  for (const [t, x, y, n] of [['tank', 84, 34, 4], ['infantry', 78, 33, 8], ['apc', 92, 34, 3], ['tank', 100, 36, 3]])
    await send({ type: 'sandbox_spawn', unitType: t, x, y, count: n, enemy: true, maxed: false });
  await pump(4);
  const s = await snap();
  const id = (t) => r.made.find((m) => m[0] === t)[1];
  const b = (t) => s.buildings.find((x) => x.id === id(t));
  log('drones', JSON.stringify(s.air.aircraft.map((a) => [a.type, a.state])), 'airbase', ab.cx, ab.cy);
  return { send, snap, ab, factory: b('factory'), hq: b('hq'), barracks: b('barracks'), tower: b('tower'), warehouse: b('warehouse') };
}
module.exports = { setupDroneScene };
