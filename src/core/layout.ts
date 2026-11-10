import { CLEARANCE, MIN_CLEAT_RUN } from "./constants.ts";
import { promoteIfWide, selectTier, type Tier } from "./tier.ts";

/** Single-layer grid of identical parts: rows along X, columns along Y (SPEC 5.2, R6). */
export interface Layout {
  rows: number;
  cols: number;
  /** Cavity size between skin inner faces. */
  L_in: number;
  W_in: number;
  H_in: number;
  /** Spacing between rows along X (one shared stop board plus a gap each side). */
  s_p: number;
  /** Part end to the end stop's outer face: gap plus stop-board thickness. The stop sits against the end skin unless the cavity was widened to its minimum. */
  e_stop: number;
  /** Min-corner position of every part copy inside the cavity, row-major. */
  partOrigins: { row: number; col: number; x: number; y: number; z: number }[];
}

export interface PartSize { L: number; W: number; H: number }

interface Candidate { rows: number; cols: number; L_in: number; W_in: number }

export function chooseLayout(size: PartSize, quantity: number, tier: Tier): Layout {
  const { g_c, web, c_floor, c_top } = CLEARANCE;
  const s_p = tier.c + 2 * g_c;
  const e_stop = g_c + tier.c;

  // Smallest cavity side that keeps every cleat run buildable (two edge cleats plus one screw pitch).
  const minInner = 2 * tier.d + MIN_CLEAT_RUN;
  const naturalL = (rows: number) => rows * size.L + (rows - 1) * s_p + 2 * e_stop;
  const naturalW = (cols: number) => cols * (size.W + 2 * g_c) + (cols + 1) * web;

  let best: Candidate | null = null;
  for (let rows = 1; rows <= quantity; rows++) {
    // cols must hold everything (ceil) and must not leave a whole row empty: (rows − 1) × cols < N.
    const maxCols = rows === 1 ? quantity : Math.floor((quantity - 1) / (rows - 1));
    for (let cols = Math.ceil(quantity / rows); cols <= maxCols; cols++) {
      const cand = { rows, cols, L_in: Math.max(naturalL(rows), minInner), W_in: Math.max(naturalW(cols), minInner) };
      if (!best || better(cand, best)) best = cand;
    }
  }
  if (!best) throw new Error("no layout"); // unreachable for quantity ≥ 1

  // Cavity height: part plus floor and top clearance, but never so low that the top and bottom
  // wall cleats meet or the intermediate cleats (H_in + t − 2d long) fall under one screw pitch (SPEC 5.4).
  const H_in = Math.max(c_floor + size.H + c_top, minInner - tier.t);

  // When a side was widened to the minimum, the parts (and their end stops) sit centred in it.
  const extraX = (best.L_in - naturalL(best.rows)) / 2;
  const extraY = (best.W_in - naturalW(best.cols)) / 2;
  const partOrigins: Layout["partOrigins"] = [];
  for (let row = 0; row < best.rows; row++) {
    for (let col = 0; col < best.cols; col++) {
      if (row * best.cols + col >= quantity) break;
      partOrigins.push({
        row,
        col,
        x: extraX + e_stop + row * (size.L + s_p),
        y: extraY + web + g_c + col * (size.W + 2 * g_c + web),
        z: c_floor,
      });
    }
  }
  return { rows: best.rows, cols: best.cols, L_in: best.L_in, W_in: best.W_in, H_in, s_p, e_stop, partOrigins };
}

/**
 * Tier and layout together (SPEC R13): pick the tier from net load, lay out,
 * and if the cavity is wider than the promotion width, move up one tier and
 * lay out again with the thicker stock. Promotion happens once and is not revisited:
 * the second layout may pick a different grid (the thicker stops change L_in), but the
 * tier is settled by the first width, which is already over the promotion width.
 */
export function planLayout(size: PartSize, quantity: number, netKg: number): { tier: Tier; layout: Layout; promoted: boolean } {
  const base = selectTier(netKg);
  let layout = chooseLayout(size, quantity, base);
  const tier = promoteIfWide(base, layout.W_in);
  const promoted = tier.name !== base.name;
  if (promoted) layout = chooseLayout(size, quantity, tier);
  return { tier, layout, promoted };
}

/** Smallest longest side, then smallest area, then fewer rows. */
function better(a: Candidate, b: Candidate): boolean {
  const ma = Math.max(a.L_in, a.W_in);
  const mb = Math.max(b.L_in, b.W_in);
  if (ma !== mb) return ma < mb;
  const aa = a.L_in * a.W_in;
  const ab = b.L_in * b.W_in;
  if (aa !== ab) return aa < ab;
  return a.rows < b.rows;
}
