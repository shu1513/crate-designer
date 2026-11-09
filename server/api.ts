import { ALGORITHM_VERSION } from "../src/core/version.ts";
import { isStorableDesign, type ExportFile, type RecordStore } from "./db.ts";

export type ApiResponse = { status: number; body: unknown };

export interface ApiRequest {
  method: string;
  pathname: string;
  query: URLSearchParams;
  body: unknown;
}

/**
 * Routes an API request to a response (SPEC 5.1). Pure function over the store so it can be
 * unit-tested with an in-memory database.
 */
export function handleApi(req: ApiRequest, store: RecordStore | null, now = new Date()): ApiResponse {
  const { method, pathname, query, body } = req;
  if (method === "GET" && pathname === "/api/health") {
    return { status: 200, body: { ok: true, version: ALGORITHM_VERSION, records: store !== null } };
  }
  if (!store) return { status: 503, body: { error: "Records are unavailable" } };

  if (method === "POST" && pathname === "/api/designs") {
    const b = body as { glbName?: unknown; glbBase64?: unknown; design?: unknown } | null;
    if (!b || typeof b.glbName !== "string" || typeof b.glbBase64 !== "string" || typeof b.design !== "object" || b.design === null) {
      return { status: 400, body: { error: "Expected glbName, glbBase64, and design" } };
    }
    if (!isStorableDesign(b.design)) return { status: 400, body: { error: "Design is missing its inputs, outer size, or steps" } };
    const bytes = Buffer.from(b.glbBase64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024) return { status: 400, body: { error: "GLB must be between 1 byte and 20 MB" } };
    const row = store.save(b.glbName, bytes, JSON.stringify(b.design), now);
    return { status: 201, body: { id: row.id, createdAt: row.createdAt } };
  }
  if (method === "GET" && pathname === "/api/designs") {
    return { status: 200, body: store.list({ part: query.get("part") ?? undefined, from: query.get("from") ?? undefined, to: query.get("to") ?? undefined }) };
  }
  if (method === "GET" && pathname === "/api/export") {
    return { status: 200, body: store.exportAll() };
  }
  if (method === "POST" && pathname === "/api/import") {
    try {
      return { status: 200, body: store.importAll(body as ExportFile) };
    } catch (err) {
      return { status: 400, body: { error: (err as Error).message } };
    }
  }
  const one = /^\/api\/designs\/([A-Za-z0-9-]+)$/.exec(pathname);
  if (one && method === "GET") {
    const row = store.get(one[1]!);
    if (!row) return { status: 404, body: { error: "No such design" } };
    return { status: 200, body: { id: row.id, createdAt: row.createdAt, glbName: row.glbName, glbBase64: Buffer.from(row.glbBytes).toString("base64"), design: JSON.parse(row.designJson), problems: row.problems } };
  }
  const problem = /^\/api\/designs\/([A-Za-z0-9-]+)\/problems$/.exec(pathname);
  if (problem && method === "POST") {
    const b = body as { stepId?: unknown; note?: unknown } | null;
    if (!b || typeof b.stepId !== "string") return { status: 400, body: { error: "Expected stepId and optional note" } };
    const row = store.addProblem(problem[1]!, b.stepId, typeof b.note === "string" ? b.note : "", now);
    if (!row) return { status: 404, body: { error: "No such design" } };
    return { status: 201, body: row };
  }
  return { status: 404, body: { error: "Not found" } };
}
