import { TICK_RATE } from './config.ts';
import type { Simulation } from './Simulation.ts';
import type { PlayerStats, Slot } from './types.ts';

/**
 * Relatório pós-partida (lote 1, §3.2): a sala guarda amostras do teatro durante a partida e, no
 * fim, calcula as medalhas de cada comandante. A tela de resultado desenha os gráficos.
 */
export interface ReportSample {
  /** Segundos de partida. */
  t: number;
  players: {
    slot: Slot;
    /** Tropas em campo. */
    army: number;
    /** Construções prontas. */
    buildings: number;
    /** Fração do território reivindicado no mapa (0 a 1). */
    territory: number;
    /** Recursos coletados desde o início (acumulado). */
    gathered: number;
    /** PIB do país (US$), quando há camada nacional. */
    gdpUsd?: number;
  }[];
}

export type MedalId = 'victory' | 'territory' | 'political' | 'fortress' | 'ace' | 'industry' | 'builder' | 'economy' | 'survivor' | 'veterans';

export const MEDALS: Record<MedalId, { label: string; icon: string; description: string }> = {
  victory: { label: 'Vitória', icon: '🏆', description: 'Venceu a partida' },
  territory: { label: 'Senhor das Fronteiras', icon: '🗺', description: 'Venceu por domínio territorial' },
  political: { label: 'Golpe de Mestre', icon: '⚖', description: 'Venceu com o colapso político do rival' },
  fortress: { label: 'Muralha', icon: '🛡', description: 'Partida de 10 min ou mais sem perder nenhuma construção' },
  ace: { label: 'Ás de Combate', icon: '🎯', description: 'Pelo menos 10 abates e o dobro das perdas' },
  industry: { label: 'Potência Industrial', icon: '🏭', description: 'Coletou 5.000 recursos ou mais' },
  builder: { label: 'Construtor', icon: '🏗', description: 'Ergueu 25 construções ou mais' },
  economy: { label: 'Milagre Econômico', icon: '📈', description: 'PIB 5% maior no fim da partida' },
  survivor: { label: 'Resistência', icon: '🔥', description: 'Resistiu 30 min ou mais antes de cair' },
  veterans: { label: 'Escola de Heróis', icon: '🎖', description: 'Teve uma tropa promovida a Herói' },
};

export interface MatchReport {
  samples: ReportSample[];
  medals: { slot: Slot; medals: MedalId[] }[];
}

/** Amostras a cada 30 s; acima do limite, metade das antigas é descartada (uma a cada duas). */
export const REPORT_EVERY_TICKS = 30 * TICK_RATE;
export const REPORT_MAX_SAMPLES = 160;

export function reportSample(sim: Simulation, gdp?: (slot: Slot) => number | null): ReportSample {
  const counts = sim.players.map(() => 0);
  let total = 0;
  for (const o of sim.territory)
    if (o >= 0 && o < counts.length) {
      counts[o]!++;
      total++;
    }
  return {
    t: Math.round(sim.tick / TICK_RATE),
    players: sim.players.map((p) => {
      const g = gdp?.(p.slot) ?? null;
      return {
        slot: p.slot,
        army: sim.units.filter((u) => u.owner === p.slot).length,
        buildings: sim.buildings.filter((b) => b.owner === p.slot && b.progress >= 1).length,
        territory: total ? Math.round((counts[p.slot]! / total) * 1000) / 1000 : 0,
        gathered: Math.round(p.stats.resourcesGathered),
        ...(g !== null ? { gdpUsd: Math.round(g) } : {}),
      };
    }),
  };
}

/** Acrescenta uma amostra mantendo o tamanho limitado (a série continua cobrindo a partida toda). */
export function pushSample(samples: ReportSample[], s: ReportSample): ReportSample[] {
  const out = [...samples, s];
  if (out.length <= REPORT_MAX_SAMPLES) return out;
  return out.filter((_, i) => i % 2 === 0 || i === out.length - 1);
}

export interface MedalInput {
  result: 'win' | 'loss' | 'draw';
  reason: string;
  durationSeconds: number;
  stats: PlayerStats;
  gdpStartUsd?: number | null;
  gdpEndUsd?: number | null;
  /** Maior patente alcançada por uma tropa (0 a 3). */
  bestRank: number;
}

export function medalsFor(m: MedalInput): MedalId[] {
  const out: MedalId[] = [];
  if (m.result === 'win') out.push('victory');
  if (m.result === 'win' && m.reason === 'territory') out.push('territory');
  if (m.result === 'win' && m.reason === 'political') out.push('political');
  if (m.durationSeconds >= 600 && m.stats.structuresLost === 0) out.push('fortress');
  if (m.stats.unitsKilled >= 10 && m.stats.unitsKilled >= 2 * m.stats.unitsLost) out.push('ace');
  if (m.stats.resourcesGathered >= 5000) out.push('industry');
  if (m.stats.structuresBuilt >= 25) out.push('builder');
  if (m.gdpStartUsd && m.gdpEndUsd && m.gdpEndUsd >= m.gdpStartUsd * 1.05) out.push('economy');
  if (m.result === 'loss' && m.durationSeconds >= 1800) out.push('survivor');
  if (m.bestRank >= 3) out.push('veterans');
  return out;
}
