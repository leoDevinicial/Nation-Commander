import { describe, expect, it } from 'vitest';
import { PRODUCTION_QUEUE_LIMIT, POP_ABSOLUTE_CAP, RECRUIT, UNITS, emptyStockpile } from '../sim/config.ts';
import { checkProduce, type ProduceContext } from '../sim/production.ts';

const rich = { supplies: 900, food: 900, wood: 900, stone: 900, iron: 900, oil: 900 };
const ctx = (over: Partial<ProduceContext> = {}): ProduceContext => ({
  buildingType: 'barracks',
  level: 1,
  spec: null,
  progress: 1,
  queueLength: 0,
  resources: { ...rich },
  recruits: 3,
  popTotal: 20,
  popCap: 40,
  techs: null,
  ...over,
});

describe('regra de produção (servidor e HUD)', () => {
  it('com tudo em ordem, libera e devolve o custo real', () => {
    const r = checkProduce('infantry', ctx());
    expect(r.blocker).toBeNull();
    expect(r.short).toBeNull();
    expect(r.cost).toEqual(UNITS.infantry.cost);
  });

  it('recursos sobrando mas sem recruta: bloqueado com motivo claro (o "botão cinza" sem explicação)', () => {
    const r = checkProduce('tank', ctx({ buildingType: 'factory', recruits: 0 }));
    expect(r.short).toBe('sem recruta');
    expect(r.blocker).toMatch(/aliste recrutas na base militar/);
  });

  it('diz exatamente o que falta', () => {
    const res = { ...rich, oil: 0 };
    const r = checkProduce('tank', ctx({ buildingType: 'factory', resources: res }));
    expect(r.short).toBe(`faltam ${UNITS.tank.cost.oil} petróleo`);
    expect(r.blocker).toMatch(/Recursos insuficientes: faltam .*petróleo/);
    expect(checkProduce('infantry', ctx({ resources: emptyStockpile() })).short).toMatch(/^faltam /);
  });

  it('obra, fila cheia, moradia e teto nacional', () => {
    expect(checkProduce('infantry', ctx({ progress: 0.5 })).short).toBe('em obra');
    expect(checkProduce('infantry', ctx({ queueLength: PRODUCTION_QUEUE_LIMIT })).short).toBe('fila cheia');
    expect(checkProduce('recruit', ctx({ popTotal: 40, popCap: 40 })).short).toBe('sem moradia');
    expect(checkProduce('recruit', ctx({ popTotal: POP_ABSOLUTE_CAP, popCap: POP_ABSOLUTE_CAP })).short).toBe(`limite ${POP_ABSOLUTE_CAP}`);
    // unidades militares usam recrutas já formados: não dependem de moradia livre
    expect(checkProduce('infantry', ctx({ popTotal: 40, popCap: 40 })).blocker).toBeNull();
    expect(checkProduce('citizen', ctx()).short).toBe('só no QG');
  });

  it('custo acompanha a especialização do edifício', () => {
    // centro de alistamento: recrutas 30% mais baratos
    const r = checkProduce('recruit', ctx({ level: 6, spec: 'enlistment' }));
    expect(r.cost.food).toBeLessThan(RECRUIT.cost.food!);
  });
});
