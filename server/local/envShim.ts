/**
 * Primeira importação do worker da partida local (22/11): o código do servidor lê `process.env` ao carregar
 * (`server/config.ts`). No navegador não há `process`; aqui ele existe, vazio, antes de qualquer outro módulo.
 */
const g = globalThis as unknown as { process?: { env: Record<string, string | undefined> } };
g.process ??= { env: {} };

export {};
