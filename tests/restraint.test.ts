import { describe, expect, it } from "vitest";
import { CLEARANCE } from "../src/core/constants.ts";
import { DesignError } from "../src/core/errors.ts";
import { chooseLayout, planLayout } from "../src/core/layout.ts";
import { orientPart } from "../src/core/orientation.ts";
import { loadPart } from "../src/core/part.ts";
import { chooseStations, designRestraint, nominalStations, slabExtents } from "../src/core/restraint.ts";
import { selectTier } from "../src/core/tier.ts";
import { buildGlb } from "./helpers/glb.ts";
import { loadSample, samplesPresent } from "./helpers/samples.ts";

const { g_c, web, c_floor } = CLEARANCE;
const mm = (glb: ArrayBuffer) => orientPart(loadPart(glb, { modelUnits: "mm", upAxis: "Z" }));

/** A stepped shaft along X made of boxes (square section stands in for round): 1530 long, 88 thick, 172 collar at 300..340, 142 collar at 1260..1340. */
function steppedShaft() {
  return mm(buildGlb([
    { size: [1530, 88, 88], center: [765, 0, 0] },
    { size: [40, 172, 172], center: [320, 0, 0] },
    { size: [80, 142, 142], center: [1300, 0, 0] },
  ]));
}

describe("5.4 slab sampling", () => {
  it("collects vertices inside the slab and edge crossings of its faces", () => {
    const frame = mm(buildGlb([{ size: [1000, 100, 60], center: [500, 0, 30] }]));
    const e = slabExtents(frame.positions, 490, 510)!; // no vertices inside; only crossings
    expect(e.pointCount).toBeGreaterThan(0);
    expect([e.minY, e.maxY, e.minZ, e.maxZ]).toEqual([0, 100, 0, 60]);
    expect(e.bearingWidth).toBe(100);
    expect(e.z_eq).toBe(60); // a rectangle is widest all the way up; side walls go to the top
    expect(slabExtents(frame.positions, 2000, 2020)).toBeNull();
    // A slab straddling a step scores the smaller face (100, not 200) when both sections share a bottom...
    const stepped = mm(buildGlb([{ size: [500, 100, 60], center: [250, 0, 30] }, { size: [500, 200, 120], center: [750, 0, 60] }]));
    expect(slabExtents(stepped.positions, 490, 510)!.bearingWidth).toBe(100);
    expect(slabExtents(stepped.positions, 600, 620)!.bearingWidth).toBe(200);
    // ...and scores 0 when one face has no seat at the slab's lowest point (raised second section).
    const raised = mm(buildGlb([{ size: [500, 100, 60], center: [250, 0, 30] }, { size: [500, 200, 120], center: [750, 0, 100] }]));
    expect(slabExtents(raised.positions, 490, 510)!.bearingWidth).toBe(0);
  });

  it("nominal stations: 2 at 20%/80% for short parts, more every ≤ 600 mm", () => {
    expect(nominalStations(360)).toEqual([72, 288]);
    expect(nominalStations(445)).toEqual([89, 356]);
    expect(nominalStations(1530)).toEqual([306, 765, 1224]);
    const n = nominalStations(3000);
    expect(n).toHaveLength(4);
    for (let i = 1; i < n.length; i++) expect(n[i]! - n[i - 1]!).toBeLessThanOrEqual(600);
  });
});

