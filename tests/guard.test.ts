import { describe, expect, it } from "vitest";
import { rejectForeignRequest } from "../server/guard.ts";

describe("R22: the service only serves this machine", () => {
  it("accepts the service's own host and localhost origins (including the Vite dev server), refuses others", () => {
    expect(rejectForeignRequest("GET", { host: "localhost:8787" }, 8787)).toBeNull();
    expect(rejectForeignRequest("GET", { host: "127.0.0.1:8787", origin: "http://localhost:5173" }, 8787)).toBeNull();
    expect(rejectForeignRequest("POST", { host: "localhost:8787", origin: "http://localhost:8787", "content-type": "application/json" }, 8787)).toBeNull();
    expect(rejectForeignRequest("GET", { host: "evil.example:8787" }, 8787)).toMatch(/Host/);
    expect(rejectForeignRequest("GET", { host: "localhost:9999" }, 8787)).toMatch(/Host/);
    expect(rejectForeignRequest("GET", { host: "localhost:8787", origin: "http://evil.example" }, 8787)).toMatch(/Cross-origin/);
    expect(rejectForeignRequest("POST", { host: "localhost:8787", "content-type": "text/plain" }, 8787)).toMatch(/application\/json/);
  });
});
