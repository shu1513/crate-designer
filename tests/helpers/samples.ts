import { existsSync, readFileSync } from "node:fs";
import { loadPart, type PartMesh } from "../../src/core/part.ts";

export const SAMPLES_DIR = "samples";
export const samplesPresent = existsSync(`${SAMPLES_DIR}/parts.json`);

export interface SampleEntry { id: string; model: string; mass_kg: number; dimensions_mm: [number, number, number]; suggested_quantities: number[] }

export function sampleList(): SampleEntry[] {
  return (JSON.parse(readFileSync(`${SAMPLES_DIR}/parts.json`, "utf8")) as { parts: SampleEntry[] }).parts;
}

export function loadSample(id: string): { entry: SampleEntry; part: PartMesh } {
  const entry = sampleList().find((p) => p.id === id);
  if (!entry) throw new Error(`no sample ${id}`);
  const bytes = readFileSync(`${SAMPLES_DIR}/${entry.model}`);
  const part = loadPart(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { modelUnits: "m", upAxis: "Z" });
  return { entry, part };
}
