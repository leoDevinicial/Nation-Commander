import { describe, expect, it } from 'vitest';
import { TICK_RATE, Terrain } from '../sim/config.ts';
import { Simulation } from '../sim/Simulation.ts';
import { TSUNAMI, tsunamiField } from '../sim/tsunami.ts';
import { flatMap, TEST_START } from './helpers.ts';

/**
 * Tsunami (11/11): mapa 64×64 com mar nas colunas 16..47 (terra nas laterais, com os QGs nos cantos) e uma ilha de
 * 6×20 no meio do mar, de x 34 a 39, y 22 a 41. A explosão é em (26, 32), a oeste da ilha.
 */
const map = () =>
  flatMap(64, (set) => {
    for (let y = 0; y < 64; y++) for (let x = 16; x < 48; x++) set(x, y, Terrain.Water);
    for (let y = 22; y < 42; y++) for (let x = 34; x < 40; x++) set(x, y, Terrain.Plains);
  });

const cell = (sim: Simulation, cx: number, cy: number) => ({ x: (cx + 0.5) * sim.map.cellSize, y: (cy + 0.5) * sim.map.cellSize });

describe('tsunami', () => {
  it('a onda anda só pela água: contorna a ilha e invade só a faixa da costa', () => {
    const m = map();
    const f = tsunamiField(m, 26, 32);
    expect(f[32 * 64 + 26]).toBe(0);
    // atrás da ilha (x 42) fica mais longe pela água que a mesma distância em linha reta do outro lado (x 10 é terra)
    expect(f[32 * 64 + 42]!).toBeGreaterThan(16 + 2);
    // a costa da ilha (terra) é alcançada; o meio da ilha (3 células da margem), não
    expect(f[32 * 64 + 34]!).toBeLessThan(Infinity);
    expect(f[32 * 64 + 36]).toBe(Infinity);
    // terra firme a oeste: as duas primeiras colunas da margem, sim; a terceira, não
    expect(f[32 * 64 + 15]!).toBeLessThan(Infinity);
    expect(f[32 * 64 + 14]!).toBeLessThan(Infinity);
    expect(f[32 * 64 + 13]).toBe(Infinity);
    // explosão em terra: nada
    expect(tsunamiField(m, 5, 5).every((d) => d === Infinity)).toBe(true);
  });

  it('afunda ou avaria navios de todos os lados (inclusive de quem lançou) e atinge a costa, não o interior', () => {
    const sim = new Simulation({ map: map(), playerCount: 2, startingUnits: [], allAtWar: false, startingResources: TEST_START });
    const ownNear = sim.addUnit('frigate', 0, cell(sim, 24, 32));
    const enemyNear = sim.addUnit('aircraft_carrier', 1, cell(sim, 28, 30));
    const open = sim.addUnit('frigate', 1, cell(sim, 26, 8));
    const sheltered = sim.addUnit('frigate', 1, cell(sim, 43, 32));
    const coastTroop = sim.addUnit('infantry', 1, cell(sim, 15, 32));
    const inland = sim.addUnit('infantry', 1, cell(sim, 10, 32));
    // a ogiva na água começa a onda; na terra, não
    expect(sim.tsunamis.detonate(0, cell(sim, 5, 32))).toBe(false);
    expect(sim.tsunamis.detonate(0, cell(sim, 26, 32))).toBe(true);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'tsunami' && e.owner === 0)).toBe(true);
    const seconds = (TSUNAMI.reach + TSUNAMI.coastCells + 2) / TSUNAMI.speed;
    for (let i = 0; i < seconds * TICK_RATE; i++) sim.step();
    expect(sim.tsunamis.active).toBe(0);
    const hp = (u: { id: number; hp: number }) => (sim.entities.get(u.id) ? u.hp : 0);
    // perto da explosão: afundam, inclusive a fragata de quem lançou e o porta-aviões
    expect(hp(ownNear)).toBe(0);
    expect(hp(enemyNear)).toBe(0);
    // em mar aberto a 24 células: avariada, mas de pé
    expect(hp(open)).toBeGreaterThan(0);
    expect(hp(open)).toBeLessThan(900);
    // atrás da ilha (mais longe pelo caminho da água) sofre menos que em mar aberto
    expect(hp(sheltered)).toBeGreaterThan(hp(open));
    // a tropa na margem morre; a do interior nem sente
    expect(hp(coastTroop)).toBe(0);
    expect(inland.hp).toBe(70);
  });

  it('o tsunami em andamento vai no salvamento e continua igual depois de carregar', () => {
    const sim = new Simulation({ map: map(), playerCount: 2, startingUnits: [], allAtWar: false, startingResources: TEST_START });
    for (let i = 0; i < 6; i++) sim.addUnit('frigate', i % 2, cell(sim, 20 + i * 4, 10 + i * 6));
    sim.tsunamis.detonate(1, cell(sim, 26, 32));
    for (let i = 0; i < 3 * TICK_RATE; i++) sim.step();
    const copy = Simulation.deserialize(sim.serialize());
    for (let i = 0; i < 8 * TICK_RATE; i++) {
      sim.step();
      copy.step();
    }
    expect(copy.serialize()).toBe(sim.serialize());
  });
});
