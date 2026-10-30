import { C, layers, type ModelLayers, type PartBuilder } from './kit.ts';
import { railing, strut } from './rigging.ts';
import type { BuildingModel, ModelAnim } from './buildingModels.ts';

/**
 * Instalações de comércio (Fase 6): terminal comercial (escritório, pátio de contêineres e
 * empilhadeira de contêiner), porto (cais com defensas e cabeços, portêiner com carro que corre
 * pela lança, armazém portuário) e estação ferroviária (plataforma coberta, linhas com dormentes,
 * prédio da estação, sinal e vagões). Também os veículos de carga desenhados no mapa.
 */

type Built = Omit<BuildingModel, 'detail'>;
type V3 = [number, number, number];

const CONTAINER_COLORS = ['#a8432f', '#2f5f8a', '#3f7a46', '#c99a2e', '#6b6f75', '#8a3f6a'];

/** Contêiner com nervuras (comprimento ao longo de x). */
export function box20(b: PartBuilder, pos: V3, color: string, len = 0.6): void {
  const [x, y, z] = pos;
  b.box(len, 0.26, 0.26, color, [x, y + 0.13, z]);
  for (let i = 1; i < 5; i++) b.box(0.012, 0.24, 0.27, color, [x - len / 2 + (i * len) / 5, y + 0.13, z]);
  for (const s of [-1, 1]) b.box(0.02, 0.27, 0.27, '#2b2d30', [x + (s * len) / 2, y + 0.13, z]);
}

function containerStack(b: PartBuilder, x: number, z: number, rows: number, cols: number, tiers: number, seed: number): void {
  let k = seed;
  for (let t = 0; t < tiers; t++)
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        k = (k * 31 + 7) % 97;
        if (t > 0 && k % 4 === 0) continue;
        box20(b, [x + c * 0.64, 0.06 + t * 0.27, z + r * 0.29], CONTAINER_COLORS[k % CONTAINER_COLORS.length]!);
      }
}

// ------------------------------------------------------------------ terminal comercial

export function buildMarketModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.9, 0.06, 3.9, C.asphalt, [0, 0.03, 0]);
  for (let i = 0; i < 5; i++) b.box(0.05, 0.012, 0.7, '#d9d8d0', [-1.6 + i * 0.4, 0.065, 1.45]); // vagas de caminhão
  // escritório de despacho com fachada de vidro e marquise
  b.box(1.4, 0.75, 0.9, '#cfd2d0', [-1.1, 0.43, -1.3]);
  g.box(1.2, 0.3, 0.02, '#ffffff', [-1.1, 0.55, -0.845]);
  b.box(1.5, 0.05, 1.0, C.roof, [-1.1, 0.83, -1.3]);
  b.box(0.7, 0.04, 0.35, C.metal, [-1.1, 0.42, -0.7]);
  a.box(1.0, 0.12, 0.02, '#ffffff', [-1.1, 0.7, -0.843]);
  b.box(0.36, 0.2, 0.28, C.steel, [-0.7, 0.96, -1.4]);
  // balança rodoviária e cancela
  b.box(0.9, 0.04, 0.42, '#7d8288', [-0.95, 0.08, 0.15]);
  b.box(0.18, 0.3, 0.18, '#d9d8d0', [-1.55, 0.2, 0.15]);
  g.box(0.02, 0.1, 0.12, '#ffffff', [-1.455, 0.25, 0.15]);
  b.box(0.8, 0.03, 0.03, C.red, [-1.1, 0.32, 0.45]);
  // pátio de contêineres
  containerStack(b, 0.35, -1.55, 3, 3, 3, 5);
  containerStack(b, 0.35, -0.3, 2, 3, 2, 11);
  // empilhadeira de contêiner (reach stacker)
  b.box(0.55, 0.22, 0.3, C.yellow, [1.2, 0.25, 0.75]);
  for (const s of [-1, 1]) for (const dx of [-0.18, 0.18]) b.cyl(0.09, 0.09, 0.06, C.rubber, [1.2 + dx, 0.15, 0.75 + s * 0.16], [Math.PI / 2, 0, 0], 8);
  b.box(0.18, 0.2, 0.2, '#2a3a44', [1.05, 0.46, 0.75]);
  strut(b, [1.3, 0.4, 0.75], [0.75, 0.9, 0.75], 0.07, C.yellow);
  b.box(0.08, 0.06, 0.34, '#2b2d30', [0.72, 0.86, 0.75]);
  box20(b, [0.72, 0.56, 0.75], CONTAINER_COLORS[1]!, 0.56);
  // poste de iluminação e faixa da nação no portão
  strut(b, [1.75, 0.06, 1.75], [1.75, 1.4, 1.75], 0.05, C.steel, true);
  b.box(0.3, 0.05, 0.1, '#f2e6a0', [1.62, 1.4, 1.75]);
  a.box(0.6, 0.18, 0.02, '#ffffff', [-1.1, 0.95, -0.82]);
  return { base: l.build(), moving: null, height: 1.5 };
}

