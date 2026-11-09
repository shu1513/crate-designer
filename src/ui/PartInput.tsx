import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ModelUnits, UpAxis } from "../core/part.ts";
import type { PartSummary } from "../worker/protocol.ts";
import { designWorker } from "../worker/client.ts";
import { useUnits } from "./units.tsx";

export interface LoadedPart {
  fileName: string;
  bytes: ArrayBuffer;
  summary: PartSummary;
  modelUnits: ModelUnits;
  upAxis: UpAxis;
}

interface Props {
  onLoaded: (part: LoadedPart | null) => void;
  /** Called the moment the file or a selector changes, before measuring (SPEC R23). */
  onChanging: () => void;
}

/** File drop zone plus model-units and up-axis selectors (SPEC R1, R2, R4). */
export function PartInput({ onLoaded, onChanging }: Props) {
  const u = useUnits();
  const [fileName, setFileName] = useState<string | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [modelUnits, setModelUnits] = useState<ModelUnits>("m");
  const [upAxis, setUpAxis] = useState<UpAxis>("Z");
  const [summary, setSummary] = useState<PartSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadSeq = useRef(0);

  async function load(name: string, data: ArrayBuffer, units: ModelUnits, up: UpAxis) {
    onChanging();
    const seq = ++loadSeq.current;
    setBusy(true);
    setError(null);
    // The worker takes ownership of a copy (transferred, no second copy) so the original stays for re-measuring.
    const copy = data.slice(0);
    try {
      const res = await designWorker.send({ type: "loadPart", bytes: copy, modelUnits: units, upAxis: up }, [copy]);
      if (seq !== loadSeq.current) return; // a newer load superseded this one
      if (res.type === "partLoaded") {
        setSummary(res.summary);
        onLoaded({ fileName: name, bytes: data, summary: res.summary, modelUnits: units, upAxis: up });
      } else {
        setSummary(null);
        setError(res.type === "error" ? res.message : "Unexpected reply from the measuring step.");
        onLoaded(null);
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setSummary(null);
      setError(`The measuring step failed: ${(err as Error).message}`);
      onLoaded(null);
    } finally {
      if (seq === loadSeq.current) setBusy(false);
    }
  }

  async function acceptFile(file: File) {
    const data = await file.arrayBuffer();
    setFileName(file.name);
    setBytes(data);
    await load(file.name, data, modelUnits, upAxis);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void acceptFile(file);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void acceptFile(file);
  }

  function onUnits(e: ChangeEvent<HTMLSelectElement>) {
    const units = e.target.value as ModelUnits;
    setModelUnits(units);
    if (fileName && bytes) void load(fileName, bytes, units, upAxis);
  }

  function onUp(e: ChangeEvent<HTMLSelectElement>) {
    const up = e.target.value as UpAxis;
    setUpAxis(up);
    if (fileName && bytes) void load(fileName, bytes, modelUnits, up);
  }

  return (
    <div className="part-input">
      <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <p>{fileName ? <strong>{fileName}</strong> : "Drop a .glb file here"}</p>
        <label className="button">
          Choose file
          <input type="file" accept=".glb,model/gltf-binary" onChange={onPick} hidden />
        </label>
      </div>
      <label className="field">
        Model units
        <select value={modelUnits} onChange={onUnits}>
          <option value="m">meters</option>
          <option value="mm">millimeters</option>
          <option value="in">inches</option>
        </select>
      </label>
      <label className="field">
        Up axis
        <select value={upAxis} onChange={onUp}>
          <option value="Z">Z up (sample files)</option>
          <option value="Y">Y up (glTF default)</option>
        </select>
      </label>
      {busy && <p className="status">Measuring…</p>}
      {error && <p className="error">{error}</p>}
      {summary && (
        <div className="measured">
          <p className="status">
            Part size: {u.size(summary.dims.L, summary.dims.W, summary.dims.H)}
            <span className="muted"> ({summary.triangleCount.toLocaleString()} triangles)</span>
          </p>
          {summary.warnings.map((w) => (
            <p key={w} className="warning">{u.text(w)}</p>
          ))}
        </div>
      )}
    </div>
  );
}
