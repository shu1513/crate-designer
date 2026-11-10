import { describe, expect, it } from "vitest";
import { CLEARANCE, MIN_CLEAT_RUN } from "../src/core/constants.ts";
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
    // Skids sit under the long rails so the rail-to-skid screws land in the skid, not beside it.
    const rails = d.crate.pieces.find((p) => p.id === "BF-L")!.placements;
    for (const sk of d.crate.pieces.find((p) => p.id === "SK")!.placements) {
      expect(rails.some((r) => r.y >= sk.y - 1e-6 && r.y + r.dy <= sk.y + sk.dy + 1e-6), "rail within skid width").toBe(true);
    }
    expect(cut(d, "BF-L")).toBe("2 × 19×64×1574");
    expect(cut(d, "BF-S")).toBe("2 × 19×64×240");
    expect(cut(d, "BF-J")).toBe("2 × 19×64×240");
    expect(cut(d, "FP")).toBe("1 × 10×278×1574");
    expect(cut(d, "SS")).toBe("2 × 10×296×1632");
    expect(cut(d, "SC-V")).toBe("4 × 19×64×296");
    expect(cut(d, "SC-H")).toBe("4 × 19×64×1504");
    expect(cut(d, "SC-M")).toBe("4 × 19×64×104");
    expect(cut(d, "ES")).toBe("2 × 10×296×278");
    expect(cut(d, "EC-V")).toBe("4 × 19×64×296");
    expect(cut(d, "EC-H")).toBe("4 × 19×64×150");
    expect(cut(d, "LP")).toBe("1 × 10×336×1632");
    expect(cut(d, "LC-L")).toBe("2 × 19×64×1574");
    expect(cut(d, "LC-S")).toBe("2 × 19×64×150");
    expect(cut(d, "LC-M")).toBe("1 × 19×64×150");
    // The middle lid cleat stays clear of the top cradle boards' screw lines.
    const lcm = d.crate.pieces.find((p) => p.id === "LC-M")!.placements[0]!;
    for (const tb of d.restraint.topBoards) expect(lcm.x >= tb.x + tb.thickness + 5 || lcm.x + lcm.dx <= tb.x - 5).toBe(true);
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

  it("E10: a part shorter than two cradle boards is refused in plain words; a narrow part is not refused", () => {
    const short = mmPart(buildGlb([{ size: [40, 30, 30], center: [20, 0, 15] }])); // 40 mm long after orientation: under two 19 mm boards plus margins
    let caught: unknown;
    try { designFromPart(short, inputs(1, 1)); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(DesignError);
    expect((caught as DesignError).code).toBe("E10");
    expect((caught as DesignError).message).toMatch(/shorter than two cradle boards/);
    // 100 × 22 × 100 used to fail on a 0 mm end cleat; the cavity minimum now makes it buildable.
    const thin = mmPart(buildGlb([{ size: [100, 22, 100], center: [50, 0, 50] }]));
    const d = designFromPart(thin, inputs(1, 1));
    expect(d.crate.pieces.find((p) => p.id === "EC-H")!.length).toBe(MIN_CLEAT_RUN);
    expect(overlappingPieces(d.crate.pieces)).toEqual([]);
    // 60 × 40 × 30 used to give two overlapping short lid cleats; the minimum cavity length now keeps them apart,
    // and the end stops follow the part into the middle of the widened cavity.
    const tiny = designFromPart(mmPart(buildGlb([{ size: [60, 40, 30], center: [30, 0, 15] }])), inputs(1, 1));
    expect(overlappingPieces(tiny.crate.pieces)).toEqual([]);
    expect(tiny.crate.pieces.find((p) => p.id === "LC-S")!.length).toBe(MIN_CLEAT_RUN);
    const stops = tiny.restraint.endStops.map((s) => s.x).sort((a, b) => a - b);
    const o = tiny.layout.partOrigins[0]!;
    expect(stops[0]! + tiny.tier.c + CLEARANCE.g_c).toBeCloseTo(o.x, 6);
    expect(stops[1]).toBeCloseTo(o.x + 60 + CLEARANCE.g_c, 6);
  });

  it("a short lid cleat moves along the lid when a top cradle board would sit under it, so its screw rows stay reachable", () => {
    // 234 mm part at T2 (d = 89): station 1 lands near x 60..80 of the cavity, inside the first short cleat's 0..89 band.
    const d = designFromPart(mmPart(buildGlb([{ size: [234, 200, 200], center: [117, 0, 100] }])), inputs(1, 50));
    expect(d.tier.name).toBe("T2");
    const tops = d.restraint.topBoards.map((b) => [b.x, b.x + b.thickness] as const);
    const lcS = d.crate.pieces.find((p) => p.id === "LC-S")!;
    expect(lcS.placements).toHaveLength(2);
    for (const b of lcS.placements) for (const [a, z] of tops) expect(b.x >= z + 5 - 1e-9 || b.x + b.dx <= a - 5 + 1e-9, `LC-S at ${b.x} clear of board ${a}..${z}`).toBe(true);
    expect(lcS.placements[0]!.x).toBeGreaterThan(0); // the first one really moved
    expect(overlappingPieces(d.crate.pieces)).toEqual([]);
    // The lid step lists each short cleat's own position from the L end.
    const place = d.steps.find((s) => s.group === 9 && s.text.startsWith("Place LC-"))!;
    expect(place.positions!.filter((p) => p.label.startsWith("LC-S"))).toHaveLength(2);
    expect(place.positions!.find((p) => p.label.startsWith("LC-S 1"))!.mm).toBeCloseTo(lcS.placements[0]!.x + d.crate.w, 6);
  });

  it("E11: the design refuses itself when its own geometry check fails (simulated by a corrupt frame)", () => {
    // A part whose declared length is 10 mm under its real geometry puts the far end stop through the part.
    const part = mmPart(buildGlb([{ size: [360, 220, 258], center: [180, 0, 129] }]));
    const shifted = { ...part, dims: { ...part.dims, L: part.dims.L - 10 } };
    let caught: unknown;
    try { designFromPart(shifted, inputs(1, 20)); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(DesignError);
    expect((caught as DesignError).code).toBe("E11");
    expect((caught as DesignError).message).toMatch(/failed its own geometry check/);
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
    expect(d.fasteners.map((f) => f.size)).toEqual(["#8 × 25 mm", "#8 × 38 mm", "#10 × 75 mm", "#8 × 32 mm", "#10 × 100 mm"]); // corner screws bite the end cleat; board screws fit the 25 mm top boards; skid screws reach through the rail
    // Board screws are exactly what the steps say: one per web on a cradle board, three per end stop.
    const boards = [...d.restraint.bottomBoards, ...d.restraint.topBoards];
    expect(d.fasteners.find((f) => f.role === "board")!.count).toBe(boards.reduce((n, b) => n + b.pockets.length + 1, 0) + 3 * d.restraint.endStops.length);
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
