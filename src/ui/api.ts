import type { Design } from "../core/design.ts";

/** Browser side of the records API (SPEC 5.1, R25–R28). All calls go to the local service only. */

export interface HistoryEntry { id: string; createdAt: string; glbName: string; quantity: number; outer: { L: number; W: number; H: number }; problems: { stepId: string; note: string }[] }
export interface ProblemMark { designId: string; stepId: string; note: string; recordedAt: string }
export interface StoredRecord { id: string; createdAt: string; glbName: string; glbBase64: string; design: Design; problems: ProblemMark[] }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { message = ((await res.json()) as { error?: string }).error ?? message; } catch { /* keep status text */ }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function bytesToBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64: string): ArrayBuffer {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8.buffer;
}

/** The design without the part's triangle array; the GLB in the same record rebuilds it. */
export function storable(design: Design): Design {
  return { ...design, frame: { ...design.frame, positions: new Float32Array(0) } };
}

export const recordsApi = {
  save: (glbName: string, glb: ArrayBuffer, design: Design) =>
    call<{ id: string; createdAt: string }>("/api/designs", { method: "POST", body: JSON.stringify({ glbName, glbBase64: bytesToBase64(glb), design: storable(design) }) }),
  list: (filter: { part?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (filter.part) q.set("part", filter.part);
    if (filter.from) q.set("from", filter.from);
    if (filter.to) q.set("to", filter.to);
    return call<HistoryEntry[]>(`/api/designs?${q.toString()}`);
  },
  get: (id: string) => call<StoredRecord>(`/api/designs/${encodeURIComponent(id)}`),
  addProblem: (id: string, stepId: string, note: string) =>
    call<ProblemMark>(`/api/designs/${encodeURIComponent(id)}/problems`, { method: "POST", body: JSON.stringify({ stepId, note }) }),
  exportAll: () => call<unknown>("/api/export"),
  importAll: (file: unknown) => call<{ added: number; skipped: number }>("/api/import", { method: "POST", body: JSON.stringify(file) }),
};
