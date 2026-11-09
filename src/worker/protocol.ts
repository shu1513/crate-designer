import type { ModelUnits, UpAxis } from "../core/part.ts";

/** Messages between the UI and the design worker. The worker keeps the loaded part. */
export type WorkerRequest =
  | { id: number; type: "loadPart"; bytes: ArrayBuffer; modelUnits: ModelUnits; upAxis: UpAxis };

export interface PartSummary {
  triangleCount: number;
  dims: { L: number; W: number; H: number };
  warnings: string[];
}

export type WorkerResponse =
  | { id: number; type: "partLoaded"; summary: PartSummary }
  | { id: number; type: "error"; code: string; message: string };
