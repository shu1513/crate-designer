import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DesignError } from "../src/core/errors.ts";
import { guessModelUnits, loadPart, MAX_TRIANGLES } from "../src/core/part.ts";
import { guessUpAxis, parseGlb } from "../src/core/glb.ts";
import { buildGlb, patchGlbJson } from "./helpers/glb.ts";

const SAMPLES = "samples";
const samplesPresent = existsSync(`${SAMPLES}/parts.json`);

interface SampleEntry { id: string; model: string; dimensions_mm: [number, number, number] }

describe("R1: GLB loading and bounds", () => {
  it.skipIf(!samplesPresent)("T-R1: sample parts measure within 1 mm of parts.json", () => {
    const list = JSON.parse(readFileSync(`${SAMPLES}/parts.json`, "utf8")) as { parts: SampleEntry[] };
    for (const entry of list.parts) {
      const bytes = readFileSync(`${SAMPLES}/${entry.model}`);
      const part = loadPart(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { modelUnits: "m", upAxis: "Z" });
      const [L, W, H] = entry.dimensions_mm;
      expect(Math.abs(part.dims.L - L), `${entry.id} L`).toBeLessThanOrEqual(1);
      expect(Math.abs(part.dims.W - W), `${entry.id} W`).toBeLessThanOrEqual(1);
      expect(Math.abs(part.dims.H - H), `${entry.id} H`).toBeLessThanOrEqual(1);
      expect(part.warnings).toEqual([]);
    }
  });

  it("merges every mesh in the default scene and applies node transforms", () => {
    // Two bodies: a 1 m cube at the origin and a 0.1 m cube translated to x = 2 m and scaled ×2.
    const glb = buildGlb([
      { size: [1, 1, 1] },
      { size: [0.1, 0.1, 0.1], translation: [2, 0, 0], scale: [2, 2, 2] },
    ]);
    const part = loadPart(glb, { modelUnits: "m", upAxis: "Z" });
    expect(part.triangleCount).toBe(24);
    expect(part.bounds.min[0]).toBeCloseTo(-500, 3);
    expect(part.bounds.max[0]).toBeCloseTo(2100, 3); // 2000 + 0.05 × 2 × 1000
    expect(part.dims.L).toBeCloseTo(2600, 3);
  });

  it("ignores scenes other than the default scene", () => {
    const glb = buildGlb([{ size: [1, 1, 1] }], { extraScene: true });
    const part = loadPart(glb, { modelUnits: "m", upAxis: "Z" });
    expect(part.dims.L).toBeCloseTo(1000, 3);
  });

  it("reads 16-bit, 32-bit, and non-indexed primitives alike", () => {
    for (const indexType of ["u16", "u32", "none"] as const) {
      const part = loadPart(buildGlb([{ size: [2, 3, 4], indexType }]), { modelUnits: "mm", upAxis: "Z" });
      expect(part.triangleCount).toBe(12);
      expect([part.dims.L, part.dims.W, part.dims.H]).toEqual([2, 3, 4]);
    }
  });

  it("applies a rotation quaternion (90° about Z swaps X and Y extents)", () => {
    const s = Math.SQRT1_2;
    const part = loadPart(buildGlb([{ size: [100, 20, 10], rotation: [0, 0, s, s] }]), { modelUnits: "mm", upAxis: "Z" });
    expect(part.dims.L).toBeCloseTo(20, 3);
    expect(part.dims.W).toBeCloseTo(100, 3);
    expect(part.dims.H).toBeCloseTo(10, 3);
  });
});

describe("R4: model units and up axis", () => {
  it("T-R4: millimeter units on a meter-scale file give sub-millimeter dimensions and an E2 that names the likely unit", () => {
    const glb = buildGlb([{ size: [0.36, 0.22, 0.258] }]);
    expect(() => loadPart(glb, { modelUnits: "mm", upAxis: "Z" })).toThrowError(/Read as millimeters, the part would be 0\.36 × 0\.22 × 0\.26 mm, which is flat or empty in one direction\. The file is probably in meters/);
    const parsed = parseGlb(glb);
    expect(parsed.triangleCount).toBe(12);
  });

  it("guesses the up axis from the writing program: trimesh files are Z up, everything else Y up (the glTF rule)", () => {
    expect(guessUpAxis("https://github.com/mikedh/trimesh")).toBe("Z");
    expect(guessUpAxis("Khronos glTF Blender I/O v4.2")).toBe("Y");
    expect(guessUpAxis("")).toBe("Y");
    expect(parseGlb(buildGlb([{ size: [1, 1, 1] }])).generator).toBe("crate-designer tests");
  });

  it("guesses the file's unit from its size: 1.53 → meters, 1530 → millimeters, 60 → inches", () => {
    expect(guessModelUnits(1.53)).toBe("m");
    expect(guessModelUnits(1530)).toBe("mm");
    expect(guessModelUnits(0.36)).toBe("m");
    expect(guessModelUnits(25)).toBe("in");
    expect(guessModelUnits(445)).toBe("mm");
  });

  it("T-R4: inch units scale by 25.4", () => {
    const part = loadPart(buildGlb([{ size: [10, 2, 1] }]), { modelUnits: "in", upAxis: "Z" });
    expect(part.dims.L).toBeCloseTo(254, 3);
  });

  it("T-R4: a Y-up box measures as if it were Z-up when up axis is set to Y", () => {
    // Box is 100 along X, 50 along file-Y (height in a Y-up file), 20 along file-Z.
    const part = loadPart(buildGlb([{ size: [100, 50, 20] }]), { modelUnits: "mm", upAxis: "Y" });
    expect(part.dims.L).toBeCloseTo(100, 3);
    expect(part.dims.W).toBeCloseTo(20, 3);
    expect(part.dims.H).toBeCloseTo(50, 3);
    // Up stays up: the top of the file's Y range becomes the top of our Z range.
    expect(part.bounds.max[2]).toBeCloseTo(25, 3);
  });
});

