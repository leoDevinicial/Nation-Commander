// Gravação do vídeo do drone. Uso: ver scripts/video/README.md (seção "Vídeo do drone").
const { openGame, step, fs } = require('../common.cjs');
const { setupDroneScene } = require('./setup.cjs');
const FPS = Number(process.env.FPS || 24);
const DUR = Number(process.env.DUR || 40);
const OUT = process.env.OUT || '/tmp/drone_frames';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { b, p } = await openGame({ w: W, h: H });
  const sc = await setupDroneScene(p);
  const cdp = await p.context().newCDPSession(p);
  const cs = 2;
  const center = (bd, size) => ({ x: (bd.cx + size / 2) * cs, z: (bd.cy + size / 2) * cs });
  const cfg = {
    mySlot: 0,
    airbase: center(sc.ab, 5),
    target: center(sc.hq, 3),
    factory: center(sc.factory, 2),
    t: { launchA: 4, flyby: 7.4, takeover: 9.4, fpvEnd: null, baseShot: 1e9 },
  };
  await p.addScriptTag({ path: __dirname + '/shots.js' });
  await p.evaluate(async (cfg) => {
    const rt = window.__runtime;
    window.__cfg = cfg;
    rt.renderer.domElement.classList.add('rec-main');
    rt.fpv.canvas.classList.add('rec-osd');
    const st = document.createElement('style');
    st.textContent = '*{visibility:hidden!important} canvas.rec-main,canvas.rec-osd{visibility:visible!important}';
    document.head.appendChild(st);
    rt.cameraCtl.closeUp = true;
    rt.probeLive = false;
    rt.exposureLive = false;
    const { audio } = await import('/src/game/audio/AudioService.ts');
    window.__audio = audio;
    window.__alog = [];
    for (const fn of ['playAt', 'playWide', 'play', 'thunder', 'setDroneFpv']) {
      const o = audio[fn].bind(audio);
      audio[fn] = (...a) => { window.__alog.push([window.__recT ?? -1, fn, a, { ...audio.listener }]); return o(...a); };
    }
    // marcadores de interface no mundo: fora do vídeo
    const al = rt.airLayer; const of = al.frame.bind(al);
    al.frame = (...a) => { const r = of(...a); for (const m of al.targetRings.values()) m.visible = false; for (const d of al.drones.values()) d.hint.visible = false; try { al.rangeRing.visible = false; al.aimRing.visible = false; } catch {} return r; };
    // piloto do FPV: mira na fábrica inimiga, turbo no caminho, mergulho no fim (o servidor decide tudo, como sempre)
    rt.fpv.input = function () {
      const v = this.pred ?? null;
      const T = window.__cfg.factory;
      if (!v) return { turn: 0, climb: 0, throttle: 0 };
      const want = Math.atan2(T.z - v.z, T.x - v.x);
      const err = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
      const flat = Math.hypot(T.x - v.x, T.z - v.z);
      const wantAlt = flat < 14 ? Math.max(0, flat * 0.32) : 4.2 + Math.sin(window.__recT * 0.9) * 0.6;
      return { turn: Math.max(-1, Math.min(1, err * 2.2)), climb: Math.max(-1, Math.min(1, (wantAlt - v.alt) * 0.9)), throttle: flat > 18 ? 1 : 0.35 };
    };
    const cc = rt.cameraCtl; const orig = cc.apply.bind(cc);
    cc.apply = function () {
      const c = window.__camPose;
      if (!c) return orig();
      const cam = this.camera;
      cam.position.set(c.pos.x, c.pos.y, c.pos.z);
      const tr = this.trauma;
      if (tr > 0) {
        const a2 = tr * tr * 0.5, tt = this.shakeTime * 31;
        cam.position.x += a2 * (Math.sin(tt) * 0.6 + Math.sin(tt * 2.3) * 0.4);
        cam.position.y += a2 * (Math.sin(tt * 1.7 + 1) * 0.6 + Math.sin(tt * 3.1) * 0.4) * 0.6;
        cam.position.z += a2 * (Math.sin(tt * 1.3 + 2) * 0.6 + Math.sin(tt * 2.9) * 0.4);
      }
      cam.lookAt(c.look.x, c.look.y, c.look.z);
      this.target.set(c.look.x, 0, c.look.z);
      this.distance = Math.max(10, Math.hypot(c.pos.x - c.look.x, c.pos.y - c.look.y, c.pos.z - c.look.z));
    };
    window.__shotsInit(cfg);
    window.__startFake();
  }, cfg);
  const done = new Set();
  const at = async (key, cond, fn) => { if (cond && !done.has(key)) { done.add(key); await fn(); } };
  let stepped = 0, droneA = null, fpvSeen = false, swarmIds = [], endAt = null, lastPass = -9;
  const t0 = Date.now();
  for (let f = 0; f < DUR * FPS; f++) {
    const t = f / FPS;
    await at('launchA', t >= cfg.t.launchA, () => send(sc, { type: 'launch_drone', buildingId: sc.ab.id, x: cfg.factory.x, y: cfg.factory.z }));
    if (!droneA && t > cfg.t.launchA) droneA = await p.evaluate(() => (window.__runtime.snapshot.air?.drones ?? []).find((d) => d.owner === 0)?.id ?? null);
    await at('take', t >= cfg.t.takeover && droneA, () => p.evaluate((id) => window.__runtime.takeDrone(id), droneA));
    const fpv = await p.evaluate(() => { const rt = window.__runtime; if (rt.fpv.active) rt.fpv.startedAt = -1e9; return rt.fpv.active; });
    if (fpv) fpvSeen = true;
    // enxame: os outros três drones saem enquanto o primeiro ainda voa
    await at('swarm', fpvSeen && t >= cfg.t.takeover + 2.5, async () => {
      for (const tg of [sc.hq, sc.barracks, sc.tower]) {
        const c = { x: (tg.cx + 1) * cs, z: (tg.cy + 1) * cs };
        await send(sc, { type: 'launch_drone', buildingId: sc.ab.id, x: c.x, y: c.z });
      }
    });
    if (fpvSeen && !fpv && cfg.t.fpvEnd === null) {
      cfg.t.fpvEnd = t;
      await p.evaluate((v) => (window.__cfg.t.fpvEnd = v), t);
      console.log('fpvEnd', t.toFixed(2));
    }
    if (done.has('swarm') && cfg.t.baseShot === 1e9 && f % 6 === 0) {
      const near = await p.evaluate((T) => (window.__runtime.snapshot.air?.drones ?? []).filter((d) => d.owner === 0).some((d) => Math.hypot(d.x - T.x, d.y - T.z) < 26), cfg.target);
      if (near && cfg.t.fpvEnd !== null && t > cfg.t.fpvEnd + 2.5) { cfg.t.baseShot = t; await p.evaluate((v) => (window.__cfg.t.baseShot = v), t); console.log('baseShot', t.toFixed(2)); }
    }
    if (cfg.t.baseShot < 1e9 && endAt === null && f % 6 === 0) {
      const left = await p.evaluate(() => (window.__runtime.snapshot.air?.drones ?? []).filter((d) => d.owner === 0).length);
      if (left === 0) { endAt = t + 3.2; console.log('end at', endAt.toFixed(2)); }
    }
    if (endAt !== null && t >= endAt) break;
    // zumbido dos drones vistos de fora (registrado para a trilha)
    if (!fpv && t - lastPass > 1.6 && t > cfg.t.launchA + 0.3) {
      lastPass = t;
      await p.evaluate(() => { const ds = (window.__runtime.snapshot.air?.drones ?? []).filter((d) => d.owner === 0); for (const d of ds.slice(0, 2)) window.__audio.playAt('drone_pass', d.x, d.y); });
    }
    const want = Math.floor(t * 20);
    if (want > stepped) {
      if (f > 0) await p.waitForTimeout(25);
      const tick = await step(want - stepped);
      stepped = want;
      const snapTick = tick - (tick % 2);
      for (let w = 0; w < 400; w++) {
        if (await p.evaluate((k) => window.__runtime.snapshot.tick >= k, snapTick)) break;
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    const shot = await p.evaluate(([t, F]) => { window.__recT = t; window.__camPose = window.__camFor(t, 1 / F); window.__advance(1000 / F); return window.__shotName; }, [t, FPS]);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    fs.writeFileSync(`${OUT}/${String(f).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'));
    if (f % 24 === 0) console.log('frame', f, 't', t.toFixed(1), shot, 'fpv', fpv, 'elapsed', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  fs.writeFileSync(OUT + '/audio.json', JSON.stringify(await p.evaluate(() => window.__alog)));
  fs.writeFileSync(OUT + '/cuts.json', JSON.stringify(cfg.t));
  console.log('done', JSON.stringify(cfg.t));
  await b.close();
})();
function send(sc, cmd) { return sc.send(cmd); }
