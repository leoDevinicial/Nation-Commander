import { Simulation } from '../sim/Simulation.ts';

// Testes de regra anteriores à rede elétrica: as construções funcionam sem energia. Os testes da rede
// (`power.test.ts`) passam `power: true` no `SimulationInit`.
Simulation.powerByDefault = false;
