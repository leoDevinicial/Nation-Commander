window.__shotsInit = (cfg) => {
  const rt = window.__runtime;
  const V = (x, y, z) => ({ x, y, z });
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const gh = (x, z) => { try { return rt.groundHeight(x, z); } catch { return 0; } };
  const pad = cfg.pad;
  const W = new (rt.camera.position.constructor)();
  const rocket = () => { for (const b of rt.buildings.values()) if (b.snap.type === 'space_center' && b.visual.launch) return b.visual.launch.rocket.getWorldPosition(W); return null; };
  // lado de onde a câmera olha: da capital para a plataforma (o QG fica atrás da câmera)
  // a câmera fica do outro lado da plataforma, olhando para a capital (SIDE=-1 inverte)
  const SIDE = window.__side ?? -1;
  let dx = (pad.x - cfg.hq.x) * SIDE, dz = (pad.z - cfg.hq.z) * SIDE; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const px = -dz, pz = dx;
  const g = gh(pad.x, pad.z);
  const st = { pos: null, look: null, shot: -1 };
  const shots = [
    // T-10 a T-5: plano aberto ao entardecer, aproximando devagar
    { until: 5, k: 4, f: (t) => {
      const k = ease(t / 5);
      const d = lerp(40, 30, k);
      const x = pad.x - dx * d + px * 10, z = pad.z - dz * d + pz * 10;
      return { pos: V(x, g + lerp(7, 5, k), z), look: V(pad.x, g + 5, pad.z) };
    } },
    // T-5 a T-1,5: perto da base do foguete, câmera baixa (vapor, água, ignição)
    { until: 8.5, k: 4, f: (t) => {
      const k = (t - 5) / 3.5;
      const x = pad.x - dx * 12 - px * 6 + px * k * 2, z = pad.z - dz * 12 - pz * 6 + pz * k * 2;
      return { pos: V(x, g + 1.8, z), look: V(pad.x, g + 4.5 + k, pad.z) };
    } },
    // T-1,5 em diante: plano aberto e baixo, a câmera inclina para seguir o foguete
    { until: 99, k: 2.2, f: (t) => {
      const r = rocket();
      const y = r ? r.y : g + 6;
      const x = pad.x - dx * 30 + px * 7, z = pad.z - dz * 30 + pz * 7;
      return { pos: V(x, g + 5.5, z), look: V(r ? r.x : pad.x, Math.max(g + 6, y + 2), r ? r.z : pad.z) };
    } },
  ];
  window.__camFor = (t, dt) => {
    const i = shots.findIndex((s) => t < s.until);
    const s = shots[i];
    const want = s.f(t);
    if (i !== st.shot || !st.pos) { st.shot = i; st.pos = { ...want.pos }; st.look = { ...want.look }; }
    else {
      const a = 1 - Math.exp(-dt * s.k);
      for (const key of ['x', 'y', 'z']) { st.pos[key] += (want.pos[key] - st.pos[key]) * a; st.look[key] += (want.look[key] - st.look[key]) * a; }
    }
    return { pos: st.pos, look: st.look };
  };
};
