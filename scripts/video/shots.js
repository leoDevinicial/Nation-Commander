// Roteiro de câmera (roda na página). window.__shotsInit(cfg) prepara; __camFor(t, dt) devolve a pose.
window.__shotsInit = (cfg) => {
  const rt = window.__runtime;
  const V = (x, y, z) => ({ x, y, z });
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const gh = (x, z) => { try { return rt.groundHeight(x, z); } catch { return 0; } };
  const centroid = (owner, re) => {
    let sx = 0, sz = 0, n = 0;
    for (const t of rt.units.values()) {
      if (t.snap.owner !== owner || t.snap.hp <= 0 || (re && !re.test(t.snap.type))) continue;
      sx += t.visual.renderPos.x; sz += t.visual.renderPos.y; n++;
    }
    return n ? { x: sx / n, z: sz / n, n } : null;
  };
  const st = { pos: null, look: null, shot: -1, cache: {} };
  const hq = cfg.hq, fac = cfg.factory;
  const shots = [
    // 1: coluna blindada avançando, câmera rente ao chão à frente e ao lado
    { until: 5, k: 3, f: (t) => {
      const c = centroid(cfg.mySlot, /mbt|tank/) ?? st.cache.c1 ?? { x: 64, z: 10 };
      st.cache.c1 = c;
      const d = { x: 0.76, z: 0.65 }, pr = { x: -d.z, z: d.x };
      const px = c.x + d.x * (9 - t * 0.6) + pr.x * 6, pz = c.z + d.z * (9 - t * 0.6) + pr.z * 6;
      return { pos: V(px, gh(px, pz) + 1.6, pz), look: V(c.x, gh(c.x, c.z) + 1.0, c.z) };
    } },
    // 2: o choque, em órbita baixa
    { until: 11, k: 2, f: (t) => {
      const a = centroid(cfg.mySlot, null) ?? st.cache.a2, b = centroid(cfg.enemySlot, null) ?? st.cache.b2;
      st.cache.a2 = a; st.cache.b2 = b;
      const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const ang = -2.2 + (t - 5) * 0.09;
      const r = 24;
      const px = m.x + Math.cos(ang) * r, pz = m.z + Math.sin(ang) * r;
      return { pos: V(px, gh(px, pz) + 8, pz), look: V(m.x, gh(m.x, m.z) + 0.5, m.z) };
    } },
    // 3: atrás e acima dos lança-foguetes (por cima das árvores), olhando para a frente de batalha
    { until: 15, k: 2.5, f: (t) => {
      const a = centroid(cfg.mySlot, /rocket_artillery|artillery/) ?? st.cache.a3 ?? { x: 50, z: 8 };
      st.cache.a3 = a;
      const b = centroid(cfg.enemySlot, null) ?? { x: 80, z: 30 };
      let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const back = 9 - (t - 11) * 0.6;
      const px = a.x - dx * back + dz * 4, pz = a.z - dz * back - dx * 4;
      return { pos: V(px, gh(px, pz) + 7.5, pz), look: V(a.x + dx * 16, gh(a.x + dx * 16, a.z + dz * 16) + 1.5, a.z + dz * 16) };
    } },
    // 4: bombardeiros chegando à base inimiga
    { until: 21, k: 1.6, f: (t) => {
      const dir = { x: 0.96, z: 0.28 }, pr = { x: -dir.z, z: dir.x };
      const px = hq.x + pr.x * 20 + dir.x * 4, pz = hq.z + pr.z * 20 + dir.z * 4;
      const k = ease((t - 15) / 4.5);
      const lx = lerp(hq.x - dir.x * 28, hq.x, k), lz = lerp(hq.z - dir.z * 28, hq.z, k);
      return { pos: V(px, gh(px, pz) + 5.5, pz), look: V(lx, lerp(9, 1.5, k), lz) };
    } },
    // 5: perseguição do drone até o impacto
    { until: 26.8, k: 8, f: () => {
      const d = (rt.snapshot.air?.drones ?? []).find((x) => x.owner === cfg.mySlot);
      const v = d ? rt.airLayer.droneView(d.id) : null;
      if (!v) return st.cache.d5 ?? { pos: V(fac.x - 10, 6, fac.z - 4), look: V(fac.x, 1, fac.z) };
      const fx = Math.cos(v.heading), fz = Math.sin(v.heading);
      const r = { pos: V(v.pos.x - fx * 3.2, v.pos.y + 1.1, v.pos.z - fz * 3.2), look: V(v.pos.x + fx * 6, v.pos.y - 0.9, v.pos.z + fz * 6) };
      st.cache.d5 = r;
      return r;
    } },
    // 6: a bomba nuclear: plano aberto que se afasta devagar
    { until: 99, k: 2, f: (t) => {
      const k = ease((t - 26.8) / 9);
      const px = hq.x - 46 - k * 10, pz = hq.z - 26 - k * 6;
      return { pos: V(px, gh(px, pz) + 16 + k * 6, pz), look: V(hq.x, 4 + k * 4, hq.z) };
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
