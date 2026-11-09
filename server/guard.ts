/**
 * The service is for the browser on this machine only (SPEC R22, D28): the Host header must be
 * this service, any Origin must be a localhost origin (the Vite dev server on :5173 proxies to us
 * and keeps its own Origin), and POST bodies must be JSON.
 */
export interface GuardHeaders { host?: string; origin?: string; "content-type"?: string }

const LOCAL_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function rejectForeignRequest(method: string, headers: GuardHeaders, port: number): string | null {
  const host = headers.host ?? "";
  if (!LOCAL_NAMES.has(host.replace(/:\d+$/, "")) || !host.endsWith(`:${port}`)) return "Requests must come from this machine (Host header)";
  const origin = headers.origin;
  if (origin) {
    const name = origin.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
    if (!LOCAL_NAMES.has(name)) return "Cross-origin requests are not allowed";
  }
  if (method === "POST" && !(headers["content-type"] ?? "").startsWith("application/json")) return "POST bodies must be application/json";
  return null;
}
