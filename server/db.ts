import { DatabaseSync } from "node:sqlite";

/**
 * Records (SPEC R25–R28, D28): one SQLite file, two tables, minimal data: the part's GLB,
 * the design output, and problem marks. Nothing is regenerated from stored records.
 */

export interface DesignRow {
  id: string;
  createdAt: string;
  glbName: string;
  glbBytes: Uint8Array;
  designJson: string;
}
export interface ProblemRow { designId: string; stepId: string; note: string; recordedAt: string }
export interface ListEntry { id: string; createdAt: string; glbName: string; quantity: number; outer: { L: number; W: number; H: number }; problems: number }

export class RecordStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS designs (
        id TEXT PRIMARY KEY, created_at TEXT NOT NULL, glb_name TEXT NOT NULL,
        glb_bytes BLOB NOT NULL, design_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS problems (
        design_id TEXT NOT NULL REFERENCES designs(id), step_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '', recorded_at TEXT NOT NULL
      );`);
  }

  /** CR-YYYYMMDD-NNN, numbered per day (SPEC R25). */
  nextId(now = new Date()): string {
    const day = now.toISOString().slice(0, 10).replace(/-/g, "");
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM designs WHERE id LIKE ?").get(`CR-${day}-%`) as { n: number };
    return `CR-${day}-${String(row.n + 1).padStart(3, "0")}`;
  }

  save(glbName: string, glbBytes: Uint8Array, designJson: string, now = new Date()): DesignRow {
    const id = this.nextId(now);
    const createdAt = now.toISOString();
    this.db.prepare("INSERT INTO designs (id, created_at, glb_name, glb_bytes, design_json) VALUES (?, ?, ?, ?, ?)").run(id, createdAt, glbName, glbBytes, designJson);
    return { id, createdAt, glbName, glbBytes, designJson };
  }

  list(filter: { part?: string; from?: string; to?: string } = {}): ListEntry[] {
    const clauses: string[] = [];
    const params: string[] = [];
    if (filter.part) { clauses.push("glb_name LIKE ?"); params.push(`%${filter.part}%`); }
    if (filter.from) { clauses.push("created_at >= ?"); params.push(filter.from); }
    if (filter.to) { clauses.push("created_at <= ?"); params.push(filter.to.length === 10 ? `${filter.to}T23:59:59.999Z` : filter.to); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT d.id, d.created_at, d.glb_name, d.design_json, (SELECT COUNT(*) FROM problems p WHERE p.design_id = d.id) AS problems
      FROM designs d ${where} ORDER BY d.created_at DESC`).all(...params) as { id: string; created_at: string; glb_name: string; design_json: string; problems: number }[];
    return rows.map((r) => {
      const d = JSON.parse(r.design_json) as { inputs: { quantity: number }; crate: { outer: { L: number; W: number; H: number } } };
      return { id: r.id, createdAt: r.created_at, glbName: r.glb_name, quantity: d.inputs.quantity, outer: d.crate.outer, problems: r.problems };
    });
  }

  get(id: string): (DesignRow & { problems: ProblemRow[] }) | null {
    const r = this.db.prepare("SELECT id, created_at, glb_name, glb_bytes, design_json FROM designs WHERE id = ?").get(id) as
      { id: string; created_at: string; glb_name: string; glb_bytes: Uint8Array; design_json: string } | undefined;
    if (!r) return null;
    return { id: r.id, createdAt: r.created_at, glbName: r.glb_name, glbBytes: r.glb_bytes, designJson: r.design_json, problems: this.problems(id) };
  }

  problems(id: string): ProblemRow[] {
    const rows = this.db.prepare("SELECT design_id, step_id, note, recorded_at FROM problems WHERE design_id = ? ORDER BY recorded_at").all(id) as
      { design_id: string; step_id: string; note: string; recorded_at: string }[];
    return rows.map((r) => ({ designId: r.design_id, stepId: r.step_id, note: r.note, recordedAt: r.recorded_at }));
  }

  addProblem(id: string, stepId: string, note: string, now = new Date()): ProblemRow | null {
    if (!this.get(id)) return null;
    const recordedAt = now.toISOString();
    this.db.prepare("INSERT INTO problems (design_id, step_id, note, recorded_at) VALUES (?, ?, ?, ?)").run(id, stepId, note.slice(0, 200), recordedAt);
    return { designId: id, stepId, note: note.slice(0, 200), recordedAt };
  }

  /** Everything, GLB bytes as base64, for backup (SPEC R28). */
  exportAll(): ExportFile {
    const rows = this.db.prepare("SELECT id, created_at, glb_name, glb_bytes, design_json FROM designs ORDER BY created_at").all() as
      { id: string; created_at: string; glb_name: string; glb_bytes: Uint8Array; design_json: string }[];
    return {
      format: "crate-designer-records",
      version: 1,
      designs: rows.map((r) => ({ id: r.id, createdAt: r.created_at, glbName: r.glb_name, glbBase64: Buffer.from(r.glb_bytes).toString("base64"), designJson: r.design_json, problems: this.problems(r.id) })),
    };
  }

  /** Imports records, skipping any ID that already exists. Returns how many were added. */
  importAll(file: ExportFile): { added: number; skipped: number } {
    if (file.format !== "crate-designer-records") throw new Error("Not a Crate Designer export file");
    let added = 0, skipped = 0;
    const insert = this.db.prepare("INSERT INTO designs (id, created_at, glb_name, glb_bytes, design_json) VALUES (?, ?, ?, ?, ?)");
    const insertProblem = this.db.prepare("INSERT INTO problems (design_id, step_id, note, recorded_at) VALUES (?, ?, ?, ?)");
    for (const d of file.designs) {
      if (this.get(d.id)) { skipped++; continue; }
      insert.run(d.id, d.createdAt, d.glbName, Buffer.from(d.glbBase64, "base64"), d.designJson);
      for (const p of d.problems) insertProblem.run(d.id, p.stepId, p.note, p.recordedAt);
      added++;
    }
    return { added, skipped };
  }

  close(): void {
    this.db.close();
  }
}

export interface ExportFile {
  format: "crate-designer-records";
  version: 1;
  designs: { id: string; createdAt: string; glbName: string; glbBase64: string; designJson: string; problems: ProblemRow[] }[];
}
