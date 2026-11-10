import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { recordsApi, type HistoryEntry } from "./api.ts";
import { useUnits } from "./units.tsx";

interface Props {
  onOpen: (id: string) => void;
  onReprint: (id: string) => void;
}

/** Saved designs with part-name and date filters, export and import (SPEC R26, R28). */
export function History({ onOpen, onReprint }: Props) {
  const u = useUnits();
  const [part, setPart] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const importInput = useRef<HTMLInputElement>(null);

  // Date filters are typed as local calendar days; the service compares UTC timestamps.
  const localDayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
  const localDayEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

  useEffect(() => {
    const mine = ++seq.current;
    recordsApi.list({ part, from: localDayStart(from), to: localDayEnd(to) })
      .then((list) => { if (mine === seq.current) { setRows(list); setError(null); } })
      .catch((err: Error) => { if (mine === seq.current) setError(`History is unavailable: ${err.message}`); });
  }, [part, from, to, tick]);

  async function exportAll() {
    try {
      const data = await recordsApi.exportAll();
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `crate-designer-records-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(`Export failed: ${(err as Error).message}`);
    }
  }

  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await recordsApi.importAll(JSON.parse(await file.text()));
      setMessage(`Imported ${result.added} design${result.added === 1 ? "" : "s"}, skipped ${result.skipped} already present.`);
      setTick((t) => t + 1); // refresh with the filters as they are now
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
    }
    e.target.value = "";
  }

  return (
    <section className="history">
      <p className="muted">Every design is saved here. Open one to see it again above, or Reprint it straight away.</p>
      <div className="filters">
        <label className="field">Part file<input value={part} onChange={(e) => setPart(e.target.value)} placeholder="e.g. PART-002" /></label>
        <label className="field">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="status">{message}</p>}
      {rows && rows.length === 0 && <p className="muted">No saved designs match.</p>}
      {rows && rows.length > 0 && (
        <table className="grid">
          <thead><tr><th>ID</th><th>Date</th><th>Part file</th><th>Qty</th><th>Outer size</th><th>Problems</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.id}</strong></td><td>{new Date(r.createdAt).toLocaleString()}</td><td>{r.glbName}</td><td>{r.quantity}</td>
                <td>{u.size(r.outer.L, r.outer.W, r.outer.H)}</td>
                <td>{r.problems.length === 0 ? "" : <ul className="plain">{r.problems.map((p, i) => <li key={i}>Step {p.stepId}{p.note ? `: ${p.note}` : ""}</li>)}</ul>}</td>
                <td className="row-actions"><button onClick={() => onOpen(r.id)}>Open</button> <button onClick={() => onReprint(r.id)}>Reprint</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="history-actions">
        <button className="secondary" onClick={() => void exportAll()}>Export all to a file</button>
        <button type="button" className="button" onClick={() => importInput.current?.click()}>Import from a file</button>
        <input ref={importInput} type="file" accept="application/json,.json" onChange={importFile} hidden />
      </div>
    </section>
  );
}
