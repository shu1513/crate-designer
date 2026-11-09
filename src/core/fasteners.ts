import type { Crate } from "./crate.ts";
import type { Restraint } from "./restraint.ts";
import type { Tier } from "./tier.ts";

/** Screws only (SPEC R16, D20). Counts follow 5.5 and are rounded up to the next 10. */
export type FastenerRole = "wall" | "frame" | "corner" | "board" | "skid";

export interface Fastener {
  type: "wood screw";
  role: FastenerRole;
  /** Gauge, e.g. "#8". */
  gauge: string;
  /** Human label, e.g. "#8 × 25 mm". */
  size: string;
  lengthMm: number;
  count: number;
  /** Rounded-up count shown to the builder. */
  countAbout: number;
  usedIn: string[];
  /** Thickest stack of wood this screw goes through (for the length check). */
  joinsMm: number;
}

const STOCK_LENGTHS = [25, 32, 38, 50, 63, 75, 100];
const SKIN_PITCH = 100;
const EDGE_PITCH = 300;
const TWO_ROW_MIN_WIDTH = 82;

/** Screw length for skin-to-cleat: t + c − 3 rounded down to a stock length, never under 25 (SPEC 5.5). */
export function wallScrewLength(t: number, c: number): number {
  const target = t + c - 3;
  const fit = [...STOCK_LENGTHS].reverse().find((l) => l <= target);
  return Math.max(25, fit ?? 25);
}

function parseLength(label: string): number {
  const m = /×\s*(\d+)\s*mm/.exec(label);
  return m ? Number(m[1]) : 0;
}
function parseGauge(label: string): string {
  return /^(#\d+)/.exec(label)?.[1] ?? "#8";
}
/** Step-text form of a screw with its length as a unit token (SPEC R20). */
export function screwToken(f: Fastener): string {
  return `${f.gauge} × {{mm:${f.lengthMm}}}`;
}

function perRun(length: number, pitch: number, minimum = 2): number {
  return Math.max(minimum, Math.ceil(length / pitch));
}

/** Longest stock length that fits a wood stack, never under 25 mm. */
function fitStock(stackMm: number): number {
  const fit = [...STOCK_LENGTHS].reverse().find((l) => l <= stackMm - 3);
  return Math.max(25, fit ?? 25);
}

export function countFasteners(crate: Crate, restraint: Restraint, tier: Tier): Fastener[] {
  const { t, c, d } = tier;
  const { L, W } = crate.inner;
  const rows = d >= TWO_ROW_MIN_WIDTH ? 2 : 1;
  const about = (n: number) => Math.ceil(n / 10) * 10;
  const wallHeight = crate.inner.H + t + d;

  // Wall screws (through plywood into lumber): skin-to-cleat, lid panel-to-cleat, skin-to-base rail,
  // floor panel-to-base rail, lid closure into the top cleats.
  let wall = 0;
  const wallUses: string[] = [];
  for (const p of crate.pieces) {
    if (/^(SC|EC|LC)-/.test(p.id)) wall += p.count * rows * perRun(p.length, SKIN_PITCH);
  }
  wallUses.push("skins and lid panel to cleats");
  wall += 2 * perRun(L, SKIN_PITCH) + 2 * perRun(W, SKIN_PITCH); wallUses.push("skins to base rails");
  wall += 2 * perRun(L, EDGE_PITCH); wallUses.push("FP to the long rails"); // the end rails sit under the end stops
  const wallLen = wallScrewLength(t, c);

  // Frame screws (lumber to lumber, or through the lid into the top wall cleats): wall corners through
  // side cleat + skin into end cleat, base frame corners, joist ends, lid closure.
  let frame = 0;
  const frameUses: string[] = [];
  frame += 8; frameUses.push("base frame corners");
  const joists = crate.pieces.find((p) => p.id === "BF-J")?.count ?? 0;
  if (joists) { frame += 4 * joists; frameUses.push("joist ends"); }
  frame += perRun(2 * (crate.outer.L + crate.outer.W), SKIN_PITCH); frameUses.push("lid closure into the top wall cleats");
  const frameLen = parseLength(tier.frameScrew);

  // Board screws go into each board's solid webs (beside and between the pockets), which are full height,
  // so the length only needs to fit the shortest board; about 45 mm of bite is plenty.
  const boards = [...restraint.bottomBoards, ...restraint.topBoards, ...restraint.endStops];
  const shortest = Math.min(...boards.map((b) => b.height));
  const boardScrews = boards.reduce((n, b) => n + Math.max(3, b.pockets.length + 1), 0);
  const boardLen = fitStock(t + Math.min(shortest, 45));
  // Corner screws: through the side cleat (c) and side skin (t) into the end cleat's d-wide face.
  const cornerScrews = 4 * perRun(wallHeight, SKIN_PITCH);
  const cornerLen = fitStock(c + t + d);

  const list: Fastener[] = [
    { type: "wood screw", role: "wall", gauge: parseGauge(tier.wallScrew), size: tier.wallScrew, lengthMm: wallLen, count: wall, countAbout: about(wall), usedIn: wallUses, joinsMm: t + c },
    { type: "wood screw", role: "frame", gauge: parseGauge(tier.frameScrew), size: tier.frameScrew, lengthMm: frameLen, count: frame, countAbout: about(frame), usedIn: frameUses, joinsMm: Math.min(2 * c, t + d) },
    { type: "wood screw", role: "corner", gauge: "#10", size: `#10 × ${cornerLen} mm`, lengthMm: cornerLen, count: cornerScrews, countAbout: about(cornerScrews), usedIn: ["wall corners, side cleat through side skin into end cleat"], joinsMm: c + t + d },
    { type: "wood screw", role: "board", gauge: "#8", size: `#8 × ${boardLen} mm`, lengthMm: boardLen, count: boardScrews, countAbout: about(boardScrews), usedIn: ["cradle boards and end stops"], joinsMm: t + shortest },
  ];
  if (crate.skids) {
    // Driven down through the rails into the skids before the floor panel goes on.
    const outerSkids = 2, middle = crate.skids - 2;
    const skidScrews = outerSkids * perRun(L, EDGE_PITCH) + middle * (2 + joists) * 2;
    const skidLen = fitStock(d + tier.skid.d);
    list.push({ type: "wood screw", role: "skid", gauge: "#10", size: `#10 × ${skidLen} mm`, lengthMm: skidLen, count: skidScrews, countAbout: about(skidScrews), usedIn: ["rails into skids"], joinsMm: d + tier.skid.d });
  }
  return list;
}
