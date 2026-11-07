// R1 — a nação nasce: amanhecer, time-lapse da IA erguendo a cidade, cidade viva.
module.exports = {
  duration: 14,
  tod: 860,
  // ticks de simulação por segundo de vídeo
  rate: (t) => (t < 4 ? 20 : t < 10 ? 5500 : 20),
  clientRate: (t) => (t < 4 ? 1 : t < 10 ? 2 : 1),
  async setup(ctx) {
    await ctx.send({ type: 'sandbox_toggle', key: 'aiActive', value: true });
    await ctx.pump(Number(process.env.START_TICKS || 1200));
    const s = await ctx.info();
    const hq = s.buildings.find((x) => x[1] === 1 && x[2] === 'hq');
    ctx.state.hq = { x: hq[3], z: hq[4] };
    ctx.state.center = { x: s.map.w, z: s.map.h }; // mapa 96 células × 2 = centro em (96, 96)
    ctx.log('hq', JSON.stringify(ctx.state));
  },
};
