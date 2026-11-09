import { CLEARANCE } from "./constants.ts";
import { DesignError, MESSAGES } from "./errors.ts";
import type { Layout } from "./layout.ts";
import type { PartFrame } from "./orientation.ts";
import type { Tier } from "./tier.ts";

/**
 * Restraint geometry (SPEC 5.4, R8–R11): where the cradle boards go along the
 * part, and the straight-cut rectangular pocket in each board. All lengths mm.
 * Part-local X runs from 0 (part start) to L; cavity-local X runs from the end
 * skin's inner face.
 */

export interface SlabExtents {
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  /**
   * How much the part offers to sit on: the Y width of the points within 1 mm of the slab's
   * lowest Z, measured on each face of the board and taking the smaller. A board that straddles
   * a step, or a seat that exists only in the slab margin, scores low and is not chosen.
   */
  bearingWidth: number;
  /** Highest Z of a point at minY or maxY (where the part is widest); pocket side walls stop here. */
  z_eq: number;
  pointCount: number;
}

export interface Station {
  index: number;
  /** Chosen position along the part (part-local X). */
  x: number;
  nominalX: number;
  extents: SlabExtents;
}

export interface Pocket {
  col: number;
  /** From the board's left end (cavity Y = 0) to the pocket's left wall. */
  leftOffset: number;
  width: number;
  /** Cut depth from the board's open edge (top edge for bottom boards, bottom edge for top boards). */
  depth: number;
}

export type BoardKind = "bottom-cradle" | "top-cradle" | "end-stop";

export interface Board {
  id: string;
  kind: BoardKind;
  /** Cavity-local X of the board's face nearest the cavity start. */
  x: number;
  thickness: number;
  height: number;
  /** Board length across the cavity (= W_in). */
  length: number;
  pockets: Pocket[];
  /** Row of parts this board serves (end stops between rows list both). */
  rows: number[];
  stationIndex?: number;
}

export interface Restraint {
  stations: Station[];
  bottomBoards: Board[];
  topBoards: Board[];
  endStops: Board[];
}

const BEARING_BAND = 1;
const EXTREME_TOL = 0.01;
const SLAB_MARGIN = 2;
const SEARCH_STEP = 10;

const ON_PLANE = 1e-6;

/**
 * Points of the mesh inside the slab x0..x1 (vertices plus crossings of both slab faces),
 * projected to YZ. Extents come from the whole slab (board plus margin). Bearing is judged on
 * the two BOARD faces (bx0, bx1), which lie inside the slab, so a seat that exists only in
 * the margin does not count. Vertices lying exactly on a board face count for that face.
 */
