import { describe, expect, it } from 'vitest';
import { THREAT, ThreatTracker } from './threat.ts';

describe('estado de ameaça da trilha sonora (04/11)', () => {
  it('começa calmo, sobe na hora e só volta depois do tempo de espera', () => {
    const t = new ThreatTracker();
    expect(t.level(0)).toBe('calm');
    t.combat(10);
    expect(t.level(10)).toBe('combat');
    expect(t.level(10 + THREAT.combatHold - 1)).toBe('combat');
    expect(t.level(10 + THREAT.combatHold + 0.1)).toBe('calm');
  });
  it('perdas em sequência e muitos tiros viram ataque massivo; depois desce para combate e então calma', () => {
    const t = new ThreatTracker();
    for (let i = 0; i < THREAT.massiveLosses; i++) t.loss(100 + i);
    expect(t.level(110)).toBe('massive');
    const end = 100 + THREAT.massiveLosses - 1 + THREAT.massiveHold;
    expect(t.level(end + 1)).toBe('combat');
    expect(t.level(end + THREAT.combatHold + 1)).toBe('calm');
    const u = new ThreatTracker();
    for (let i = 0; i < THREAT.massiveShots; i++) u.shot(50 + i * 0.1);
    expect(u.level(60)).toBe('massive');
  });
  it('guerra nuclear segura o clima pesado por mais tempo; inimigos perto da base contam', () => {
    const t = new ThreatTracker();
    t.massive(0, THREAT.nuclearHold);
    expect(t.level(THREAT.nuclearHold - 1)).toBe('massive');
    const u = new ThreatTracker();
    u.enemiesNear(3, 0);
    expect(u.level(1)).toBe('combat');
    u.enemiesNear(THREAT.massiveEnemies, 2);
    expect(u.level(3)).toBe('massive');
    const v = new ThreatTracker();
    v.enemiesNear(0, 0);
    expect(v.level(1)).toBe('calm');
  });
});
