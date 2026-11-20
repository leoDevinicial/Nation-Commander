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

/**
 * Queda de conexão nas partidas com dois ou mais humanos (20/11). Antes a partida seguia sem pausa e quem não voltava
 * em 60 s perdia por abandono: em partidas de 1 h, amigos que caíam por instabilidade perdiam a vaga. Agora a partida
 * pausa sozinha enquanto alguém está fora (com teto de duração e de vezes, para a queda não virar pausa ilimitada) e
 * o prazo para voltar é maior (`reconnectGracePvpMs`, padrão 3 min). Os outros jogadores podem retomar antes.
 */
export const DISCONNECT_POLICY = {
  /** Pausas automáticas por queda, por jogador e por partida. */
  pausesPerPlayer: 3,
  /** Duração máxima de cada pausa automática: depois disso a partida volta sozinha (ms). */
  pauseMs: 90_000,
};