// ------------------------------------------------------------------ porto

export function buildPortModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  // pátio do cais (a margem da água fica do lado +z do modelo — o porto é girado pelo jogo)
  b.box(3.9, 0.18, 3.9, '#8d8a82', [0, 0.09, 0]);
  b.box(3.9, 0.2, 0.25, '#6f6c66', [0, 0.1, 1.83]); // muro do cais
  for (let i = 0; i < 6; i++) {
    b.box(0.22, 0.16, 0.06, '#1d1d1d', [-1.6 + i * 0.64, 0.12, 1.98]); // defensas
    b.cyl(0.05, 0.06, 0.1, '#2b2d30', [-1.6 + i * 0.64, 0.23, 1.78], undefined, 8); // cabeços
  }
  for (let i = 0; i < 10; i++) b.box(0.18, 0.012, 0.04, C.yellow, [-1.75 + i * 0.4, 0.185, 1.6]);
  // trilhos do portêiner
  for (const z of [0.9, 1.6]) b.box(3.8, 0.02, 0.04, C.metal, [0, 0.19, z]);
  // armazém portuário e contêineres
  b.box(1.5, 0.75, 1.0, '#9ca2a8', [-1.1, 0.55, -1.35]);
  b.gable(1.6, 1.1, 0.3, C.roof, [-1.1, 0.93, -1.35]);
  for (let i = 0; i < 8; i++) b.box(0.012, 0.74, 1.01, '#878d93', [-1.8 + i * 0.2, 0.55, -1.35]);
  b.box(0.5, 0.5, 0.03, C.metalDark, [-1.1, 0.43, -0.84]);
  a.box(0.8, 0.12, 0.02, '#ffffff', [-1.1, 0.86, -0.84]);
  containerStack(b, 0.4, -1.6, 2, 3, 2, 3);
  containerStack(b, 0.55, -0.45, 2, 2, 1, 9);
  // guarita
  b.box(0.3, 0.32, 0.3, '#d9d8d0', [-1.65, 0.34, 0.3]);
  g.box(0.31, 0.1, 0.2, '#ffffff', [-1.65, 0.4, 0.3]);

  // portêiner (estrutura fixa) e carro que corre pela lança até sobre a água
  const px = 0.6;
  for (const x of [px - 0.45, px + 0.45]) {
    for (const z of [0.9, 1.6]) strut(b, [x, 0.2, z], [x, 1.7, z], 0.08, '#c8402f');
    strut(b, [x, 1.0, 0.9], [x, 1.0, 1.6], 0.06, '#c8402f');
    strut(b, [x, 0.25, 0.9], [x, 1.55, 1.6], 0.035, '#c8402f');
  }
  for (const z of [0.9, 1.6]) strut(b, [px - 0.45, 1.7, z], [px + 0.45, 1.7, z], 0.07, '#c8402f');
  b.box(0.12, 0.1, 2.9, '#c8402f', [px - 0.12, 1.78, 1.25]); // lança (sai sobre a água)
  b.box(0.12, 0.1, 2.9, '#c8402f', [px + 0.12, 1.78, 1.25]);
  b.box(0.5, 0.3, 0.4, '#d9d8d0', [px, 1.98, 0.35]); // casa de máquinas
  g.box(0.51, 0.1, 0.2, '#ffffff', [px, 2.0, 0.35]);
  const trolley = layers();
  trolley.body.box(0.34, 0.12, 0.22, '#3a3d40', [0, 0, 0]);
  trolley.glass.box(0.12, 0.08, 0.2, '#ffffff', [0.12, -0.06, 0]);
  strut(trolley.body, [0, -0.05, 0.05], [0, -0.75, 0.05], 0.01, '#26282b', true);
  strut(trolley.body, [0, -0.05, -0.05], [0, -0.75, -0.05], 0.01, '#26282b', true);
  trolley.body.box(0.4, 0.05, 0.2, C.yellow, [0, -0.78, 0]);
  box20(trolley.body, [0, -1.07, 0], CONTAINER_COLORS[0]!, 0.56);
  const anims: ModelAnim[] = [{ layers: trolley.build(), pivot: [px, 1.7, 0.6], motion: { kind: 'shuttle', dir: [0, 0, 1], length: 1.7, speed: 0.5 } }];
  return { base: l.build(), moving: null, anims, height: 2.3 };
}

