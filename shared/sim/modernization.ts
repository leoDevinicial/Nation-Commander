import { BUILDINGS, RESOURCE_TYPES, UNITS, canAfford, type BuildingType, type Cost, type Stockpile, type UnitType } from './config.ts';
import { formatUsd, missingText } from './upgrades.ts';
import { TECHNOLOGIES, type TechId } from '../strategic/technologies.ts';

/**
 * Modernização de tropas (Fase 5). Uma pesquisa concluída libera um pacote de equipamento, mas
 * não transforma sozinha as tropas em campo: cada unidade precisa ir a uma instalação compatível
 * (base militar para infantaria, fábrica para veículos), pagar materiais e verba de obras e ficar
 * indisponível enquanto o pacote é instalado. Unidades novas saem da linha de produção com o
 * padrão vigente, pagando a diferença de custo do equipamento.
 *
 * Cada unidade guarda os pacotes instalados (`Unit.mods`), então tropas antigas e modernizadas
 * convivem no campo e todo bônus aponta para o pacote — e a pesquisa — de onde veio.
 */
export type ModId = 'body_armor' | 'composite_armor' | 'guided_munitions' | 'digital_radio' | 'thermal_optics' | 'efficient_engine';

export interface ModEffects {
  hpMul: number;
  damageMul: number;
  /** Multiplicador do intervalo entre disparos (< 1 = dispara mais rápido). */
  cooldownMul: number;
  rangeAdd: number;
  sightAdd: number;
  speedMul: number;
  /** Multiplicador do desgaste em território inimigo sem linha de suprimento. */
  attritionMul: number;
}

export interface ModDef {
  id: ModId;
  label: string;
  /** Sigla curta mostrada no rótulo de equipamento da unidade. */
  short: string;
  /** Área de melhoria (blindagem, precisão, comunicações, detecção, mobilidade). */
  area: string;
  tech: TechId;
  units: UnitType[];
  effects: Partial<ModEffects>;
  /** Instalação por unidade já em campo. */
  retrofit: { cost: Cost; usd: number; seconds: number };
  /** Diferença no custo de cada unidade nova que sai da linha de produção com o pacote. */
  lineCost: Cost;
  description: string;
}

const ALL = Object.keys(UNITS) as UnitType[];
const VEHICLES: UnitType[] = ALL.filter((u) => UNITS[u].armor === 'vehicle');
const FOOT: UnitType[] = ALL.filter((u) => UNITS[u].armor === 'infantry');

export const MODS: Record<ModId, ModDef> = {
  body_armor: {
    id: 'body_armor',
    label: 'Colete balístico',
    short: 'CB',
    area: 'Blindagem',
    tech: 'composite_armor',
    units: FOOT,
    effects: { hpMul: 1.15 },
    retrofit: { cost: { iron: 10, supplies: 10 }, usd: 300_000, seconds: 12 },
    lineCost: { iron: 5 },
    description: 'Coletes e capacetes de cerâmica composta.',
  },
  composite_armor: {
    id: 'composite_armor',
    label: 'Blindagem composta',
    short: 'BC',
    area: 'Blindagem',
    tech: 'composite_armor',
    units: VEHICLES,
    effects: { hpMul: 1.25 },
    retrofit: { cost: { iron: 40, supplies: 20 }, usd: 1_500_000, seconds: 25 },
    lineCost: { iron: 20 },
    description: 'Placas adicionais de cerâmica e aço no casco.',
  },
  guided_munitions: {
    id: 'guided_munitions',
    label: 'Munição guiada',
    short: 'MG',
    area: 'Precisão',
    tech: 'guided_munitions',
    units: ALL,
    effects: { damageMul: 1.15 },
    retrofit: { cost: { supplies: 30, iron: 10 }, usd: 800_000, seconds: 15 },
    lineCost: { supplies: 15 },
    description: 'Munição com guiagem e controle de tiro digital.',
  },
  digital_radio: {
    id: 'digital_radio',
    label: 'Rádio digital',
    short: 'RD',
    area: 'Comunicações',
    tech: 'digital_comms',
    units: ALL,
    effects: { sightAdd: 2, cooldownMul: 0.92 },
    retrofit: { cost: { supplies: 20 }, usd: 400_000, seconds: 10 },
    lineCost: { supplies: 8 },
    description: 'Rede de dados entre unidades: alvos compartilhados e tiro coordenado.',
  },
  thermal_optics: {
    id: 'thermal_optics',
    label: 'Óptica térmica',
    short: 'OT',
    area: 'Detecção',
    tech: 'sensor_optics',
    units: VEHICLES,
    effects: { sightAdd: 2, rangeAdd: 1 },
    retrofit: { cost: { supplies: 25, iron: 15 }, usd: 1_200_000, seconds: 20 },
    lineCost: { iron: 8, supplies: 8 },
    description: 'Câmera térmica e telêmetro a laser.',
  },
  efficient_engine: {
    id: 'efficient_engine',
    label: 'Motor eficiente',
    short: 'ME',
    area: 'Mobilidade e logística',
    tech: 'efficient_propulsion',
    units: VEHICLES,
    effects: { speedMul: 1.12, attritionMul: 0.7 },
    retrofit: { cost: { iron: 30, oil: 20 }, usd: 1_500_000, seconds: 25 },
    lineCost: { iron: 10 },
    description: 'Motor e transmissão de menor consumo e maior confiabilidade.',
  },
};

