import { Simulation } from '../sim/Simulation.ts';

// Testes de regra anteriores à rede elétrica: as construções funcionam sem energia. Os testes da rede
// (`power.test.ts`) passam `power: true` no `SimulationInit`.
Simulation.powerByDefault = false;
// Idem para os construtores (01/11): os testes antigos contam com a obra andando sozinha no tempo de `buildSeconds`;
// `builders.test.ts` passa `builders: true`.
Simulation.buildersByDefault = false;
