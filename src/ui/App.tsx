import { useEffect, useRef, useState } from "react";
import type { Design } from "../core/design.ts";
import type { DisplayUnit } from "../core/format.ts";
import { loadPart } from "../core/part.ts";
import { applyOrientation } from "../core/orientation.ts";
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
  const [pastOpen, setPastOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [viewKey, setViewKey] = useState(0); // bumping it re-frames the 3D view
  const [openError, setOpenError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0); // remounts the file box to clear it
  function startNew() {
    invalidate();
    setPart(null);
    setPartPositions(null);
    setOpenedFile(null);
    setPastOpen(false);
    setInputKey((k) => k + 1);
    window.scrollTo({ top: 0 });
  }
  const [openedFile, setOpenedFile] = useState<string | null>(null);
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
    // A new design starts with no record: no old ID, marks, or warning may carry over (E9).
    setRecordId(null); setProblems([]); setSaveWarning(null); setReadOnly(false);
    try {
      const res = await designWorker.send({ type: "design", quantity, weightKg });
      if (rev !== revision.current) return; // inputs changed meanwhile: stale result
      if (res.type === "designed") {
        setDesign(res.design);
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
  async function openRecord(id: string, andPrint = false) {
    const rev = ++revision.current; // cancels any design in flight
    setBusy(false);
    try {
      const rec = await recordsApi.get(id);
      if (rev !== revision.current) return; // another open or a new design superseded this one
      const bytes = base64ToBytes(rec.glbBase64);
      const settings = { modelUnits: rec.design.inputs.modelUnits, upAxis: rec.design.inputs.upAxis };
      const mesh = loadPart(bytes, settings);
      const frame = applyOrientation(mesh, rec.design.frame.rules); // the rules it was saved with, not today's
      setDesign({ ...rec.design, frame: { ...rec.design.frame, positions: frame.positions } });
      setPartPositions(mesh.positions);
      setRecordId(rec.id);
      setProblems(rec.problems);
      setReadOnly(true);
      setOpenedFile(rec.glbName);
      setDesignError(null);
      setOpenError(null);
      setSaveWarning(null);
      setPastOpen(false);
      window.scrollTo({ top: 0 });
      if (andPrint) setTimeout(() => window.print(), 400); // let the page render first
    } catch (err) {
      setOpenError(`Could not open ${id}: ${(err as Error).message}`);
    }
  }

  async function reportProblem(stepId: string) {
    if (!recordId) return;
    const note = window.prompt(`What went wrong at step ${stepId}? (optional, up to 200 characters)`) ?? null;
    if (note === null) return;
    const forRecord = recordId;
    try {
      const mark = await recordsApi.addProblem(forRecord, stepId, note.slice(0, 200));
      if (forRecord !== recordId) return; // a different record is open now
      setProblems((p) => [...p, mark]);
    } catch (err) {
      setSaveWarning(`Could not save the problem mark (${(err as Error).message}).`);
    }
  }

  return (
    <UnitContext.Provider value={unit}>
      <div className="layout">
        <aside className="column inputs no-print">
          <div className="title-row">
            <h1>Crate Designer</h1>
            <div className="unit-toggle" role="group" aria-label="Show measurements in">
              <button className={unit === "mm" ? "active" : ""} onClick={() => setUnit("mm")} title="Show measurements in millimetres">mm</button>
              <button className={unit === "in" ? "active" : ""} onClick={() => setUnit("in")} title="Show measurements in inches">in</button>
            </div>
          </div>
          <section className={`step-section ${part ? "done" : "current"}`}>
            <h2><span className="num">1</span> Add the part file <span className="state">{part ? "done" : ""}</span></h2>
            <PartInput key={inputKey} onLoaded={onPartLoaded} onChanging={invalidate} />
          </section>
          <section className={`step-section ${!part ? "" : design ? "done" : "current"}`}>
            <h2><span className="num">2</span> How many, and how heavy <span className="state">{design ? "done" : ""}</span></h2>
            <DesignInputs disabled={!part || readOnly} busy={busy} unit={unit} onDesign={runDesign} onChange={invalidate} partKey={part ? `${part.fileName}:${part.bytes.byteLength}` : null} suggested={part?.match ? { id: part.match.id, weightKg: part.match.massKg, quantities: part.match.suggestedQuantities } : null} />
          </section>
          <section className={`step-section ${design ? "current" : ""}`}>
            <h2><span className="num">3</span> Print and build</h2>
            {design && recordId && <p className="status">Saved as <strong>{recordId}</strong>. This ID is printed on every page.</p>}
            {design && !recordId && saveWarning && <p className="warning">{saveWarning} The design still works and prints.</p>}
            <button className="secondary" disabled={!design} onClick={() => window.print()}>Print the build package</button>

            {readOnly && design && (
              <div className="saved-banner">
                <p className="status">Showing saved design <strong>{recordId}</strong> exactly as it was saved: {openedFile}, {design.inputs.quantity} × {design.inputs.weightKg} kg.</p>
                <button className="primary" onClick={startNew}>Start a new design</button>
              </div>
            )}
          </section>
          {healthError && <p className="warning">The local service is not answering ({healthError}). Designs still work but will not be saved to History.</p>}
          {health && <span className="sr-only">Service ok, version {health.version}</span>}
        </aside>
        <main className="column preview no-print">
          {(design || partPositions) && (
            <div className="preview-controls">
              {design && <label><input type="checkbox" checked={hideLid} onChange={(e) => setHideLid(e.target.checked)} /> Hide lid</label>}
              {design && <label><input type="checkbox" checked={hideWalls} onChange={(e) => setHideWalls(e.target.checked)} /> Hide walls</label>}
              <button className="link" onClick={() => setViewKey((k) => k + 1)}>Reset view</button>
              <span className="legend"><i className="sw part" /> your part <i className="sw ply" /> plywood <i className="sw lumber" /> lumber and boards</span>
            </div>
          )}
          {(design || partPositions) ? <Preview3D key={viewKey} design={design} partPositions={partPositions} hideLid={hideLid} hideWalls={hideWalls} /> : <p className="muted">The 3D view of your part, and then of the crate around it, appears here.</p>}
          {(design || partPositions) && <p className="muted size-line">Drag to turn, scroll to zoom.</p>}
        </main>
        <section className="column results-column">
          {designError && <div className="error-box"><strong>Cannot design a crate for this input</strong><p>{designError}</p></div>}
          {!designError && !design && <p className="muted no-print">The overview, pieces to cut, screws, and build steps appear here after you press Design crate.</p>}
          {saveWarning && <p className="warning no-print">{saveWarning}</p>}
          {readOnly && design && (
            <div className="saved-banner top no-print">
              <span>Saved design <strong>{recordId}</strong> ({openedFile}), shown exactly as it was saved.</span>
              <button className="secondary" onClick={startNew}>Start a new design</button>
            </div>
          )}
          {design && <Results design={design} recordId={recordId} fileName={readOnly ? openedFile : part?.fileName ?? null} problems={problems} onReportProblem={recordId ? reportProblem : undefined} />}
          <details className="past-designs no-print" open={pastOpen} onToggle={(e) => setPastOpen((e.target as HTMLDetailsElement).open)}>
            <summary>Past designs</summary>
            {openError && <p className="error">{openError}</p>}
            {pastOpen && <History onOpen={(id) => void openRecord(id)} onReprint={(id) => void openRecord(id, true)} />}
          </details>
        </section>
      </div>
    </UnitContext.Provider>
  );
}
