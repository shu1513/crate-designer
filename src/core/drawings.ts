import type { Box, Piece } from "./crate.ts";
import type { Step } from "./steps.ts";
import { formatLength, type DisplayUnit } from "./format.ts";

/**
 * Line drawings as SVG (SPEC R18, R11): one fixed isometric viewpoint for every step,
 * pieces already in place in gray, pieces added in the step highlighted, parts in blue,
 * a turn arrow when a panel is flipped. Cradle boards get an elevation with their pocket table.
 */

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
const GRAY = "#d1d5db", GRAY_EDGE = "#6b7280", HI = "#f59e0b", HI_EDGE = "#92400e", PART = "#93c5fd", PART_EDGE = "#1d4ed8";

/** Isometric projection with the camera at (+X, −Y, +Z): the long side runs left to right, the near long face and the right end are visible. */
function project(x: number, y: number, z: number): [number, number] {
  return [(x + y) * COS30, (x - y) * SIN30 - z];
}

function facePaths(b: Box): string[] {
  const c = (x: number, y: number, z: number) => project(x, y, z).map((v) => v.toFixed(1)).join(",");
  const { x, y, z, dx, dy, dz } = b;
  const top = `M${c(x, y, z + dz)} L${c(x + dx, y, z + dz)} L${c(x + dx, y + dy, z + dz)} L${c(x, y + dy, z + dz)} Z`;
  const front = `M${c(x, y, z)} L${c(x + dx, y, z)} L${c(x + dx, y, z + dz)} L${c(x, y, z + dz)} Z`; // y = min face
  const side = `M${c(x + dx, y, z)} L${c(x + dx, y + dy, z)} L${c(x + dx, y + dy, z + dz)} L${c(x + dx, y, z + dz)} Z`; // x = max face
  return [top, front, side];
}

/** Painter's order for this camera, by box centre: farther boxes (larger y, smaller x and z) first. */
function depth(b: Box): number {
  return (b.x + b.dx / 2) - (b.y + b.dy / 2) + (b.z + b.dz / 2);
}