export function slabExtents(positions: Float32Array, x0: number, x1: number, bx0 = x0, bx1 = x1): SlabExtents | null {
  // face = 0: on the bx0 plane, 1: on the bx1 plane, 2: elsewhere in the slab (extents only).
  const ys: number[] = [];
  const zs: number[] = [];
  const faces: number[] = [];
  const add = (y: number, z: number, face: number) => {
    ys.push(y);
    zs.push(z);
    faces.push(face);
  };
  const cross = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, plane: number, face: number) => {
    if ((ax - plane) * (bx - plane) < 0) {
      const t = (plane - ax) / (bx - ax);
      add(ay + t * (by - ay), az + t * (bz - az), face);
    }
  };
  for (let i = 0; i < positions.length; i += 9) {
    for (let v = 0; v < 3; v++) {
      const a = i + v * 3;
      const b = i + ((v + 1) % 3) * 3;
      const ax = positions[a]!, ay = positions[a + 1]!, az = positions[a + 2]!;
      const bx = positions[b]!, by = positions[b + 1]!, bz = positions[b + 2]!;
      if (ax >= x0 && ax <= x1) {
        const face = Math.abs(ax - bx0) <= ON_PLANE ? 0 : Math.abs(ax - bx1) <= ON_PLANE ? 1 : 2;
        add(ay, az, face);
        if (face === 0 && Math.abs(bx1 - bx0) <= ON_PLANE) add(ay, az, 1); // zero-width board: one plane, both faces
      }
      cross(ax, ay, az, bx, by, bz, x0, 2);
      cross(ax, ay, az, bx, by, bz, x1, 2);
      cross(ax, ay, az, bx, by, bz, bx0, 0);
      cross(ax, ay, az, bx, by, bz, bx1, 1);
    }
  }
  if (ys.length === 0) return null;
  let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k < ys.length; k++) {
    minY = Math.min(minY, ys[k]!); maxY = Math.max(maxY, ys[k]!);
    minZ = Math.min(minZ, zs[k]!); maxZ = Math.max(maxZ, zs[k]!);
  }
  const bearMin = [Infinity, Infinity];
  const bearMax = [-Infinity, -Infinity];
  let z_eq = -Infinity;
  for (let k = 0; k < ys.length; k++) {
    const f = faces[k]!;
    if (f < 2 && zs[k]! <= minZ + BEARING_BAND) {
      bearMin[f] = Math.min(bearMin[f]!, ys[k]!);
      bearMax[f] = Math.max(bearMax[f]!, ys[k]!);
    }
    if (ys[k]! <= minY + EXTREME_TOL || ys[k]! >= maxY - EXTREME_TOL) z_eq = Math.max(z_eq, zs[k]!);
  }
  const bearing = (f: number) => (bearMax[f]! > bearMin[f]! ? bearMax[f]! - bearMin[f]! : 0);
  return { minY, maxY, minZ, maxZ, bearingWidth: Math.min(bearing(0), bearing(1)), z_eq, pointCount: ys.length };
}

/** Number of stations and their nominal positions: evenly from 20% to 80% of the length. */
export function nominalStations(L: number): number[] {
  const n = Math.max(2, Math.ceil((0.6 * L) / CLEARANCE.maxStationSpacing) + 1);
  const start = 0.2 * L;
  const span = 0.6 * L;
  return Array.from({ length: n }, (_, i) => start + (span * i) / (n - 1));
}

/**
 * Picks each station in increasing X: among candidates nominal + 10k mm (|10k| ≤ 10% of L)
 * that have geometry, a usable pocket depth, and keep min(100, L/2)..600 mm to the previous
 * station, take the widest bearing; ties go to the candidate nearest the nominal, then the
 * lower X. No candidate → E6. Greedy by design (SPEC D32): a station is never revisited once
 * chosen, so an unusual part with gaps can be refused even though some other combination
 * would have worked.
 */
export function chooseStations(frame: PartFrame, tier: Tier): Station[] {
  const half = tier.c / 2 + SLAB_MARGIN;
  const { maxStationSpacing } = CLEARANCE;
  // Short parts cannot keep 100 mm between two stations; scale the floor down with the part.
  const minStationSpacing = Math.min(CLEARANCE.minStationSpacing, 0.5 * frame.L);
  const stations: Station[] = [];
  nominalStations(frame.L).forEach((nominal, index) => {
    const reach = Math.floor((0.1 * frame.L) / SEARCH_STEP);
    let best: Station | null = null;
    let bestScore = -Infinity;
    let bestDist = Infinity;
    for (let k = -reach; k <= reach; k++) {
      const x = nominal + k * SEARCH_STEP;
      if (x - half < 0 || x + half > frame.L) continue;
      const prev = stations[stations.length - 1];
      if (prev && (x - prev.x < minStationSpacing || x - prev.x > maxStationSpacing)) continue;
      const extents = slabExtents(frame.positions, x - half, x + half, x - tier.c / 2, x + tier.c / 2);
      if (!extents) continue;
      if (extents.z_eq - extents.minZ <= 0) continue; // no usable pocket depth here (widest point is the floor)
      const dist = Math.abs(k * SEARCH_STEP);
      const betterScore = extents.bearingWidth > bestScore + 1e-9;
      const tieNearer = Math.abs(extents.bearingWidth - bestScore) <= 1e-9 && (dist < bestDist || (dist === bestDist && best !== null && x < best.x));
      if (betterScore || tieNearer) {
        best = { index, x, nominalX: nominal, extents };
        bestScore = extents.bearingWidth;
        bestDist = dist;
      }
    }
    if (!best) throw new DesignError("E6", MESSAGES.E6);
    stations.push(best);
  });
  return stations;
}

