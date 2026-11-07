// Motor de gravação do trailer: SCENE=r1 node film.cjs
// A cena (scenes/<nome>.cjs) diz a duração, a velocidade da simulação a cada instante (ticks por segundo de vídeo:
// 20 = tempo real, 10 = câmera lenta 0,5×, 400 = time-lapse 20×), os eventos (ordens) e a câmera (scenes/<nome>.page.js).
// Quadros em OUT/<cena>/00000.jpg; sons do jogo em OUT/<cena>/audio.json (tempo de vídeo).
const { openGame, step, hideUi, installRig, info, cmdAs, shot, syncTo, fs } = require('./common.cjs');
const SCENE = process.env.SCENE;
const FPS = Number(process.env.FPS || 24);
const W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const OUT = (process.env.OUT || '/home/user/trailer_work/frames') + '/' + SCENE + (process.env.TAG ? '_' + process.env.TAG : '');
// RANGES="2-5,9-12": só fotografa esses trechos (o resto anda sem desenhar)
const RANGES = (process.env.RANGES || '').split(',').filter(Boolean).map((r) => r.split('-').map(Number));
const shootAt = (t) => !RANGES.length || RANGES.some(([a, b]) => t >= a && t < b);
const drawAt = (t) => !RANGES.length || RANGES.some(([a, b]) => t >= a - 0.75 && t < b);
const scene = require(`./scenes/${SCENE}.cjs`);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { b, p } = await openGame({ w: W, h: H, mapType: scene.mapType ?? null, mode: scene.mode ?? 'sandbox' });
  const cdp = await p.context().newCDPSession(p);
  await p.evaluate(async () => {
    const { gameClient } = await import('/src/net/client.ts');
    window.__rej = [];
    gameClient.on((m) => { if (m.t === 'cmd_rejected') window.__rej.push(m.reason); });
  });
  const send = (c) => p.evaluate((c) => window.__runtime.send(c), c);
  const pump = async (ticks) => { for (let i = 0; i < ticks; i += 40) await step(Math.min(40, ticks - i)); const s = await info(); await syncTo(p, s.tick); };
  const ctx = { p, send, pump, info, cmdAs, step, log: console.log, state: {} };
  await send({ type: 'sandbox_toggle', key: 'reveal', value: true });
  await pump(2);
  const t0 = Date.now();
  // preparação sem desenhar (o jogo segue recebendo o estado): sobra CPU para as outras gravações
  if (!process.env.NOSUSPEND) await p.evaluate(() => window.__runtime.setSuspended(true));
  if (scene.setup) await scene.setup(ctx);
  await p.evaluate(() => window.__runtime.setSuspended(false));
  console.log('setup ok', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'rej', JSON.stringify([...new Set(await p.evaluate(() => window.__rej))].slice(-8)));
  await p.evaluate(() => { window.__rej = []; });
  if (!scene.ui) await hideUi(p);
  await installRig(p, { tod: scene.tod ?? 300, clear: scene.clear !== false, closeUp: !scene.ui });
  await p.addScriptTag({ path: `${__dirname}/scenes/${SCENE}.page.js` });
  await p.evaluate((cfg) => { window.__shotsInit(cfg); window.__startFake(); }, ctx.state);
  const rate = scene.rate ?? (() => 20);
  const clientRate = scene.clientRate ?? ((t) => Math.min(rate(t), 40) / 20);
  const done = new Set();
  let simTicks = 0; // ticks pedidos desde o início do filme
  let stepped = 0;
  const startTick = (await info()).tick;
  const DUR = scene.duration;
  // pré-rolagem: a exposição automática se ajusta antes do primeiro quadro gravado
  const PRE = Number(process.env.PREROLL ?? 84);
  for (let k = 0; k < PRE; k++) await p.evaluate((dt) => { const rt = window.__runtime; window.__hideTags(); try { rt.territoryLayer.group.visible = false; } catch {} window.__recT = -1; window.__camPose = window.__camFor(0, 0); window.__advance(dt); }, Number(process.env.PREROLL_DT || 100));
  await shot(cdp, `${OUT}/preroll.jpg`); // descarta o primeiro quadro composto
  await p.evaluate(() => { window.__alog = []; });
  const t1 = Date.now();
  for (let f = 0; f < Math.round(DUR * FPS); f++) {
    const t = f / FPS;
    for (const ev of scene.events ?? []) if (t >= ev.at && !done.has(ev)) { done.add(ev); try { await ev.fn(ctx, t); } catch (e) { console.log('event error', ev.at, String(e)); } }
    simTicks += rate(t) / FPS;
    const want = Math.floor(simTicks);
    if (want > stepped) {
      if (f > 0) await p.waitForTimeout(20); // ordens chegam antes do tick
      let n = want - stepped;
      while (n > 0) { const k = Math.min(n, 200); await step(k); n -= k; }
      stepped = want;
      await syncTo(p, startTick + stepped);
    }
    const dt = (1000 / FPS) * clientRate(t);
    if (!drawAt(t)) {
      await p.evaluate(([t, dt]) => { window.__recT = t; window.__camPose = window.__camFor(t, dt / 1000); window.__advanceNoRender(dt); }, [t, dt]);
      if (f % 48 === 0) console.log('skip', f, t.toFixed(1));
      continue;
    }
    await p.evaluate(([t, dt]) => { const rt = window.__runtime; window.__hideTags(); try { rt.territoryLayer.group.visible = false; } catch {} window.__recT = t; window.__camPose = window.__camFor(t, dt / 1000); window.__advance(dt); }, [t, dt]);
    if (shootAt(t)) await shot(cdp, `${OUT}/${String(f).padStart(5, '0')}.jpg`);
    if (f % 48 === 0) fs.writeFileSync(OUT + '/audio.json', JSON.stringify(await p.evaluate(() => window.__alog)));
    if (f % 24 === 0) console.log('frame', f, 't', t.toFixed(2), 'elapsed', ((Date.now() - t1) / 1000).toFixed(0) + 's');
  }
  const alog = await p.evaluate(() => window.__alog);
  fs.writeFileSync(OUT + '/audio.json', JSON.stringify(alog));
  console.log('done; audio events', alog.length, 'rej', JSON.stringify([...new Set(await p.evaluate(() => window.__rej))].slice(-8)));
  await b.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
