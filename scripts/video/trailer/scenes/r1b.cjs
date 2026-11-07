// R1b — eras: o mesmo bairro da capital troca de aparência a cada avanço de era (Sandbox: avanço instantâneo).
const { placeNear } = require('./lib.cjs');
const ERA_AT = [1.75, 3.5, 5.25];
module.exports = {
  duration: 7,
  tod: 1290,
  async setup(ctx) {
    const s = await ctx.info();
    const hq = s.buildings.find((x) => x[1] === 0 && x[2] === 'hq');
    const [cx, cy] = [hq[7], hq[8]];
    ctx.state.hq = { x: hq[3], z: hq[4] };
    for (const [t, dx, dy] of [['house', -4, 4], ['house', -2, 5], ['house', 0, 5], ['school', 3, 5], ['factory', 5, -1], ['barracks', -5, -1], ['research_center', -4, -5], ['farm', -8, 6], ['house', 2, 7], ['airbase', 8, 6]]) {
      const b = await placeNear(ctx, t, cx + dx, cy + dy);
      ctx.log('built', t, b && b.slice(3, 5));
    }
    // só os prédios: as tropas iniciais saem do quadro
    await ctx.send({ type: 'sandbox_clear', who: 'mine' });
    await ctx.pump(40);
  },
  events: ERA_AT.map((at) => ({ at, fn: (ctx) => ctx.send({ type: 'advance_era' }) })),
};