function shade(fill: string, k: number): string {
  // Slightly darker side faces so the box reads as a solid.
  const n = parseInt(fill.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - k), g = Math.max(0, ((n >> 8) & 255) - k), bl = Math.max(0, (n & 255) - k);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

function drawBoxes(items: { b: Box; fill: string; edge: string }[]): string {
  const sorted = [...items].sort((p, q) => depth(p.b) - depth(q.b));
  return sorted.map(({ b, fill, edge }) => {
    const [top, front, side] = facePaths(b);
    return `<path d="${top}" fill="${fill}" stroke="${edge}" stroke-width="1"/><path d="${front}" fill="${shade(fill, 24)}" stroke="${edge}" stroke-width="1"/><path d="${side}" fill="${shade(fill, 48)}" stroke="${edge}" stroke-width="1"/>`;
  }).join("");
}

function bounds(boxes: Box[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    for (const [px, py, pz] of [[b.x, b.y, b.z], [b.x + b.dx, b.y, b.z], [b.x, b.y + b.dy, b.z], [b.x + b.dx, b.y + b.dy, b.z], [b.x, b.y, b.z + b.dz], [b.x + b.dx, b.y, b.z + b.dz], [b.x, b.y + b.dy, b.z + b.dz], [b.x + b.dx, b.y + b.dy, b.z + b.dz]] as const) {
      const [sx, sy] = project(px, py, pz);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** One step's figure. `labelFor` gives the text drawn on each highlighted box (piece ID). */
export function stepSvg(step: Step, labelFor: (b: Box) => string | undefined): string {
  const items = [
    ...step.inPlace.map((b) => ({ b, fill: GRAY, edge: GRAY_EDGE })),
    ...(step.parts ?? []).map((b) => ({ b, fill: PART, edge: PART_EDGE })),
    ...step.highlight.map((b) => ({ b, fill: HI, edge: HI_EDGE })),
  ];
  const all = items.map((i) => i.b);
  if (all.length === 0) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120"><text x="10" y="60" font-size="14">${escape(step.text)}</text></svg>`;
  const bb = bounds(all);
  const pad = 40;
  const vw = bb.maxX - bb.minX + 2 * pad, vh = bb.maxY - bb.minY + 2 * pad + 30;
  const labels = step.highlight.map((b) => {
    const id = labelFor(b);
    if (!id) return "";
    const [sx, sy] = project(b.x + b.dx / 2, b.y + b.dy / 2, b.z + b.dz);
    return `<text x="${sx.toFixed(1)}" y="${(sy - 4).toFixed(1)}" font-size="${Math.max(12, vw / 60).toFixed(0)}" text-anchor="middle" fill="#111827" font-family="sans-serif">${escape(id)}</text>`;
  }).join("");
  const figureLabels = (step.labels ?? []).map((l, i) => `<text x="${(bb.minX).toFixed(1)}" y="${(bb.maxY + pad / 2 + i * 16).toFixed(1)}" font-size="${Math.max(12, vw / 60).toFixed(0)}" fill="#374151" font-family="sans-serif">${escape(l)}</text>`).join("");
  const flip = step.flip ? turnArrow(bb.maxX - 40, bb.minY - 10, Math.max(14, vw / 40)) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(bb.minX - pad).toFixed(1)} ${(bb.minY - pad).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" data-step="${step.id}">${drawBoxes(items)}${labels}${figureLabels}${flip}</svg>`;
}

function turnArrow(x: number, y: number, size: number): string {
  const r = size;
  return `<g data-flip="true" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><path d="M${-r},0 A${r},${r} 0 1 1 ${r},0" fill="none" stroke="#111827" stroke-width="${(r / 6).toFixed(1)}"/><path d="M${r},0 l${-r / 2},${-r / 2} M${r},0 l${r / 2},${-r / 2}" stroke="#111827" stroke-width="${(r / 6).toFixed(1)}" fill="none"/><text x="0" y="${(r + size).toFixed(1)}" font-size="${size.toFixed(0)}" text-anchor="middle" font-family="sans-serif">Turn over</text></g>`;
}

/** Elevation of a cradle board (looking along X) with its pockets and the pocket table (R11). */
export function boardSvg(piece: Piece, unit: DisplayUnit): string {
  const b = piece.placements[0]!;
  const L = b.dy, H = b.dz;
  const scale = 400 / L;
  const pad = 30;
  const rect = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${(pad + x * scale).toFixed(1)}" y="${(pad + y * scale).toFixed(1)}" width="${(w * scale).toFixed(1)}" height="${(h * scale).toFixed(1)}" fill="${fill}" stroke="#374151" stroke-width="1"/>`;
  const pockets = piece.cutouts.map((c) => ({ left: c.y - b.y, depth: c.dz, width: c.dy, fromTop: c.z + c.dz >= b.z + b.dz - 1e-6 }));
  const svgPockets = pockets.map((p) => rect(p.left, p.fromTop ? 0 : H - p.depth, p.width, p.depth, "#ffffff")).join("");
  const rows = pockets.map((p, i) => `<tr><td>${i + 1}</td><td>${formatLength(p.left, unit)}</td><td>${formatLength(p.width, unit)}</td><td>${formatLength(p.depth, unit)}</td></tr>`).join("");
  const caption = `<p class="board-caption">${escape(piece.id)}: ${formatLength(L, unit)} long × ${formatLength(H, unit)} tall × ${formatLength(b.dx, unit)} thick. The left end is the crate's near side (Y = 0). Pockets open ${pockets[0]?.fromTop === false ? "downward, from the bottom edge" : "upward, from the top edge"}.</p>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(400 + 2 * pad).toFixed(0)} ${(H * scale + 2 * pad).toFixed(0)}" data-board="${piece.id}">${rect(0, 0, L, H, "#fde68a")}${svgPockets}</svg>`;
  const table = `<table class="pocket-table" data-board="${piece.id}"><thead><tr><th>Pocket</th><th>From left end</th><th>Width</th><th>Depth</th></tr></thead><tbody>${rows}</tbody></table>`;
  return svg + caption + table;
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
