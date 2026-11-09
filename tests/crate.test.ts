import { describe, expect, it } from "vitest";
import { CLEARANCE } from "../src/core/constants.ts";
import { DesignError } from "../src/core/errors.ts";
import { boxesOverlap, meshIntersectsBox, overlappingPieces, piecesHitByPart } from "../src/core/checks.ts";
import { solids, woodWeightKg } from "../src/core/crate.ts";
import { designFromPart, partInCrate, type Design } from "../src/core/design.ts";
import { wallScrewLength } from "../src/core/fasteners.ts";
import { loadPart } from "../src/core/part.ts";
import { TIERS } from "../src/core/tier.ts";
import { buildGlb } from "./helpers/glb.ts";
import { loadSample, samplesPresent } from "./helpers/samples.ts";

const mmPart = (glb: ArrayBuffer) => loadPart(glb, { modelUnits: "mm", upAxis: "Z" });
const inputs = (quantity: number, weightKg: number) => ({ quantity, weightKg, modelUnits: "mm" as const, upAxis: "Z" as const });

/** Square-section stand-in for the sample shaft: same envelope 1530 × 172 × 172. */
const shaftLike = () => mmPart(buildGlb([{ size: [1530, 88, 88], center: [765, 0, 86] }, { size: [40, 172, 172], center: [320, 0, 86] }, { size: [80, 142, 142], center: [1300, 0, 86] }]));

function cut(d: Design, id: string) {
  const p = d.crate.pieces.filter((x) => x.id === id);
  expect(p.length, id).toBeGreaterThan(0);
  return p.map((x) => `${x.count} × ${x.thickness}×${x.width}×${x.length}`).join("; ");
}

describe("R15, R17: crate pieces and sizes", () => {
  it("T-R17: the spec worked example (shaft envelope × 1, 27 kg) gives outer 1632 × 336 × 414 with 2 skids and the listed cut sizes", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    expect(d.tier.name).toBe("T1");
    expect(d.crate.inner).toEqual({ L: 1574, W: 278, H: 222 });
    expect(d.crate.outer).toEqual({ L: 1632, W: 336, H: 414 });
    expect(d.crate.skids).toBe(2);
    expect(cut(d, "SK")).toBe("2 × 38×89×1632");
    expect(cut(d, "BF-L")).toBe("2 × 19×64×1574");
    expect(cut(d, "BF-S")).toBe("2 × 19×64×240");
    expect(cut(d, "BF-J")).toBe("2 × 19×64×240");
    expect(cut(d, "FP")).toBe("1 × 10×278×1574");
    expect(cut(d, "SS")).toBe("2 × 10×296×1632");
    expect(cut(d, "SC-V")).toBe("4 × 19×64×296");
    expect(cut(d, "SC-H")).toBe("4 × 19×64×1504");
    expect(cut(d, "SC-M")).toBe("4 × 19×64×168");
    expect(cut(d, "ES")).toBe("2 × 10×296×278");
    expect(cut(d, "EC-V")).toBe("4 × 19×64×296");
    expect(cut(d, "EC-H")).toBe("4 × 19×64×150");
    expect(cut(d, "LP")).toBe("1 × 10×336×1632");
    expect(cut(d, "LC-L")).toBe("2 × 19×64×1632");
    expect(cut(d, "LC-S")).toBe("2 × 19×64×208");
    expect(cut(d, "LC-M")).toBe("1 × 19×64×208");
    expect(d.restraint.bottomBoards).toHaveLength(3);
    expect(d.woodKg).toBeGreaterThanOrEqual(27);
    expect(d.woodKg).toBeLessThanOrEqual(33);
    expect(d.grossKg).toBe(27 + d.woodKg);
  });

  it("T-R17: a small light part gets no skids; a heavy one does even when short", () => {
    const housing = mmPart(buildGlb([{ size: [435, 445, 254], center: [0, 0, 127] }]));
    expect(designFromPart(housing, inputs(1, 11.8)).crate.skids).toBe(0);
    const heavy = designFromPart(housing, inputs(1, 95)).crate; // 95 kg + wood ≥ 91 kg
    expect(heavy.skids).toBe(2);
    // Wide crate: three skids.
    const wide = designFromPart(housing, inputs(4, 11.8)).crate;
    expect(wide.outer.W).toBeGreaterThan(914);
    expect(wide.skids).toBe(3);
  });

  it("T-R15: every piece has an ID, a material, positive cut dimensions, and as many placements as its count", () => {
    for (const part of [shaftLike(), mmPart(buildGlb([{ size: [360, 220, 258], center: [0, 0, 129] }]))]) {
      for (const n of [1, 4, 8]) {
        const d = designFromPart(part, inputs(n, 21.5));
        for (const p of d.crate.pieces) {
          expect(p.id).toMatch(/^[A-Z]+(-[A-Z0-9.]+)?$/);
          expect(p.material.label.length).toBeGreaterThan(0);
          expect(Math.min(p.length, p.width, p.thickness)).toBeGreaterThan(0);
          expect(p.placements).toHaveLength(p.count);
        }
      }
    }
  });

  it("E10: a part too small for the rules is refused with the piece named", () => {
    // 100 × 22 × 100: cavity width 128 = 2 × 64, so the end cleat EC-H would be 0 mm long.
    const thin = mmPart(buildGlb([{ size: [100, 22, 100], center: [50, 0, 50] }]));
    let caught: unknown;
    try { designFromPart(thin, inputs(1, 1)); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(DesignError);
    expect((caught as DesignError).code).toBe("E10");
    expect((caught as DesignError).message).toBe("This part is too small for the crate rules. Smallest piece would be EC-H at 0 mm.");
  });

  it("wood weight follows the density rule and pockets are subtracted", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    const fp = d.crate.pieces.find((p) => p.id === "FP")!;
    expect([fp.length, fp.width, fp.thickness]).toEqual([1574, 278, 10]);
    expect(woodWeightKg([fp])).toBe(Math.round(((fp.length * fp.width * fp.thickness) / 1e9) * 600 * 2) / 2);
    const bc = d.crate.pieces.find((p) => p.id === "BC-1")!;
    const gross = ((bc.length * bc.width * bc.thickness) / 1e9) * 500;
    expect(woodWeightKg([bc])).toBeLessThanOrEqual(Math.round(gross * 2) / 2);
    expect(solids(bc).length).toBeGreaterThanOrEqual(3); // two walls and the floor strip around one pocket
  });
});

