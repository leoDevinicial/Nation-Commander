import * as THREE from 'three';
import { eraAccentMaterial } from '../materials.ts';
import { sharedGeometry, sharedMaterial } from '../palette.ts';

/**
 * Drone de vigilância (era Futuro Próximo, sobre o QG): casco facetado cinza-grafite com placas, escotilha e faixas
 * claras, câmera frontal com três lentes, quatro braços com luz de posição e rotores de três pás dentro de protetores
 * octogonais (anel de segmentos com braçadeiras). As pás giram dentro de `rotors`; um disco translúcido dá a sensação
 * de movimento sem o efeito estroboscópico.
 *
 * Eixos: +Z é a frente (a câmera), Y para cima. Envergadura ≈ 1,1 (escala do mapa).
 */
export interface DroneParts {
  group: THREE.Group;
  /** Grupos das pás (giram em Y). */
  rotors: THREE.Object3D[];
  /** Discos de movimento das pás (um por rotor). */
  blurs: THREE.Mesh[];
}

const hull = () => sharedMaterial('drone-hull', () => new THREE.MeshStandardMaterial({ color: '#454b52', roughness: 0.55, metalness: 0.55 }));
const plate = () => sharedMaterial('drone-plate', () => new THREE.MeshStandardMaterial({ color: '#565d66', roughness: 0.45, metalness: 0.6 }));
const black = () => sharedMaterial('drone-black', () => new THREE.MeshStandardMaterial({ color: '#16191c', roughness: 0.4, metalness: 0.5 }));
const metal = () => sharedMaterial('drone-metal', () => new THREE.MeshStandardMaterial({ color: '#c9ced3', roughness: 0.25, metalness: 0.9 }));
const stripe = () => sharedMaterial('drone-stripe', () => new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.5, metalness: 0.2 }));
const glass = () =>
  sharedMaterial('drone-glass', () => new THREE.MeshStandardMaterial({ color: '#0a1016', roughness: 0.05, metalness: 0.9, emissive: '#0d2233', emissiveIntensity: 0.6 }));
