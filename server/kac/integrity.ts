import { createHash } from 'node:crypto';

/**
 * KAC — relatório de integridade de cada partida, gravado no histórico (`matches.report.integrity`) junto com o
 * relatório pós-partida. Serve para auditar um resultado depois:
 * - `stateHash`: hash do estado final da simulação (que é determinística), para comparar com uma reexecução;
 * - por jogador: ordens aceitas e recusadas, pausas usadas e alertas de automação;
 * - `verdict`: "clean" sem nenhum sinal; "review" quando algo merece olhar humano. Não é condenação: uma partida
 *   em revisão não perde nada até alguém decidir com base na política de sanções (`docs/kac/KAC_ENFORCEMENT_POLICY.md`).
 */
export interface MatchIntegrity {
  version: 1;
  stateHash: string;
  ticks: number;
  /** Partida entre dois ou mais humanos. */
  competitive: boolean;
  players: { slot: number; commandsAccepted: number; commandsRejected: number; pausesUsed: number; automationAlerts: number }[];
  /** Eventos de segurança de gravidade média ou maior desta sala durante a partida. */
  securityEvents: number;
  verdict: 'clean' | 'review';
}

export interface IntegrityCounters {
  accepted: number;
  rejected: number;
  automationAlerts: number;
}

export function stateHash(serialized: string): string {
  return createHash('sha256').update(serialized).digest('hex');
}

export function buildIntegrity(input: {
  serialized: string;
  ticks: number;
  competitive: boolean;
  slots: number[];
  counters: (slot: number) => IntegrityCounters | undefined;
  pausesUsed: (slot: number) => number;
  securityEvents: number;
}): MatchIntegrity {
  const players = input.slots.map((slot) => {
    const c = input.counters(slot);
    return {
      slot,
      commandsAccepted: c?.accepted ?? 0,
      commandsRejected: c?.rejected ?? 0,
      pausesUsed: input.pausesUsed(slot),
      automationAlerts: c?.automationAlerts ?? 0,
    };
  });
  const flagged = input.securityEvents > 0 || players.some((p) => p.automationAlerts > 0);
  return {
    version: 1,
    stateHash: stateHash(input.serialized),
    ticks: input.ticks,
    competitive: input.competitive,
    players,
    securityEvents: input.securityEvents,
    verdict: flagged ? 'review' : 'clean',
  };
}
