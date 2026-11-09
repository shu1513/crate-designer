import { DesignError, MESSAGES } from "./errors.ts";

/** Validates the two typed inputs (SPEC R3, E3, E4). Returns normalized values. */
export function validateInputs(quantity: unknown, weightKg: unknown): { quantity: number; weightKg: number } {
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
    throw new DesignError("E3", MESSAGES.E3);
  }
  if (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg <= 0) {
    throw new DesignError("E4", MESSAGES.E4);
  }
  return { quantity, weightKg };
}