// ------------------------------------------------------------------ estação ferroviária

function track(b: PartBuilder, z: number, x0: number, x1: number): void {
  for (let x = x0; x <= x1; x += 0.2) b.box(0.07, 0.03, 0.42, C.woodDark, [x, 0.08, z]);
  for (const s of [-1, 1]) b.box(x1 - x0 + 0.1, 0.035, 0.03, C.steel, [(x0 + x1) / 2, 0.11, z + s * 0.14]);
}

/** Vagão (comprimento ao longo de x). */
export function wagon(b: PartBuilder, x: number, y: number, z: number, kind: 'box' | 'tank' | 'loco', color: string): void {
  b.box(0.82, 0.06, 0.3, '#2b2d30', [x, y + 0.14, z]);
  for (const dx of [-0.28, 0.28]) for (const s of [-1, 1]) b.cyl(0.06, 0.06, 0.03, '#1d1d1d', [x + dx, y + 0.08, z + s * 0.13], [Math.PI / 2, 0, 0], 8);
  if (kind === 'tank') {
    b.cyl(0.14, 0.14, 0.76, color, [x, y + 0.32, z], [0, 0, Math.PI / 2], 10);
    b.cyl(0.05, 0.05, 0.06, '#2b2d30', [x, y + 0.48, z], undefined, 6);
  } else if (kind === 'loco') {
    b.box(0.82, 0.32, 0.3, color, [x, y + 0.33, z]);
    b.box(0.2, 0.12, 0.31, '#2a3a44', [x + 0.28, y + 0.42, z]);
    b.box(0.5, 0.04, 0.26, '#3a3d40', [x - 0.1, y + 0.51, z]);
  } else {
    b.box(0.8, 0.3, 0.3, color, [x, y + 0.32, z]);
    b.box(0.2, 0.26, 0.31, '#3a3d40', [x, y + 0.31, z]);
  }
}

