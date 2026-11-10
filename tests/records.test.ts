import { describe, expect, it } from "vitest";
import { handleApi } from "../server/api.ts";
import { RecordStore, type ExportFile } from "../server/db.ts";
import { designFromPart } from "../src/core/design.ts";
import { loadPart } from "../src/core/part.ts";
import { buildGlb } from "./helpers/glb.ts";

const glb = buildGlb([{ size: [360, 220, 258], center: [180, 0, 129] }]);
const design = designFromPart(loadPart(glb, { modelUnits: "mm", upAxis: "Z" }), { quantity: 4, weightKg: 21.5, modelUnits: "mm", upAxis: "Z" });
const stored = { ...design, frame: { ...design.frame, positions: undefined } }; // positions come back from the GLB
const base64 = Buffer.from(glb).toString("base64");

function api(store: RecordStore, method: string, pathname: string, body: unknown = null, query = "", now = new Date("2026-11-09T12:00:00Z")) {
  return handleApi({ method, pathname, query: new URLSearchParams(query), body }, store, now);
}

describe("R25–R28: records", () => {
  it("T-R25: saving stores exactly the GLB, the design JSON, and a timestamp under a CR-YYYYMMDD-NNN id", () => {
    const store = new RecordStore(":memory:");
    const res = api(store, "POST", "/api/designs", { glbName: "bracket.glb", glbBase64: base64, design: stored });
    expect(res.status).toBe(201);
    const { id } = res.body as { id: string };
    expect(id).toBe("CR-20261109-001");
    const second = api(store, "POST", "/api/designs", { glbName: "bracket.glb", glbBase64: base64, design: stored });
    expect((second.body as { id: string }).id).toBe("CR-20261109-002");
    const row = store.get(id)!;
    expect(Object.keys(row).sort()).toEqual(["createdAt", "designJson", "glbBytes", "glbName", "id", "problems"]);
    expect(Buffer.from(row.glbBytes).equals(Buffer.from(glb))).toBe(true);
    expect(JSON.parse(row.designJson).crate.outer).toEqual(design.crate.outer);
    expect(row.problems).toEqual([]);
  });

  it("rejects bad save bodies, designs without the required shape, empty files, and files over 20 MB", () => {
    const store = new RecordStore(":memory:");
    expect(api(store, "POST", "/api/designs", { glbName: "x" }).status).toBe(400);
    expect(api(store, "POST", "/api/designs", { glbName: "x", glbBase64: base64, design: {} }).status).toBe(400);
    expect(api(store, "POST", "/api/designs", { glbName: "x", glbBase64: base64, design: { ...stored, frame: undefined } }).status).toBe(400); // missing render fields
    expect(api(store, "POST", "/api/designs", { glbName: "x", glbBase64: base64, design: { ...stored, steps: [null] } }).status).toBe(400); // a null step must be refused, not crash
    expect(api(store, "POST", "/api/designs", { glbName: "x", glbBase64: base64, design: { ...stored, crate: { ...stored.crate, pieces: [{ id: "X" }] } } }).status).toBe(400);
    expect(api(store, "POST", "/api/designs", { glbName: "x", glbBase64: "", design: stored }).status).toBe(400);
    const huge = Buffer.alloc(20 * 1024 * 1024 + 1).toString("base64");
    expect(api(store, "POST", "/api/designs", { glbName: "x", glbBase64: huge, design: stored })).toMatchObject({ status: 400, body: { error: expect.stringMatching(/20 MB/) } });
    expect(api(store, "GET", "/api/designs/CR-nope").status).toBe(404);
  });

  it("import checks every entry before writing anything; a damaged stored row is skipped by History instead of breaking it", () => {
    const store = new RecordStore(":memory:");
    const good = { id: "CR-20260101-001", createdAt: "2026-01-01T00:00:00.000Z", glbName: "a.glb", glbBase64: base64, designJson: JSON.stringify(stored), problems: [] };
    const bad = { ...good, id: "CR-20260101-002", designJson: "{not json" };
    expect(api(store, "POST", "/api/import", { format: "crate-designer-records", version: 1, designs: [good, bad] }).status).toBe(400);
    expect((api(store, "GET", "/api/designs").body as unknown[]).length).toBe(0); // nothing written: the good one was not kept either
    expect(api(store, "POST", "/api/import", { format: "crate-designer-records", version: 1, designs: [good] }).status).toBe(200);
    expect((api(store, "GET", "/api/designs").body as unknown[]).length).toBe(1);
    // A row damaged on disk (edited by hand, or written by an older version) is left out of the list, and the rest still show.
    store.save("b.glb", Buffer.from(glb), "{not json", new Date("2026-01-02T00:00:00Z"));
    store.save("c.glb", Buffer.from(glb), JSON.stringify({ inputs: { quantity: 1 } }), new Date("2026-01-03T00:00:00Z"));
    expect((api(store, "GET", "/api/designs").body as { id: string }[]).map((r) => r.id)).toEqual(["CR-20260101-001"]);
  });

  it("T-R26: history lists saved designs with id, date, part, quantity, outer size, and reopens one exactly as saved", () => {
    const store = new RecordStore(":memory:");
    api(store, "POST", "/api/designs", { glbName: "bracket.glb", glbBase64: base64, design: stored });
    const list = api(store, "GET", "/api/designs").body as { id: string; glbName: string; quantity: number; outer: { L: number } }[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "CR-20261109-001", glbName: "bracket.glb", quantity: 4 });
    expect(list[0]!.outer.L).toBe(design.crate.outer.L);
    const one = api(store, "GET", "/api/designs/CR-20261109-001").body as { glbBase64: string; design: { steps: unknown[]; crate: { pieces: unknown[] }; frame: { rules: string[] } } };
    expect(one.glbBase64).toBe(base64);
    expect(one.design.steps).toEqual(JSON.parse(JSON.stringify(design.steps)));
    expect(one.design.crate.pieces).toEqual(JSON.parse(JSON.stringify(design.crate.pieces)));
    expect(one.design.frame.rules).toEqual(design.frame.rules);
  });

  it("ids never collide: after importing a sparse id, the next save takes one above the highest number", () => {
    const store = new RecordStore(":memory:");
    const file: ExportFile = { format: "crate-designer-records", version: 1, designs: [{ id: "CR-20261109-002", createdAt: "2026-11-09T10:00:00.000Z", glbName: "a.glb", glbBase64: base64, designJson: JSON.stringify(stored), problems: [] }] };
    api(store, "POST", "/api/import", file);
    const res = api(store, "POST", "/api/designs", { glbName: "b.glb", glbBase64: base64, design: stored });
    expect((res.body as { id: string }).id).toBe("CR-20261109-003");
  });

  it("import refuses ids with an oversized suffix", () => {
    const store = new RecordStore(":memory:");
    const entry = { id: "CR-20260101-99999999999999999999", createdAt: "2026-01-01T00:00:00.000Z", glbName: "a.glb", glbBase64: base64, designJson: JSON.stringify(stored), problems: [] };
    expect(api(store, "POST", "/api/import", { format: "crate-designer-records", version: 1, designs: [entry] }).status).toBe(400);
  });

  it("an import file that repeats an id adds it once and skips the repeat; History shows one row", () => {
    const store = new RecordStore(":memory:");
    const entry = (id: string) => ({ id, createdAt: "2026-01-01T00:00:00.000Z", glbName: "a.glb", glbBase64: base64, designJson: JSON.stringify(stored), problems: [] });
    const res = api(store, "POST", "/api/import", { format: "crate-designer-records", version: 1, designs: [entry("CR-20260101-001"), entry("CR-20260101-001")] });
    expect(res.body).toEqual({ added: 1, skipped: 1 });
    expect((api(store, "GET", "/api/designs").body as unknown[]).length).toBe(1);
  });

  it("T-R26b: filters by part name and by date range", () => {
    const store = new RecordStore(":memory:");
    api(store, "POST", "/api/designs", { glbName: "bracket.glb", glbBase64: base64, design: stored }, "", new Date("2025-11-09T12:00:00Z"));
    api(store, "POST", "/api/designs", { glbName: "shaft.glb", glbBase64: base64, design: stored }, "", new Date("2026-11-09T12:00:00Z"));
    expect((api(store, "GET", "/api/designs", null, "part=shaft").body as unknown[]).length).toBe(1);
    expect((api(store, "GET", "/api/designs", null, "from=2026-01-01").body as unknown[]).length).toBe(1);
    expect((api(store, "GET", "/api/designs", null, "from=2025-01-01&to=2025-12-31").body as { id: string }[]).map((r) => r.id)).toEqual(["CR-20251109-001"]);
    expect((api(store, "GET", "/api/designs").body as unknown[]).length).toBe(2);
  });

  it("T-R27: a problem mark on a step is saved with its note and timestamp and counted in history", () => {
    const store = new RecordStore(":memory:");
    api(store, "POST", "/api/designs", { glbName: "bracket.glb", glbBase64: base64, design: stored });
    const res = api(store, "POST", "/api/designs/CR-20261109-001/problems", { stepId: "3d", note: "screw split the board" });
    expect(res.status).toBe(201);
    const one = api(store, "GET", "/api/designs/CR-20261109-001").body as { problems: { stepId: string; note: string; recordedAt: string }[] };
    expect(one.problems).toHaveLength(1);
    expect(one.problems[0]).toMatchObject({ stepId: "3d", note: "screw split the board", recordedAt: "2026-11-09T12:00:00.000Z" });
    expect((api(store, "GET", "/api/designs").body as { problems: { stepId: string; note: string }[] }[])[0]!.problems).toEqual([{ stepId: "3d", note: "screw split the board" }]);
    expect(api(store, "POST", "/api/designs/CR-nope/problems", { stepId: "1a" }).status).toBe(404);
  });

  it("T-R28: export then import into an empty store restores everything; importing twice adds nothing", () => {
    const a = new RecordStore(":memory:");
    api(a, "POST", "/api/designs", { glbName: "bracket.glb", glbBase64: base64, design: stored });
    api(a, "POST", "/api/designs/CR-20261109-001/problems", { stepId: "2a", note: "" });
    const file = api(a, "GET", "/api/export").body as ExportFile;
    expect(file.format).toBe("crate-designer-records");
    const b = new RecordStore(":memory:");
    expect(api(b, "POST", "/api/import", file).body).toEqual({ added: 1, skipped: 0 });
    expect(api(b, "POST", "/api/import", file).body).toEqual({ added: 0, skipped: 1 });
    const one = api(b, "GET", "/api/designs/CR-20261109-001").body as { glbBase64: string; problems: unknown[] };
    expect(one.glbBase64).toBe(base64);
    expect(one.problems).toHaveLength(1);
    expect(api(b, "POST", "/api/import", { format: "other" }).status).toBe(400);
  });

  it("without a store the API answers 503 but health still works", () => {
    const res = handleApi({ method: "GET", pathname: "/api/designs", query: new URLSearchParams(), body: null }, null);
    expect(res.status).toBe(503);
  });
});
