import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from './origins.ts';

describe('isOriginAllowed', () => {
  const list = ['https://nationcommander.vercel.app/', 'https://nation-commander-*-leodevinicial.vercel.app'];
  it('aceita origem exata, ignorando barra final e maiúsculas', () => {
    expect(isOriginAllowed('https://NationCommander.vercel.app', list)).toBe(true);
  });
  it('aceita previews pelo curinga', () => {
    expect(isOriginAllowed('https://nation-commander-mgmqwch3n-leodevinicial.vercel.app', list)).toBe(true);
  });
  it('recusa outras origens', () => {
    expect(isOriginAllowed('https://evil.example', list)).toBe(false);
    expect(isOriginAllowed('https://nation-commander-x.evil.app', list)).toBe(false);
    expect(isOriginAllowed('https://a.b-leodevinicial.vercel.app', ['https://*-leodevinicial.vercel.app'])).toBe(false);
    expect(isOriginAllowed(undefined, list)).toBe(false);
  });
  it('lista vazia aceita tudo', () => {
    expect(isOriginAllowed('https://qualquer.app', [])).toBe(true);
  });
});
