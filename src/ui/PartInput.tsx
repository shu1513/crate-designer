import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ModelUnits, UpAxis } from "../core/part.ts";
import { matchPart, parsePartsList, parsePartsListSettings, type PartsListEntry } from "../core/partsList.ts";
import type { PartSummary } from "../worker/protocol.ts";
import { designWorker } from "../worker/client.ts";
import { useUnits } from "./units.tsx";

export interface LoadedPart {
  fileName: string;
  bytes: ArrayBuffer;
  summary: PartSummary;
  modelUnits: ModelUnits;
  upAxis: UpAxis;
  /** Entry from a dropped parts list whose model file name matches this GLB, if any (R29). */
  match: PartsListEntry | null;
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
  // Where the current unit setting came from: the parts list, a guess from the size, or the user.
  const [unitsSource, setUnitsSource] = useState<"list" | "guess" | "user" | null>(null);
  const [upSource, setUpSource] = useState<"list" | "guess" | "user" | null>(null);
  const [summary, setSummary] = useState<PartSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [partsList, setPartsList] = useState<PartsListEntry[] | null>(null);
  const [partsListError, setPartsListError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  async function load(name: string, data: ArrayBuffer, units: ModelUnits | "auto", up: UpAxis | "auto", list: PartsListEntry[] | null = partsList) {
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
        setModelUnits(res.summary.modelUnits);
        if (res.summary.guessed) setUnitsSource("guess");
        setUpAxis(res.summary.upAxis);
        if (res.summary.upGuessed) setUpSource("guess");
        onLoaded({ fileName: name, bytes: data, summary: res.summary, modelUnits: res.summary.modelUnits, upAxis: res.summary.upAxis, match: list ? matchPart(list, name) : null });
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

  async function acceptFile(file: File, units: ModelUnits | "auto", up: UpAxis | "auto", list: PartsListEntry[] | null) {
    const data = await file.arrayBuffer();
    setFileName(file.name);
    setBytes(data);
    await load(file.name, data, units, up, list);
  }

  /** A drop may hold a parts list (.json), one or more models (.glb), or both; the list is read first. */
  async function acceptFiles(files: FileList | File[]) {
    const all = Array.from(files);
    const json = all.find((f) => f.name.toLowerCase().endsWith(".json"));
    let list = partsList;
    let units: ModelUnits | "auto" = unitsSource === "user" ? modelUnits : "auto";
    let up: UpAxis | "auto" = upSource === "user" ? upAxis : "auto";
    if (json) {
      try {
        const text = await json.text();
        list = parsePartsList(text);
        setPartsList(list);
        setPartsListError(null);
        const settings = parsePartsListSettings(text);
        if (settings.modelUnits) { units = settings.modelUnits; setModelUnits(settings.modelUnits); setUnitsSource("list"); }
        if (settings.upAxis) { up = settings.upAxis; setUpAxis(settings.upAxis); setUpSource("list"); }
      } catch (err) {
        setPartsListError((err as Error).message);
      }
    }
    const glb = all.find((f) => f.name.toLowerCase().endsWith(".glb"));
    if (glb) await acceptFile(glb, units, up, list);
    else if (json && fileName && bytes) await load(fileName, bytes, units, up, list); // list dropped after the part: re-measure with its settings and match it
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    void acceptFiles(e.dataTransfer.files);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) void acceptFiles(e.target.files);
    e.target.value = "";
  }

  function onUnits(e: ChangeEvent<HTMLSelectElement>) {
    const units = e.target.value as ModelUnits;
    setModelUnits(units);
    setUnitsSource("user");
    if (fileName && bytes) void load(fileName, bytes, units, upAxis);
  }

  function onUp(e: ChangeEvent<HTMLSelectElement>) {
    const up = e.target.value as UpAxis;
    setUpAxis(up);
    setUpSource("user");
    if (fileName && bytes) void load(fileName, bytes, modelUnits, up);
  }

  return (
    <div className="part-input">
      <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <p>{fileName ? <strong>{fileName}</strong> : "Drop a .glb file here (and parts.json if you have it)"}</p>
        <label className="button">
          Choose files
          <input type="file" accept=".glb,.json,model/gltf-binary,application/json" multiple onChange={onPick} hidden />
        </label>
      </div>
      {partsListError && <p className="error">{partsListError}</p>}
      {partsList && (
        <details className="parts-list" open={!fileName}>
          <summary>Parts list: {partsList.length} part{partsList.length === 1 ? "" : "s"}</summary>
          <table className="grid">
            <thead><tr><th>ID</th><th>Name</th><th>Weight</th><th>Qty</th></tr></thead>
            <tbody>
              {partsList.map((p) => (
                <tr key={p.id} className={fileName && matchPart(partsList, fileName)?.id === p.id ? "matched" : ""}>
                  <td>{p.id}</td><td>{p.name}</td><td>{u.kg(p.massKg)}</td><td>{p.suggestedQuantities.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Drop the matching .glb file to load it; its weight and quantities fill in.</p>
        </details>
      )}
      <details className="file-settings">
        <summary>Only if the part looks wrong</summary>
        <label className="field">
          The file's numbers are in
          <select value={modelUnits} onChange={onUnits}>
            <option value="m">meters</option>
            <option value="mm">millimeters</option>
            <option value="in">inches</option>
          </select>
          <span className="hint">
            {unitsSource === "list" ? "Taken from parts.json." : unitsSource === "guess" ? "Guessed from the part's size." : unitsSource === "user" ? "Set by you." : "Taken from parts.json when present, otherwise guessed from the size."}
            {" "}A .glb file does not say its unit. If the size shown is far too big or too small, change this.
          </span>
        </label>
        <label className="field">
          Which way is up in the file
          <select value={upAxis} onChange={onUp}>
            <option value="Z">Hadrian files (Z is up)</option>
            <option value="Y">Most other programs (Y is up)</option>
          </select>
          <span className="hint">
            {upSource === "list" ? "Taken from parts.json." : upSource === "guess" ? "Guessed from the program that wrote the file." : upSource === "user" ? "Set by you." : "Taken from parts.json when present, otherwise guessed from the program that wrote the file."}
            {" "}Different programs store "up" differently. If the part is lying on its side or standing on end in the 3D view, switch this.
          </span>
        </label>
      </details>
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
