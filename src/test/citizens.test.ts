import { describe, expect, it } from 'vitest';
import type { BuildingSnapshot } from '../../shared/sim/snapshot.ts';
import { citizenRoster, dropoffFor } from '../game/render/CitizenLayer.ts';

const b = (id: number, type: BuildingSnapshot['type'], workers: number, progress = 1): BuildingSnapshot =>
  ({ id, type, owner: 0, cx: 0, cy: 0, hp: 100, progress, queue: [], rally: null, workers }) as BuildingSnapshot;

describe('cidadãos visíveis', () => {
  it('um civil por trabalhador e por ocioso: o total bate com a população real', () => {
    const roster = citizenRoster([b(1, 'farm', 3), b(2, 'barracks', 2), b(3, 'hq', 0)], 4);
    expect(roster).toHaveLength(3 + 2 + 4);
    expect(roster.filter((j) => j.kind === 'gather')).toHaveLength(3);
    expect(roster.filter((j) => j.kind === 'staff')).toHaveLength(2);
    expect(roster.filter((j) => j.kind === 'idle')).toHaveLength(4);
    expect(roster.find((j) => j.kind === 'gather')!.resource).toBe('food');
  });

  it('obra em andamento não tem trabalhadores no mapa', () => {
    expect(citizenRoster([b(1, 'sawmill', 3, 0.5)], 0)).toHaveLength(0);
  });

  it('chaves estáveis: o mesmo posto mantém o mesmo cidadão entre snapshots', () => {
    const a = citizenRoster([b(7, 'quarry', 2)], 1).map((j) => j.key);
    const c = citizenRoster([b(7, 'quarry', 3)], 1).map((j) => j.key);
    expect(c).toEqual(expect.arrayContaining(a));
  });

  it('carga vai ao depósito mais próximo que guarda o recurso', () => {
    const own = [
      { type: 'hq' as const, x: 0, y: 0, done: true },
      { type: 'silo' as const, x: 30, y: 0, done: true },
      { type: 'warehouse' as const, x: 22, y: 0, done: true },
      { type: 'silo' as const, x: 26, y: 0, done: false },
    ];
    expect(dropoffFor('food', { x: 28, y: 0 }, own)).toMatchObject({ x: 30 });
    expect(dropoffFor('wood', { x: 28, y: 0 }, own)).toMatchObject({ x: 22 });
    expect(dropoffFor('oil', { x: 28, y: 0 }, own)).toMatchObject({ x: 0 });
  });

  it('recrutas da reserva aparecem junto ao quartel, separados dos civis', () => {
    const roster = citizenRoster([b(1, 'farm', 2), b(5, 'barracks', 2)], 1, 3);
    const rec = roster.filter((j) => j.kind === 'recruit');
    expect(rec).toHaveLength(3);
    expect(rec.every((j) => j.buildingId === 5)).toBe(true);
    // civis: 2 da fazenda + 2 do quartel (instrutores) + 1 ocioso
    expect(roster.filter((j) => j.kind !== 'recruit')).toHaveLength(5);
  });
});
