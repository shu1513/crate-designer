import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchPart, parsePartsList } from "../src/core/partsList.ts";
import { samplesPresent } from "./helpers/samples.ts";

describe("R29: parts list intake", () => {
  const sample = JSON.stringify({ parts: [
    { id: "PART-001", name: "Bracket", model: "PART-001-machined-steel-bracket.glb", mass_kg: 21.5, suggested_quantities: [1, 4, 8] },
    { id: "PART-002", name: "Shaft", model: "PART-002-long-steel-shaft.glb", mass_kg: 27.0, suggested_quantities: [1, 2, 4] },
  ] });

  it("T-R29: parses id, name, model, mass, and suggested quantities; matches a dropped GLB by file name", () => {
    const list = parsePartsList(sample);
    expect(list).toHaveLength(2);
    expect(list[1]).toEqual({ id: "PART-002", name: "Shaft", model: "PART-002-long-steel-shaft.glb", massKg: 27, suggestedQuantities: [1, 2, 4] });
    expect(matchPart(list, "PART-002-long-steel-shaft.glb")?.id).toBe("PART-002");
    expect(matchPart(list, "C:\\\\parts\\\\part-002-LONG-steel-shaft.GLB")?.id).toBe("PART-002");
    expect(matchPart(list, "other.glb")).toBeNull();
  });

  it("T-R29: refuses files that are not a parts list, with a plain message", () => {
    expect(() => parsePartsList("not json")).toThrowError(/not a readable parts list/);
    expect(() => parsePartsList("{}")).toThrowError(/no "parts" array/);
    expect(() => parsePartsList(JSON.stringify({ parts: [{ id: "X", model: "x.glb" }] }))).toThrowError(/Part X needs/);
  });

  it.skipIf(!samplesPresent)("T-R29 sample: Hadrian's parts.json parses and matches all three sample files", () => {
    const list = parsePartsList(readFileSync("samples/parts.json", "utf8"));
    expect(list.map((p) => p.id)).toEqual(["PART-001", "PART-002", "PART-003"]);
    expect(matchPart(list, "PART-003-irregular-aluminum-housing.glb")?.massKg).toBe(11.8);
  });
});
