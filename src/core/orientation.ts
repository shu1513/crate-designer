import type { PartMesh } from "./part.ts";

export type OrientationRule = "native" | "laid-down" | "turned-90";

/**
 * The part in its crate orientation: Z up, long side along X, min corner at the origin.
 * Positions are 9 floats per triangle in mm (SPEC 5.2, R5).
 */
export interface PartFrame {
  positions: Float32Array;
  L: number;
  W: number;
  H: number;
  /** Which rules fired, in order, so the printout can say how the part sits. */
  rules: OrientationRule[];
}

/** Right-angle rotations only, so every pose is one the builder can picture. */
type Rotate = (x: number, y: number, z: number) => [number, number, number];
const aboutYPlus90: Rotate = (x, y, z) => [z, y, -x]; // Z axis → X axis
const aboutZPlus90: Rotate = (x, y, z) => [-y, x, z]; // Y axis → −X, X axis → Y

export function orientPart(part: PartMesh): PartFrame {
  const rules: OrientationRule[] = [];
  const steps: Rotate[] = [];
  let { L, W, H } = part.dims;

  // Rule 2: tall thin part lies down so its long axis runs along X.
  if (H > 1.5 * Math.max(L, W)) {
    steps.push(aboutYPlus90);
    [L, H] = [H, L];
    rules.push("laid-down");
  }
  // Rule 3: longer footprint side along X.
  if (W > L) {
    steps.push(aboutZPlus90);
    [L, W] = [W, L];
    rules.push("turned-90");
  }
  if (rules.length === 0) rules.push("native");

  const src = part.positions;
  const out = new Float32Array(src.length);
  const min = [Infinity, Infinity, Infinity];
  for (let i = 0; i < src.length; i += 3) {
    let p: [number, number, number] = [src[i]!, src[i + 1]!, src[i + 2]!];
    for (const step of steps) p = step(p[0], p[1], p[2]);
    out[i] = p[0];
    out[i + 1] = p[1];
    out[i + 2] = p[2];
    for (let k = 0; k < 3; k++) if (p[k]! < min[k]!) min[k] = p[k]!;
  }
  // Move the min corner to the origin so every later position is a plain offset.
  for (let i = 0; i < out.length; i += 3) {
    out[i] = out[i]! - min[0]!;
    out[i + 1] = out[i + 1]! - min[1]!;
    out[i + 2] = out[i + 2]! - min[2]!;
  }
  return { positions: out, L, W, H, rules };
}
