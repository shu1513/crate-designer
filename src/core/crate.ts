import { DesignError } from "./errors.ts";
import type { Layout } from "./layout.ts";
import type { Board, Restraint } from "./restraint.ts";
import type { Tier } from "./tier.ts";

/**
 * Crate structure (SPEC 5.5): every wooden piece with its cut size and where it
 * sits. Crate frame: X along the length, Y across, Z up; origin at the cavity's
 * inner corner on top of the floor panel, so the cavity is [0,L_in]×[0,W_in]×[0,H_in].
 * The base (frame + floor panel) has the cavity footprint and sits inside the four
 * skins, which hang down over it; walls are screwed through the skins into the base rails.
 */

export interface Box {
  x: number; y: number; z: number; // min corner
  dx: number; dy: number; dz: number; // size
}

export type Material =
  | { type: "plywood"; t: number; label: string }
  | { type: "lumber"; c: number; d: number; label: string }
  | { type: "board"; c: number; label: string }; // cradle/stop boards ripped to height from c-thick stock

export interface Piece {
  id: string;
  name: string;
  /** Identical copies share one entry; `placements.length === count`. */
  count: number;
  material: Material;
  /** Cut size: length × width × thickness as the builder cuts it. */
  length: number;
  width: number;
  thickness: number;
  placements: Box[];
  /** Pocket cut-outs in crate coordinates (cradle boards only). */
  cutouts: Box[];
  notes: string[];
}

export interface Crate {
  pieces: Piece[];
  outer: { L: number; W: number; H: number };
  inner: { L: number; W: number; H: number };
  skids: number;
  /** Wall thickness t + c. */
  w: number;
}

const SHEET = 2440;
export const SKID_WEIGHT_KG = 91;
export const SKID_LENGTH_MM = 1524;
export const THIRD_SKID_WIDTH = 914;

function box(x: number, y: number, z: number, dx: number, dy: number, dz: number): Box {
  return { x, y, z, dx, dy, dz };
}

/** Evenly spaced positions of `count` members of thickness `size` strictly inside [from, to]. */
function spread(from: number, to: number, count: number, size: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= count; i++) out.push(from + ((to - from) * i) / (count + 1) - size / 2);
  return out;
}

