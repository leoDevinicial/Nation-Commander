window.__shotsInit = (cfg) => {
  const rt = window.__runtime;
  const V = (x, y, z) => ({ x, y, z });
  const centroid = (owner) => {
    let sx = 0, sz = 0, n = 0;
    for (const t of rt.units.values()) {
      if ((owner !== null && t.snap.owner !== owner) || t.snap.hp <= 0 || !/frigate|carrier|submarine/.test(t.snap.type)) continue;
      sx += t.visual.renderPos.x; sz += t.visual.renderPos.y; n++;
    }
    return n ? { x: sx / n, z: sz / n } : null;
  };
  let dx = cfg.foe.x - cfg.start.x, dz = cfg.foe.z - cfg.start.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const px = -dz, pz = dx;
  const st = { pos: null, look: null, c: null };
  // um plano lateral: as duas frotas no quadro, a câmera desliza devagar ao longo da linha de fogo
  window.__camFor = (t, dt) => {
    const c = centroid(null) ?? st.c ?? { x: (cfg.start.x + cfg.foe.x) / 2, z: (cfg.start.z + cfg.foe.z) / 2 }; st.c = c;
    const want = { pos: V(c.x + px * 19 - dx * (6 - t * 0.6), 4.2 - t * 0.12, c.z + pz * 19 - dz * (6 - t * 0.6)), look: V(c.x - dx * 2, 0.8, c.z - dz * 2) };
    if (!st.pos) { st.pos = { ...want.pos }; st.look = { ...want.look }; }
    else { const a = 1 - Math.exp(-dt * 2); for (const k of ['x', 'y', 'z']) { st.pos[k] += (want.pos[k] - st.pos[k]) * a; st.look[k] += (want.look[k] - st.look[k]) * a; } }
    return { pos: st.pos, look: st.look };
  };
};
