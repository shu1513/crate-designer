import type { Design } from "../core/design.ts";
import type { ModelUnits, UpAxis } from "../core/part.ts";

/** Messages between the UI and the design worker. The worker keeps the loaded part. */
export type WorkerRequest =
  | { id: number; type: "loadPart"; bytes: ArrayBuffer; modelUnits: ModelUnits | "auto"; upAxis: UpAxis | "auto" }
  | { id: number; type: "design"; quantity: number; weightKg: number };

export interface PartSummary {
  triangleCount: number;
  dims: { L: number; W: number; H: number };
  warnings: string[];
  /** The unit actually used (the guess, when "auto" was requested). */
  modelUnits: ModelUnits;
  guessed: boolean;
  /** The up axis actually used, and whether it was guessed from the file's generator. */
  upAxis: UpAxis;
  upGuessed: boolean;
}

export type WorkerResponse =
  | { id: number; type: "partLoaded"; summary: PartSummary }
  | { id: number; type: "designed"; design: Design }
  | { id: number; type: "error"; code: string; message: string; used?: { modelUnits: ModelUnits; guessed: boolean; upAxis: UpAxis; upGuessed: boolean } };
