import type { Box, Piece } from "./crate.ts";
import { solids } from "./crate.ts";

/** Geometry diagnostics (SPEC R24, T-R10, T-R24). Touching counts as no overlap. */

const EPS = 1e-3;

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x + a.dx > b.x + EPS && b.x + b.dx > a.x + EPS &&
    a.y + a.dy > b.y + EPS && b.y + b.dy > a.y + EPS &&
    a.z + a.dz > b.z + EPS && b.z + b.dz > a.z + EPS;
}

/** Pairs of piece IDs whose solid boxes overlap. Each placement is its own physical piece. */
export function overlappingPieces(pieces: Piece[]): [string, string][] {
  const items: { id: string; key: string; b: Box }[] = [];
  for (const p of pieces) {
    p.placements.forEach((placement, k) => {
      const one: Piece = { ...p, placements: [placement], count: 1 };
      for (const b of solids(one)) items.push({ id: p.id, key: `${p.id}#${k}`, b });
    });
  }
  const bad: [string, string][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!, c = items[j]!;
      if (a.key === c.key) continue; // solids of the same physical board never overlap each other
      if (boxesOverlap(a.b, c.b)) bad.push([a.id, c.id]);
    }
  }
  return bad;
}

/**
 * Does any triangle of the mesh (9 floats per triangle, already in crate coordinates,
 * optionally shifted by `offset`) have positive-volume overlap with the box?
 * Separating-axis test (Akenine-Möller) shrunk by EPS so surface contact does not count.
 */
export function meshIntersectsBox(positions: Float32Array, b: Box, offset: [number, number, number] = [0, 0, 0]): boolean {
  const cx = b.x + b.dx / 2, cy = b.y + b.dy / 2, cz = b.z + b.dz / 2;
  const hx = b.dx / 2 - EPS, hy = b.dy / 2 - EPS, hz = b.dz / 2 - EPS;
  if (hx <= 0 || hy <= 0 || hz <= 0) return false;
  const v = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < positions.length; i += 9) {
    for (let k = 0; k < 9; k++) v[k] = positions[i + k]! + offset[k % 3]! - (k % 3 === 0 ? cx : k % 3 === 1 ? cy : cz);
    if (triBoxOverlap(v, hx, hy, hz)) return true;
  }
  return false;
}

function triBoxOverlap(v: number[], hx: number, hy: number, hz: number): boolean {
  const [v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z] = v as [number, number, number, number, number, number, number, number, number];
  // 1. AABB of the triangle against the box.
  if (Math.min(v0x, v1x, v2x) >= hx || Math.max(v0x, v1x, v2x) <= -hx) return false;
  if (Math.min(v0y, v1y, v2y) >= hy || Math.max(v0y, v1y, v2y) <= -hy) return false;
  if (Math.min(v0z, v1z, v2z) >= hz || Math.max(v0z, v1z, v2z) <= -hz) return false;
  // 2. Triangle plane against the box.
  const e0 = [v1x - v0x, v1y - v0y, v1z - v0z], e1 = [v2x - v1x, v2y - v1y, v2z - v1z], e2 = [v0x - v2x, v0y - v2y, v0z - v2z];
  const n = cross(e0, e1);
  const dist = n[0]! * v0x + n[1]! * v0y + n[2]! * v0z;
  const r = hx * Math.abs(n[0]!) + hy * Math.abs(n[1]!) + hz * Math.abs(n[2]!);
  if (Math.abs(dist) >= r) return false;
  // 3. Nine edge cross-product axes.
  const verts = [[v0x, v0y, v0z], [v1x, v1y, v1z], [v2x, v2y, v2z]];
  const axesUnit = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const e of [e0, e1, e2]) {
    for (const u of axesUnit) {
      const a = cross(u, e);
      if (Math.abs(a[0]!) + Math.abs(a[1]!) + Math.abs(a[2]!) < 1e-12) continue;
      let min = Infinity, max = -Infinity;
      for (const p of verts) {
        const proj = a[0]! * p[0]! + a[1]! * p[1]! + a[2]! * p[2]!;
        min = Math.min(min, proj); max = Math.max(max, proj);
      }
      const rad = hx * Math.abs(a[0]!) + hy * Math.abs(a[1]!) + hz * Math.abs(a[2]!);
      if (min >= rad || max <= -rad) return false;
    }
  }
  return true;
}

function cross(a: number[], b: number[]): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}

/**
 * Pieces whose solid wood intersects the part mesh placed at `offset` (crate coordinates).
 * With `near` given, only solid boxes that overlap that box are tested: a board with many pockets
 * splits into many boxes, and testing boxes far from the part against every triangle is wasted work.
 */
export function piecesHitByPart(pieces: Piece[], positions: Float32Array, offset: [number, number, number] = [0, 0, 0], near?: Box): string[] {
  const hit = new Set<string>();
  for (const p of pieces) {
    for (const b of solids(p)) {
      if (near && !boxesOverlap(b, near)) continue;
      if (meshIntersectsBox(positions, b, offset)) { hit.add(p.id); break; }
    }
  }
  return [...hit];
}
