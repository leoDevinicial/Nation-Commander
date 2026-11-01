const { step } = require('./common.cjs');
const setupUrl = (plan) => 'http://localhost:8790/setup?plan=' + encodeURIComponent(JSON.stringify(plan));
async function setupScene(p, log = console.log) {
  await p.evaluate(async () => {
    const { gameClient } = await import('/src/net/client.ts');
    window.__rej = []; window.__ev = [];
    gameClient.on((m) => {
      if (m.t === 'cmd_rejected') window.__rej.push(m.reason);
      if (m.t === 'snapshot' && !m.scope) for (const e of m.s.events) window.__ev.push([m.s.tick, e.type, e.phase ?? e.state ?? '']);
    });
  });
  const send = (cmd) => p.evaluate((c) => window.__runtime.send(c), cmd);
  const pump = async (ticks) => { for (let i = 0; i < ticks; i += 20) await step(Math.min(20, ticks - i)); await p.waitForTimeout(150); };
  const snap = () => p.evaluate(() => window.__runtime.snapshot);
  await send({ type: 'sandbox_toggle', key: 'reveal', value: true });
  for (let k = 0; k < 4; k++) { await send({ type: 'advance_era' }); await pump(20); }
  // base inimiga ao sul do campo aberto
  const base = [['hq', 43, 19], ['barracks', 38, 18], ['factory', 48, 18], ['warehouse', 38, 22], ['house', 48, 22], ['house', 50, 22], ['tower', 46, 23]];
  const r = await (await fetch(setupUrl({ base }))).json();
  log('setup', JSON.stringify(r));
  await pump(4);
  // base aérea: tenta vários lugares de uma vez
  const cands = [];
  for (let cy = 6; cy <= 30; cy += 2) for (let cx = 6; cx <= 30; cx += 2) cands.push([cx, cy]);
  let ab = null;
  for (let i = 0; i < cands.length && !ab; i += 12) {
    for (const [cx, cy] of cands.slice(i, i + 12)) await send({ type: 'build', buildingType: 'airbase', cx, cy });
    await pump(2);
    ab = (await snap()).buildings.find((b) => b.type === 'airbase' && b.owner === 0);
  }
  let silo = null;
  for (let i = 0; i < cands.length && !silo; i += 12) {
    for (const [cx, cy] of cands.slice(i, i + 12)) { await send({ type: 'build', buildingType: 'missile_silo', cx: cx + 1, cy: cy + 1 }); }
    await pump(2);
    silo = (await snap()).buildings.find((b) => b.type === 'missile_silo' && b.owner === 0);
  }
  await pump(60);
  await send({ type: 'sandbox_level', buildingId: ab.id, level: 3 });
  await pump(4);
  for (let k = 0; k < 3; k++) await send({ type: 'build_aircraft', buildingId: ab.id, aircraftType: 'bomber' });
  await send({ type: 'build_aircraft', buildingId: ab.id, aircraftType: 'drone' });
  await send({ type: 'build_missile', buildingId: silo.id, nuclear: true });
  await pump(2000);
  const s = await snap();
  log('air', JSON.stringify(s.air.aircraft.map((a) => [a.type, a.state])), 'silo', JSON.stringify(s.buildings.filter((b) => b.type === 'missile_silo').map((b) => [b.id, b.missiles ?? b.stored])));
  // exércitos
  const spawn = (unitType, x, y, count, enemy) => send({ type: 'sandbox_spawn', unitType, x, y, count, enemy, maxed: false });
  // os meus entram pelo noroeste; o inimigo defende na frente da base (mais numeroso e veterano)
  for (const [t, x, y, n] of [['mbt', 58, 8, 4], ['mbt', 66, 6, 4], ['tank', 52, 12, 3], ['tank', 70, 10, 3], ['apc', 62, 12, 4]]) await spawn(t, x, y, n, false);
  await spawn('rocket_artillery', 48, 6, 2, false); await spawn('rocket_artillery', 54, 4, 2, false); await spawn('artillery', 44, 10, 3, false);
  for (const [t, x, y, n] of [['tank', 80, 30, 5], ['tank', 98, 30, 5], ['at_infantry', 88, 31, 8], ['infantry', 74, 33, 8], ['infantry', 104, 33, 8], ['mbt', 88, 35, 4], ['apc', 94, 36, 3]]) await send({ type: 'sandbox_spawn', unitType: t, x, y, count: n, enemy: true, maxed: true });
  await pump(2);
  const s2 = await snap();
  const madeId = (t) => r.made.find((m) => m[0] === t)[1];
  log('enemyB', JSON.stringify(s2.buildings.filter((b) => b.owner === 1).map((b) => [b.type, b.id])), JSON.stringify(r.made));
  const enemyHq = s2.buildings.find((b) => b.id === madeId('hq'));
  const enemyFactory = s2.buildings.find((b) => b.id === madeId('factory'));
  const enemyBarracks = s2.buildings.find((b) => b.id === madeId('barracks'));
  log('units', s2.units.filter((u) => u.owner === 0).length, 'vs', s2.units.filter((u) => u.owner === 1).length, 'rej', JSON.stringify([...new Set(await p.evaluate(() => window.__rej))].slice(-8)));
  return { send, snap, ab, silo, enemyHq, enemyFactory, enemyBarracks };
}
module.exports = { setupScene };
