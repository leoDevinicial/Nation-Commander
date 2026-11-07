// R2 — interface real (em inglês) numa partida normal contra a IA: obras do jogador, seleção por caixa e ordem às
// tropas, menu de construção, árvore de pesquisa e globo.
const { placeNear } = require('./lib.cjs');
module.exports = {
  ui: true,
  mode: 'ai',
  duration: Number(process.env.DUR || 12),
  tod: 1240,
  async setup(ctx) {
    const { p } = ctx;
    await p.evaluate(async () => { const { useLangStore } = await import('/src/i18n/index.ts'); useLangStore.getState().setLang('en'); });
    const s = await ctx.info();
    const hq = s.buildings.find((x) => x[1] === 0 && x[2] === 'hq');
    // primeiras obras de verdade (custam e levam tempo, com construtores)
    for (const [t, dx, dy] of [['house', -4, 4], ['house', -1, 5], ['farm', -8, 6], ['sawmill', 6, -6], ['house', 3, 5]]) await placeNear(ctx, t, hq[7] + dx, hq[8] + dy, { maxTries: 40 });
    await ctx.pump(20 * 150);
    ctx.state.hq = { x: hq[3], z: hq[4] };
    const mine = (await ctx.info()).units.filter((u) => u[1] === 0 && u[2] !== 'citizen');
    ctx.log('tropas', JSON.stringify(mine.map((u) => u[2])));
    const a = mine.length ? mine.reduce((m, u) => ({ x: m.x + u[3] / mine.length, z: m.z + u[4] / mine.length }), { x: 0, z: 0 }) : { x: hq[3] + 6, z: hq[4] + 6 };
    ctx.state.army = a;
    // avisos antigos (obras recusadas) fora da tela
    await p.evaluate(async () => { const { useAppStore } = await import('/src/state/useAppStore.ts'); for (const t of useAppStore.getState().toasts) useAppStore.getState().dismissToast(t.id); });
  },
};
// caixa de seleção sobre as tropas (coordenadas de tela calculadas no quadro), ordem de movimento, painéis
const box = async (ctx) => ctx.p.evaluate(() => {
  const rt = window.__runtime; const v = new (rt.camera.position.constructor)();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const t of rt.units.values()) {
    if (t.snap.owner !== 0 || t.snap.type === 'citizen') continue;
    v.set(t.visual.renderPos.x, 0.5, t.visual.renderPos.y).project(rt.camera);
    const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x0 < 1e9 ? [x0 - 40, y0 - 40, x1 + 40, y1 + 30] : [innerWidth * 0.4, innerHeight * 0.35, innerWidth * 0.6, innerHeight * 0.55];
});
const DRAG = [1.0, 2.2];
const store = (code) => (ctx) => ctx.p.evaluate(code);
module.exports.events = [
  { at: DRAG[0], fn: async (ctx) => { ctx.state.box = await box(ctx); const [x0, y0] = ctx.state.box; await ctx.p.mouse.move(x0, y0); await ctx.p.mouse.down(); } },
  ...Array.from({ length: 10 }, (_, i) => ({ at: DRAG[0] + ((i + 1) * (DRAG[1] - DRAG[0])) / 11, fn: async (ctx) => { const [x0, y0, x1, y1] = ctx.state.box; const k = (i + 1) / 10; await ctx.p.mouse.move(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); } })),
  { at: DRAG[1], fn: async (ctx) => { await ctx.p.mouse.up(); } },
  { at: 2.7, fn: async (ctx) => { const [, y0, x1] = ctx.state.box; await ctx.p.mouse.click(Math.min(x1 + 220, 1700), Math.max(140, y0 - 40), { button: 'right' }); } },
  { at: 3.6, fn: async (ctx) => { await ctx.p.keyboard.press('b'); } },
  { at: 6.2, fn: async (ctx) => { await ctx.p.keyboard.press('Escape'); await store(async () => { const { useNationalStore } = await import('/src/state/useNationalStore.ts'); useNationalStore.getState().openPanelAt('research'); })(ctx); } },
  { at: 9.0, fn: store(async () => { const { useNationalStore } = await import('/src/state/useNationalStore.ts'); useNationalStore.getState().openGlobe(); }) },
];
