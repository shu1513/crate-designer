/**
 * Optional parts list (SPEC R29): the shop's `parts.json` gives the weight, model file name,
 * and suggested quantities for each part, so the builder does not have to type them.
 * Typing still works and overrides anything prefilled.
 */
export interface PartsListEntry {
  id: string;
  name: string;
  /** GLB file name this entry describes. */
  model: string;
  massKg: number;
  suggestedQuantities: number[];
}

export function parsePartsList(text: string): PartsListEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This is not a readable parts list (JSON).");
  }
  const parts = (data as { parts?: unknown })?.parts;
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('The parts list has no "parts" array.');
  const out: PartsListEntry[] = [];
  for (const raw of parts) {
    const p = raw as { id?: unknown; name?: unknown; model?: unknown; mass_kg?: unknown; suggested_quantities?: unknown };
    if (typeof p.model !== "string" || typeof p.mass_kg !== "number" || !(p.mass_kg > 0)) {
      throw new Error(`Part ${typeof p.id === "string" ? p.id : "?"} needs a model file name and a positive mass_kg.`);
    }
    const qs = Array.isArray(p.suggested_quantities) ? p.suggested_quantities.filter((q): q is number => Number.isInteger(q) && q >= 1) : [];
    out.push({
      id: typeof p.id === "string" ? p.id : p.model,
      name: typeof p.name === "string" ? p.name : p.model,
      model: p.model,
      massKg: p.mass_kg,
      suggestedQuantities: qs,
    });
  }
  return out;
}

/** Finds the entry for a dropped GLB by file name (case-insensitive, folder paths ignored). */
export function matchPart(list: PartsListEntry[], fileName: string): PartsListEntry | null {
  const base = fileName.split(/[\\/]/).pop()!.toLowerCase();
  return list.find((e) => e.model.split(/[\\/]/).pop()!.toLowerCase() === base) ?? null;
}
