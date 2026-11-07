// R3 — Programa Espacial: contagem de 10 s, ignição, decolagem (Sandbox: era Futuro Próximo e obra instantânea).
const { placeNear } = require('./lib.cjs');
module.exports = {
  duration: 17,
  tod: 575,
  async setup(ctx) {
    for (let k = 0; k < 3; k++) { await ctx.send({ type: 'advance_era' }); await ctx.pump(12); }
    const s = await ctx.info();
    const hq = s.buildings.find((x) => x[1] === 0 && x[2] === 'hq');
    await ctx.send({ type: 'sandbox_level', buildingId: hq[0], level: 10 });
    await ctx.pump(4);
    const sc = await placeNear(ctx, 'space_center', hq[7] + 9, hq[8] + 2, { maxTries: 200 });
    ctx.log('space_center', JSON.stringify(sc));
    await ctx.pump(60);
    ctx.state.pad = { x: sc[3], z: sc[4], id: sc[0] };
    ctx.state.hq = { x: hq[3], z: hq[4] };
  },
  events: [{ at: 0.02, fn: (ctx) => ctx.send({ type: 'space_launch', buildingId: ctx.state.pad.id }) }],
};