export function buildRailStationModel(): Built {
  const l = layers();
  const { body: b, accent: a, glass: g } = l;
  b.box(3.9, 0.06, 3.9, '#6f6a60', [0, 0.03, 0]);
  b.box(3.9, 0.04, 1.6, '#8a8478', [0, 0.065, 0.95]); // lastro de brita
  track(b, 0.55, -1.85, 1.85);
  track(b, 1.35, -1.85, 1.85);
  // plataforma com cobertura e pilares
  b.box(3.4, 0.18, 0.5, C.concrete, [0, 0.12, -0.05]);
  b.box(3.4, 0.02, 0.06, C.yellow, [0, 0.215, 0.18]);
  for (let i = 0; i < 5; i++) b.box(0.05, 0.6, 0.05, C.metalDark, [-1.5 + i * 0.75, 0.5, -0.12]);
  b.box(3.5, 0.04, 0.62, C.roof, [0, 0.82, -0.02], [0.08, 0, 0]);
  // prédio da estação com relógio e janelas
  b.box(1.6, 0.8, 0.8, '#c9b89a', [-0.6, 0.46, -1.15]);
  b.gable(1.7, 0.95, 0.35, C.roofRed, [-0.6, 0.86, -1.15]);
  for (const x of [-1.15, -0.85, -0.35, -0.05]) g.box(0.18, 0.28, 0.02, '#ffffff', [x, 0.52, -0.745]);
  b.box(0.26, 0.42, 0.03, C.woodDark, [-0.6, 0.27, -0.745]);
  b.cyl(0.11, 0.11, 0.03, '#f0eee6', [-0.6, 0.75, -0.73], [Math.PI / 2, 0, 0], 12);
  a.box(0.8, 0.1, 0.02, '#ffffff', [-0.6, 0.66, -0.742]);
  // pátio de carga: guindaste de pórtico e carga paletizada
  for (const x of [0.75, 1.75]) for (const z of [-1.7, -0.6]) strut(b, [x, 0.06, z], [x, 0.95, z], 0.06, C.yellow);
  for (const z of [-1.7, -0.6]) strut(b, [0.75, 0.95, z], [1.75, 0.95, z], 0.06, C.yellow);
  b.box(0.25, 0.12, 1.2, C.yellow, [1.25, 0.98, -1.15]);
  containerStack(b, 0.95, -1.5, 2, 1, 2, 7);
  // sinal ferroviário
  strut(b, [1.85, 0.06, 0.15], [1.85, 0.8, 0.15], 0.03, C.metalDark, true);
  b.box(0.08, 0.2, 0.06, '#1d1d1d', [1.85, 0.8, 0.15]);
  b.sphere(0.025, C.red, [1.85, 0.85, 0.18]);
  b.sphere(0.025, '#3fbf5a', [1.85, 0.76, 0.18]);
  // composição estacionada na linha 2
  wagon(b, -1.2, 0.06, 1.35, 'loco', '#2f5f8a');
  wagon(b, -0.3, 0.06, 1.35, 'box', '#8a4b32');
  wagon(b, 0.6, 0.06, 1.35, 'tank', '#2b2d30');
  railing(b, [1.95, -1.9], [1.95, -0.3], 0.06, 0.3, '#8d9196', 3);
  return { base: l.build(), moving: null, height: 1.3 };
}

// ------------------------------------------------------------------ veículos de carga (mapa)

