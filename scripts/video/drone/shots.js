// Roteiro de câmera do vídeo do drone. __camFor(t, dt) devolve a pose, ou null quando a câmera é a do FPV.
window.__shotsInit = (cfg) => {
  const rt = window.__runtime;
  const V = (x, y, z) => ({ x, y, z });
  const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const gh = (x, z) => { try { return rt.groundHeight(x, z); } catch { return 0; } };
  const st = { pos: null, look: null, shot: -1, cache: {} };
  const ab = cfg.airbase;
  const view = (id) => (id ? rt.airLayer.droneView(id) : null);
  const flying = () => (rt.snapshot.air?.drones ?? []).filter((d) => d.owner === cfg.mySlot);
  const shots = [
    // 1: drones estacionados no pátio da base aérea, câmera baixa girando devagar
    { name: 'parked', until: () => cfg.t.launchA, k: 3, f: (t) => {
      const ang = 2.4 + t * 0.12, r = 7.5;
      const c = { x: ab.x, z: ab.z + 1.7 };
      const px = c.x + Math.cos(ang) * r, pz = c.z + Math.sin(ang) * r;
      return { pos: V(px, gh(px, pz) + 1.4 + t * 0.15, pz), look: V(c.x, 0.6, c.z) };
    } },
    // 2: decolagem — de lado e atrás, subindo junto
    { name: 'takeoff', until: () => cfg.t.flyby, k: 5, f: () => {
      const d = flying()[0];
      const v = view(d?.id);
      if (!v) return st.cache.last ?? { pos: V(ab.x + 6, 2, ab.z + 6), look: V(ab.x, 1, ab.z) };
      const fx = Math.cos(v.heading), fz = Math.sin(v.heading);
      const r = { pos: V(v.pos.x - fx * 4 - fz * 2.6, v.pos.y + 0.7, v.pos.z - fz * 4 + fx * 2.6), look: V(v.pos.x + fx * 3, v.pos.y, v.pos.z + fz * 3) };
      st.cache.last = r;
      return r;
    } },
    // 3: rasante — câmera parada no chão à frente, o drone passa por cima
    { name: 'flyby', until: () => cfg.t.takeover + 0.4, k: 6, f: () => {
      const d = flying()[0];
      const v = view(d?.id);
      if (!st.cache.fly && v) {
        const fx = Math.cos(v.heading), fz = Math.sin(v.heading);
        const px = v.pos.x + fx * 13 + fz * 1.6, pz = v.pos.z + fz * 13 - fx * 1.6;
        st.cache.fly = V(px, gh(px, pz) + 1.2, pz);
      }
      const at = st.cache.fly ?? V(ab.x, 2, ab.z);
      return { pos: at, look: v ? V(v.pos.x, v.pos.y, v.pos.z) : V(at.x + 5, 3, at.z) };
    } },
    // 4: primeira pessoa (a câmera é a do próprio drone) — até sair do FPV
    { name: 'fpv', until: () => (cfg.t.fpvEnd ?? 1e9), k: 1, f: () => null },
    // 5: enxame — atrás e acima dos três drones
    { name: 'swarm', until: () => cfg.t.baseShot, k: 2.2, f: () => {
      const vs = flying().map((d) => view(d.id)).filter(Boolean);
      if (!vs.length) return st.cache.sw ?? { pos: V(ab.x, 12, ab.z), look: V(cfg.target.x, 1, cfg.target.z) };
      const c = vs.reduce((a, v) => ({ x: a.x + v.pos.x / vs.length, y: a.y + v.pos.y / vs.length, z: a.z + v.pos.z / vs.length }), { x: 0, y: 0, z: 0 });
      let dx = cfg.target.x - c.x, dz = cfg.target.z - c.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const r = { pos: V(c.x - dx * 9 + dz * 3, c.y + 3.2, c.z - dz * 9 - dx * 3), look: V(c.x + dx * 10, c.y - 1.2, c.z + dz * 10) };
      st.cache.sw = r;
      return r;
    } },
    // 6: na base inimiga, plano aberto e baixo, esperando os impactos
    { name: 'base', until: () => 1e9, k: 1.2, f: (t) => {
      const k = ease((t - cfg.t.baseShot) / 8);
      const T = cfg.target;
      const px = T.x - 20 + k * 3, pz = T.z - 15 + k * 2;
      return { pos: V(px, gh(px, pz) + 5.5 - k * 1.2, pz), look: V(T.x + 1, 1.8, T.z + 1) };
    } },
  ];
  window.__camFor = (t, dt) => {
    const i = shots.findIndex((s) => t < s.until());
    const s = shots[i];
    window.__shotName = s.name;
    const want = s.f(t);
    if (!want) { st.shot = i; st.pos = null; return null; }
    if (i !== st.shot || !st.pos) { st.shot = i; st.pos = { ...want.pos }; st.look = { ...want.look }; }
    else {
      const a = 1 - Math.exp(-dt * s.k);
      for (const key of ['x', 'y', 'z']) { st.pos[key] += (want.pos[key] - st.pos[key]) * a; st.look[key] += (want.look[key] - st.look[key]) * a; }
    }
    return { pos: st.pos, look: st.look };
  };
};
