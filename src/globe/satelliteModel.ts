import * as THREE from 'three';

/**
 * Satélite do Programa Espacial no globo, no estilo dos satélites de comunicação reais: corpo cilíndrico com
 * manta térmica dourada, módulo de equipamentos com radiadores, antena parabólica grande voltada para a Terra (com o
 * alimentador sustentado por três hastes), duas asas de painéis solares em três segmentos com células, moldura e
 * treliça, propulsores, antenas auxiliares, um mastro longo de magnetômetro e luz de navegação piscando.
 *
 * Eixos: +Z aponta para a Terra (o objeto recebe `lookAt` no centro do globo), X ao longo das asas, Y "para cima".
 * Envergadura total ≈ 0,24 unidades (o raio do globo é 1).
 */
export interface SatelliteParts {
  root: THREE.Group;
  /** Asas solares: giram em torno de X acompanhando o Sol. */
  wings: THREE.Object3D[];
  /** Luz de navegação (pisca). */
  beacon: THREE.Mesh;
}

/** Células solares: retângulos azul-escuros com reflexo, separados por trilhas prateadas. */
function solarTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b8bec6';
  g.fillRect(0, 0, 256, 128);
  const cols = 8;
  const rows = 4;
  const cw = 256 / cols;
  const ch = 128 / rows;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = x * cw + 2;
      const py = y * ch + 2;
      const grd = g.createLinearGradient(px, py, px + cw, py + ch);
      grd.addColorStop(0, '#22406f');
      grd.addColorStop(0.55, '#0f2347');
      grd.addColorStop(1, '#1a3560');
      g.fillStyle = grd;
      g.fillRect(px, py, cw - 4, ch - 4);
      // linhas finas de contato de cada célula
      g.strokeStyle = 'rgba(160,180,210,0.25)';
      g.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        g.moveTo(px + ((cw - 4) * k) / 4, py);
        g.lineTo(px + ((cw - 4) * k) / 4, py + ch - 4);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(px, py + (ch - 4) / 2);
      g.lineTo(px + cw - 4, py + (ch - 4) / 2);
      g.stroke();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Manta térmica (MLI): dourado amassado, com dobras claras e escuras. */
function foilTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c99a3c';
  g.fillRect(0, 0, 128, 128);
  // dobras determinísticas (sem Math.random: o visual é o mesmo para todos)
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 128;
    const y = rnd() * 128;
    const w = 6 + rnd() * 26;
    const h = 3 + rnd() * 10;
    const light = rnd() > 0.5;
    g.fillStyle = light ? `rgba(255,228,150,${0.25 + rnd() * 0.3})` : `rgba(90,60,15,${0.2 + rnd() * 0.3})`;
    g.beginPath();
    g.ellipse(x, y, w, h, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Haste fina entre dois pontos. */
function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

export function buildSatellite(): SatelliteParts {
  const root = new THREE.Group();
  const foil = new THREE.MeshStandardMaterial({ map: foilTexture(), color: '#ffffff', metalness: 0.85, roughness: 0.32 });
  const silver = new THREE.MeshStandardMaterial({ color: '#cfd4da', metalness: 0.8, roughness: 0.28 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#4a4f57', metalness: 0.7, roughness: 0.45 });
  const white = new THREE.MeshStandardMaterial({ color: '#eef0f2', metalness: 0.15, roughness: 0.5, side: THREE.DoubleSide });
  const radiator = new THREE.MeshStandardMaterial({ color: '#f4f6f8', metalness: 0.4, roughness: 0.2 });

  // --- corpo: cilindro com manta dourada, anéis prateados e tampas
  const busLen = 0.04;
  const busR = 0.013;
  const bus = new THREE.Mesh(new THREE.CylinderGeometry(busR, busR, busLen, 16), foil);
  bus.rotation.x = Math.PI / 2;
  root.add(bus);
  for (const z of [-busLen / 2, -busLen / 6, busLen / 6, busLen / 2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(busR * 1.02, 0.0012, 6, 20), silver);
    ring.position.z = z;
    root.add(ring);
  }
  for (const z of [-busLen / 2 - 0.002, busLen / 2 + 0.002]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(busR * 0.92, busR * 0.92, 0.004, 16), darkMetal);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = z;
    root.add(cap);
  }

  // --- módulo de equipamentos com radiadores brancos (lado de cima) e caixas de eletrônica
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.022), silver);
  box.position.set(0, busR + 0.005, -0.004);
  root.add(box);
  const rad = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.0012, 0.024), radiator);
  rad.position.set(0, busR + 0.0115, -0.004);
  root.add(rad);
  for (const [x, z] of [
    [-0.012, 0.01],
    [0.012, -0.012],
  ] as const) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.007, 0.009), foil);
    e.position.set(x, busR - 0.002, z);
    root.add(e);
  }
  // tanques de combustível esféricos meio expostos na lateral de baixo
  for (const z of [-0.01, 0.006]) {
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 12, 8), silver);
    tank.position.set(0, -busR + 0.001, z);
    root.add(tank);
  }

  // --- antena parabólica grande voltada para a Terra (+Z)
  const dishR = 0.026;
  const depth = 0.009;
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const r = (i / 12) * dishR;
    prof.push(new THREE.Vector2(r, (r * r) / ((dishR * dishR) / depth)));
  }
  const dish = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), white);
  // a lathe cresce em +Y: gira para abrir em direção a +Z (a Terra)
  dish.rotation.x = Math.PI / 2;
  const dishZ = busLen / 2 + 0.012;
  dish.position.z = dishZ;
  root.add(dish);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(dishR, 0.0009, 6, 32), silver);
  rim.position.z = dishZ + depth;
  root.add(rim);
  // estrutura de reforço atrás do refletor: cubo central, anel e seis escoras
  const k = (dishR * dishR) / depth;
  const ringR = dishR * 0.6;
  const ringZ = dishZ + (ringR * ringR) / k - 0.0012;
  const backRing = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.0006, 6, 24), silver);
  backRing.position.z = ringZ;
  root.add(backRing);
  const hub = new THREE.Vector3(0, 0, dishZ - 0.004);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    root.add(rod(hub, new THREE.Vector3(Math.cos(a) * ringR, Math.sin(a) * ringR, ringZ), 0.0005, silver));
  }
  // suporte entre o corpo e a antena
  root.add(rod(new THREE.Vector3(0, 0, busLen / 2), new THREE.Vector3(0, 0, dishZ + 0.0005), 0.0035, darkMetal));
  // alimentador no foco, preso por três hastes na borda
  const focus = new THREE.Vector3(0, 0, dishZ + depth + 0.016);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.0035, 0.007, 10, 1, true), silver);
  horn.rotation.x = -Math.PI / 2;
  horn.position.copy(focus);
  root.add(horn);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
    root.add(rod(new THREE.Vector3(Math.cos(a) * dishR * 0.95, Math.sin(a) * dishR * 0.95, dishZ + depth), focus, 0.0004, darkMetal));
  }

  // --- asas solares: braço (treliça) e três segmentos com moldura, que giram juntos em X
  const wings: THREE.Object3D[] = [];
  const cellMat = new THREE.MeshStandardMaterial({ map: solarTexture(), metalness: 0.55, roughness: 0.25, emissive: '#06122a' });
  const backMat = new THREE.MeshStandardMaterial({ color: '#8a9099', metalness: 0.6, roughness: 0.5 });
  const segW = 0.028;
  const segH = 0.022;
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * busR, 0, -0.004);
    // braço com duas longarinas e travessas em X
    const armLen = 0.016;
    for (const y of [-0.0025, 0.0025]) wing.add(rod(new THREE.Vector3(0, y, 0), new THREE.Vector3(side * armLen, y * 2.4, 0), 0.0006, silver));
    wing.add(rod(new THREE.Vector3(0, -0.0025, 0), new THREE.Vector3(side * armLen, 0.006, 0), 0.0004, silver));
    wing.add(rod(new THREE.Vector3(0, 0.0025, 0), new THREE.Vector3(side * armLen, -0.006, 0), 0.0004, silver));
    // articulação (motor de giro) na base do braço
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.004, 10), darkMetal);
    joint.rotation.z = Math.PI / 2;
    wing.add(joint);
    for (let i = 0; i < 3; i++) {
      const cx = side * (armLen + segW / 2 + i * (segW + 0.0015));
      // face com células (frente) e verso cinza
      const panel = new THREE.Mesh(new THREE.BoxGeometry(segW, segH, 0.0007), [backMat, backMat, backMat, backMat, cellMat, backMat]);
      panel.position.x = cx;
      wing.add(panel);
      // moldura
      for (const y of [-segH / 2, segH / 2]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.0009, 0.0012), silver);
        bar.position.set(cx, y, 0);
        wing.add(bar);
      }
      for (const dx of [-segW / 2, segW / 2]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.0009, segH, 0.0012), silver);
        bar.position.set(cx + dx, 0, 0);
        wing.add(bar);
      }
      // dobradiça entre segmentos
      if (i < 2) {
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, segH * 0.8, 6), darkMetal);
        hinge.position.set(cx + side * (segW / 2 + 0.00075), 0, 0);
        wing.add(hinge);
      }
    }
    root.add(wing);
    wings.push(wing);
  }

  // --- propulsores na traseira (−Z): bocal principal e quatro de manobra
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.006, 0.008, 12, 1, true), darkMetal);
  nozzle.rotation.x = -Math.PI / 2;
  nozzle.position.z = -busLen / 2 - 0.008;
  root.add(nozzle);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.0018, 0.004, 8), darkMetal);
    t.position.set(Math.cos(a) * busR * 0.85, Math.sin(a) * busR * 0.85, -busLen / 2 - 0.003);
    t.rotation.x = Math.PI / 2;
    root.add(t);
  }

  // --- antenas auxiliares: duas pequenas parabólicas, antena de chicote e mastro longo do magnetômetro
  for (const side of [-1, 1]) {
    const small = new THREE.Mesh(new THREE.SphereGeometry(0.006, 14, 6, 0, Math.PI * 2, 0, Math.PI / 3), white);
    small.position.set(side * 0.009, -busR - 0.004, 0.01);
    small.rotation.x = Math.PI;
    root.add(small);
    root.add(rod(new THREE.Vector3(side * 0.006, -busR, 0.01), small.position.clone(), 0.0005, silver));
  }
  root.add(rod(new THREE.Vector3(-0.005, busR + 0.012, -0.012), new THREE.Vector3(-0.012, busR + 0.04, -0.02), 0.0004, silver));
  const boomEnd = new THREE.Vector3(0.03, busR + 0.05, -0.07);
  root.add(rod(new THREE.Vector3(0.004, busR + 0.006, -0.014), boomEnd, 0.0005, silver));
  const sensor = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.005, 8), darkMetal);
  sensor.position.copy(boomEnd);
  root.add(sensor);

  // --- luz de navegação
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b30' }));
  beacon.position.set(0, busR + 0.014, -0.016);
  root.add(beacon);

  // leve inclinação, como na foto (o satélite não fica perfeitamente alinhado à câmera)
  root.rotation.z = 0.12;
  return { root, wings, beacon };
}