const led = () => sharedMaterial('drone-led', () => new THREE.MeshBasicMaterial({ color: '#e8f4ff' }));
const blurMat = () =>
  sharedMaterial('drone-blur', () => new THREE.MeshBasicMaterial({ color: '#2a2f35', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = false): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

const box = (k: string, w: number, h: number, d: number) => sharedGeometry(`drone-box-${k}`, () => new THREE.BoxGeometry(w, h, d));

/** Casco: seção hexagonal achatada (laterais chanfradas), extrudada ao longo de Z, com a frente mais estreita. */
function hullGeometry(): THREE.BufferGeometry {
  return sharedGeometry('drone-hull', () => {
    const w = 0.15;
    const h = 0.055;
    const s = new THREE.Shape();
    s.moveTo(-w * 0.62, h);
    s.lineTo(w * 0.62, h);
    s.lineTo(w, h * 0.25);
    s.lineTo(w * 0.85, -h);
    s.lineTo(-w * 0.85, -h);
    s.lineTo(-w, h * 0.25);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.56, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1 });
    g.translate(0, 0, -0.28);
    // afina a frente (+Z) para o nariz da câmera
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (z > 0.12) {
        const k = 1 - ((z - 0.12) / 0.17) * 0.28;
        p.setX(i, p.getX(i) * k);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Protetor octogonal (10 lados): segmentos retos com braçadeiras alternadas. */
function guard(parent: THREE.Object3D, r: number): void {
  const n = 10;
  const seg = 2 * r * Math.sin(Math.PI / n);
  const segGeo = box('guard-seg', seg * 1.02, 0.03, 0.017);
  const clampGeo = box('guard-clamp', 0.042, 0.04, 0.028);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const m = add(parent, segGeo, hull(), Math.cos(a) * r * Math.cos(Math.PI / n), 0, Math.sin(a) * r * Math.cos(Math.PI / n));
    m.rotation.y = -a + Math.PI / 2;
    if (i % 2 === 0) {
      const b = (i / n) * Math.PI * 2;
      const c = add(parent, clampGeo, black(), Math.cos(b) * r, 0, Math.sin(b) * r);
      c.rotation.y = -b;
    }
    // faixa clara em dois segmentos (como na referência)
    if (i === 2 || i === 7) {
      const s = add(parent, box('guard-stripe', seg * 0.35, 0.032, 0.019), stripe(), Math.cos(a) * r * Math.cos(Math.PI / n), 0, Math.sin(a) * r * Math.cos(Math.PI / n));
      s.rotation.y = -a + Math.PI / 2;
    }
  }
}

export function buildDrone(owner: number): DroneParts {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const rotors: THREE.Object3D[] = [];
  const blurs: THREE.Mesh[] = [];

  // --- casco, placas de cima, escotilha e faixas
  add(group, hullGeometry(), hull(), 0, 0, 0, true);
  add(group, box('top-plate', 0.17, 0.012, 0.3), plate(), 0, 0.068, -0.02);
  add(group, box('hatch', 0.08, 0.008, 0.13), black(), 0, 0.077, 0.02);
  add(group, box('hatch-b', 0.05, 0.006, 0.04), black(), 0, 0.075, -0.12);
  for (const s of [-1, 1]) {
    const st = add(group, box('hull-stripe', 0.012, 0.01, 0.14), stripe(), s * 0.075, 0.068, 0.12);
    st.rotation.y = s * 0.35;
    add(group, box('side-vent', 0.006, 0.03, 0.12), black(), s * 0.152, 0.005, -0.06);
  }
  // faixa da facção na traseira
  add(group, box('tail-accent', 0.12, 0.014, 0.012), eraAccentMaterial(owner, 4), 0, 0.03, -0.295);

  // --- câmera frontal: bloco escuro com três lentes
  add(group, box('cam', 0.13, 0.1, 0.07), black(), 0, -0.03, 0.31);
  const lensBig = sharedGeometry('drone-lens-big', () => new THREE.CylinderGeometry(0.028, 0.028, 0.02, 16).rotateX(Math.PI / 2));
  const lensSmall = sharedGeometry('drone-lens-small', () => new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12).rotateX(Math.PI / 2));
  add(group, lensBig, glass(), -0.022, -0.045, 0.35);
  add(group, lensSmall, glass(), 0.03, -0.015, 0.35);
  add(group, lensSmall, glass(), 0.03, -0.06, 0.35);
  add(
    group,
    sharedGeometry('drone-lens-ring', () => new THREE.TorusGeometry(0.03, 0.004, 6, 16)),
    metal(),
    -0.022,
    -0.045,
    0.358,
  );

  // --- braços, motores, pás e protetores
  const span = 0.42;
  const reach = [
    [span, 0.2],
    [-span, 0.2],
    [span, -0.22],
    [-span, -0.22],
  ] as const;
  const ringR = 0.2;
  // pá afilada: raiz estreita, alarga no meio e termina em ponta arredondada (como a de um drone real)
  const bladeGeo = sharedGeometry('drone-blade', () => {
    const b = new THREE.Shape();
    b.moveTo(0.015, -0.012);
    b.quadraticCurveTo(0.07, -0.03, 0.14, -0.022);
    b.quadraticCurveTo(0.178, -0.016, 0.176, 0.002);
    b.quadraticCurveTo(0.17, 0.016, 0.13, 0.016);
    b.quadraticCurveTo(0.07, 0.018, 0.015, 0.01);
    b.closePath();
    const g = new THREE.ExtrudeGeometry(b, { depth: 0.004, bevelEnabled: false, curveSegments: 6 });
    // o contorno fica no plano XZ (a pá deita), com a espessura em Y
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.002, 0);
    return g;
  });
  for (const [x, z] of reach) {
    const sx = Math.sign(x);
    // braço robusto do casco ao motor, com luz de posição em cima
    const jx = sx * 0.13;
    const jz = z * 0.45;
    const dx = x - jx;
    const dz = z - jz;
    const arm = add(group, box('arm', 1, 0.045, 0.055), hull(), (jx + x) / 2, 0.01, (jz + z) / 2);
    arm.scale.x = Math.hypot(dx, dz);
    arm.rotation.y = -Math.atan2(dz, dx);
    add(group, box('arm-joint', 0.07, 0.06, 0.08), plate(), jx + sx * 0.02, 0.01, jz);
    const l = add(group, box('arm-led', 0.035, 0.012, 0.016), led(), jx + dx * 0.35, 0.038, jz + dz * 0.35);
    l.rotation.y = arm.rotation.y;
    const pod = new THREE.Group();
    pod.position.set(x, 0.03, z);
    group.add(pod);
    // motor: cilindro escuro, anel e tampa metálica
    add(
      pod,
      sharedGeometry('drone-motor', () => new THREE.CylinderGeometry(0.035, 0.04, 0.07, 14)),
      black(),
      0,
      0,
      0,
      true,
    );
    add(
      pod,
      sharedGeometry('drone-motor-ring', () => new THREE.CylinderGeometry(0.043, 0.043, 0.014, 14)),
      plate(),
      0,
      -0.02,
      0,
    );
    // três escoras do motor até o protetor
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + (sx > 0 ? 0.3 : -0.3);
      const strut = add(pod, box('strut', ringR, 0.016, 0.022), hull(), (Math.cos(a) * ringR) / 2, -0.03, (Math.sin(a) * ringR) / 2);
      strut.rotation.y = -a;
    }
    const g = new THREE.Group();
    g.position.y = -0.005;
    guard(g, ringR);
    pod.add(g);
    // pás e cubo
    const rotor = new THREE.Group();
    rotor.position.y = 0.045;
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(bladeGeo, black());
      b.rotation.y = (k / 3) * Math.PI * 2;
      // passo da pá (leve torção)
      b.rotation.x = 0.12;
      rotor.add(b);
    }
    add(
      rotor,
      sharedGeometry('drone-hub', () => new THREE.CylinderGeometry(0.022, 0.026, 0.02, 14)),
      metal(),
      0,
      0.012,
      0,
    );
    add(
      rotor,
      sharedGeometry('drone-hub-cap', () => new THREE.SphereGeometry(0.016, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
      metal(),
      0,
      0.022,
      0,
    );
    pod.add(rotor);
    rotors.push(rotor);
    // disco de movimento (as pás em alta rotação)
    const blur = add(
      pod,
      sharedGeometry('drone-blur', () => new THREE.CircleGeometry(0.18, 32).rotateX(-Math.PI / 2)),
      blurMat(),
      0,
      0.046,
      0,
    );
    blurs.push(blur);
  }
  return { group, rotors, blurs };
}