describe("Section 6: errors and warnings", () => {
  function code(fn: () => unknown): string {
    try {
      fn();
    } catch (e) {
      if (e instanceof DesignError) return e.code;
      throw e;
    }
    return "none";
  }

  it("E1: text renamed to .glb, truncated files, and bad magic are refused", () => {
    expect(code(() => loadPart(new TextEncoder().encode("hello world, not a model").buffer, { modelUnits: "m", upAxis: "Z" }))).toBe("E1");
    const good = buildGlb([{ size: [1, 1, 1] }]);
    expect(code(() => loadPart(good.slice(0, 40), { modelUnits: "m", upAxis: "Z" }))).toBe("E1");
    const bad = good.slice(0);
    new DataView(bad).setUint32(0, 0x12345678, true);
    expect(code(() => loadPart(bad, { modelUnits: "m", upAxis: "Z" }))).toBe("E1");
  });

  it("E1: external buffers, truncated buffer views, and sparse accessors are refused", () => {
    const good = buildGlb([{ size: [1, 1, 1] }]);
    const opts = { modelUnits: "m" as const, upAxis: "Z" as const };
    expect(loadPart(good, opts).triangleCount).toBe(12);
    type J = { buffers: { uri?: string }[]; bufferViews: { byteLength: number }[]; accessors: { sparse?: object }[] };
    expect(code(() => loadPart(patchGlbJson(good, (j) => { (j as unknown as J).buffers[0]!.uri = "data.bin"; }), opts))).toBe("E1");
    expect(code(() => loadPart(patchGlbJson(good, (j) => { (j as unknown as J).bufferViews[0]!.byteLength = 8; }), opts))).toBe("E1");
    expect(code(() => loadPart(patchGlbJson(good, (j) => { (j as unknown as J).accessors[0]!.sparse = { count: 1 }; }), opts))).toBe("E1");
  });

  it("E1: a model with no triangles is refused", () => {
    const glb = buildGlb([]);
    expect(code(() => loadPart(glb, { modelUnits: "m", upAxis: "Z" }))).toBe("E1");
  });

  it("E2: a flat model is refused", () => {
    expect(code(() => loadPart(buildGlb([{ size: [100, 100, 0.5] }]), { modelUnits: "mm", upAxis: "Z" }))).toBe("E2");
  });

  it("E8: more than 500,000 triangles is refused", () => {
    const glb = buildGlb([{ size: [10, 10, 10], repeatTriangles: MAX_TRIANGLES + 1 }]);
    expect(code(() => loadPart(glb, { modelUnits: "mm", upAxis: "Z" }))).toBe("E8");
    const atLimit = buildGlb([{ size: [10, 10, 10], repeatTriangles: MAX_TRIANGLES - 11 }]);
    expect(loadPart(atLimit, { modelUnits: "mm", upAxis: "Z" }).triangleCount).toBeLessThanOrEqual(MAX_TRIANGLES);
  });

  it("E7: suspicious sizes warn but still load", () => {
    const huge = loadPart(buildGlb([{ size: [30, 1, 1] }]), { modelUnits: "m", upAxis: "Z" });
    expect(huge.warnings[0]).toMatch(/measures \{\{mm:30000\}\} × \{\{mm:1000\}\} × \{\{mm:1000\}\}/);
    const tiny = loadPart(buildGlb([{ size: [5, 5, 5] }]), { modelUnits: "mm", upAxis: "Z" });
    expect(tiny.warnings).toHaveLength(1);
    const normal = loadPart(buildGlb([{ size: [1.53, 0.172, 0.172] }]), { modelUnits: "m", upAxis: "Z" });
    expect(normal.warnings).toEqual([]);
  });
});
