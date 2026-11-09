import { useState, type ChangeEvent, type DragEvent } from "react";
import type { ModelUnits, UpAxis } from "../core/part.ts";
import type { PartSummary } from "../worker/protocol.ts";
import { designWorker } from "../worker/client.ts";

export interface LoadedPart {
  fileName: string;
  bytes: ArrayBuffer;
  summary: PartSummary;
}

interface Props {
  onLoaded: (part: LoadedPart | null) => void;
}

/** File drop zone plus model-units and up-axis selectors (SPEC R1, R2, R4). */
export function PartInput({ onLoaded }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [modelUnits, setModelUnits] = useState<ModelUnits>("m");
  const [upAxis, setUpAxis] = useState<UpAxis>("Z");
  const [summary, setSummary] = useState<PartSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(name: string, data: ArrayBuffer, units: ModelUnits, up: UpAxis) {
    setBusy(true);
    setError(null);
    // The worker takes ownership of a copy so the original stays available for re-measuring.
    const res = await designWorker.send({ type: "loadPart", bytes: data.slice(0), modelUnits: units, upAxis: up });
    setBusy(false);
    if (res.type === "partLoaded") {
      setSummary(res.summary);
      onLoaded({ fileName: name, bytes: data, summary: res.summary });
    } else {
      setSummary(null);
      setError(res.message);
      onLoaded(null);
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
            Part size: {Math.round(summary.dims.L)} × {Math.round(summary.dims.W)} × {Math.round(summary.dims.H)} mm
            <span className="muted"> ({summary.triangleCount.toLocaleString()} triangles)</span>
          </p>
          {summary.warnings.map((w) => (
            <p key={w} className="warning">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
