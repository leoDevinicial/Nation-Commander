import { describe, expect, it } from 'vitest';
import { TECH_IDS, TECHNOLOGIES, type TechCategory } from '../../shared/strategic/technologies.ts';
import { treeLayout } from '../ui/national/techTree.ts';

describe('árvore de pesquisa por área', () => {
  it('cada nó fica numa coluna depois dos pré-requisitos da área, sem dois nós no mesmo lugar', () => {
    for (const cat of ['military', 'state', 'industry', 'resources'] as TechCategory[]) {
      const ids = TECH_IDS.filter((id) => TECHNOLOGIES[id].category === cat);
      const t = treeLayout(ids, (id) => TECHNOLOGIES[id as keyof typeof TECHNOLOGIES].prereqs);
      expect(t.nodes).toHaveLength(ids.length);
      const at = new Map(t.nodes.map((n) => [n.id, n]));
      for (const e of t.edges) expect(at.get(e.to)!.col).toBeGreaterThan(at.get(e.from)!.col);
      const spots = new Set(t.nodes.map((n) => `${n.col}:${n.row}`));
      expect(spots.size).toBe(ids.length);
    }
  });

  it('pré-requisito de outra área vira etiqueta, não linha', () => {
    const ids = TECH_IDS.filter((id) => TECHNOLOGIES[id].category === 'military');
    const t = treeLayout(ids, (id) => TECHNOLOGIES[id as keyof typeof TECHNOLOGIES].prereqs);
    const armor = t.nodes.find((n) => n.id === 'composite_armor')!;
    expect(armor.external).toEqual(['mechanized_extraction']);
    expect(t.edges.some((e) => e.from === 'mechanized_extraction')).toBe(false);
    // cadeia dentro da área: comunicações → munição guiada → mísseis → armas nucleares
    const col = (id: string) => t.nodes.find((n) => n.id === id)!.col;
    expect([col('digital_comms'), col('guided_munitions'), col('ballistic_missiles'), col('nuclear_weapons')]).toEqual([0, 1, 2, 3]);
  });
});
