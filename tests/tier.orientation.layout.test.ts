import { describe, expect, it } from "vitest";
import { DesignError } from "../src/core/errors.ts";
import { loadPart } from "../src/core/part.ts";
import { validateInputs } from "../src/core/inputs.ts";
import { orientPart } from "../src/core/orientation.ts";
import { chooseLayout } from "../src/core/layout.ts";
import { promoteIfWide, selectTier } from "../src/core/tier.ts";
import { CLEARANCE } from "../src/core/constants.ts";
import { buildGlb } from "./helpers/glb.ts";
import { loadSample, samplesPresent } from "./helpers/samples.ts";

const box = (L: number, W: number, H: number) => loadPart(buildGlb([{ size: [L, W, H] }]), { modelUnits: "mm", upAxis: "Z" });

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

  it("T-R6: a quantity that does not fill the grid leaves no empty row (5 parts → 2 × 3, not 3 × 2 with an empty row)", () => {
    const five = chooseLayout({ L: 100, W: 100, H: 50 }, 5, selectTier(10));
    expect(five.rows * five.cols).toBeGreaterThanOrEqual(5);
    expect((five.rows - 1) * five.cols).toBeLessThan(5);
    expect(five.partOrigins).toHaveLength(5);
  });

  it("T-R13: PART-003 × 8 needs a cavity wider than 1200 and promotes T2 to T3", () => {
    const base = selectTier(8 * 11.8);
    const layout = chooseLayout({ L: 445, W: 435, H: 254 }, 8, base);
    expect(layout.W_in).toBeGreaterThan(1200);
    expect(promoteIfWide(base, layout.W_in).name).toBe("T3");
  });

  it("T-R7: parts keep ≥ 50 mm from each other and the side skins, and g_c + c from the end skins", () => {
    const cases: [{ L: number; W: number; H: number }, number, number][] = [
      [{ L: 360, W: 220, H: 258 }, 1, 21.5], [{ L: 360, W: 220, H: 258 }, 4, 21.5], [{ L: 360, W: 220, H: 258 }, 8, 21.5],
      [{ L: 1530, W: 172, H: 172 }, 1, 27], [{ L: 1530, W: 172, H: 172 }, 4, 27], [{ L: 1530, W: 172, H: 172 }, 8, 27],
      [{ L: 445, W: 435, H: 254 }, 1, 11.8], [{ L: 445, W: 435, H: 254 }, 4, 11.8], [{ L: 445, W: 435, H: 254 }, 8, 11.8],
    ];
    for (const [size, n, w] of cases) {
      const tier = selectTier(n * w);
      const layout = chooseLayout(size, n, tier);
      for (const p of layout.partOrigins) {
        expect(p.y).toBeGreaterThanOrEqual(web);
        expect(layout.W_in - (p.y + size.W)).toBeGreaterThanOrEqual(web);
        if (p.row === 0) expect(p.x).toBe(g_c + tier.c);
        if (p.row === layout.rows - 1) expect(layout.L_in - (p.x + size.L)).toBe(g_c + tier.c);
        expect(p.z).toBe(c_floor);
        expect(layout.H_in - (p.z + size.H)).toBeGreaterThanOrEqual(c_top);
        for (const q of layout.partOrigins) {
          if (q === p) continue;
          const dx = Math.max(0, Math.max(p.x, q.x) - Math.min(p.x + size.L, q.x + size.L));
          const dy = Math.max(0, Math.max(p.y, q.y) - Math.min(p.y + size.W, q.y + size.W));
          expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(Math.min(web, layout.s_p));
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
