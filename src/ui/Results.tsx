import { useState } from "react";
import type { Design } from "../core/design.ts";
import { boardSvg, stepSvg } from "../core/drawings.ts";
import type { Box } from "../core/crate.ts";
import { useUnits } from "./units.tsx";
import type { ProblemMark } from "./api.ts";

type Tab = "summary" | "cutlist" | "fasteners" | "steps";

interface ResultsProps {
  design: Design;
  recordId: string | null;
  problems?: ProblemMark[];
  onReportProblem?: (stepId: string) => void;
}

export function Results({ design, recordId, problems = [], onReportProblem }: ResultsProps) {
  const [tab, setTab] = useState<Tab>("summary");
  return (
    <div className="results">
      <nav className="tabs no-print">
        {(["summary", "cutlist", "fasteners", "steps"] as Tab[]).map((t) => (
          <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
            {t === "summary" ? "Summary" : t === "cutlist" ? "Cut list" : t === "fasteners" ? "Fasteners" : "Steps"}
          </button>
        ))}
      </nav>
      <div className="tab-body no-print">
        {tab === "summary" && <Summary design={design} recordId={recordId} problems={problems} />}
        {tab === "cutlist" && <CutList design={design} />}
        {tab === "fasteners" && <Fasteners design={design} />}
        {tab === "steps" && <Steps design={design} problems={problems} onReportProblem={onReportProblem} />}
      </div>
      {/* Print package (SPEC R19): summary, cut list, fasteners, board drawings, steps. */}
      <div className="print-only print-package">
        <PrintHeader design={design} recordId={recordId} />
        <Summary design={design} recordId={recordId} problems={problems} />
        <h2>Cut list</h2>
        <CutList design={design} />
        <h2>Fasteners</h2>
        <Fasteners design={design} />
        <h2>Cradle boards and pocket tables</h2>
        <Boards design={design} />
        <h2>Build steps</h2>
        <Steps design={design} />
      </div>
    </div>
  );
}

function PrintHeader({ design, recordId }: { design: Design; recordId: string | null }) {
  return (
    <div className="print-header">
      <strong>Crate Designer</strong> · Design {recordId ?? "not saved"} · {design.inputs.quantity} × part · {new Date().toLocaleDateString()}
    </div>
  );
}

export function Summary({ design, recordId, problems = [] }: { design: Design; recordId: string | null; problems?: ProblemMark[] }) {
  const u = useUnits();
  const { crate, layout, tier, inputs } = design;
  const orientation = design.frame.rules.map((r) => (r === "native" ? "as modelled" : r === "laid-down" ? "laid on its side" : "turned 90°")).join(", ");
  return (
    <section>
      <h2>Summary</h2>
      <table className="kv">
        <tbody>
          <tr><th>Design ID</th><td>{recordId ?? "not saved"}</td></tr>
          <tr><th>Parts in crate</th><td>{inputs.quantity} ({layout.rows} row{layout.rows > 1 ? "s" : ""} × {layout.cols} column{layout.cols > 1 ? "s" : ""}), each {u.kg(inputs.weightKg)}</td></tr>
          <tr><th>Part orientation</th><td>{orientation}; long side along the crate length</td></tr>
          <tr><th>Outer size (L × W × H)</th><td>{u.size(crate.outer.L, crate.outer.W, crate.outer.H)}{crate.skids ? " including skids" : ""}</td></tr>
          <tr><th>Inside size (L × W × H)</th><td>{u.size(crate.inner.L, crate.inner.W, crate.inner.H)}</td></tr>
          <tr><th>Structure tier</th><td>{tier.name}{design.promoted ? " (moved up one tier for the wide span)" : ""}: plywood {tier.plywoodLabel}, lumber {tier.stockLabel}{crate.skids ? `, ${crate.skids} skids ${tier.skid.label}` : ", no skids"}</td></tr>
          <tr><th>Weights</th><td>parts {u.kg(design.netKg)} + wood {u.kg(design.woodKg)} = about {u.kg(design.grossKg)}</td></tr>
          <tr><th>Cradle stations</th><td>{design.restraint.stations.length} per part, at {design.restraint.stations.map((s) => u.len(s.x)).join(", ")} from the part's end</td></tr>
        </tbody>
      </table>
      {design.warnings.map((w) => <p key={w} className="warning">{u.text(w)}</p>)}
      {problems.length > 0 && (
        <div className="problems">
          <strong>Problems reported while building</strong>
          <ul>{problems.map((p) => <li key={p.recordedAt + p.stepId}>Step {p.stepId}: {p.note || "(no note)"} <span className="muted">({new Date(p.recordedAt).toLocaleString()})</span></li>)}</ul>
        </div>
      )}
    </section>
  );
}

