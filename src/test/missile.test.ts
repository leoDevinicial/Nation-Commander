import { describe, expect, it } from 'vitest';
import { missilePoint } from '../game/render/AirLayer.ts';

const l = { fx: 10, fy: 10, tx: 70, ty: 50 };

describe('trajetória do míssil', () => {
  it('sai do silo e cai exatamente no alvo', () => {
    const a = missilePoint(l, 0);
    const b = missilePoint(l, 1);
    expect([a.x, a.z]).toEqual([10, 10]);
    expect(b.x).toBeCloseTo(70);
    expect(b.z).toBeCloseTo(50);
    expect(b.y).toBeCloseTo(0.6);
  });

  it('sobe quase na vertical, faz um arco alto e mergulha íngreme', () => {
    const p0 = missilePoint(l, 0);
    const p1 = missilePoint(l, 0.08);
    const climb = (p1.y - p0.y) / Math.hypot(p1.x - p0.x, p1.z - p0.z);
    expect(climb).toBeGreaterThan(5);
    const q0 = missilePoint(l, 0.92);
    const q1 = missilePoint(l, 1);
    const dive = (q0.y - q1.y) / Math.hypot(q1.x - q0.x, q1.z - q0.z);
    expect(dive).toBeGreaterThan(0.4);
    expect(missilePoint(l, 0.5).y).toBeGreaterThan(20);
  });
});
