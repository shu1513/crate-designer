import { describe, expect, it } from "vitest";
import { DesignError } from "../src/core/errors.ts";
import { loadPart } from "../src/core/part.ts";
import { validateInputs } from "../src/core/inputs.ts";
import { orientPart } from "../src/core/orientation.ts";
import { chooseLayout, planLayout } from "../src/core/layout.ts";
import { promoteIfWide, selectTier } from "../src/core/tier.ts";
import { CLEARANCE } from "../src/core/constants.ts";
import { buildGlb } from "./helpers/glb.ts";
import { loadSample, samplesPresent } from "./helpers/samples.ts";

const box = (L: number, W: number, H: number) => loadPart(buildGlb([{ size: [L, W, H] }]), { modelUnits: "mm", upAxis: "Z" });

function bounds(p: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k]!, p[i + k]!);
    max[k] = Math.max(max[k]!, p[i + k]!);
  }
  return { min, max };
}
function verticesWhere(p: Float32Array, pred: (x: number, y: number, z: number) => boolean): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < p.length; i += 3) if (pred(p[i]!, p[i + 1]!, p[i + 2]!)) out.push([p[i]!, p[i + 1]!, p[i + 2]!]);
  return out;
}

describe("R3: input validation", () => {
  it("T-R3: E3 for bad quantity, E4 for bad weight, values pass through otherwise", () => {
    expect(() => validateInputs(0, 10)).toThrowError(DesignError);
    expect(() => validateInputs(1.5, 10)).toThrowError(/whole number/);
    expect(() => validateInputs(2, 0)).toThrowError(/greater than 0/);
    expect(() => validateInputs(2, Number.NaN)).toThrowError(/greater than 0/);
    expect(validateInputs(4, 21.5)).toEqual({ quantity: 4, weightKg: 21.5 });
  });
});

describe("R5: orientation", () => {
  it("T-R5: a tall 100 × 100 × 500 box lies down with 500 along X", () => {
    const frame = orientPart(box(100, 100, 500));
    expect([frame.L, frame.W, frame.H]).toEqual([500, 100, 100]);
    expect(frame.rules).toEqual(["laid-down"]);
    // Positions were really rotated and re-based: min corner at the origin, max at (500, 100, 100).
    let maxX = 0, minX = Infinity;
    for (let i = 0; i < frame.positions.length; i += 3) {
      maxX = Math.max(maxX, frame.positions[i]!);
      minX = Math.min(minX, frame.positions[i]!);
    }
    expect(minX).toBeCloseTo(0, 6);
    expect(maxX).toBeCloseTo(500, 3);
  });

  it("T-R5: laying down is a proper rotation, not a mirror (asymmetric fixture)", () => {
    // Tall post with a small lug sticking out on +X near the top.
    const glb = buildGlb([
      { size: [100, 100, 500], center: [0, 0, 250] },
      { size: [50, 50, 50], center: [75, 0, 475] },
    ]);
    const frame = orientPart(loadPart(glb, { modelUnits: "mm", upAxis: "Z" }));
    expect(frame.rules).toEqual(["laid-down"]);
    expect([frame.L, frame.W, frame.H]).toEqual([500, 100, 150]);
    const b = bounds(frame.positions);
    expect(b.min.map((v) => Math.round(v))).toEqual([0, 0, 0]);
    expect(b.max.map((v) => Math.round(v))).toEqual([500, 100, 150]);
    // Rotation about +Y by 90° sends the lug (was +X, top) to the far end along X and to the BOTTOM (z 0..50).
    // A mirror would put it at the top (z 100..150).
    // The lug is 50 wide in Y (|y − 50| ≤ 25 after re-basing); the post's end face is 100 wide, so filter on both.
    const lug = verticesWhere(frame.positions, (x, y) => x > 440 && y > 24.9 && y < 75.1);
    expect(lug.length).toBeGreaterThan(0);
    expect(Math.max(...lug.map((v) => v[2]))).toBeLessThanOrEqual(50.001);
  });

  it("T-R5: turning 90° is a proper rotation, not a mirror (asymmetric fixture)", () => {
    // Flat plate long along Y with a lug at the +Y end on the +X side.
    const glb = buildGlb([
      { size: [100, 300, 50], center: [0, 0, 25] },
      { size: [20, 20, 50], center: [60, 140, 25] },
    ]);
    const frame = orientPart(loadPart(glb, { modelUnits: "mm", upAxis: "Z" }));
    expect(frame.rules).toEqual(["turned-90"]);
    expect([frame.L, frame.W, frame.H]).toEqual([300, 120, 50]);
    const b = bounds(frame.positions);
    expect(b.min.map((v) => Math.round(v))).toEqual([0, 0, 0]);
    expect(b.max.map((v) => Math.round(v))).toEqual([300, 120, 50]);
    // Rotation about +Z by 90° sends +Y to −X: the lug lands at the START of X (0..20) and sticks out at +Y (100..120).
    // A mirror (swap X and Y) would put it at x 280..300.
    const lug = verticesWhere(frame.positions, (_x, y) => y > 100.001);
    expect(lug.length).toBeGreaterThan(0);
    expect(Math.max(...lug.map((v) => v[0]))).toBeLessThanOrEqual(20.001);
  });

  it("T-R5: a wide footprint turns 90° so the longer side is along X; a flat tall part only turns", () => {
    const turned = orientPart(box(435, 445, 254));
    expect([turned.L, turned.W, turned.H]).toEqual([445, 435, 254]);
    expect(turned.rules).toEqual(["turned-90"]);
    const native = orientPart(box(360, 220, 258));
    expect(native.rules).toEqual(["native"]);
    // 300 tall on a 100 × 250 footprint: 300 < 1.5 × 250, so it stays upright and turns.
    const upright = orientPart(box(100, 250, 300));
    expect(upright.rules).toEqual(["turned-90"]);
    expect([upright.L, upright.W, upright.H]).toEqual([250, 100, 300]);
  });

  it("T-R5: the same input gives identical output twice", () => {
    const a = orientPart(box(100, 100, 500));
    const b = orientPart(box(100, 100, 500));
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });

  it.skipIf(!samplesPresent)("T-R5: samples: PART-001 and PART-002 native, PART-003 turned 90°", () => {
    expect(orientPart(loadSample("PART-001").part).rules).toEqual(["native"]);
    expect(orientPart(loadSample("PART-002").part).rules).toEqual(["native"]);
    const housing = orientPart(loadSample("PART-003").part);
    expect(housing.rules).toEqual(["turned-90"]);
    expect(housing.L).toBeCloseTo(445, 0);
  });
});

