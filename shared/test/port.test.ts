import { describe, expect, it } from "vitest";
import { Terrain } from "../sim/config.ts";
import { Simulation } from "../sim/Simulation.ts";
import { flatMap } from "./helpers.ts";

/** O porto só pode ser construído encostado na água (antes dava para erguê-lo em qualquer lugar). */
describe("Porto na margem da água", () => {
  const sim = new Simulation({
    map: flatMap(40, (set) => {
      for (let y = 0; y < 40; y++) set(20, y, Terrain.Water);
    }),
    playerCount: 2,
    startingUnits: [],
  });

  it("recusa o porto longe da água", () => {
    expect(sim.placementError(0, "port", { cx: 6, cy: 6 })).toMatch(
      /margem da água/,
    );
  });

  it("aceita o porto com o cais encostado na água", () => {
    expect(sim.placementError(0, "port", { cx: 18, cy: 4 }) ?? "").not.toMatch(
      /margem da água/,
    );
  });
});
