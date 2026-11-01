import { describe, expect, it } from 'vitest';
import { BUILDINGS, type BuildingType } from '../../shared/sim/config.ts';
import { BUILDING_SOLID_HEIGHT, SPARSE_BUILDINGS } from '../../shared/sim/buildingHeights.ts';
import { buildingModel } from '../game/render/models/buildingModels.ts';

describe('altura sólida dos edifícios (colisão do drone) acompanha os modelos 3D', () => {
  for (const t of Object.keys(BUILDINGS) as BuildingType[]) {
    it(t, () => {
      const model = buildingModel(t, 1).height;
      const solid = BUILDING_SOLID_HEIGHT[t];
      if (SPARSE_BUILDINGS.includes(t)) expect(solid).toBeLessThanOrEqual(model);
      // o corpo do prédio: a tabela não pode ficar mais de 10% abaixo nem acima do modelo
      else expect(Math.abs(solid - model) / model).toBeLessThan(0.1);
    });
  }
});
