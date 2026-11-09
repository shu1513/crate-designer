import { useEffect, useState } from "react";
import type { Design } from "../core/design.ts";
import type { DisplayUnit } from "../core/format.ts";
import { loadPart } from "../core/part.ts";
import { designWorker } from "../worker/client.ts";
import { DesignInputs } from "./DesignInputs.tsx";
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

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Health) => setHealth(data))
      .catch((err: Error) => setHealthError(err.message));
  }, []);

  // Any change to the part or its settings clears the design (SPEC R23); the unit toggle does not.
  function onPartLoaded(p: LoadedPart | null) {
    setPart(p);
    setDesign(null);
    setDesignError(null);
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
    setBusy(true);
    setDesignError(null);
    try {
      const res = await designWorker.send({ type: "design", quantity, weightKg });
      if (res.type === "designed") setDesign(res.design);
      else if (res.type === "error") { setDesign(null); setDesignError(res.message); }
    } catch (err) {
      setDesign(null);
      setDesignError(`The design step failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
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
          <PartInput onLoaded={onPartLoaded} />
          <DesignInputs disabled={!part} busy={busy} unit={unit} onDesign={runDesign} onChange={() => { setDesign(null); setDesignError(null); }} />
          <button className="secondary" disabled={!design} onClick={() => window.print()}>Print</button>
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
          {designError && <div className="error-box"><strong>Cannot design a crate for this input</strong><p>{designError}</p></div>}
          {!designError && !design && <p className="muted no-print">Load a part, enter quantity and weight, then press Design crate.</p>}
          {design && <Results design={design} recordId={null} />}
        </section>
      </div>
    </UnitContext.Provider>
  );
}
