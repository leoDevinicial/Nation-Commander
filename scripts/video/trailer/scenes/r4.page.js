window.__shotsInit = (cfg) => {
  const rt = window.__runtime;
  const V = (x, y, z) => ({ x, y, z });
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const gh = (x, z) => { try { return rt.groundHeight(x, z); } catch { return 0; } };
  const [sA, sB] = cfg.silos; const dome = cfg.dome; const ehq = cfg.ehq;
  const C = window.__r4 ?? { conv: 0.5, nuke: 9, domeFrom: 3.5, domeTo: 8, wideFrom: 13.4 };
  // direção do domo para os meus silos (de onde vem o míssil)
  let dx = sA.x - dome.x, dz = sA.z - dome.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const px = -dz, pz = dx;
  const st = { pos: null, look: null, shot: -1 };
  // silo de perto, câmera baixa ao lado; a mira sobe com o míssil (fase de lançamento ~2,5 s depois da ordem)
  const silo = (s, t0, side = 1, up = 0) => (t) => {
    const k = ease((t - t0 - 0.9) / 3.6);
    const x = s.x - dx * 8 + px * 6 * side, z = s.z - dz * 8 + pz * 6 * side;
    const g = gh(s.x, s.z);
    return { pos: V(x, Math.max(gh(x, z), g) + 2.4 + up + k * 1.5, z), look: V(s.x, g + 1.2 + k * 6, s.z) };
  };
  const shots = [
    { until: C.domeFrom, k: 5, f: silo(sA, C.conv) },
    // domo: câmera atrás das baterias, olhando para o céu de onde vem o míssil
    { until: C.domeTo, k: 3, f: (t) => {
      const k = ease((t - C.domeFrom) / (C.domeTo - C.domeFrom));
      const x = dome.x - dx * 10 + px * 5, z = dome.z - dz * 10 + pz * 5;
      return { pos: V(x, gh(x, z) + 2.4, z), look: V(dome.x + dx * 30, gh(dome.x, dome.z) + lerp(7, 13, k), dome.z + dz * 30) };
    } },
    { until: C.wideFrom, k: 5, f: silo(sB, C.nuke, -1, 3) },
    // nuclear: plano aberto e alto sobre a capital inimiga, recuando devagar
    { until: 99, k: 2, f: (t) => {
      const k = ease((t - C.wideFrom) / 9);
      const x = ehq.x + dx * (56 + k * 10) + px * 22, z = ehq.z + dz * (56 + k * 10) + pz * 22;
      return { pos: V(x, gh(x, z) + 14 + k * 6, z), look: V(ehq.x, 5 + k * 6, ehq.z) };
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
