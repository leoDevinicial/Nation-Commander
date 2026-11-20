import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../ui/changelog.ts';
import { playerKeys, unseenVersions } from '../ui/components/ChangelogPopup.tsx';

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

  it('conta pelo login no aparelho, sem esperar o servidor de jogo, e aproveita o que foi visto pela chave antiga (20/11)', () => {
    const v = CHANGELOG[0]!.version;
    const old = CHANGELOG[1]!.version;
    // servidor de jogo fora do ar: só a conta do login, e o aviso aparece
    const offline = playerKeys({ id: 'u1' }, null, null);
    expect(offline).toEqual(['acct:u1']);
    expect(unseenVersions(offline, {}).map((c) => c.version)).toEqual([v]);
    // com o servidor: as duas chaves; quem viu a anterior pela chave antiga recebe só a nova
    const online = playerKeys({ id: 'u1' }, null, { id: 'p:abc', guest: false, name: 'Ana' });
    expect(online).toEqual(['acct:u1', 'p:abc']);
    expect(unseenVersions(online, { 'p:abc': old }).map((c) => c.version)).toEqual([v]);
    // já viu a atual por qualquer uma das chaves: nada
    expect(unseenVersions(online, { 'p:abc': v })).toEqual([]);
    expect(unseenVersions(online, { 'acct:u1': v })).toEqual([]);
    // a mais recente vista vale, mesmo que a outra chave tenha uma mais antiga
    expect(unseenVersions(online, { 'acct:u1': old, 'p:abc': CHANGELOG[3]!.version }).map((c) => c.version)).toEqual([v]);
    // convidado
    expect(playerKeys(null, { name: 'Zé' }, { id: 'p:z', guest: true, name: 'Zé' })).toEqual(['guest:Zé']);
  });
});
