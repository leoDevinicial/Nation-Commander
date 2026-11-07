window.__shotsInit = (cfg) => {
  const rt = window.__runtime;
  const V = (x, y, z) => ({ x, y, z });
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const gh = (x, z) => { try { return rt.groundHeight(x, z); } catch { return 0; } };
  const hq = cfg.hq;
  // direção do centro do mapa para a capital (a câmera vem de dentro do mapa)
  let dx = hq.x - cfg.center.x, dz = hq.z - cfg.center.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const px = -dz, pz = dx;
  const cityCentroid = (re) => {
    let sx = 0, sz = 0, n = 0;
    for (const b of rt.buildings.values()) { if (b.snap.owner !== 1 || (re && !re.test(b.snap.type))) continue; const s = b.visual.group?.position ?? null; if (!s) continue; sx += s.x; sz += s.z; n++; }
    return n ? { x: sx / n, z: sz / n } : { x: hq.x, z: hq.z };
  };
  const st = { pos: null, look: null, shot: -1, c: null };
  const shots = [
    // 1: amanhecer, voo baixo sobre a mata em direção à capital
    { until: 4, k: 6, f: (t) => {
      window.__tod = 860 + t * 4;
      const k = ease(t / 4);
      const d = lerp(70, 34, k);
      const x = hq.x - dx * d + px * 8, z = hq.z - dz * d + pz * 8;
      return { pos: V(x, gh(x, z) + lerp(5, 12, k), z), look: V(hq.x, gh(hq.x, hq.z) + 2, hq.z) };
    } },
    // 2: time-lapse em órbita alta: a cidade cresce e o dia avança
    { until: 10, k: 3, f: (t) => {
      const k = (t - 4) / 6;
      window.__tod = lerp(876, 1315, ease(k));
      const c = cityCentroid(null);
      // por fora da cidade (lado da borda), olhando para dentro do mapa: o fundo é o próprio mapa
      const a = Math.atan2(dz, dx) - 0.55 + k * 1.1;
      const r = 40 + k * 6;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      return { pos: V(x, gh(x, z) + 26 + k * 6, z), look: V(c.x, gh(c.x, c.z) + 1, c.z) };
    } },
    // 3: cidade viva, grua baixa sobre as casas
    { until: 99, k: 3, f: (t) => {
      window.__tod = 1315 + (t - 10) * 2;
      st.c = st.c ?? cityCentroid(/house|farm|school|market|warehouse/);
      const c = st.c;
      const k = (t - 10) / 4;
      const a = Math.atan2(-dz, -dx) + 0.6 + k * 0.35;
      const r = 20 - k * 3;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      return { pos: V(x, gh(x, z) + 4 + k * 4, z), look: V(c.x, gh(c.x, c.z) + 1.5, c.z) };
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