/** Modelo de um veículo de carga por modal (frente para +x), em escala do mapa. */
export function cargoVehicle(mode: 'road' | 'rail' | 'sea' | 'air' | 'caravan'): ModelLayers {
  const l = layers();
  if (mode === 'caravan') {
    boxTruck(l);
    return l.build();
  }
  const { body: b, glass: g, accent: a } = l;
  if (mode === 'road') {
    semiTruck(l);
  } else if (mode === 'rail') {
    wagon(b, 0.45, 0, 0, 'loco', '#2f5f8a');
    wagon(b, -0.45, 0, 0, 'box', '#8a4b32');
    wagon(b, -1.35, 0, 0, 'tank', '#2b2d30');
    wagon(b, -2.25, 0, 0, 'box', '#3f7a46');
    a.box(0.02, 0.1, 0.24, '#ffffff', [0.87, 0.36, 0]);
  } else if (mode === 'sea') {
    // navio porta-contêineres: casco, superestrutura e pilhas no convés
    b.side(
      [
        [-1.6, 0],
        [1.3, 0],
        [1.75, 0.35],
        [-1.7, 0.35],
      ],
      0.75,
      '#2b3440',
      [0, -0.05, 0],
    );
    b.box(3.2, 0.04, 0.7, '#a8432f', [0, -0.03, 0]);
    b.box(0.5, 0.55, 0.62, '#e6e6e0', [-1.25, 0.6, 0]);
    g.box(0.51, 0.08, 0.6, '#ffffff', [-1.25, 0.78, 0]);
    b.cyl(0.06, 0.07, 0.3, '#2b2d30', [-1.4, 1.0, 0], undefined, 8);
    for (let i = 0; i < 4; i++) for (const z of [-0.15, 0.15]) box20(b, [-0.6 + i * 0.55, 0.32, z], CONTAINER_COLORS[(i * 2 + (z > 0 ? 1 : 0)) % CONTAINER_COLORS.length]!, 0.5);
    a.box(0.3, 0.12, 0.02, '#ffffff', [-1.25, 0.6, 0.315]);
  } else {
    // helicóptero de carga com contêiner no gancho
    b.box(0.9, 0.3, 0.32, '#4f5a50', [0, 0.9, 0]);
    g.box(0.2, 0.18, 0.3, '#ffffff', [0.42, 0.95, 0]);
    b.box(0.9, 0.08, 0.08, '#4f5a50', [-0.85, 0.98, 0]);
    b.box(0.04, 0.22, 0.04, '#4f5a50', [-1.28, 1.06, 0]);
    b.cyl(0.9, 0.9, 0.02, '#26282b', [0, 1.12, 0], undefined, 12); // rotor (disco translúcido no material comum)
    strut(b, [0, 0.75, 0], [0, 0.35, 0], 0.012, '#26282b', true);
    box20(b, [0, 0.07, 0], CONTAINER_COLORS[2]!, 0.55);
    a.box(0.3, 0.06, 0.33, '#ffffff', [-0.2, 0.9, 0]);
  }
  return l.build();
}

// ------------------------------------------------------------------ caminhões (comboio e caravana)

type Layers = ReturnType<typeof layers>;

const TIRE = '#111211';
const HUB = '#b8bcc0';
const CHASSIS = '#26282b';
const LAMP = '#f3eed2';
const SIGNAL = '#e08a2a';
const TAIL = '#a3241c';

/** Roda com pneu, aro e cubo (eixo ao longo de z); `dual` desenha a roda dupla do eixo traseiro. */
function truckWheel(b: PartBuilder, x: number, z: number, r: number, dual = false): void {
  const s = Math.sign(z);
  const w = dual ? 0.22 : 0.15;
  b.cyl(r, r, w, TIRE, [x, r, z], [Math.PI / 2, 0, 0], 14);
  b.cyl(r * 0.58, r * 0.58, 0.02, HUB, [x, r, z + s * (w / 2 + 0.005)], [Math.PI / 2, 0, 0], 12);
  b.cyl(r * 0.2, r * 0.2, 0.03, '#6f747a', [x, r, z + s * (w / 2 + 0.02)], [Math.PI / 2, 0, 0], 8);
  if (dual) b.box(0.012, r * 1.6, 0.012, '#111', [x, r, z]);
}

/** Para-lama sobre a roda. */
function fender(b: PartBuilder, x: number, z: number, r: number, len = 0.55): void {
  b.box(len, 0.04, 0.22, CHASSIS, [x, r * 2 + 0.06, z]);
  b.box(0.04, 0.12, 0.22, CHASSIS, [x - len / 2, r * 2, z]);
}

/** Grade frontal com frisos horizontais (frente em `x`). */
function grille(b: PartBuilder, x: number, y: number, h: number, w: number, slats: number, color = '#2a2c2f', slat = '#9aa0a6'): void {
  b.box(0.03, h, w, color, [x, y, 0]);
  for (let i = 0; i < slats; i++) b.box(0.035, 0.018, w - 0.06, slat, [x + 0.005, y - h / 2 + ((i + 0.5) * h) / slats, 0]);
}

