import { DesignError, MESSAGES, messageE2, warningE7 } from "./errors.ts";
import { parseGlb } from "./glb.ts";

export type ModelUnits = "m" | "mm" | "in";
export type UpAxis = "Z" | "Y";

export interface PartOptions {
  modelUnits: ModelUnits;
  upAxis: UpAxis;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

/** A part ready for design: Z up, millimeters, one rigid body (SPEC R1, A6). */
export interface PartMesh {
  /** 9 floats per triangle, millimeters, Z up. */
  positions: Float32Array;
  triangleCount: number;
  bounds: Bounds;
  /** Extents along X, Y, Z in mm, before any crate orientation is chosen. */
  dims: { L: number; W: number; H: number };
  warnings: string[];
}

export const MAX_TRIANGLES = 500_000;
export const UNIT_TO_MM: Record<ModelUnits, number> = { m: 1000, mm: 1, in: 25.4 };

/**
 * Guesses the file's unit from its largest raw extent: machined parts are between about 30 mm and
 * 20 m, so a raw extent of 1.5 reads as meters, 1500 as millimeters, and only 20..30 (too big for
 * a part in meters, too small for one in millimeters) reads as inches.
 */
export function guessModelUnits(rawMaxExtent: number): ModelUnits {
  const v = rawMaxExtent;
  if (v >= 0.03 && v <= 20) return "m";
  if (v >= 30 && v <= 20000) return "mm";
  if (v > 20 && v < 30) return "in"; // 20..30 units: a 0.5..0.75 m part in inches is likelier than a 20 m part in meters
  return v < 0.03 ? "m" : "mm";
}

/** Largest extent of the raw file coordinates (file units), for unit guessing and E2 hints. */
export function rawMaxExtent(positions: Float32Array): number {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
    const v = positions[i + k]!;
    if (v < min[k]!) min[k] = v;
    if (v > max[k]!) max[k] = v;
  }
  return Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
}

export function loadPart(bytes: ArrayBuffer, options: PartOptions): PartMesh {
  const raw = parseGlb(bytes);
  if (raw.triangleCount === 0) throw new DesignError("E1", MESSAGES.E1);
  if (raw.triangleCount > MAX_TRIANGLES) throw new DesignError("E8", MESSAGES.E8);

  const scale = UNIT_TO_MM[options.modelUnits];
  const positions = new Float32Array(raw.positions.length);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < raw.positions.length; i += 3) {
    const x = raw.positions[i]! * scale;
    const y = raw.positions[i + 1]! * scale;
    const z = raw.positions[i + 2]! * scale;
    // glTF's default is Y up; our frame is Z up. Y-up → Z-up keeps X, sends Y to Z and Z to −Y.
    const px = x;
    const py = options.upAxis === "Y" ? -z : y;
    const pz = options.upAxis === "Y" ? y : z;
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) throw new DesignError("E1", MESSAGES.E1);
    positions[i] = px;
    positions[i + 1] = py;
    positions[i + 2] = pz;
    if (px < min[0]) min[0] = px;
    if (py < min[1]) min[1] = py;
    if (pz < min[2]) min[2] = pz;
    if (px > max[0]) max[0] = px;
    if (py > max[1]) max[1] = py;
    if (pz > max[2]) max[2] = pz;
  }
  const dims = { L: max[0] - min[0], W: max[1] - min[1], H: max[2] - min[2] };
  if (dims.L < 1 || dims.W < 1 || dims.H < 1) {
    throw new DesignError("E2", messageE2(options.modelUnits, [dims.L, dims.W, dims.H], guessModelUnits(rawMaxExtent(raw.positions))));
  }

  const warnings: string[] = [];
  const largest = Math.max(dims.L, dims.W, dims.H);
  if (largest > 20_000 || largest < 10) {
    warnings.push(warningE7(dims.L, dims.W, dims.H));
  }
  return { positions, triangleCount: raw.triangleCount, bounds: { min, max }, dims, warnings };
}
