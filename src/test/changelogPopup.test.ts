import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../ui/changelog.ts';
import { unseenVersions } from '../ui/components/ChangelogPopup.tsx';

describe('novidades ao entrar', () => {
  it('mostra a versão atual uma vez por jogador e depois não mostra mais', () => {
    const v = CHANGELOG[0]!.version;
    expect(unseenVersions('ana', {}).map((c) => c.version)).toEqual([v]);
    expect(unseenVersions('ana', { ana: v })).toEqual([]);
    // outro jogador no mesmo aparelho ainda vê
    expect(unseenVersions('bia', { ana: v }).map((c) => c.version)).toEqual([v]);
  });

  it('quem viu uma versão antiga recebe tudo o que saiu desde então (até 3 versões); sem armazenamento, nada', () => {
    const old = CHANGELOG[2]!.version;
    expect(unseenVersions('ana', { ana: old }).map((c) => c.version)).toEqual(CHANGELOG.slice(0, 2).map((c) => c.version));
    expect(unseenVersions('ana', null)).toEqual([]);
  });
});
