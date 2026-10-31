import { createHmac, randomBytes } from 'node:crypto';
import type { IdCipher, IdSpace } from '../../shared/sim/ids.ts';

/**
 * KAC-06 — permutação secreta dos ids de cada partida.
 *
 * Rede de Feistel de 4 rodadas sobre 24 bits (duas metades de 12), com HMAC-SHA256 como função de rodada e uma chave
 * aleatória de 256 bits por sala. Com uma função pseudoaleatória de verdade, 4 rodadas formam uma permutação
 * pseudoaleatória (Luby–Rackoff): o id publicado não revela o contador, nem a ordem entre dois ids, para quem não tem
 * a chave. Cada espaço (`entity`, `air`, `mine`, `caravan`) entra no HMAC, então os espaços não se correlacionam.
 *
 * Domínio: contadores de 0 a 2^24 − 1 (16,7 milhões, muito acima do que uma partida cria); o id publicado é a
 * permutação + 1, entre 1 e 2^24. Se uma partida passar do domínio, os ids seguintes saem acima de 2^24, em
 * sequência (únicos, só sem embaralhar).
 */
const HALF = 12;
const MASK = (1 << HALF) - 1;
const DOMAIN = 1 << (2 * HALF);
const ROUNDS = 4;

/** Chave nova para uma sala (hex, 256 bits). Fica no salvamento da sala, nunca vai para o cliente. */
export function newIdKey(): string {
  return randomBytes(32).toString('hex');
}

export function idCipher(keyHex: string): IdCipher {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length < 16) throw new Error('chave de ids curta demais');
  const round = (space: IdSpace, r: number, half: number) => createHmac('sha256', key).update(`${space}:${r}:${half}`).digest().readUInt16BE(0) & MASK;
  return (space, counter) => {
    if (!Number.isInteger(counter) || counter < 0) throw new Error(`contador inválido: ${counter}`);
    if (counter >= DOMAIN) return counter + 1;
    let l = counter >>> HALF;
    let r = counter & MASK;
    for (let i = 0; i < ROUNDS; i++) {
      const next = l ^ round(space, i, r);
      l = r;
      r = next;
    }
    return ((l << HALF) | r) + 1;
  };
}