describe("R8: stations and pockets", () => {
  it("T-R8: the station search moves onto a collar (widest bearing) and the pocket follows the collar", () => {
    const frame = steppedShaft();
    const tier = selectTier(27);
    const stations = chooseStations(frame, tier);
    expect(stations).toHaveLength(3);
    // Station 1 (nominal 306) sits on the 172 collar (x 300..340).
    expect(stations[0]!.x).toBeGreaterThanOrEqual(300 + tier.c / 2 + 2 - 0.001);
    expect(stations[0]!.x).toBeLessThanOrEqual(340 - tier.c / 2 - 2 + 0.001);
    expect(stations[0]!.extents.maxY - stations[0]!.extents.minY).toBeCloseTo(172, 6);
    // Station 2 stays on the plain shaft; station 3 (nominal 1224) walks right onto the 142 collar.
    expect(stations[1]!.extents.maxY - stations[1]!.extents.minY).toBeCloseTo(88, 6);
    expect(stations[2]!.extents.maxY - stations[2]!.extents.minY).toBeCloseTo(142, 6);
    for (let i = 1; i < 3; i++) {
      expect(stations[i]!.x - stations[i - 1]!.x).toBeGreaterThanOrEqual(100);
      expect(stations[i]!.x - stations[i - 1]!.x).toBeLessThanOrEqual(600);
    }
  });

  it("T-R8: pockets are the slab extents plus 3 mm each side; floors keep the axis level; top pockets clear by 3 mm", () => {
    const frame = steppedShaft();
    const { tier, layout } = planLayout(frame, 1, 27);
    const r = designRestraint(frame, layout, tier);
    expect(r.bottomBoards).toHaveLength(3);
    expect(r.topBoards).toHaveLength(3);
    const widths = r.bottomBoards.map((b) => b.pockets[0]!.width);
    expect(widths).toEqual([178, 94, 148]);
    // Square sections are widest all the way up, so the pocket walls reach the top of each section.
    const depths = r.bottomBoards.map((b) => b.pockets[0]!.depth);
    expect(depths).toEqual([172, 88, 142]);
    // Seated datum: the pocket floor (board top − depth) is at the slab's lowest point for every station,
    // so the centre line (floor + half section) is the same height everywhere.
    const centre = r.bottomBoards.map((b) => b.height - b.pockets[0]!.depth + (b.pockets[0]!.width - 2 * g_c) / 2);
    expect(new Set(centre.map((a) => Math.round(a))).size).toBe(1);
    expect(r.bottomBoards[0]!.height).toBe(c_floor + 172); // h_b = c_floor + z_eq
    // Top board: height fills the cavity; its pocket reaches exactly 3 mm above the part.
    for (const [i, tb] of r.topBoards.entries()) {
      const bb = r.bottomBoards[i]!;
      expect(tb.height + bb.height).toBe(layout.H_in);
      const partTop = c_floor + r.stations[i]!.extents.maxZ;
      const pocketTop = layout.H_in - tb.height + tb.pockets[0]!.depth;
      expect(pocketTop - partTop).toBeCloseTo(g_c, 6);
      expect(tb.pockets[0]!.width).toBe(widths[i]);
    }
  });

  it("T-R8: a flat plate gets a shallow full-width pocket; a wedge gets a pocket as wide as its widest point (no snag)", () => {
    const plate = mm(buildGlb([{ size: [360, 220, 28], center: [180, 0, 14] }]));
    const { tier, layout } = planLayout(plate, 1, 10);
    const r = designRestraint(plate, layout, tier);
    expect(r.bottomBoards).toHaveLength(2);
    expect(r.bottomBoards[0]!.pockets[0]).toMatchObject({ width: 226, depth: 28, leftOffset: web });
    // Wedge: narrow at the bottom (40) and wide at the top (200). Pocket must be 206 wide so it drops straight in.
    const wedge = mm(buildGlb([
      { size: [300, 40, 50], center: [150, 0, 25] },
      { size: [300, 200, 50], center: [150, 0, 75] },
    ]));
    const w = designRestraint(wedge, chooseLayout(wedge, 1, tier), tier);
    expect(w.bottomBoards[0]!.pockets[0]!.width).toBe(206);
    expect(w.bottomBoards[0]!.pockets[0]!.depth).toBe(100); // z_eq at the top of the wide block; floor at the bottom of the narrow one
  });

  it("E6: a part with no geometry near any station is refused", () => {
    // Two small blocks at the very ends of a 1000 mm span, nothing in the middle 20%..80% ± 10%.
    const frame = mm(buildGlb([
      { size: [50, 50, 50], center: [25, 0, 25] },
      { size: [50, 50, 50], center: [975, 0, 25] },
    ]));
    expect(() => chooseStations(frame, selectTier(10))).toThrowError(DesignError);
    expect(() => chooseStations(frame, selectTier(10))).toThrowError(/solid cross-sections/);
  });

  it.skipIf(!samplesPresent)("T-R8 samples: shaft 3+3 boards with station 1 on the 172 collar (178 × 86); bracket 2+2 with a 226 × 28 pocket; housing never on an isolated boss", () => {
    const shaft = orientPart(loadSample("PART-002").part);
    let plan = planLayout(shaft, 1, 27);
    let r = designRestraint(shaft, plan.layout, plan.tier);
    expect(r.bottomBoards).toHaveLength(3);
    expect(r.topBoards).toHaveLength(3);
    expect(r.bottomBoards[0]!.pockets[0]!.width).toBeCloseTo(178, 0);
    expect(r.bottomBoards[0]!.pockets[0]!.depth).toBeCloseTo(86, 0);
    expect(new Set(r.stations.map((s) => Math.round(s.extents.z_eq))).size).toBe(1); // axis level

    const bracket = orientPart(loadSample("PART-001").part);
    plan = planLayout(bracket, 1, 21.5);
    r = designRestraint(bracket, plan.layout, plan.tier);
    expect(r.bottomBoards).toHaveLength(2);
    expect(r.bottomBoards[0]!.pockets[0]!.width).toBeCloseTo(226, 0);
    expect(r.bottomBoards[0]!.pockets[0]!.depth).toBeCloseTo(28, 0);

    const housing = orientPart(loadSample("PART-003").part);
    plan = planLayout(housing, 1, 11.8);
    r = designRestraint(housing, plan.layout, plan.tier);
    for (const s of r.stations) expect(s.extents.bearingWidth).toBeGreaterThanOrEqual(200);
  });
});