export function buildCrate(layout: Layout, restraint: Restraint, tier: Tier, needSkids: (outer: { L: number; W: number; H: number }, woodKg: number) => boolean, netKg: number): Crate {
  const { t, c, d } = tier;
  const { L_in, W_in, H_in } = layout;
  const w = t + c;
  const L_out = L_in + 2 * w;
  const W_out = W_in + 2 * w;
  const plywood: Material = { type: "plywood", t, label: tier.plywoodLabel };
  const lumber: Material = { type: "lumber", c, d, label: tier.stockLabel };
  const boardStock: Material = { type: "board", c, label: `solid wood or plywood {{mm:${c}}} thick` }; // unit token, rendered on screen (R20)
  const pieces: Piece[] = [];
  const add = (id: string, name: string, material: Material, length: number, width: number, thickness: number, placements: Box[], cutouts: Box[] = [], notes: string[] = []) => {
    pieces.push({ id, name, count: placements.length, material, length, width, thickness, placements, cutouts, notes });
  };

  // Base frame (on edge, d tall) with the cavity footprint, under the floor panel.
  const zBF = -t - d;
  add("BF-L", "Base frame long rail", lumber, L_in, d, c, [box(0, 0, zBF, L_in, c, d), box(0, W_in - c, zBF, L_in, c, d)]);
  add("BF-S", "Base frame short rail", lumber, W_in - 2 * c, d, c, [box(0, c, zBF, c, W_in - 2 * c, d), box(L_in - c, c, zBF, c, W_in - 2 * c, d)]);
  const joists = Math.ceil(L_in / 600) - 1;
  if (joists > 0) add("BF-J", "Base frame joist", lumber, W_in - 2 * c, d, c, spread(c, L_in - c, joists, c).map((x) => box(x, c, zBF, c, W_in - 2 * c, d)));

  // Floor panel on the base frame, same footprint as the cavity.
  add("FP", "Floor panel", plywood, L_in, W_in, t, [box(0, 0, -t, L_in, W_in, t)], [], sheetNote(L_in, W_in));

  // Walls hang down over the base: skins run from the base frame's bottom to the top of the cavity.
  const zWall = zBF;
  const hWall = H_in + t + d;
  // Side panels: skin inside (y −t..0), cleats outside (y −w..−t). Skins run the full outer length.
  for (const side of [0, 1] as const) {
    const ySkin = side === 0 ? -t : W_in;
    const yCleat = side === 0 ? -w : W_in + t;
    pushOrMerge(pieces, "SS", "Side skin", plywood, L_out, hWall, t, box(-w, ySkin, zWall, L_out, t, hWall), sheetNote(L_out, hWall));
    pushOrMerge(pieces, "SC-V", "Side cleat, vertical edge", lumber, hWall, d, c, box(-w, yCleat, zWall, d, c, hWall));
    pushOrMerge(pieces, "SC-V", "Side cleat, vertical edge", lumber, hWall, d, c, box(L_in + w - d, yCleat, zWall, d, c, hWall));
    // Bottom horizontal cleat sits just above the base-frame zone, leaving bare skin over the rail for the base screws.
    pushOrMerge(pieces, "SC-H", "Side cleat, horizontal", lumber, L_out - 2 * d, d, c, box(-w + d, yCleat, -t, L_out - 2 * d, c, d));
    pushOrMerge(pieces, "SC-H", "Side cleat, horizontal", lumber, L_out - 2 * d, d, c, box(-w + d, yCleat, H_in - d, L_out - 2 * d, c, d));
    const mids = Math.ceil(L_out / 600) - 1;
    for (const x of spread(-w + d, L_in + w - d, mids, d)) pushOrMerge(pieces, "SC-M", "Side cleat, intermediate vertical", lumber, H_in + t - 2 * d, d, c, box(x, yCleat, -t + d, d, c, H_in + t - 2 * d));
  }
  // End panels fit between the side skins: skin at x −t..0 / L_in..L_in+t, cleats outside.
  for (const end of [0, 1] as const) {
    const xSkin = end === 0 ? -t : L_in;
    const xCleat = end === 0 ? -w : L_in + t;
    pushOrMerge(pieces, "ES", "End skin", plywood, W_in, hWall, t, box(xSkin, 0, zWall, t, W_in, hWall), sheetNote(W_in, hWall));
    pushOrMerge(pieces, "EC-V", "End cleat, vertical edge", lumber, hWall, d, c, box(xCleat, 0, zWall, c, d, hWall));
    pushOrMerge(pieces, "EC-V", "End cleat, vertical edge", lumber, hWall, d, c, box(xCleat, W_in - d, zWall, c, d, hWall));
    pushOrMerge(pieces, "EC-H", "End cleat, horizontal", lumber, W_in - 2 * d, d, c, box(xCleat, d, -t, c, W_in - 2 * d, d));
    pushOrMerge(pieces, "EC-H", "End cleat, horizontal", lumber, W_in - 2 * d, d, c, box(xCleat, d, H_in - d, c, W_in - 2 * d, d));
    const mids = Math.ceil(W_in / 600) - 1;
    for (const y of spread(d, W_in - d, mids, d)) pushOrMerge(pieces, "EC-M", "End cleat, intermediate vertical", lumber, H_in + t - 2 * d, d, c, box(xCleat, y, -t + d, c, d, H_in + t - 2 * d));
  }

  // Lid: panel on top of the walls, flat cleats on top of the panel.
  const zLid = H_in;
  add("LP", "Lid panel", plywood, L_out, W_out, t, [box(-w, -w, zLid, L_out, W_out, t)], [], sheetNote(L_out, W_out));
  // Lid cleats are inset by the wall thickness so the band over the walls stays clear for the closure screws.
  const zLC = zLid + t;
  add("LC-L", "Lid cleat, long", lumber, L_in, d, c, [box(0, 0, zLC, L_in, d, c), box(0, W_in - d, zLC, L_in, d, c)]);
  // The cleats that run across the lid (short end cleats and middle cleats) must not sit over a top
  // cradle board: the board is screwed from the outside face first (D36) and would cover a whole row
  // of the cleat's screws. Each is moved along the lid, away from its end, until it is clear of every
  // board and of the cross cleats already placed, but never past the lid's inset band [0, L_in − d].
  // A cross cleat with no room is left out: the top cradle boards already span the lid and stiffen it
  // more than a flat cleat would. The long cleats only meet a board at one spot each, where the
  // builder leaves that screw out.
  const obstacles: [number, number][] = restraint.topBoards.map((b) => [b.x, b.x + b.thickness]);
  const across = (desired: number, dir: 1 | -1): number | null => {
    let x = desired;
    for (let guard = 0; guard < 50; guard++) {
      if (x < 0 || x > L_in - d) return null;
      const hit = obstacles.find(([a, b]) => x < b + 5 && x + d > a - 5);
      if (!hit) { obstacles.push([x, x + d]); return x; }
      x = dir > 0 ? hit[1] + 5 : hit[0] - 5 - d;
    }
    return null;
  };
  const placed = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null).map((x) => box(x, d, zLC, d, W_in - 2 * d, c));
  const lcS = placed([across(0, 1), across(L_in - d, -1)]);
  if (lcS.length) add("LC-S", "Lid cleat, short", lumber, W_in - 2 * d, d, c, lcS);
  const lidMids = Math.ceil(L_out / 1200) - 1;
  if (lidMids > 0) {
    const lcM = placed(spread(d, L_in - d, lidMids, d).map((x) => across(x, 1)));
    if (lcM.length) add("LC-M", "Lid cleat, middle", lumber, W_in - 2 * d, d, c, lcM);
  }

  // Cradles and stops from the restraint design.
  for (const b of restraint.bottomBoards) addBoard(pieces, b, boardStock, box(b.x, 0, 0, b.thickness, b.length, b.height), b.pockets.map((p) => box(b.x, p.leftOffset, b.height - p.depth, b.thickness, p.width, p.depth)));
  for (const b of restraint.topBoards) addBoard(pieces, b, boardStock, box(b.x, 0, H_in - b.height, b.thickness, b.length, b.height), b.pockets.map((p) => box(b.x, p.leftOffset, H_in - b.height, b.thickness, p.width, p.depth)));
  for (const b of restraint.endStops) addBoard(pieces, b, boardStock, box(b.x, 0, 0, b.thickness, b.length, b.height), []);

  // Guard: every required piece must have positive dimensions (SPEC E10).
  for (const p of pieces) {
    const smallest = Math.min(p.length, p.width, p.thickness);
    if (!(smallest > 0)) {
      throw new DesignError("E10", `This part is too small for the crate rules. Smallest piece would be ${p.id} at ${Math.round(smallest)} mm.`);
    }
  }

  // Skids: decided on the crate without skids, then added and not revisited.
  const H_noSkid = d + t + H_in + t + c;
  const outerNoSkid = { L: L_out, W: W_out, H: H_noSkid };
  const woodNoSkid = woodWeightKg(pieces);
  let skids = 0;
  if (needSkids(outerNoSkid, woodNoSkid + netKg)) {
    skids = W_out > THIRD_SKID_WIDTH ? 3 : 2;
    const sk = tier.skid;
    const zSK = zBF - sk.d;
    // Skids sit directly under the long rails (the base frame is inside the walls), so the skid screws
    // driven down through a rail land in the middle of a skid. A middle skid sits under the joists' centre.
    const ys = [0, W_in - sk.c];
    if (skids === 3) ys.push((W_in - sk.c) / 2);
    add("SK", "Skid", { type: "lumber", c: sk.c, d: sk.d, label: sk.label }, L_out, sk.d, sk.c, ys.map((y) => box(-w, y, zSK, L_out, sk.c, sk.d)));
  }
  const outer = { L: L_out, W: W_out, H: H_noSkid + (skids ? tier.skid.d : 0) };
  return { pieces, outer, inner: { L: L_in, W: W_in, H: H_in }, skids, w };
}

