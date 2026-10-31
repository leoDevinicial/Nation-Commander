/**
 * KAC — políticas de integridade da partida (achado KAC-02 da auditoria: abuso da pausa).
 *
 * Nas partidas com dois ou mais humanos, a pausa era ilimitada: qualquer jogador pausava quando e quanto quisesse e
 * tirava a pausa do outro, e as ordens dadas com o jogo parado ficavam na fila e eram executadas juntas na volta
 * (planejar com o tempo parado). Contra a IA e no Sandbox nada muda.
 */
export const PAUSE_POLICY = {
  /** Pausas por jogador por partida. */
  perPlayer: 3,
  /** Duração máxima de cada pausa: depois disso a partida volta sozinha (ms). */
  maxMs: 60_000,
  /** Antes disso, só quem pausou pode tirar a pausa (ms). */
  ownerOnlyMs: 15_000,
};
