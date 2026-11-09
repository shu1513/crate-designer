import { CLEARANCE } from "./constants.ts";
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
  /** Part end to end skin: gap plus stop-board thickness. */
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

  let best: Candidate | null = null;
  for (let rows = 1; rows <= quantity; rows++) {
    // cols must hold everything (ceil) and must not leave a whole row empty: (rows − 1) × cols < N.
    const maxCols = rows === 1 ? quantity : Math.floor((quantity - 1) / (rows - 1));
    for (let cols = Math.ceil(quantity / rows); cols <= maxCols; cols++) {
      const L_in = rows * size.L + (rows - 1) * s_p + 2 * e_stop;
      const W_in = cols * (size.W + 2 * g_c) + (cols + 1) * web;
      const cand = { rows, cols, L_in, W_in };
      if (!best || better(cand, best)) best = cand;
    }
  }
  if (!best) throw new Error("no layout"); // unreachable for quantity ≥ 1

  // Cavity height: part plus floor and top clearance, but never so low that the
  // top and bottom wall cleats would overlap (SPEC 5.4, Codex review item 10).
  const H_in = Math.max(c_floor + size.H + c_top, 2 * tier.d + 20);

  const partOrigins: Layout["partOrigins"] = [];
  for (let row = 0; row < best.rows; row++) {
    for (let col = 0; col < best.cols; col++) {
      if (row * best.cols + col >= quantity) break;
      partOrigins.push({
        row,
        col,
        x: e_stop + row * (size.L + s_p),
        y: web + g_c + col * (size.W + 2 * g_c + web),
        z: c_floor,
      });
    }
  }
  return { rows: best.rows, cols: best.cols, L_in: best.L_in, W_in: best.W_in, H_in, s_p, e_stop, partOrigins };
}

/**
 * Tier and layout together (SPEC R13): pick the tier from net load, lay out,
 * and if the cavity is wider than the promotion width, move up one tier and
 * lay out again with the thicker stock. Promotion cannot loop: W_in does not
 * depend on the tier.
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