/**
 * Caravana interna: caminhão-baú de entregas (frente para +x), com a cabine na cor da nação,
 * para-choque com protetor, barra de faróis no teto, baú com faixas da nação e portas traseiras.
 * Do tamanho de um blindado leve (≈2,8 × 1,0 × 1,4).
 */
function boxTruck(l: Layers): void {
  const { body: b, accent: a, glass: g } = l;
  const r = 0.21;
  // chassi, rodas (dianteira simples, traseira dupla) e para-lamas
  b.box(2.55, 0.12, 0.7, CHASSIS, [-0.05, r + 0.14, 0]);
  for (const z of [-0.43, 0.43]) {
    truckWheel(b, 0.86, z, r);
    truckWheel(b, -0.78, z, r, true);
    fender(b, 0.86, z, r, 0.5);
    fender(b, -0.78, z, r, 0.56);
  }
  // cabine (perfil lateral) na cor da nação: capô curto, para-brisa inclinado e teto
  a.side(
    [
      [0.4, 0.42],
      [1.3, 0.42],
      [1.32, 0.66],
      [1.06, 0.72],
      [0.95, 1.12],
      [0.4, 1.14],
    ],
    1.0,
    '#ffffff',
  );
  b.box(0.92, 0.03, 1.01, '#d9dadc', [0.86, 0.43, 0]); // soleira clara
  b.box(0.34, 0.022, 0.9, '#ffffff', [1.18, 0.705, 0], [0, 0, -0.22]); // faixa clara no capô
  // vidros: para-brisa, janelas laterais e quebra-vento
  g.box(0.02, 0.4, 0.88, '#ffffff', [1.0, 0.93, 0], [0, 0, -0.26]);
  for (const s of [-1, 1]) {
    g.box(0.36, 0.26, 0.02, '#ffffff', [0.72, 0.92, s * 0.501]);
    g.box(0.08, 0.18, 0.02, '#ffffff', [0.95, 0.88, s * 0.501]);
    b.box(0.03, 0.42, 0.02, '#2a2c2f', [0.53, 0.82, s * 0.502]); // vão da porta
    b.box(0.06, 0.02, 0.02, '#c9cdd1', [0.6, 0.74, s * 0.505]); // maçaneta
    // retrovisor com braço
    b.box(0.14, 0.02, 0.02, '#2a2c2f', [1.0, 0.98, s * 0.56]);
    b.box(0.04, 0.17, 0.08, '#2a2c2f', [1.07, 0.95, s * 0.63]);
    // degrau
    b.box(0.22, 0.03, 0.08, '#3c4046', [0.62, 0.38, s * 0.52]);
  }
  // frente: grade, faróis duplos, piscas, para-choque e protetor de grade
  grille(b, 1.33, 0.55, 0.18, 0.6, 4);
  for (const s of [-1, 1]) {
    b.box(0.04, 0.09, 0.15, LAMP, [1.33, 0.58, s * 0.39]);
    b.box(0.04, 0.05, 0.09, SIGNAL, [1.33, 0.5, s * 0.41]);
  }
  b.box(0.1, 0.1, 1.02, '#9ea3a8', [1.38, 0.38, 0]);
  for (const z of [-0.3, 0, 0.3]) b.box(0.04, 0.26, 0.04, '#b8bcc0', [1.44, 0.53, z]);
  b.box(0.04, 0.04, 0.9, '#b8bcc0', [1.44, 0.66, 0]);
  // barra de faróis auxiliares no teto
  b.box(0.06, 0.06, 0.7, '#b8bcc0', [0.9, 1.2, 0]);
  for (const z of [-0.26, -0.1, 0.1, 0.26]) b.cyl(0.04, 0.04, 0.03, LAMP, [0.94, 1.2, z], [0, 0, Math.PI / 2], 10);
  // baú de carga com avanço sobre a cabine
  const bx0 = -1.4;
  const bx1 = 0.38;
  const bodyC = '#e6e4dd';
  b.box(bx1 - bx0, 0.9, 1.06, bodyC, [(bx0 + bx1) / 2, 0.96, 0]);
  b.box(0.3, 0.28, 1.06, bodyC, [bx1 + 0.15, 1.27, 0]); // avanço sobre o teto da cabine
  for (const s of [-1, 1]) {
    a.box(bx1 - bx0 + 0.3, 0.07, 0.01, '#ffffff', [(bx0 + bx1 + 0.3) / 2, 1.22, s * 0.536]); // faixa alta
    a.box(bx1 - bx0, 0.05, 0.01, '#ffffff', [(bx0 + bx1) / 2, 0.66, s * 0.536]); // faixa baixa
    b.box(bx1 - bx0, 0.04, 0.012, '#b7b5ad', [(bx0 + bx1) / 2, 0.52, s * 0.536]); // perfil inferior
  }
  a.box(bx1 - bx0 + 0.3, 0.012, 0.5, '#ffffff', [(bx0 + bx1 + 0.3) / 2, 1.415, 0]); // faixa no teto
  b.box(0.04, 0.88, 1.06, '#cfcdc5', [bx0 - 0.01, 0.96, 0]); // traseira
  b.box(0.045, 0.86, 0.015, '#9a988f', [bx0 - 0.02, 0.96, 0]); // divisão das portas
  for (const z of [-0.12, 0.12]) b.box(0.05, 0.5, 0.02, '#8f9399', [bx0 - 0.03, 0.94, z]); // trincos
  for (const s of [-1, 1]) {
    b.box(0.04, 0.1, 0.08, TAIL, [bx0 - 0.02, 0.6, s * 0.44]);
    b.box(0.04, 0.05, 0.08, SIGNAL, [bx0 - 0.02, 0.69, s * 0.44]);
  }
  b.box(0.08, 0.08, 0.9, '#3c4046', [bx0 - 0.02, 0.36, 0]); // para-choque traseiro
  // tanque de combustível e caixa de ferramentas sob o baú
  b.cyl(0.11, 0.11, 0.42, '#9aa0a6', [0.05, 0.33, 0.36], [0, 0, Math.PI / 2], 10);
  b.box(0.36, 0.18, 0.2, '#3c4046', [-0.25, 0.33, -0.36]);
}