describe("R16: fasteners", () => {
  it("T-R16: screws only, counts rounded to tens and ≥ computed, lengths within the wood joined", () => {
    for (const tier of TIERS) {
      const l = wallScrewLength(tier.t, tier.c);
      expect(l).toBeGreaterThanOrEqual(25);
      expect(l).toBeLessThanOrEqual(tier.t + tier.c);
    }
    const d = designFromPart(shaftLike(), inputs(1, 27));
    for (const f of d.fasteners) {
      expect(f.type).toBe("wood screw");
      expect(f.countAbout % 10).toBe(0);
      expect(f.countAbout).toBeGreaterThanOrEqual(f.count);
      expect(f.lengthMm).toBeGreaterThanOrEqual(25);
      expect(f.lengthMm).toBeLessThanOrEqual(f.joinsMm);
      expect(f.count).toBeGreaterThan(0);
    }
    expect(d.fasteners.map((f) => f.size)).toEqual(["#8 × 25 mm", "#8 × 38 mm", "#8 × 32 mm"]); // board screws fit the 25 mm top boards
  });
});

describe("R24, R10: geometry checks", () => {
  it("box overlap: touching faces do not count, interpenetration does", () => {
    const a = { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10 };
    expect(boxesOverlap(a, { x: 10, y: 0, z: 0, dx: 10, dy: 10, dz: 10 })).toBe(false);
    expect(boxesOverlap(a, { x: 9, y: 0, z: 0, dx: 10, dy: 10, dz: 10 })).toBe(true);
  });

  it("triangle-box test: a mesh resting on a box face does not intersect it; pushed 2 mm in, it does", () => {
    const cube = mmPart(buildGlb([{ size: [100, 100, 100], center: [50, 50, 50] }]));
    const floor = { x: -500, y: -500, z: -50, dx: 1000, dy: 1000, dz: 50 };
    expect(meshIntersectsBox(cube.positions, floor)).toBe(false);
    expect(meshIntersectsBox(cube.positions, floor, [0, 0, -2])).toBe(true);
    // A thin wall passing through the cube's interior with no vertex inside the box still counts.
    const wall = { x: 40, y: -500, z: -500, dx: 20, dy: 1000, dz: 1000 };
    expect(meshIntersectsBox(cube.positions, wall)).toBe(true);
  });

  it("T-R24: no two pieces overlap and no piece cuts into the part, for three shapes at 1, 4, 8", () => {
    const shapes = [
      shaftLike(),
      mmPart(buildGlb([{ size: [360, 220, 258], center: [0, 0, 129] }])),
      mmPart(buildGlb([{ size: [435, 445, 254], center: [0, 0, 127] }])),
    ];
    for (const part of shapes) {
      for (const n of [1, 4, 8]) {
        const d = designFromPart(part, inputs(n, 20));
        expect(overlappingPieces(d.crate.pieces), `pieces n=${n}`).toEqual([]);
        for (const o of d.layout.partOrigins) {
          expect(piecesHitByPart(d.crate.pieces, partInCrate(d.frame, o)), `part n=${n}`).toEqual([]);
        }
      }
    }
  });

  it("T-R10 (diagnostic): seated part is free by 2 mm sideways and up, blocked at 7 mm sideways and 4 mm up", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    const mesh = partInCrate(d.frame, d.layout.partOrigins[0]!);
    const free: [number, number, number][] = [[2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2]];
    const blocked: [number, number, number][] = [[7, 0, 0], [-7, 0, 0], [0, 7, 0], [0, -7, 0], [0, 0, 4]];
    for (const o of free) expect(piecesHitByPart(d.crate.pieces, mesh, o), `free ${o}`).toEqual([]);
    for (const o of blocked) expect(piecesHitByPart(d.crate.pieces, mesh, o).length, `blocked ${o}`).toBeGreaterThan(0);
    // Seated: moving down 2 mm penetrates the pocket floor.
    expect(piecesHitByPart(d.crate.pieces, mesh, [0, 0, -2]).length).toBeGreaterThan(0);
    expect(CLEARANCE.g_c).toBe(3);
  });

  it.skipIf(!samplesPresent)("T-R24 and T-R17 on the real samples", () => {
    for (const [id, kg] of [["PART-001", 21.5], ["PART-002", 27], ["PART-003", 11.8]] as const) {
      const part = loadSample(id).part;
      for (const n of [1, 4, 8]) {
        const d = designFromPart(part, { quantity: n, weightKg: kg, modelUnits: "m", upAxis: "Z" });
        expect(overlappingPieces(d.crate.pieces), `${id} n=${n}`).toEqual([]);
        for (const o of d.layout.partOrigins) expect(piecesHitByPart(d.crate.pieces, partInCrate(d.frame, o)), `${id} n=${n}`).toEqual([]);
      }
    }
    const shaft = designFromPart(loadSample("PART-002").part, { quantity: 1, weightKg: 27, modelUnits: "m", upAxis: "Z" });
    expect(shaft.crate.outer.L).toBeCloseTo(1632, 2);
    expect(shaft.crate.outer.W).toBeCloseTo(336, 2);
    expect(shaft.crate.outer.H).toBeCloseTo(414, 2);
    expect(Math.abs(shaft.woodKg - 30)).toBeLessThanOrEqual(3);
    // Spec worked example: cradle boards 111 tall, first pocket 178 × 86, end stops 155 (−X) and 161 (+X).
    expect(shaft.restraint.bottomBoards[0]!.height).toBeCloseTo(111, 1);
    expect(shaft.restraint.bottomBoards[0]!.pockets[0]!.width).toBeCloseTo(178, 1);
    expect(shaft.restraint.bottomBoards[0]!.pockets[0]!.depth).toBeCloseTo(86, 1);
    expect(shaft.restraint.endStops.map((s) => Math.round(s.height))).toEqual([155, 161]);
    expect(shaft.grossKg).toBeCloseTo(27 + shaft.woodKg, 9);
    const housing = designFromPart(loadSample("PART-003").part, { quantity: 1, weightKg: 11.8, modelUnits: "m", upAxis: "Z" });
    expect(housing.crate.skids).toBe(0);
  });
});
