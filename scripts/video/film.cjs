const { openGame, step, fs } = require('./common.cjs');
const { setupScene } = require('./setup.cjs');
const FPS = Number(process.env.FPS || 24);
const DUR = Number(process.env.DUR || 36);
const OUT = process.env.OUT || __dirname + '/frames';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const SHOOT = process.env.SHOOT !== '0';
// RANGES="11-21.1,26.8-36": só desenha (e fotografa) esses trechos; o resto anda sem desenhar
const RANGES = (process.env.RANGES || '').split(',').filter(Boolean).map((r) => r.split('-').map(Number));
const shootAt = (t) => !RANGES.length || RANGES.some(([a, b]) => t >= a && t < b);
const drawAt = (t) => !RANGES.length || RANGES.some(([a, b]) => t >= a - 0.75 && t < b);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { b, p } = await openGame({ w: W, h: H });
  const sc = await setupScene(p);
  const cdp = await p.context().newCDPSession(p);
  const { send, snap } = sc;
  const s0 = await snap();
  const mine = s0.units.filter((u) => u.owner === 0);
  const groundIds = mine.filter((u) => !/artillery/.test(u.type)).map((u) => u.id);
  const artIds = mine.filter((u) => /artillery/.test(u.type)).map((u) => u.id);
  const cs = 2;
  const hqPos = { x: (sc.enemyHq.cx + 1.5) * cs, z: (sc.enemyHq.cy + 1.5) * cs };
  const facPos = { x: (sc.enemyFactory.cx + 1) * cs, z: (sc.enemyFactory.cy + 1) * cs };
  await p.addScriptTag({ path: __dirname + '/shots.js' });
  await p.evaluate(async (cfg) => {
    const rt = window.__runtime;
    // sem interface nenhuma: só o canvas do jogo
    rt.renderer.domElement.classList.add('rec-main');
    const st = document.createElement('style');
    st.textContent = '*{visibility:hidden!important} canvas.rec-main{visibility:visible!important}';
    document.head.appendChild(st);
    rt.cameraCtl.closeUp = true; // sem barras de vida, patentes e recargas
    try { rt.territoryLayer.group.visible = false; } catch {}
    try { rt.territoryLayer.visible = false; } catch {}
    const { audio } = await import('/src/game/audio/AudioService.ts');
    window.__alog = [];
    for (const fn of ['playAt', 'playWide', 'play', 'missileCue', 'thunder', 'setDroneFpv']) {
      const o = audio[fn].bind(audio);
      audio[fn] = (...a) => { window.__alog.push([window.__recT ?? -1, fn, a, { ...audio.listener }]); return o(...a); };
    }
    const cc = rt.cameraCtl; const orig = cc.apply.bind(cc);
    cc.apply = function () {
      const c = window.__camPose;
      if (!c) return orig();
      const cam = this.camera;
      cam.position.set(c.pos.x, c.pos.y, c.pos.z);
      const tr = this.trauma;
      if (tr > 0) {
        const a = tr * tr * 0.5, tt = this.shakeTime * 31;
        cam.position.x += a * (Math.sin(tt) * 0.6 + Math.sin(tt * 2.3) * 0.4);
        cam.position.y += a * (Math.sin(tt * 1.7 + 1) * 0.6 + Math.sin(tt * 3.1) * 0.4) * 0.6;
        cam.position.z += a * (Math.sin(tt * 1.3 + 2) * 0.6 + Math.sin(tt * 2.9) * 0.4);
      }
      cam.lookAt(c.look.x, c.look.y, c.look.z);
      this.target.set(c.look.x, 0, c.look.z);
      this.distance = Math.max(18, Math.hypot(c.pos.x - c.look.x, c.pos.y - c.look.y, c.pos.z - c.look.z));
    };
    window.__shotsInit(cfg);
    // marcadores de interface no mundo (alvo do míssil, anel de assumir o drone): fora do vídeo
    const al = rt.airLayer; const of = al.frame.bind(al);
    al.frame = (...a) => { const r = of(...a); for (const m of al.targetRings.values()) m.visible = false; for (const d of al.drones.values()) d.hint.visible = false; try { al.rangeRing.visible = false; al.aimRing.visible = false; } catch {} return r; };
    window.__startFake();
    // sonda de reflexos e medição de exposição renderizam a cena de novo periodicamente: congeladas na gravação
    if (cfg.freeze) { rt.probeLive = false; rt.exposureLive = false; }
  }, { mySlot: 0, enemySlot: 1, hq: hqPos, factory: facPos, freeze: process.env.FREEZE === '1' });
  let stepped = 0;
  let authorized = false;
  const done = new Set();
  const at = async (key, cond, fn) => { if (cond && !done.has(key)) { done.add(key); await fn(); } };
  const t0 = Date.now();
  for (let f = 0; f < DUR * FPS; f++) {
    const t = f / FPS;
    await at('atk', t >= 0.5, async () => { await send({ type: 'attack_move', unitIds: groundIds, x: 88, y: 32 }); await send({ type: 'attack_move', unitIds: artIds, x: 70, y: 14 }); });
    await at('enemy', t >= 1, () => fetch('http://localhost:8790/enemy?cmd=' + encodeURIComponent(JSON.stringify({ x: 70, y: 18, near: [88, 32, 14] }))));
    await at('bomb', t >= 6, async () => { const s = await snap(); const ids = s.air.aircraft.filter((a) => a.type === 'bomber').map((a) => a.id); await send({ type: 'air_mission', buildingId: sc.ab.id, aircraftIds: ids, mission: 'strike', targetId: sc.enemyHq.id }); });
    await at('drone', t >= 12, () => send({ type: 'launch_drone', buildingId: sc.ab.id, x: facPos.x, y: facPos.z }));
    await at('nuke', t >= 14, () => send({ type: 'missile_prepare', buildingId: sc.silo.id, x: hqPos.x, y: hqPos.z, nuclear: true }));
    if (!authorized && t >= 20 && f % 5 === 0) {
      const st = await (await fetch('http://localhost:8790/state')).json();
      const l = (st.launches ?? []).at(-1);
      if (l && l.state === 'armed') { authorized = true; await send({ type: 'missile_authorize', launchId: l.id }); }
    }
    // servidor no mesmo relógio do vídeo (20 ticks/s)
    const want = Math.floor(t * 20);
    if (want > stepped) {
      if (f > 0) await p.waitForTimeout(25); // ordens chegam antes do tick
      const tick = await step(want - stepped);
      stepped = want;
      const snapTick = tick - (tick % 2);
      for (let w = 0; w < 400; w++) {
        if (await p.evaluate((k) => window.__runtime.snapshot.tick >= k, snapTick)) break;
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    const draw = drawAt(t);
    if (!draw) {
      await p.evaluate(([t, FPS_]) => { window.__recT = t; window.__camPose = window.__camFor(t, 1 / FPS_); window.__advanceNoRender(1000 / FPS_); }, [t, FPS]);
      if (f % 48 === 0) console.log('skip', f, t.toFixed(1));
      continue;
    }
    await p.evaluate(([t, FPS_]) => { const rt = window.__runtime; for (const b of rt.buildings.values()) if (b.visual.cityTag) b.visual.cityTag.visible = false; window.__recT = t; window.__camPose = window.__camFor(t, 1 / FPS_); window.__advance(1000 / FPS_); }, [t, FPS]);
    if (SHOOT && shootAt(t)) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      fs.writeFileSync(`${OUT}/${String(f).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'));
    }
    if (process.env.DEBUG && f < 12) console.log('dbg', f, JSON.stringify(await p.evaluate(() => { const rt = window.__runtime; return { exp: rt.renderer.toneMappingExposure, clock: rt.clockSeconds, sim: rt.simSeconds, climate: rt.climate, now: rt.weather?.now, snow: rt.weather?.snowCover, cur: rt.exposure?.current, tgt: rt.exposure?.target, avg: rt.exposure?.lastAverage }; })));
    if (f % 30 === 0) console.log('frame', f, 't', t.toFixed(1), 'elapsed', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  const alog = await p.evaluate(() => window.__alog);
  fs.writeFileSync(OUT + '/audio.json', JSON.stringify(alog));
  console.log('audio events', alog.length, 'rej', JSON.stringify([...new Set(await p.evaluate(() => window.__rej))].slice(-6)));
  await b.close();
})();
