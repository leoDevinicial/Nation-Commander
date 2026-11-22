import { describe, expect, it } from 'vitest';

/**
 * Seletores do zustand 5 precisam devolver sempre a mesma referência quando nada mudou. `?? []` ou `?? {}` dentro do
 * seletor cria um valor novo a cada leitura e o React entra em laço (erro 185, tela preta). Foi o que travou a volta à
 * partida de um jogador em 21/11; use uma constante fixa (ex.: `const EMPTY: never[] = []`).
 */
const sources = import.meta.glob<string>(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('seletores do estado', () => {
  it('nenhum seletor cria lista ou objeto novo a cada leitura', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    const bad: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      text.split('\n').forEach((line, i) => {
        if (/use[A-Za-z]*Store\(\s*\(\w+\)\s*=>.*\?\?\s*(\[\]|\{\})/.test(line)) bad.push(`${file}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
