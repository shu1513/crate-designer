import { CLEARANCE } from "./constants.ts";

/**
 * The part check shown before the cut list (SPEC R30, 5.6): the builder measures the real part
 * against the sizes the crate was designed for, so a file that does not match the part is caught
 * before any wood is cut. Lengths are {{mm:N}} tokens so the text follows the unit toggle (R20).
 * The limit is g_c, the smallest designed clearance.
 */
export function partCheckText(frame: { L: number; W: number; H: number }): string {
  const mm = (v: number) => `{{mm:${Math.round(v)}}}`;
  return `Measure the real part: lying the way it will sit in the crate (long side along the crate), it must be ${mm(frame.L)} long, ${mm(frame.W)} wide, and ${mm(frame.H)} high. `
    + `If any of these is off by more than ${mm(CLEARANCE.g_c)}, do not cut: the 3D file does not match the part, so the crate would not fit it.`;
}