/** Skid rule (SPEC 5.5): gross ≥ 91 kg or any outer dimension ≥ 1524 mm. */
export function skidRule(outer: { L: number; W: number; H: number }, grossKg: number): boolean {
  return grossKg >= SKID_WEIGHT_KG || Math.max(outer.L, outer.W, outer.H) >= SKID_LENGTH_MM;
}

function sheetNote(a: number, b: number): string[] {
  return Math.max(a, b) > SHEET || Math.min(a, b) > 1220 ? ["panel exceeds one sheet, join two sheets over a frame member"] : [];
}

/** Adds a placement to an existing piece with the same id and cut size, or creates the piece. */
function pushOrMerge(pieces: Piece[], id: string, name: string, material: Material, length: number, width: number, thickness: number, placement: Box, notes: string[] = []): void {
  const existing = pieces.find((p) => p.id === id && p.length === length && p.width === width && p.thickness === thickness);
  if (existing) {
    existing.placements.push(placement);
    existing.count = existing.placements.length;
    return;
  }
  pieces.push({ id, name, count: 1, material, length, width, thickness, placements: [placement], cutouts: [], notes });
}

function addBoard(pieces: Piece[], b: Board, material: Material, placement: Box, cutouts: Box[]): void {
  pieces.push({ id: b.id, name: boardName(b.kind), count: 1, material, length: b.length, width: b.height, thickness: b.thickness, placements: [placement], cutouts, notes: [] });
}

