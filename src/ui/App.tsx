import { useEffect, useRef, useState } from "react";
import type { Design } from "../core/design.ts";
import type { DisplayUnit } from "../core/format.ts";
import { loadPart } from "../core/part.ts";
import { orientPart } from "../core/orientation.ts";
import { designWorker } from "../worker/client.ts";
import { base64ToBytes, recordsApi, type ProblemMark } from "./api.ts";
import { DesignInputs } from "./DesignInputs.tsx";
import { History } from "./History.tsx";
import { PartInput, type LoadedPart } from "./PartInput.tsx";
import { Preview3D } from "./Preview3D.tsx";
import { Results } from "./Results.tsx";
import { UnitContext } from "./units.tsx";

type Health = { ok: boolean; version: string } | null;

export function App() {
  const [health, setHealth] = useState<Health>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [part, setPart] = useState<LoadedPart | null>(null);
  const [partPositions, setPartPositions] = useState<Float32Array | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unit, setUnit] = useState<DisplayUnit>("mm");
  const [hideLid, setHideLid] = useState(false);
  const [hideWalls, setHideWalls] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [problems, setProblems] = useState<ProblemMark[]>([]);
  const [view, setView] = useState<"design" | "history">("design");
  const [readOnly, setReadOnly] = useState(false);
  // Bumped on every input change; worker replies from an older revision are ignored (R23).
  const revision = useRef(0);
  const invalidate = () => { revision.current++; setDesign(null); setDesignError(null); setRecordId(null); setSaveWarning(null); setProblems([]); setReadOnly(false); };

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Health) => setHealth(data))
      .catch((err: Error) => setHealthError(err.message));
  }, []);

  // Any change to the part or its settings clears the design (SPEC R23); the unit toggle does not.
  function onPartLoaded(p: LoadedPart | null) {
    setPart(p);
    invalidate();
    if (p) {
      try {
        setPartPositions(loadPart(p.bytes.slice(0), { modelUnits: p.modelUnits, upAxis: p.upAxis }).positions);
      } catch {
        setPartPositions(null);
      }
    } else {
      setPartPositions(null);
    }
  }

  async function runDesign(quantity: number, weightKg: number) {
    const rev = revision.current;
    setBusy(true);
    setDesignError(null);
    try {
      const res = await designWorker.send({ type: "design", quantity, weightKg });
      if (rev !== revision.current) return; // inputs changed meanwhile: stale result
      if (res.type === "designed") {
        setDesign(res.design);
        setView("design");
        // Save the record (SPEC R25). The design stays usable if saving fails (E9).
        if (part) {
          try {
            const saved = await recordsApi.save(part.fileName, part.bytes, res.design);
            if (rev !== revision.current) return;
            setRecordId(saved.id);
          } catch (err) {
            if (rev !== revision.current) return;
            setSaveWarning(`Could not save this design to history (${(err as Error).message}).`);
          }
        }
      } else if (res.type === "error") { setDesign(null); setDesignError(res.message); }
    } catch (err) {
      if (rev !== revision.current) return;
      setDesign(null);
      setDesignError(`The design step failed: ${(err as Error).message}`);
    } finally {
      if (rev === revision.current) setBusy(false);
    }
  }

  // Reopen a saved record exactly as stored (R26); the GLB rebuilds the part triangles for the preview.
  async function openRecord(id: string) {
    try {
      const rec = await recordsApi.get(id);
      revision.current++;
      const bytes = base64ToBytes(rec.glbBase64);
      const settings = { modelUnits: rec.design.inputs.modelUnits, upAxis: rec.design.inputs.upAxis };
      const mesh = loadPart(bytes, settings);
      const frame = orientPart(mesh);
      setDesign({ ...rec.design, frame: { ...rec.design.frame, positions: frame.positions } });
      setPartPositions(mesh.positions);
      setRecordId(rec.id);
      setProblems(rec.problems);
      setReadOnly(true);
      setDesignError(null);
      setSaveWarning(null);
      setView("design");
    } catch (err) {
      setDesignError(`Could not open ${id}: ${(err as Error).message}`);
      setView("design");
    }
  }

  async function reportProblem(stepId: string) {
    if (!recordId) return;
    const note = window.prompt(`What went wrong at step ${stepId}? (optional, up to 200 characters)`) ?? null;
    if (note === null) return;
    try {
      const mark = await recordsApi.addProblem(recordId, stepId, note.slice(0, 200));
      setProblems((p) => [...p, mark]);
    } catch (err) {
      setSaveWarning(`Could not save the problem mark (${(err as Error).message}).`);
    }
  }

  return (
    <UnitContext.Provider value={unit}>
      <div className="layout">
        <aside className="column inputs no-print">
          <h1>Crate Designer</h1>
          <div className="unit-toggle" role="group" aria-label="Units">
            <button className={unit === "mm" ? "active" : ""} onClick={() => setUnit("mm")}>mm</button>
            <button className={unit === "in" ? "active" : ""} onClick={() => setUnit("in")}>in</button>
          </div>
          <PartInput onLoaded={onPartLoaded} onChanging={invalidate} />
          <DesignInputs disabled={!part} busy={busy} unit={unit} onDesign={runDesign} onChange={invalidate} />
          <button className="secondary" disabled={!design} onClick={() => window.print()}>Print</button>
          <button className="secondary" onClick={() => setView(view === "history" ? "design" : "history")}>{view === "history" ? "Back to design" : "History"}</button>
          {readOnly && <p className="status">Showing saved design {recordId}. Press Design crate for a new one.</p>}
          <p className="status muted">
            Service: {health ? `ok (v${health.version})` : healthError ? `unreachable (${healthError})` : "checking…"}
          </p>
        </aside>
        <main className="column preview no-print">
          {design && (
            <div className="preview-controls">
              <label><input type="checkbox" checked={hideLid} onChange={(e) => setHideLid(e.target.checked)} /> Hide lid</label>
              <label><input type="checkbox" checked={hideWalls} onChange={(e) => setHideWalls(e.target.checked)} /> Hide walls</label>
            </div>
          )}
          {(design || partPositions) ? <Preview3D design={design} partPositions={partPositions} hideLid={hideLid} hideWalls={hideWalls} /> : <p className="muted">Drop a part file to see it here.</p>}
        </main>
        <section className="column results-column">
          {view === "history" && <History onOpen={(id) => void openRecord(id)} />}
          {view === "design" && designError && <div className="error-box"><strong>Cannot design a crate for this input</strong><p>{designError}</p></div>}
          {view === "design" && !designError && !design && <p className="muted no-print">Load a part, enter quantity and weight, then press Design crate.</p>}
          {view === "design" && saveWarning && <p className="warning no-print">{saveWarning}</p>}
          {view === "design" && design && <Results design={design} recordId={recordId} problems={problems} onReportProblem={recordId ? reportProblem : undefined} />}
        </section>
      </div>
    </UnitContext.Provider>
  );
}
