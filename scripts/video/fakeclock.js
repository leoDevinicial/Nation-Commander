// Relógio controlado: até __startFake(), tudo normal; depois, o tempo só anda com __advance(ms).
(() => {
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  const rRAF = window.requestAnimationFrame.bind(window), rCAF = window.cancelAnimationFrame.bind(window);
  const rST = window.setTimeout.bind(window), rCT = window.clearTimeout.bind(window), rSI = window.setInterval.bind(window), rCI = window.clearInterval.bind(window);
  let fake = false, now = 0, dateBase = 0, seq = 1e6;
  let raf = [];
  const timers = new Map();
  performance.now = () => (fake ? now : realNow());
  Date.now = () => (fake ? dateBase + now : realDateNow());
  window.requestAnimationFrame = (cb) => { if (!fake) return rRAF((ts) => (fake ? raf.push({ id: ++seq, cb }) : cb(ts))); const id = ++seq; raf.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { raf = raf.filter((r) => r.id !== id); rCAF(id); };
  window.setTimeout = (cb, ms = 0, ...a) => { if (!fake) return rST(cb, ms, ...a); const id = ++seq; timers.set(id, { at: now + Math.max(0, ms), cb, a }); return id; };
  window.setInterval = (cb, ms = 0, ...a) => { if (!fake) return rSI(cb, ms, ...a); const id = ++seq; timers.set(id, { at: now + Math.max(1, ms), cb, a, every: Math.max(1, ms) }); return id; };
  window.clearTimeout = (id) => { timers.delete(id); rCT(id); };
  window.clearInterval = (id) => { timers.delete(id); rCI(id); };
  window.__startFake = () => { now = realNow(); dateBase = realDateNow() - now; fake = true; };
  window.__now = () => now;
  // avança o relógio e os timers sem desenhar (o quadro pendente fica na fila para o próximo __advance)
  window.__advanceNoRender = (ms) => {
    const end = now + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      now = Math.max(now, t.at);
      if (t.every) t.at += t.every; else timers.delete(id);
      try { typeof t.cb === 'function' ? t.cb(...t.a) : 0; } catch (e) { console.error(e); }
    }
    now = end;
  };
  window.__advance = (ms) => {
    const end = now + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      now = Math.max(now, t.at);
      if (t.every) t.at += t.every; else timers.delete(id);
      try { typeof t.cb === 'function' ? t.cb(...t.a) : 0; } catch (e) { console.error(e); }
    }
    now = end;
    const q = raf; raf = [];
    for (const r of q) { try { r.cb(now); } catch (e) { console.error(e); } }
  };
})();