export const MOD_IDS = Object.keys(MODS) as ModId[];

export const isModId = (v: unknown): v is ModId => typeof v === 'string' && Object.hasOwn(MODS, v);

/** Distância máxima (unidades de mundo, até a borda do edifício) para modernizar numa instalação. */
export const MOD_FACILITY_RANGE = 8;
/** Fração devolvida ao cancelar uma modernização em andamento (materiais e verba). */
export const MOD_CANCEL_REFUND = 0.5;

/** Instalação que moderniza a unidade: a mesma que a produz. */
export function modFacility(type: UnitType): BuildingType {
  return UNITS[type].producedBy;
}

/** Vagas simultâneas de modernização numa instalação (cresce com o nível do edifício). */
export function refitSlots(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 3);
}

/** Pacotes que existem para a classe da unidade (na ordem de `MOD_IDS`). */
export function modsFor(type: UnitType): ModId[] {
  return MOD_IDS.filter((id) => MODS[id].units.includes(type));
}

/** Pacotes já liberados por pesquisa para a classe da unidade. */
export function availableMods(type: UnitType, techs: readonly string[] | null): ModId[] {
  if (!techs) return [];
  return modsFor(type).filter((id) => techs.includes(MODS[id].tech));
}

const NEUTRAL: ModEffects = { hpMul: 1, damageMul: 1, cooldownMul: 1, rangeAdd: 0, sightAdd: 0, speedMul: 1, attritionMul: 1 };

export function combineMods(mods: readonly ModId[]): ModEffects {
  const e = { ...NEUTRAL };
  for (const id of mods) {
    const m = MODS[id]?.effects;
    if (!m) continue;
    e.hpMul *= m.hpMul ?? 1;
    e.damageMul *= m.damageMul ?? 1;
    e.cooldownMul *= m.cooldownMul ?? 1;
    e.rangeAdd += m.rangeAdd ?? 0;
    e.sightAdd += m.sightAdd ?? 0;
    e.speedMul *= m.speedMul ?? 1;
    e.attritionMul *= m.attritionMul ?? 1;
  }
  return e;
}

/** Padrão da linha de produção: pacotes liberados que vêm de fábrica e a diferença de custo. */
export function productionStandard(type: UnitType, techs: readonly string[] | null): { mods: ModId[]; extra: Cost } {
  const mods = availableMods(type, techs);
  const extra: Cost = {};
  for (const id of mods) for (const r of RESOURCE_TYPES) if (MODS[id].lineCost[r]) extra[r] = (extra[r] ?? 0) + MODS[id].lineCost[r]!;
  return { mods, extra };
}