export function CutList({ design }: { design: Design }) {
  const u = useUnits();
  return (
    <table className="grid">
      <thead><tr><th>ID</th><th>Piece</th><th>Qty</th><th>Material</th><th>Length</th><th>Width</th><th>Thick</th><th>Notes</th></tr></thead>
      <tbody>
        {design.crate.pieces.map((p, i) => (
          <tr key={`${p.id}-${i}`}>
            <td><strong>{p.id}</strong></td><td>{p.name}</td><td>{p.count}</td><td>{p.material.label}</td>
            <td>{u.len(p.length)}</td><td>{u.len(p.width)}</td><td>{u.len(p.thickness)}</td>
            <td>{[...p.notes, p.cutouts.length ? `${p.cutouts.length} pocket${p.cutouts.length > 1 ? "s" : ""}, see board drawing` : ""].filter(Boolean).join("; ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Fasteners({ design }: { design: Design }) {
  const u = useUnits();
  return (
    <table className="grid">
      <thead><tr><th>Type</th><th>Size</th><th>About</th><th>Used for</th></tr></thead>
      <tbody>
        {design.fasteners.map((f) => (
          <tr key={f.role}><td>{f.type}</td><td>{f.gauge} × {u.len(f.lengthMm)}</td><td>{f.countAbout}</td><td>{f.usedIn.join(", ")}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function Boards({ design }: { design: Design }) {
  const u = useUnits();
  const boards = design.crate.pieces.filter((p) => p.cutouts.length > 0);
  return (
    <div className="boards">
      {boards.map((b) => <div key={b.id} className="board" dangerouslySetInnerHTML={{ __html: boardSvg(b, u.unit) }} />)}
    </div>
  );
}

export function Steps({ design, problems = [], onReportProblem }: { design: Design; problems?: ProblemMark[]; onReportProblem?: (stepId: string) => void }) {
  const u = useUnits();
  const labelFor = (b: Box) => design.crate.pieces.find((p) => p.placements.some((q) => q.x === b.x && q.y === b.y && q.z === b.z))?.id;
  let lastGroup = 0;
  return (
    <ol className="steps">
      {design.steps.map((s) => {
        const heading = s.group !== lastGroup ? <h3>{s.group}. {s.groupTitle}</h3> : null;
        lastGroup = s.group;
        return (
          <li key={s.id} className="step">
            {heading}
            <div className="step-row">
              <div className="step-text">
                <strong>{s.id}</strong> {u.text(s.text)}
                {s.positions && (
                  <table className="positions"><tbody>{s.positions.map((p) => <tr key={p.label + p.mm}><td>{p.label}</td><td>{u.len(p.mm)}</td></tr>)}</tbody></table>
                )}
                {s.note && <div className="note">{u.text(s.note)}</div>}
                {(s.screw || s.tool) && <div className="muted">{[s.screw && `Screws: ${u.text(s.screw)}`, s.tool && `Tool: ${s.tool}`].filter(Boolean).join(" · ")}</div>}
                {problems.filter((p) => p.stepId === s.id).map((p) => <div key={p.recordedAt} className="warning">Problem reported: {p.note || "(no note)"}</div>)}
                {onReportProblem && <button className="link no-print" onClick={() => onReportProblem(s.id)}>Report a problem with this step</button>}
              </div>
              <div className="step-figure" dangerouslySetInnerHTML={{ __html: stepSvg(s, labelFor) }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