/**
 * Comboio do comércio: cavalo mecânico de cabine avançada na cor da nação, com defletor no teto,
 * e carreta baú de três eixos (frente para +x). ≈4,7 × 1,0 × 1,6.
 */
function semiTruck(l: Layers): void {
  const { body: b, accent: a, glass: g } = l;
  const r = 0.21;
  // cavalo mecânico: chassi, eixo dianteiro e dois traseiros
  b.box(1.75, 0.12, 0.66, CHASSIS, [1.25, r + 0.14, 0]);
  for (const z of [-0.42, 0.42]) {
    truckWheel(b, 1.85, z, r);
    truckWheel(b, 0.92, z, r, true);
    truckWheel(b, 0.47, z, r, true);
    fender(b, 1.85, z, r, 0.48);
    b.box(0.95, 0.04, 0.24, CHASSIS, [0.7, r * 2 + 0.07, z]);
  }
  // cabine avançada (perfil) na cor da nação, com defletor de ar e para-sol
  a.side(
    [
      [1.38, 0.44],
      [2.17, 0.44],
      [2.19, 1.0],
      [2.12, 1.42],
      [1.38, 1.42],
    ],
    1.0,
    '#ffffff',
  );
  a.side(
    [
      [1.4, 1.42],
      [1.95, 1.42],
      [1.6, 1.68],
      [1.4, 1.7],
    ],
    0.9,
    '#ffffff',
  );
  b.box(0.06, 0.05, 1.0, '#2a2c2f', [2.15, 1.38, 0]); // para-sol
  b.box(0.82, 0.04, 1.01, '#2a2c2f', [1.79, 0.46, 0]); // faixa escura inferior
  g.box(0.02, 0.36, 0.9, '#ffffff', [2.17, 1.17, 0], [0, 0, -0.08]);
  for (const s of [-1, 1]) {
    g.box(0.3, 0.3, 0.02, '#ffffff', [1.93, 1.14, s * 0.501]);
    b.box(0.03, 0.62, 0.02, '#2a2c2f', [1.72, 0.85, s * 0.502]);
    b.box(0.06, 0.02, 0.02, '#c9cdd1', [1.78, 0.93, s * 0.505]);
    b.box(0.16, 0.02, 0.02, '#2a2c2f', [2.1, 1.2, s * 0.57]);
    b.box(0.04, 0.2, 0.08, '#2a2c2f', [2.18, 1.15, s * 0.64]);
    b.box(0.26, 0.03, 0.1, '#3c4046', [1.85, 0.6, s * 0.52]);
    b.box(0.26, 0.03, 0.1, '#3c4046', [1.85, 0.42, s * 0.52]); // degraus
    b.cyl(0.12, 0.12, 0.38, '#b8bcc0', [1.2, 0.36, s * 0.38], [0, 0, Math.PI / 2], 12); // tanques
  }
  grille(b, 2.2, 0.75, 0.32, 0.62, 6);
  for (const s of [-1, 1]) {
    b.box(0.04, 0.08, 0.17, LAMP, [2.2, 0.55, s * 0.36]);
    b.box(0.04, 0.08, 0.06, SIGNAL, [2.2, 0.55, s * 0.47]);
  }
  b.box(0.12, 0.14, 1.02, '#2a2c2f', [2.23, 0.42, 0]); // para-choque
  b.box(0.42, 0.04, 0.4, '#3c4046', [0.7, 0.62, 0]); // quinta roda
  b.cyl(0.04, 0.04, 0.5, '#9aa0a6', [1.32, 1.6, 0.38], undefined, 8); // escapamento
  // carreta baú
  const t0 = -2.55;
  const t1 = 1.25;
  b.box(t1 - t0, 0.08, 0.6, CHASSIS, [(t0 + t1) / 2, 0.6, 0]);
  b.box(t1 - t0, 1.0, 1.04, '#d8d2c4', [(t0 + t1) / 2, 1.16, 0]);
  for (const s of [-1, 1]) {
    b.box(t1 - t0, 0.04, 0.012, '#a9a395', [(t0 + t1) / 2, 0.68, s * 0.526]);
    b.box(t1 - t0, 0.04, 0.012, '#a9a395', [(t0 + t1) / 2, 1.64, s * 0.526]);
    a.box(1.6, 0.16, 0.01, '#ffffff', [(t0 + t1) / 2 + 0.3, 1.3, s * 0.526]); // faixa da nação
    b.box(1.3, 0.06, 0.02, '#8f9399', [-0.5, 0.48, s * 0.4]); // proteção lateral
    b.box(0.03, 0.42, 0.03, '#3c4046', [0.4, 0.38, s * 0.3]); // pé de apoio
  }
  for (const x of [-1.55, -1.95, -2.35]) for (const z of [-0.42, 0.42]) truckWheel(b, x, z, r, true);
  for (const s of [-1, 1]) b.box(1.24, 0.025, 0.2, CHASSIS, [-1.95, r * 2 + 0.04, s * 0.42]);
  b.box(0.04, 0.96, 1.04, '#c4bdae', [t0 - 0.01, 1.16, 0]);
  b.box(0.045, 0.94, 0.015, '#8f887a', [t0 - 0.02, 1.16, 0]);
  for (const z of [-0.25, -0.1, 0.1, 0.25]) b.box(0.05, 0.84, 0.02, '#8f9399', [t0 - 0.03, 1.14, z]);
  for (const s of [-1, 1]) b.box(0.04, 0.08, 0.12, TAIL, [t0 - 0.02, 0.62, s * 0.42]);
  b.box(0.08, 0.08, 0.9, '#3c4046', [t0 - 0.02, 0.42, 0]);
}
