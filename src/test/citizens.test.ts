import { describe, expect, it } from 'vitest';
import type { BuildingSnapshot } from '../../shared/sim/snapshot.ts';
import { CitizenLayer, citizenRoster } from '../game/render/CitizenLayer.ts';

const b = (id: number, type: BuildingSnapshot['type'], workers: number, progress = 1, cx = 0, cy = 0): BuildingSnapshot =>
  ({ id, type, owner: 0, cx, cy, hp: 100, maxHp: 100, progress, level: 1, spec: null, queue: [], rally: null, workers }) as BuildingSnapshot;

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

  it('recrutas da reserva aparecem junto ao quartel, separados dos civis', () => {
    const roster = citizenRoster([b(1, 'farm', 2), b(5, 'barracks', 2)], 1, 3);
    const rec = roster.filter((j) => j.kind === 'recruit');
    expect(rec).toHaveLength(3);
    expect(rec.every((j) => j.buildingId === 5)).toBe(true);
    // civis: 2 da fazenda + 2 do quartel (instrutores) + 1 ocioso
    expect(roster.filter((j) => j.kind !== 'recruit')).toHaveLength(5);
  });

  describe('camada no mapa', () => {
    const W = 40;
    const layer = () => new CitizenLayer({ width: W, height: W, cellSize: 1, terrain: new Array(W * W).fill(0) }, 0, () => 0);
    const step = (l: CitizenLayer, seconds: number) => {
      for (let t = 0; t < seconds; t += 0.1) l.update(0.1);
    };
    const hq = b(1, 'hq', 0, 1, 4, 4);

    it('o trabalhador caminha até o edifício e entra: some do mapa enquanto trabalha', () => {
      const l = layer();
      l.sync([hq, b(2, 'farm', 2, 1, 20, 20)], [hq, b(2, 'farm', 2, 1, 20, 20)], 1);
      expect(l.visible()).toHaveLength(3);
      step(l, 40);
      // os 2 da fazenda entraram; o ocioso continua à vista
      expect(l.visible()).toHaveLength(1);
      expect(l.count).toBe(3);
    });

    it('o cidadão selecionado é o mesmo que vai para o posto quando a simulação aceita a ordem', () => {
      const l = layer();
      const farm = (w: number) => b(2, 'farm', w, 1, 20, 20);
      l.sync([hq, farm(0)], [hq, farm(0)], 3);
      step(l, 1);
      const chosen = l.visible()[2]!.id;
      l.selected.add(chosen);
      expect(l.selectionInfo()).toEqual({ idle: 1, going: 0 });
      expect(l.orderWork(2)).toEqual([0]);
      // a simulação confirma: 1 trabalhador na fazenda, 2 ociosos
      l.sync([hq, farm(1)], [hq, farm(1)], 2);
      expect(l.selectionInfo()).toEqual({ idle: 0, going: 1 });
      step(l, 40);
      expect(l.visible().map((v) => v.id)).not.toContain(chosen);
      expect(l.selected.size).toBe(0);
      // realocação: quem estava dentro sai pela porta quando perde o posto
      l.sync([hq, farm(0)], [hq, farm(0)], 3);
      expect(l.visible().map((v) => v.id)).toContain(chosen);
    });

    it('ocioso mandado a um ponto vai até lá; os números seguem a simulação', () => {
      const l = layer();
      l.sync([hq], [hq], 2);
      const [a] = l.visible();
      l.selected.add(a!.id);
      expect(l.orderMove({ x: 30, y: 10 })).toBe(1);
      step(l, 40);
      const p = l.visible().find((v) => v.id === a!.id)!;
      expect(Math.hypot(p.x - 30, p.y - 10)).toBeLessThan(3);
      l.sync([hq], [hq], 0);
      expect(l.count).toBe(0);
      expect(l.selected.size).toBe(0);
    });
  });
});
