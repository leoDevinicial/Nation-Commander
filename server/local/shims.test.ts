import * as node from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as shim from './shims/crypto.ts';

/** O SHA-256 e o HMAC em JavaScript da partida local dão exatamente o que o Node dá (22/11). */
describe('substituto de node:crypto no navegador', () => {
  const samples = ['', 'abc', 'nc-guest-v1:7f3a', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'ação 🚀 '.repeat(40), 'w'.repeat(5000)];

  it('SHA-256 idêntico ao do Node (inclusive nos limites de bloco e com acentos)', () => {
    for (const s of samples) expect(shim.createHash('sha256').update(s).digest('hex')).toBe(node.createHash('sha256').update(s).digest('hex'));
  });

  it('HMAC-SHA256 idêntico, com chave curta, de 64 bytes e longa', () => {
    for (const keyLen of [16, 32, 64, 100]) {
      const key = node.randomBytes(keyLen);
      for (const s of samples) {
        const a = shim.createHmac('sha256', new Uint8Array(key)).update(s).digest();
        const b = node.createHmac('sha256', key).update(s).digest();
        expect(Array.from(a)).toEqual(Array.from(b));
      }
    }
  });

  it('randomInt respeita o intervalo', () => {
    for (let i = 0; i < 200; i++) {
      const v = shim.randomInt(32);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(32);
    }
  });
});