describe("R9: end stops", () => {
  it("T-R9: rows + 1 stops at the part ends + 3 mm, shared between rows, no overlaps at T3", () => {
    const frame = mm(buildGlb([{ size: [360, 220, 258], center: [180, 0, 129] }]));
    const { tier, layout } = planLayout(frame, 8, 8 * 50); // 400 kg → T3, c = 38
    expect(tier.name).toBe("T3");
    const r = designRestraint(frame, layout, tier);
    expect(r.endStops).toHaveLength(layout.rows + 1);
    const rowsX = [...new Set(layout.partOrigins.map((p) => p.x))].sort((a, b) => a - b);
    expect(r.endStops[0]!.x + tier.c + g_c).toBeCloseTo(rowsX[0]!, 6);
    for (let k = 1; k <= layout.rows; k++) {
      expect(r.endStops[k]!.x).toBeCloseTo(rowsX[k - 1]! + 360 + g_c, 6);
    }
    const boards = [...r.bottomBoards, ...r.endStops].sort((a, b) => a.x - b.x);
    for (let i = 1; i < boards.length; i++) expect(boards[i]!.x).toBeGreaterThanOrEqual(boards[i - 1]!.x + boards[i - 1]!.thickness - 1e-6);
    for (const s of r.endStops) expect(s.height).toBe(Math.min(layout.H_in, c_floor + 258));
  });

  it("end stops reach a raised stub at one end and the body at the other, capped at the cavity height", () => {
    const frame = mm(buildGlb([
      { size: [1000, 88, 88], center: [500, 0, 44] },
      { size: [50, 100, 100], center: [1025, 0, 50] }, // stub at the +X end, 100 tall
    ]));
    const { tier, layout } = planLayout(frame, 1, 20);
    const r = designRestraint(frame, layout, tier);
    expect(r.endStops[0]!.height).toBe(c_floor + 88);
    expect(r.endStops[1]!.height).toBe(c_floor + 100);
  });
});

describe("R11: pocket table validity", () => {
  it("T-R11: pockets never overlap and leave ≥ 50 mm of wood between them and at both ends", () => {
    const frame = mm(buildGlb([{ size: [445, 435, 254], center: [222.5, 0, 127] }]));
    for (const n of [1, 4, 8]) {
      const { tier, layout } = planLayout(frame, n, n * 11.8);
      const r = designRestraint(frame, layout, tier);
      for (const b of [...r.bottomBoards, ...r.topBoards]) {
        const sorted = [...b.pockets].sort((a, c) => a.leftOffset - c.leftOffset);
        expect(sorted.length).toBeGreaterThan(0);
        expect(sorted[0]!.leftOffset).toBeGreaterThanOrEqual(web);
        for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.leftOffset - (sorted[i - 1]!.leftOffset + sorted[i - 1]!.width)).toBeGreaterThanOrEqual(web);
        const last = sorted.at(-1)!;
        expect(b.length - (last.leftOffset + last.width)).toBeGreaterThanOrEqual(web);
        for (const p of sorted) {
          expect(p.width).toBeGreaterThan(0);
          expect(p.depth).toBeGreaterThan(0);
        }
      }
    }
  });
});