describe("R13, R14: tiers", () => {
  it("T-R13: net loads pick T1..T4 with the 45 kg boundary inclusive", () => {
    expect(selectTier(27).name).toBe("T1");
    expect(selectTier(45.0).name).toBe("T1");
    expect(selectTier(45.01).name).toBe("T2");
    expect(selectTier(108).name).toBe("T2");
    expect(selectTier(300).name).toBe("T3");
    expect(selectTier(1000).name).toBe("T4");
    expect(selectTier(1800).name).toBe("T4");
  });

  it("T-R14: over 1800 kg is refused with E5", () => {
    expect(() => selectTier(1801)).toThrowError(/over 1800 kg/);
  });

  it("T-R13: wide cavities promote one tier, T4 stays T4", () => {
    expect(promoteIfWide(selectTier(100), 1200).name).toBe("T2");
    expect(promoteIfWide(selectTier(100), 1201).name).toBe("T3");
    expect(promoteIfWide(selectTier(1000), 5000).name).toBe("T4");
  });
});

describe("R6, R7: layout", () => {
  const { g_c, web, c_floor, c_top } = CLEARANCE;

  it("T-R6: worked example PART-002 × 1 at T1 gives the spec cavity 1574 × 278 × 222", () => {
    const layout = chooseLayout({ L: 1530, W: 172, H: 172 }, 1, selectTier(27));
    expect([layout.rows, layout.cols]).toEqual([1, 1]);
    expect([layout.L_in, layout.W_in, layout.H_in]).toEqual([1574, 278, 222]);
    expect(layout.partOrigins).toEqual([{ row: 0, col: 0, x: 22, y: 53, z: 25 }]);
  });

  it("T-R6: 4 shafts go side by side (1 × 4), 8 brackets go 2 × 4, housing × 1 is 1 × 1", () => {
    const shafts = chooseLayout({ L: 1530, W: 172, H: 172 }, 4, selectTier(4 * 27));
    expect([shafts.rows, shafts.cols]).toEqual([1, 4]);
    const brackets = chooseLayout({ L: 360, W: 220, H: 258 }, 8, selectTier(8 * 21.5));
    expect([brackets.rows, brackets.cols]).toEqual([2, 4]);
    const housing = chooseLayout({ L: 445, W: 435, H: 254 }, 1, selectTier(11.8));
    expect([housing.rows, housing.cols]).toEqual([1, 1]);
    expect(brackets.partOrigins).toHaveLength(8);
    // Single layer: every part sits at the same height.
    expect(new Set(brackets.partOrigins.map((p) => p.z)).size).toBe(1);
  });

  it("T-R6: 5 square parts go 3 rows × 2 cols (occupancy 2, 2, 1): longest side 394 beats 2 × 3 at 518", () => {
    const five = chooseLayout({ L: 100, W: 100, H: 50 }, 5, selectTier(10));
    expect([five.rows, five.cols]).toEqual([3, 2]);
    expect([five.L_in, five.W_in]).toEqual([394, 362]);
    expect(five.partOrigins).toHaveLength(5);
    expect(five.partOrigins.filter((p) => p.row === 2)).toHaveLength(1);
  });

  it("T-R13: PART-003 × 8 needs a cavity wider than 1200, promotes T2 to T3, and re-lays out with T3 stock", () => {
    const plan = planLayout({ L: 445, W: 435, H: 254 }, 8, 8 * 11.8);
    expect(plan.promoted).toBe(true);
    expect(plan.tier.name).toBe("T3");
    expect(plan.layout.W_in).toBeGreaterThan(1200);
    expect(plan.layout.e_stop).toBe(3 + 38); // T3 stop board, not T2's 22
    expect(plan.layout.L_in).toBe(3 * 445 + 2 * (38 + 6) + 2 * 41); // 1505
    const noPromo = planLayout({ L: 1530, W: 172, H: 172 }, 1, 27);
    expect(noPromo.promoted).toBe(false);
    expect(noPromo.tier.name).toBe("T1");
  });

  it("T-R7: side-by-side gaps ≥ 50, end-to-end gaps = s_p, end-skin distance = g_c + c, one layer", () => {
    const cases: [{ L: number; W: number; H: number }, number, number][] = [
      [{ L: 360, W: 220, H: 258 }, 1, 21.5], [{ L: 360, W: 220, H: 258 }, 4, 21.5], [{ L: 360, W: 220, H: 258 }, 8, 21.5],
      [{ L: 1530, W: 172, H: 172 }, 1, 27], [{ L: 1530, W: 172, H: 172 }, 4, 27], [{ L: 1530, W: 172, H: 172 }, 8, 27],
      [{ L: 445, W: 435, H: 254 }, 1, 11.8], [{ L: 445, W: 435, H: 254 }, 4, 11.8], [{ L: 445, W: 435, H: 254 }, 8, 11.8],
    ];
    for (const [size, n, w] of cases) {
      const { tier, layout } = planLayout(size, n, n * w);
      for (const p of layout.partOrigins) {
        expect(p.y).toBeGreaterThanOrEqual(web);
        expect(layout.W_in - (p.y + size.W)).toBeGreaterThanOrEqual(web);
        if (p.row === 0) expect(p.x).toBe(g_c + tier.c);
        if (p.row === layout.rows - 1) expect(layout.L_in - (p.x + size.L)).toBe(g_c + tier.c);
        expect(p.z).toBe(c_floor);
        expect(layout.H_in - (p.z + size.H)).toBeGreaterThanOrEqual(c_top);
        for (const q of layout.partOrigins) {
          if (q === p) continue;
          if (q.row === p.row) {
            // side by side: at least one web of cradle wood between pockets
            const dy = Math.abs(p.y - q.y) - size.W;
            expect(dy).toBeGreaterThanOrEqual(web);
          } else if (q.col === p.col) {
            // end to end: exactly one shared stop board plus a gap each side
            const dx = Math.abs(p.x - q.x) - size.L;
            expect(dx).toBeCloseTo(layout.s_p * Math.abs(p.row - q.row) + size.L * (Math.abs(p.row - q.row) - 1), 6);
          }
        }
      }
    }
  });

  it("E10 guard input: a thin part still gets a cavity tall enough for the cleats", () => {
    const tier = selectTier(5);
    const layout = chooseLayout({ L: 300, W: 200, H: 6 }, 1, tier);
    expect(layout.H_in).toBe(2 * tier.d + 20);
  });
});
