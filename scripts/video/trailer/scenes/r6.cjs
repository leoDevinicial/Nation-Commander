// R6 — marinha no mapa Oceano Central: frota produzida no Porto (porta-aviões, fragatas, submarino) contra a frota
// inimiga; as duas se aproximam antes da gravação e o combate acontece no quadro.
const { placeNear } = require('./lib.cjs');
const PORT = Number(process.env.REC_PORT || 8790);
module.exports = {
  mapType: 'ocean',
  duration: Number(process.env.DUR || 12),
  tod: 1230,
  async setup(ctx) {
    // gravação: energia ligada em tudo (o Porto produz sem rede elétrica montada)
    await fetch(`http://localhost:${PORT}/setup?plan=${encodeURIComponent(JSON.stringify({ base: [] }))}`);
    for (let k = 0; k < 3; k++) { await ctx.send({ type: 'advance_era' }); await ctx.pump(12); }
    const w = await ctx.p.evaluate(() => {
      const rt = window.__runtime; const m = rt.map; const cs = m.cellSize;
      const s = rt.snapshot; const hq = s.buildings.find((b) => b.type === 'hq' && b.owner === 0); const eh = s.buildings.find((b) => b.type === 'hq' && b.owner === 1);
      const a = { x: (hq.cx + 1.5) * cs, z: (hq.cy + 1.5) * cs }, e = { x: (eh.cx + 1.5) * cs, z: (eh.cy + 1.5) * cs };
      const isW = (cx, cy) => m.terrain[cy * m.width + cx] === 4;
      let first = null, last = null;
      for (let k = 0; k <= 200; k++) { const x = a.x + (e.x - a.x) * k / 200, z = a.z + (e.z - a.z) * k / 200; if (isW(Math.floor(x / cs), Math.floor(z / cs))) { if (!first) first = { x, z, k }; last = { x, z, k }; } }
      return { a, e, first, last, cs };
    });
    ctx.log('water', JSON.stringify(w));
    // Porto na última terra antes da água, na linha entre as capitais (criado pelo servidor de gravação)
    const coast = await ctx.p.evaluate((w) => {
      const m = window.__runtime.map; const cs = w.cs;
      const isW = (cx, cy) => m.terrain[cy * m.width + cx] === 4;
      for (let k = w.first.k; k > 0; k--) {
        const x = w.a.x + (w.e.x - w.a.x) * k / 200, z = w.a.z + (w.e.z - w.a.z) * k / 200;
        const cx = Math.floor(x / cs), cy = Math.floor(z / cs);
        if (!isW(cx, cy) && !isW(cx - 1, cy - 1) && !isW(cx - 2, cy - 2)) return [cx - 2, cy - 2];
      }
      return null;
    }, w);
    const r = await (await fetch(`http://localhost:${PORT}/setup?plan=${encodeURIComponent(JSON.stringify({ base: [], mine: [['port', coast[0], coast[1]]] }))}`)).json();
    const port = [r.made.find((m) => m[0] === 'port')[1]];
    ctx.log('port', JSON.stringify(coast), JSON.stringify(r.made));
    await ctx.pump(10);
    for (const t of ['aircraft_carrier', 'frigate', 'frigate', 'frigate', 'submarine']) { await ctx.send({ type: 'produce', buildingId: port[0], unitType: t }); await ctx.pump(30); }
    await ctx.pump(60);
    // frota inimiga perto da costa dela
    for (const [t, ox, oy] of [['frigate', 0, 0], ['frigate', 4, 0], ['frigate', 0, 4], ['submarine', 4, 4]]) await ctx.send({ type: 'sandbox_spawn', unitType: t, x: w.last.x - 6 + ox, y: w.last.z - 6 + oy, count: 1, enemy: true, maxed: true });
    await ctx.pump(4);
    const naval = (s, o) => s.units.filter((u) => u[1] === o && /frigate|carrier|submarine/.test(u[2]));
    let s = await ctx.info();
    ctx.log('frotas', JSON.stringify(naval(s, 0).map((u) => u[2])), JSON.stringify(naval(s, 1).map((u) => u[2])));
    const mid = { x: (w.first.x + w.last.x) / 2, y: (w.first.z + w.last.z) / 2 };
    ctx.state.mine = naval(s, 0).map((u) => u[0]);
    await ctx.send({ type: 'move', unitIds: ctx.state.mine, x: mid.x - 8, y: mid.y - 8 });
    await fetch(`http://localhost:${PORT}/cmd?slot=1&cmd=${encodeURIComponent(JSON.stringify({ type: 'move', unitIds: naval(s, 1).map((u) => u[0]), x: mid.x + 10, y: mid.y + 10 }))}`);
    const cen = (l) => ({ x: l.reduce((a, u) => a + u[3], 0) / l.length, z: l.reduce((a, u) => a + u[4], 0) / l.length });
    for (let i = 0; i < 90; i++) {
      await ctx.pump(20);
      s = await ctx.info();
      const A = cen(naval(s, 0)), B = cen(naval(s, 1));
      if (Math.hypot(A.x - B.x, A.z - B.z) < 19) break;
    }
    const A = cen(naval(s, 0)), B = cen(naval(s, 1));
    ctx.log('distancia', Math.round(Math.hypot(A.x - B.x, A.z - B.z)));
    ctx.state.start = A; ctx.state.foe = B;
    ctx.state.foeIds = naval(s, 1).map((u) => u[0]);
  },
  events: [
    { at: 0.3, fn: (ctx) => ctx.send({ type: 'attack_move', unitIds: ctx.state.mine, x: ctx.state.foe.x, y: ctx.state.foe.z }) },
    { at: 0.4, fn: (ctx) => fetch(`http://localhost:${PORT}/cmd?slot=1&cmd=${encodeURIComponent(JSON.stringify({ type: 'attack_move', unitIds: ctx.state.foeIds, x: ctx.state.start.x, y: ctx.state.start.z }))}`) },
  ],
};
