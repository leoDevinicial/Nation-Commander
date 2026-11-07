// R4 — dissuasão: um míssil comum contra a capital inimiga é derrubado pelo Domo de Ferro; depois a ogiva nuclear.
const { placeNear } = require('./lib.cjs');
const PORT = Number(process.env.REC_PORT || 8790);
const state = async () => (await fetch(`http://localhost:${PORT}/state`)).json();
const T_CONV = Number(process.env.T_CONV || 0.5);
const T_NUKE = Number(process.env.T_NUKE || 9);
module.exports = {
  duration: Number(process.env.DUR || 22),
  tod: 1250,
  // câmera lenta (0,5×) em volta da interceptação
  rate: (t) => (module.exports.slow && t >= module.exports.slow[0] && t < module.exports.slow[1] ? 10 : 20),
  clientRate: (t) => (module.exports.slow && t >= module.exports.slow[0] && t < module.exports.slow[1] ? 0.5 : 1),
  slow: process.env.SLOW ? process.env.SLOW.split('-').map(Number) : null,
  async setup(ctx) {
    for (let k = 0; k < 3; k++) { await ctx.send({ type: 'advance_era' }); await ctx.pump(12); }
    const s = await ctx.info();
    const hq = s.buildings.find((x) => x[1] === 0 && x[2] === 'hq');
    // base inimiga avançada ao alcance dos silos (mesmo lugar do vídeo de combate, semente 7), com o Domo de Ferro
    const plan = { base: [['hq', 43, 19], ['barracks', 38, 18], ['factory', 48, 18], ['warehouse', 38, 22], ['house', 48, 22], ['house', 50, 22], ['house', 52, 20], ['iron_dome', 41, 24]] };
    const r = await (await fetch(`http://localhost:${PORT}/setup?plan=${encodeURIComponent(JSON.stringify(plan))}`)).json();
    ctx.log('setup', JSON.stringify(r));
    await ctx.pump(4);
    const s1 = await ctx.info();
    const hqId = r.made.find((m) => m[0] === 'hq')[1];
    const ehq = s1.buildings.find((x) => x[0] === hqId);
    // dois silos meus, voltados para o inimigo
    const silos = [];
    for (const off of [[7, -2], [3, -6]]) silos.push(await placeNear(ctx, 'missile_silo', hq[7] + off[0], hq[8] + off[1], { maxTries: 120 }));
    await ctx.pump(10);
    await ctx.send({ type: 'build_missile', buildingId: silos[0][0], nuclear: false });
    await ctx.send({ type: 'build_missile', buildingId: silos[1][0], nuclear: true });
    await ctx.pump(40);
    // alvo do míssil comum: perto da capital inimiga (área protegida pelo domo); o nuclear vai no QG
    await ctx.send({ type: 'missile_prepare', buildingId: silos[0][0], x: ehq[3] - 3, y: ehq[4] - 3, nuclear: false });
    await ctx.send({ type: 'missile_prepare', buildingId: silos[1][0], x: ehq[3], y: ehq[4], nuclear: true });
    for (let i = 0; i < 60; i++) {
      await ctx.pump(20);
      const st = await state();
      const armed = (st.launches ?? []).filter((l) => l.state === 'armed');
      if (armed.length >= 2) break;
    }
    const st = await state();
    ctx.log('launches', JSON.stringify(st.launches));
    const ls = (st.launches ?? []).filter((l) => l.state === 'armed');
    ctx.state.conv = ls[0]?.id; ctx.state.nuke = ls[1]?.id;
    const s2 = await ctx.info();
    ctx.state.silos = silos.map((b) => ({ x: b[3], z: b[4] }));
    ctx.state.ehq = { x: ehq[3], z: ehq[4] };
    const d = s2.buildings.find((x) => x[1] === 1 && x[2] === 'iron_dome');
    ctx.state.dome = d ? { x: d[3], z: d[4] } : { x: ehq[3], z: ehq[4] };
    ctx.log('state', JSON.stringify(ctx.state));
  },
  events: [
    { at: T_CONV, fn: (ctx) => ctx.send({ type: 'missile_authorize', launchId: ctx.state.conv }) },
    { at: T_NUKE, fn: (ctx) => ctx.send({ type: 'missile_authorize', launchId: ctx.state.nuke }) },
    // registro dos eventos para ajustar os planos
    ...Array.from({ length: 40 }, (_, i) => ({ at: i * 0.5, fn: async (ctx, t) => { const st = await state(); ctx.log('t', t.toFixed(1), JSON.stringify((st.launches ?? []).map((l) => l.state))); } })),
  ],
};
