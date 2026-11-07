window.__shotsInit = (cfg) => {
  const rt = window.__runtime;
  const V = (x, y, z) => ({ x, y, z });
  const gh = (x, z) => { try { return rt.groundHeight(x, z); } catch { return 0; } };
  const hq = cfg.hq;
  // um único plano: grua lenta ao redor do QG, baixa o bastante para ver as fachadas
  window.__camFor = (t) => {
    const a = 2.35 + t * 0.045;
    const r = 24 - t * 0.5;
    const x = hq.x + Math.cos(a) * r, z = hq.z + Math.sin(a) * r;
    return { pos: V(x, gh(x, z) + 9 - t * 0.25, z), look: V(hq.x, gh(hq.x, hq.z) + 1.5, hq.z + 2) };
  };
};
