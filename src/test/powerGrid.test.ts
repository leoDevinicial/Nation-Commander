import { describe, expect, it } from 'vitest';
import { netOfCells, netShort } from '../game/render/PowerGridLayer.ts';

/** Visão da rede elétrica (23/11). */
describe('visão da rede elétrica', () => {
  it('cada pedaço da malha recebe a rede do servidor que tem a célula dele; pela quina também liga', () => {
    // 10×10: pedaço A (0,0)-(1,1) na diagonal; pedaço B em (8,8)
    const mesh = [0, 11, 88];
    const nets = [
      { supply: 10, demand: 5, served: 5, dark: 0, at: 11, cx: 0, cy: 0 },
      { supply: 0, demand: 3, served: 0, dark: 1, at: 88, cx: 8, cy: 8 },
    ];
    const of = netOfCells(10, 10, mesh, nets);
    expect(of.get(0)).toBe(0);
    expect(of.get(11)).toBe(0);
    expect(of.get(88)).toBe(1);
    expect(netShort(nets[0]!)).toBe(false);
    expect(netShort(nets[1]!)).toBe(true);
  });
});
