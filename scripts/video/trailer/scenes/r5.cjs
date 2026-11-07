// R5 — guerra em terra e no ar: reaproveita a montagem do vídeo de combate (../../setup.cjs, mapa da semente 7).
const { setupScene } = require('../../setup.cjs');
module.exports = {
  duration: Number(process.env.DUR || 22),
  tod: 1240,
  async setup(ctx) {
    const sc = await setupScene(ctx.p, ctx.log);
    const s0 = await sc.snap();
    const mine = s0.units.filter((u) => u.owner === 0);
    ctx.state.groundIds = mine.filter((u) => !/artillery/.test(u.type)).map((u) => u.id);
    ctx.state.artIds = mine.filter((u) => /artillery/.test(u.type)).map((u) => u.id);
    ctx.state.ab = sc.ab.id;
    ctx.state.enemyHqId = sc.enemyHq.id;
    ctx.state.mySlot = 0; ctx.state.enemySlot = 1;
    ctx.state.hq = { x: (sc.enemyHq.cx + 1.5) * 2, z: (sc.enemyHq.cy + 1.5) * 2 };
    ctx.state.factory = { x: (sc.enemyFactory.cx + 1) * 2, z: (sc.enemyFactory.cy + 1) * 2 };
  },
  events: [
    { at: 0.5, fn: async (ctx) => { await ctx.send({ type: 'attack_move', unitIds: ctx.state.groundIds, x: 88, y: 32 }); await ctx.send({ type: 'attack_move', unitIds: ctx.state.artIds, x: 70, y: 14 }); } },
    { at: 1, fn: () => fetch(`http://localhost:${process.env.REC_PORT || 8790}/enemy?cmd=` + encodeURIComponent(JSON.stringify({ x: 70, y: 18, near: [88, 32, 14] }))) },
    { at: 6, fn: async (ctx) => { const s = await ctx.p.evaluate(() => window.__runtime.snapshot); const ids = s.air.aircraft.filter((a) => a.type === 'bomber').map((a) => a.id); await ctx.send({ type: 'air_mission', buildingId: ctx.state.ab, aircraftIds: ids, mission: 'strike', targetId: ctx.state.enemyHqId }); } },
  ],
};
