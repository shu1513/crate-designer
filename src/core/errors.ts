/** Error and warning codes from SPEC.md section 6, with their exact messages. */
export type ErrorCode = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E8" | "E10" | "E11";
export type WarningCode = "E7" | "E9";

export class DesignError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "DesignError";
    this.code = code;
  }
}

export const MESSAGES = {
  E1: "This file is not a readable 3D model (.glb). Try exporting it again.",
  E2: "The model is flat or empty in one direction. Check the model units.", // base text; see messageE2 for the full form
  E3: "Quantity must be a whole number, 1 or more.",
  E4: "Weight must be a number greater than 0.",
  E5: "Total weight is over 1800 kg. This needs an engineered crate design, which this app does not do.",
  E6: "Could not find solid cross-sections to cradle this part.",
  E8: "This model is too detailed for the app (over 500,000 triangles). Export a simplified version.",
  E11: "The design failed its own geometry check, so it was not shown.", // followed by what failed
} as const;

/** E7 text with {{mm:N}} tokens so the screen can show it in the chosen unit (R20). */
const UNIT_WORD = { m: "meters", mm: "millimeters", in: "inches" } as const;

/** E2 with what the part would measure under the chosen unit and which unit is probably right. */
export function messageE2(chosen: "m" | "mm" | "in", dimsMm: [number, number, number], suggested: "m" | "mm" | "in"): string {
  const f = (v: number) => (v < 10 ? v.toFixed(2) : Math.round(v).toString());
  const size = `${f(dimsMm[0])} × ${f(dimsMm[1])} × ${f(dimsMm[2])} mm`;
  const hint = suggested === chosen
    ? ` Open "Only if the part looks wrong" and try another unit for "The file's numbers are in".`
    : ` The file is probably in ${UNIT_WORD[suggested]}: open "Only if the part looks wrong" and change "The file's numbers are in".`;
  return `Read as ${UNIT_WORD[chosen]}, the part would be ${size}, which is flat or empty in one direction.${hint}`;
}

export function warningE7(L: number, W: number, H: number): string {
  const t = (v: number) => `{{mm:${Math.round(v)}}}`;
  return `This part measures ${t(L)} × ${t(W)} × ${t(H)}. If that is wrong, change the model units.`;
}
