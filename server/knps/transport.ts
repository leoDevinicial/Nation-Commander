import type { PerMessageDeflateOptions } from 'ws';

/**
 * KNPS-01 — compressão do transporte (WebSocket permessage-deflate, RFC 7692).
 *
 * Medição (scripts/knps-baseline.ts, partida de 4 nações): o snapshot tem ~9,5 KB de JSON e sai 10 vezes por segundo,
 * ~600–700 kbit/s por jogador. Os snapshots seguidos são quase iguais, então a compressão com contexto entre mensagens
 * (context takeover) os reduz a ~5% do tamanho (~0,5 KB) por ~0,17 ms de CPU cada. Em conexão lenta ou distante isso
 * tira a fila no caminho, que é o que mais aumenta a latência percebida.
 *
 * Todos os navegadores atuais negociam a extensão sozinhos; quem não negociar recebe sem compressão (fallback do
 * próprio protocolo). Limites:
 * - nível 1 (o mais rápido): o ganho do nível 6 é pequeno para o custo de CPU no servidor;
 * - janela de 32 KB do servidor (cabe o snapshot anterior inteiro); ~256 KB de memória por conexão;
 * - o cliente não guarda contexto (as ordens são pequenas): o servidor descomprime com memória mínima;
 * - mensagens abaixo de 512 bytes (pong, chat, ordens) vão sem compressão;
 * - o `maxPayload` do servidor vale para o tamanho já descomprimido (proteção contra bomba de descompressão).
 */
export const KNPS_DEFLATE: PerMessageDeflateOptions = {
  zlibDeflateOptions: { level: 1, memLevel: 8 },
  zlibInflateOptions: { chunkSize: 16 * 1024 },
  serverNoContextTakeover: false,
  clientNoContextTakeover: true,
  serverMaxWindowBits: 15,
  threshold: 512,
  concurrencyLimit: 10,
};

/**
 * KNPS-02 — limite da fila de saída por conexão (bytes ainda não entregues ao sistema). Acima disso a conexão está
 * congestionada: o próximo snapshot (que é substituível, o seguinte traz o estado inteiro) não é montado nem enfileirado.
 * Ordens, confirmações e mensagens de sala nunca são descartadas.
 */
export const KNPS_SEND_QUEUE_LIMIT = 192 * 1024;