function boardName(kind: Board["kind"]): string {
  return kind === "bottom-cradle" ? "Bottom cradle board" : kind === "top-cradle" ? "Top cradle board" : "End stop";
}

/** Wood weight: plywood 600 kg/m³, lumber 500 kg/m³, pockets subtracted, rounded to 0.5 kg (SPEC R17). */
export function woodWeightKg(pieces: Piece[]): number {
  let kg = 0;
  for (const p of pieces) {
    const density = p.material.type === "plywood" ? 600 : 500;
    let volume = p.placements.reduce((v, b) => v + b.dx * b.dy * b.dz, 0);
    volume -= p.cutouts.reduce((v, b) => v + b.dx * b.dy * b.dz, 0);
    kg += (volume / 1e9) * density;
  }
  return Math.round(kg * 2) / 2;
}

/** Solid boxes of a piece: its placements minus pocket cut-outs (split around each pocket). */
export function solids(piece: Piece): Box[] {
  if (piece.cutouts.length === 0) return piece.placements;
  const out: Box[] = [];
  for (const b of piece.placements) {
    const mine = piece.cutouts.filter((cut) => cut.x < b.x + b.dx && cut.x + cut.dx > b.x);
    out.push(...subtractPockets(b, mine));
  }
  return out;
}

/** Splits a board box into solid boxes around pockets that open to its top or bottom edge. */
function subtractPockets(b: Box, pockets: Box[]): Box[] {
  if (pockets.length === 0) return [b];
  const sorted = [...pockets].sort((p, q) => p.y - q.y);
  const result: Box[] = [];
  let cursor = b.y;
  for (const p of sorted) {
    if (p.y > cursor) result.push(box(b.x, cursor, b.z, b.dx, p.y - cursor, b.dz)); // wall segment before the pocket
    // strip of wood above or below the pocket within its Y span
    const below = p.z - b.z;
    const above = b.z + b.dz - (p.z + p.dz);
    if (below > 1e-9) result.push(box(b.x, p.y, b.z, b.dx, p.dy, below));
    if (above > 1e-9) result.push(box(b.x, p.y, p.z + p.dz, b.dx, p.dy, above));
    cursor = p.y + p.dy;
  }
  if (cursor < b.y + b.dy) result.push(box(b.x, cursor, b.z, b.dx, b.y + b.dy - cursor, b.dz));
  return result;
}
