// câmera do próprio jogo (visão RTS), só deslizando devagar
window.__shotsInit = (cfg) => {
  const rt = window.__runtime;
  const a = cfg.army, h = cfg.hq;
  const cx = (a.x + h.x) / 2, cz = (a.z + h.z) / 2;
  window.__camFor = (t) => ({ pos: { x: cx - 4 + t * 0.35, y: 34 - t * 0.3, z: cz + 30 - t * 0.2 }, look: { x: cx + t * 0.35, y: 0, z: cz + 2 } });
};
