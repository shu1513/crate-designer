import { DesignError, MESSAGES } from "./errors.ts";
import { MAX_NET_KG, PROMOTE_WIDTH } from "./constants.ts";

export type TierName = "T1" | "T2" | "T3" | "T4";

/** One row of the SPEC 5.5 tier table. Dimensions in mm. */
export interface Tier {
  name: TierName;
  /** Net load upper bound (kg), inclusive. */
  maxNetKg: number;
  /** Plywood thickness. */
  t: number;
  plywoodLabel: string;
  /** Frame stock: c = thickness, d = width. */
  c: number;
  d: number;
  stockLabel: string;
  /** Skid stock (thickness × height on edge) when the skid rule applies. */
  skid: { c: number; d: number; label: string };
  wallScrew: string;
  frameScrew: string;
}

export const TIERS: readonly Tier[] = [
  { name: "T1", maxNetKg: 45, t: 10, plywoodLabel: '10 mm (3/8")', c: 19, d: 64, stockLabel: "19 × 64 (1x3)", skid: { c: 38, d: 89, label: "38 × 89 (2x4)" }, wallScrew: "#8 × 25 mm", frameScrew: "#8 × 38 mm" },
  { name: "T2", maxNetKg: 200, t: 12, plywoodLabel: '12 mm (1/2")', c: 19, d: 89, stockLabel: "19 × 89 (1x4)", skid: { c: 38, d: 89, label: "38 × 89 (2x4)" }, wallScrew: "#8 × 25 mm", frameScrew: "#8 × 50 mm" },
  { name: "T3", maxNetKg: 500, t: 15, plywoodLabel: '15 mm (5/8")', c: 38, d: 89, stockLabel: "38 × 89 (2x4)", skid: { c: 38, d: 140, label: "38 × 140 (2x6)" }, wallScrew: "#8 × 50 mm", frameScrew: "#10 × 75 mm" },
  { name: "T4", maxNetKg: MAX_NET_KG, t: 18, plywoodLabel: '18 mm (3/4")', c: 38, d: 89, stockLabel: "38 × 89 (2x4)", skid: { c: 89, d: 89, label: "89 × 89 (4x4)" }, wallScrew: "#10 × 50 mm", frameScrew: "#10 × 75 mm" },
];

/** Picks the tier from net load (SPEC R13) or refuses above the limit (R14, E5). */
export function selectTier(netKg: number): Tier {
  if (netKg > MAX_NET_KG) throw new DesignError("E5", MESSAGES.E5);
  const tier = TIERS.find((t) => netKg <= t.maxNetKg);
  if (!tier) throw new DesignError("E5", MESSAGES.E5);
  return tier;
}

/** Moves up one tier when the cradle span is long (SPEC R13). T4 stays T4. */
export function promoteIfWide(tier: Tier, innerWidth: number): Tier {
  if (innerWidth <= PROMOTE_WIDTH) return tier;
  const index = TIERS.findIndex((t) => t.name === tier.name);
  return TIERS[Math.min(index + 1, TIERS.length - 1)] ?? tier;
}
