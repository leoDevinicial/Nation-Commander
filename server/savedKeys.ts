/**
 * Partidas salvas pelo jogador (24/11): mesma tabela/loja das partidas em andamento, com a chave `~CÓDIGO`. Assim não
 * precisa de migração no banco, a retomada automática (reinício do servidor) nunca pega uma delas e o código da sala
 * fica livre para outra partida. Sem dependências do Node (a loja do aparelho roda num Web Worker).
 */
export const SUSPENDED_PREFIX = '~';
export const suspendedKey = (code: string): string => `${SUSPENDED_PREFIX}${code}`;
export const isSuspendedKey = (key: string): boolean => key.startsWith(SUSPENDED_PREFIX);
