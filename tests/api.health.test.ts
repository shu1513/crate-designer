import { describe, expect, it } from "vitest";
import { handleApi } from "../server/api.ts";
import { ALGORITHM_VERSION } from "../src/core/version.ts";

describe("module 1: local service", () => {
  it("GET /api/health reports ok and the algorithm version", () => {
    const res = handleApi("GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, version: ALGORITHM_VERSION });
  });

  it("unknown API routes return 404", () => {
    expect(handleApi("GET", "/api/nothing").status).toBe(404);
  });
});