/** Highest Z of the part within the last 20 mm at one end (part-local). */
function endHeight(positions: Float32Array, x0: number, x1: number): number {
  const e = slabExtents(positions, x0, x1);
  return e ? e.maxZ : 0;
}

export function designRestraint(frame: PartFrame, layout: Layout, tier: Tier): Restraint {
  const { g_c, c_floor } = CLEARANCE;
  const c = tier.c;
  const stations = chooseStations(frame, tier);
  const bottomBoards: Board[] = [];
  const topBoards: Board[] = [];
  const endStops: Board[] = [];

  const rowsX = Array.from({ length: layout.rows }, (_, row) => layout.partOrigins.find((p) => p.row === row)!.x);
  const colsY = Array.from({ length: layout.cols }, (_, col) => layout.partOrigins.find((p) => p.col === col)?.y);

  for (let row = 0; row < layout.rows; row++) {
    const rowX = rowsX[row]!;
    const colsInRow = layout.partOrigins.filter((p) => p.row === row).map((p) => p.col);
    for (const st of stations) {
      const e = st.extents;
      // Exact geometry (SPEC 5.4); the printout rounds for display. The part rests on the pocket floor.
      const h_b = c_floor + e.z_eq;
      const depthBottom = e.z_eq - e.minZ;
      const depthTop = e.maxZ + g_c - e.z_eq;
      if (depthBottom <= 0) throw new DesignError("E6", MESSAGES.E6);
      const h_t = layout.H_in - h_b;
      const width = e.maxY - e.minY + 2 * g_c;
      const pockets = (depth: number): Pocket[] =>
        colsInRow.map((col) => ({ col, leftOffset: colsY[col]! + e.minY - g_c, width, depth }));
      const x = rowX + st.x - c / 2;
      const suffix = layout.rows > 1 ? `${row + 1}.${st.index + 1}` : `${st.index + 1}`;
      bottomBoards.push({ id: `BC-${suffix}`, kind: "bottom-cradle", x, thickness: c, height: h_b, length: layout.W_in, pockets: pockets(depthBottom), rows: [row], stationIndex: st.index });
      topBoards.push({ id: `TC-${suffix}`, kind: "top-cradle", x, thickness: c, height: h_t, length: layout.W_in, pockets: pockets(depthTop), rows: [row], stationIndex: st.index });
    }
  }

  // End stops: one before the first row, one between each pair of rows (shared), one after the last.
  const startH = Math.min(layout.H_in, c_floor + endHeight(frame.positions, 0, 20));
  const endH = Math.min(layout.H_in, c_floor + endHeight(frame.positions, frame.L - 20, frame.L));
  for (let k = 0; k <= layout.rows; k++) {
    const rows: number[] = [];
    if (k > 0) rows.push(k - 1);
    if (k < layout.rows) rows.push(k);
    const x = k === 0 ? rowsX[0]! - g_c - c : rowsX[k - 1]! + frame.L + g_c;
    let height = 0;
    if (k > 0) height = Math.max(height, endH);
    if (k < layout.rows) height = Math.max(height, startH);
    endStops.push({ id: `EB-${k + 1}`, kind: "end-stop", x, thickness: c, height, length: layout.W_in, pockets: [], rows });
  }
  return { stations, bottomBoards, topBoards, endStops };
}
