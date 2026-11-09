/** Error and warning codes from SPEC.md section 6, with their exact messages. */
export type ErrorCode = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E8" | "E10";
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
  E2: "The model is flat or empty in one direction. Check the model units.",
  E3: "Quantity must be a whole number, 1 or more.",
  E4: "Weight must be a number greater than 0.",
  E5: "Total weight is over 1800 kg. This needs an engineered crate design, which this app does not do.",
  E6: "Could not find solid cross-sections to cradle this part.",
  E8: "This model is too detailed for the app (over 500,000 triangles). Export a simplified version.",
} as const;

export function warningE7(sizeText: string): string {
  return `This part measures ${sizeText}. If that is wrong, change the model units.`;
}
