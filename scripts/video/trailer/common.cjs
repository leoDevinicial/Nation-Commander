// Abre o jogo no Modo Sandbox para a gravação do trailer (baseado em ../common.cjs).
const { chromium } = require('playwright');
const fs = require('fs');
const PORT = Number(process.env.REC_PORT || 8790);
const VITE = process.env.VITE_URL || 'http://localhost:5180/';
async function openGame({ w = 1920, h = 1080, mapType = null, country = null, mode = 'sandbox' } = {}) {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.addInitScript({ path: __dirname + '/../fakeclock.js' });
  await p.addInitScript((q) => {
    try {
      localStorage.setItem('nc.settings.v1', JSON.stringify({ quality: q, shadows: true, adaptiveQuality: false, fpsTarget: 'auto', panSpeed: 1, edgeScroll: false, showFps: false, reducedMotion: false, autoFullscreen: false, lockLandscape: false, muted: false }));
      localStorage.setItem('nc.lang.v1', JSON.stringify({ chosen: 'pt' }));
    } catch {}
  }, process.env.QUALITY || 'balanced');
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto(VITE);
  await p.waitForTimeout(1500);
  await p.mouse.click(w / 2, h / 2);
  await p.waitForSelector('#guest', { timeout: 90000 });
  await p.fill('#guest', 'Comandante');
  await p.getByRole('button', { name: /^Jogar$/ }).first().click();
  await p.waitForTimeout(2000);
  const skip = p.getByRole('button', { name: /Pular por agora/ });
  if (await skip.count()) { await skip.click(); await p.waitForTimeout(400); const y = p.getByRole('button', { name: /Pular mesmo assim/ }); if (await y.count()) await y.click(); }
  await p.getByText(mode === 'ai' ? 'Nova Partida' : 'Modo Sandbox').first().click();
  await p.waitForTimeout(1500);
  if (mapType || country) await p.evaluate(async ([mt, c]) => {
    const { gameClient } = await import('/src/net/client.ts');
    if (mt) gameClient.send({ t: 'set_room', mapType: mt });
    if (c) window.__wantCountry = c;
  }, [mapType, country]);
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Iniciar Operação/ }).click();
  await p.waitForFunction(() => window.__runtime && window.__runtime.snapshot, null, { timeout: 180000 });
  return { b, p };
}
async function step(n) {
  const r = await fetch(`http://localhost:${PORT}/step?n=${n}`);
  return (await r.json()).tick;
}
async function hideUi(p) {
  await p.evaluate(() => {
    const rt = window.__runtime;
    rt.renderer.domElement.classList.add('rec-main');
    const st = document.createElement('style');
    st.id = 'rec-hide';
    st.textContent = '*{visibility:hidden!important} canvas.rec-main{visibility:visible!important}';
    document.head.appendChild(st);
  });
}
module.exports = { openGame, step, hideUi, fs, PORT };

// Câmera do roteiro (window.__camPose = {pos, look}), hora do dia fixa (window.__tod, segundos do ciclo),
// céu limpo e marcadores de interface escondidos. Igual ao film.cjs do vídeo de combate.
async function installRig(p, { tod = null, clear = true, closeUp = true } = {}) {
  await p.evaluate(async ([tod, clear, closeUp]) => {
    const rt = window.__runtime;
    window.__tod = tod;
    if (closeUp) rt.cameraCtl.closeUp = true;
    try { rt.territoryLayer.group.visible = false; } catch {}
    const w = rt.weather;
    if (w) {
      const ou = w.update.bind(w);
      w.update = (s, ...a) => {
        if (clear) { w.now.rain = 0; w.now.snow = 0; w.now.storm = 0; w.now.cover = Math.min(w.now.cover, 0.25); w.snowCover = 0; w.wet = 0; }
        return ou(window.__tod ?? s, ...a);
      };
    }
    const cc = rt.cameraCtl; const orig = cc.apply.bind(cc);
    cc.apply = function () {
      const c = window.__camPose;
      if (!c) return orig();
      const cam = this.camera;
      cam.position.set(c.pos.x, c.pos.y, c.pos.z);
      const tr = this.trauma;
      if (tr > 0 && !c.noShake) {
        const a = tr * tr * 0.5, tt = this.shakeTime * 31;
        cam.position.x += a * (Math.sin(tt) * 0.6 + Math.sin(tt * 2.3) * 0.4);
        cam.position.y += a * (Math.sin(tt * 1.7 + 1) * 0.6 + Math.sin(tt * 3.1) * 0.4) * 0.6;
        cam.position.z += a * (Math.sin(tt * 1.3 + 2) * 0.6 + Math.sin(tt * 2.9) * 0.4);
      }
      if (c.fov && cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
      cam.lookAt(c.look.x, c.look.y, c.look.z);
      this.target.set(c.look.x, 0, c.look.z);
      this.distance = Math.max(18, Math.hypot(c.pos.x - c.look.x, c.pos.y - c.look.y, c.pos.z - c.look.z));
    };
    const al = rt.airLayer; const of = al.frame.bind(al);
    al.frame = (...a) => { const r = of(...a); for (const m of al.targetRings.values()) m.visible = false; for (const d of al.drones.values()) d.hint.visible = false; try { al.rangeRing.visible = false; al.aimRing.visible = false; } catch {} return r; };
    window.__hideTags = () => { for (const b of rt.buildings.values()) { if (b.visual.cityTag) b.visual.cityTag.visible = false; if (b.visual.powerIcon) b.visual.powerIcon.visible = false; } };
    const { audio } = await import('/src/game/audio/AudioService.ts');
    window.__alog = [];
    for (const fn of ['playAt', 'playWide', 'play', 'missileCue', 'thunder', 'warAt', 'rocketSalvo']) {
      if (typeof audio[fn] !== 'function') continue;
      const o = audio[fn].bind(audio);
      audio[fn] = (...a) => { window.__alog.push([window.__recT ?? -1, fn, a, { ...audio.listener }]); return o(...a); };
    }
  }, [tod, clear, closeUp]);
}
async function info() { return (await fetch(`http://localhost:${PORT}/info`)).json(); }
async function cmdAs(slot, cmd) { return (await fetch(`http://localhost:${PORT}/cmd?slot=${slot}&cmd=${encodeURIComponent(JSON.stringify(cmd))}`)).json(); }
async function shot(cdp, file) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}
// espera o snapshot do tick pedido chegar ao cliente
async function syncTo(p, tick) {
  const want = tick - (tick % 2);
  for (let w = 0; w < 600; w++) {
    if (await p.evaluate((k) => window.__runtime.snapshot.tick >= k, want)) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return false;
}
module.exports.installRig = installRig;
module.exports.info = info;
module.exports.cmdAs = cmdAs;
module.exports.shot = shot;
module.exports.syncTo = syncTo;
