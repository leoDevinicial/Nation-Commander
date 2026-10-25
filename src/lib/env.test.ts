import { describe, expect, it } from 'vitest';
import { normalizeServerUrl } from './env.ts';

describe('normalizeServerUrl', () => {
  it('acrescenta /ws e converte o esquema', () => {
    expect(normalizeServerUrl('wss://x.onrender.com/')).toBe('wss://x.onrender.com/ws');
    expect(normalizeServerUrl('https://x.onrender.com')).toBe('wss://x.onrender.com/ws');
    expect(normalizeServerUrl('x.onrender.com')).toBe('wss://x.onrender.com/ws');
    expect(normalizeServerUrl('ws://localhost:8787/ws')).toBe('ws://localhost:8787/ws');
  });
});