export function addCost(a: Cost, b: Cost): Cost {
  const out: Cost = { ...a };
  for (const r of RESOURCE_TYPES) if (b[r]) out[r] = (out[r] ?? 0) + b[r]!;
  return out;
}

/** Atributo de uma unidade com a origem de cada ganho (para explicar o número na interface). */
export interface StatLine {
  key: 'hp' | 'damage' | 'cooldown' | 'range' | 'sight' | 'speed' | 'attrition';
  label: string;
  base: number;
  value: number;
  unit: string;
  /** Pacotes responsáveis pela diferença, com a pesquisa de origem. */
  sources: { mod: ModId; label: string; tech: string; text: string }[];
}

const pct = (m: number) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`;

/** Atributos efetivos de uma unidade e a explicação de cada ganho. `hpMul`: equipamento do edifício produtor. */
export function unitStatLines(type: UnitType, mods: readonly ModId[], maxHp?: number): StatLine[] {
  const def = UNITS[type];
  const fx = combineMods(mods);
  const src = (pick: (e: Partial<ModEffects>) => number | undefined, fmt: (v: number) => string) =>
    mods
      .filter((id) => pick(MODS[id].effects) !== undefined)
      .map((id) => ({ mod: id, label: MODS[id].label, tech: TECHNOLOGIES[MODS[id].tech].label, text: fmt(pick(MODS[id].effects)!) }));
  return [
    { key: 'hp', label: 'Vida máxima', base: def.maxHp, value: maxHp ?? Math.round(def.maxHp * fx.hpMul), unit: '', sources: src((e) => e.hpMul, pct) },
    { key: 'damage', label: 'Dano por disparo', base: def.weapon.damage, value: Math.round(def.weapon.damage * fx.damageMul * 10) / 10, unit: '', sources: src((e) => e.damageMul, pct) },
    {
      key: 'cooldown',
      label: 'Intervalo de disparo',
      base: def.weapon.cooldown,
      value: Math.round(def.weapon.cooldown * fx.cooldownMul * 100) / 100,
      unit: 's',
      sources: src((e) => e.cooldownMul, pct),
    },
    { key: 'range', label: 'Alcance', base: def.weapon.range, value: def.weapon.range + fx.rangeAdd, unit: '', sources: src((e) => e.rangeAdd, (v) => `+${v}`) },
    { key: 'sight', label: 'Visão', base: def.sight, value: def.sight + fx.sightAdd, unit: '', sources: src((e) => e.sightAdd, (v) => `+${v}`) },
    { key: 'speed', label: 'Velocidade', base: def.speed, value: Math.round(def.speed * fx.speedMul * 100) / 100, unit: '', sources: src((e) => e.speedMul, pct) },
    {
      key: 'attrition',
      label: 'Desgaste sem suprimento',
      base: 100,
      value: Math.round(fx.attritionMul * 100),
      unit: '%',
      sources: src((e) => e.attritionMul, pct),
    },
  ];
}

/** Rótulo de equipamento: geração (pacotes instalados / existentes) e siglas. */
export function equipmentTag(type: UnitType, mods: readonly ModId[]): string {
  const total = modsFor(type).length;
  if (mods.length === 0) return `Padrão inicial (0/${total})`;
  return `Ger. ${mods.length}/${total} · ${mods.map((m) => MODS[m].short).join(' ')}`;
}

// ------------------------------------------------------------------ regra única (servidor e HUD)

/** Edifício visto pela regra de instalação (servidor: estado real; cliente: snapshot). */
export interface FacilityInfo {
  id: number;
  type: BuildingType;
  owner: number;
  /** Concluído e de pé. */
  ready: boolean;
  level: number;
  x: number;
  y: number;
  /** Meia largura do edifício (unidades de mundo). */
  half: number;
}

export type FacilityPick = { ok: true; id: number } | { ok: false; reason: string; short: string };

/**
 * Instalação compatível mais próxima, ao alcance e com baia livre (`busy`: modernizações em
 * andamento em cada uma). Sem nenhuma, explica o porquê: não existe, está longe ou está lotada.
 */
export function pickRefitFacility(u: { type: UnitType; owner: number; x: number; y: number }, facilities: Iterable<FacilityInfo>, busy: (id: number) => number): FacilityPick {
  const type = modFacility(u.type);
  const label = BUILDINGS[type].label;
  let best: FacilityInfo | null = null;
  let bestD = Infinity;
  let full = false;
  let any = false;
  for (const f of facilities) {
    if (f.owner !== u.owner || f.type !== type || !f.ready) continue;
    any = true;
    const dx = Math.max(Math.abs(u.x - f.x) - f.half, 0);
    const dy = Math.max(Math.abs(u.y - f.y) - f.half, 0);
    const d = Math.hypot(dx, dy);
    if (d > MOD_FACILITY_RANGE) continue;
    if (busy(f.id) >= refitSlots(f.level)) {
      full = true;
      continue;
    }
    if (d < bestD || (d === bestD && best !== null && f.id < best.id)) {
      bestD = d;
      best = f;
    }
  }
  if (best) return { ok: true, id: best.id };
  if (full) return { ok: false, reason: `${label} sem vaga: todas as baias de modernização estão ocupadas`, short: 'sem vaga' };
  if (!any) return { ok: false, reason: `Construa uma ${label} para modernizar ${UNITS[u.type].label}`, short: `sem ${label.split(' ')[0]!.toLowerCase()}` };
  return { ok: false, reason: `Leve a unidade para perto de uma ${label} (até ${MOD_FACILITY_RANGE} de distância)`, short: 'longe' };
}

export interface ModernizeContext {
  unitType: UnitType;
  mods: readonly ModId[];
  refitting: boolean;
  /** Pesquisas concluídas do país (null = sem camada nacional: nenhum pacote liberado). */
  techs: readonly string[] | null;
  /** Instalação compatível ao alcance com vaga livre, ou o motivo de não haver. */
  facility: FacilityPick;
  resources: Stockpile;
  /** Verba de obras disponível (null = sem camada nacional: não há cobrança em dinheiro). */
  fundsUsd: number | null;
}

export interface ModernizeCheck {
  cost: Cost;
  usd: number;
  seconds: number;
  blocker: string | null;
  short: string | null;
}

export function checkModernize(mod: ModId, c: ModernizeContext): ModernizeCheck {
  const def = MODS[mod];
  const usd = c.fundsUsd === null ? 0 : def.retrofit.usd;
  const base = { cost: def.retrofit.cost, usd, seconds: def.retrofit.seconds };
  const no = (blocker: string, short: string): ModernizeCheck => ({ ...base, blocker, short });
  if (!def.units.includes(c.unitType)) return no(`${def.label} não se aplica a ${UNITS[c.unitType].label}`, 'não se aplica');
  if (c.mods.includes(mod)) return no(`${UNITS[c.unitType].label} já tem ${def.label}`, 'instalado');
  if (c.refitting) return no('A unidade já está em modernização', 'em obra');
  if (!c.techs || !c.techs.includes(def.tech)) return no(`Pesquisa necessária: ${TECHNOLOGIES[def.tech].label}`, 'pesquisa');
  if (!c.facility.ok) return no(c.facility.reason, c.facility.short);
  if (!canAfford(c.resources, def.retrofit.cost)) return no(`Recursos insuficientes: faltam ${missingText(c.resources, def.retrofit.cost)}`, 'recursos');
  if (c.fundsUsd !== null && c.fundsUsd + 1e-6 < def.retrofit.usd)
    return no(`Verba de obras insuficiente: disponível ${formatUsd(c.fundsUsd)} de ${formatUsd(def.retrofit.usd)}`, 'sem verba');
  return { ...base, blocker: null, short: null };
}
