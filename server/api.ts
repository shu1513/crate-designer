import { ALGORITHM_VERSION } from "../src/core/version.ts";

export type ApiResponse = { status: number; body: unknown };

/**
 * Routes an API request to a response. Pure function so it can be unit-tested
 * without opening a socket. Routes grow with the modules (SPEC 5.1).
 */
export function handleApi(method: string, pathname: string): ApiResponse {
  if (method === "GET" && pathname === "/api/health") {
    return { status: 200, body: { ok: true, version: ALGORITHM_VERSION } };
  }
  return { status: 404, body: { error: "Not found" } };
}
