import { describe, expect, it } from "vitest";
import { handleApi } from "../server/api.ts";
import { ALGORITHM_VERSION } from "../src/core/version.ts";

const get = (pathname: string) => handleApi({ method: "GET", pathname, query: new URLSearchParams(), body: null }, null);

describe("module 1: local service", () => {
  it("GET /api/health reports ok and the algorithm version", () => {
    const res = get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, version: ALGORITHM_VERSION, records: false });
  });

  it("unknown API routes return 404 (or 503 when records are unavailable)", () => {
    expect([404, 503]).toContain(get("/api/nothing").status);
  });
});
