import { useState } from "react";
import type { Design } from "../core/design.ts";
import { boardSvg, panelSvg, stepSvg } from "../core/drawings.ts";
import type { Box } from "../core/crate.ts";
import type { Step } from "../core/steps.ts";
import { useUnits } from "./units.tsx";
import type { ProblemMark } from "./api.ts";

type Tab = "summary" | "cutlist" | "boards" | "fasteners" | "steps";

interface ResultsProps {
  design: Design;
  recordId: string | null;
  fileName?: string | null;
  problems?: ProblemMark[];
  onReportProblem?: (stepId: string) => void;
}

export function Results({ design, recordId, fileName = null, problems = [], onReportProblem }: ResultsProps) {
  const [tab, setTab] = useState<Tab>("summary");
  const u = useUnits();
  const { outer, skids } = design.crate;
  return (
    <div className="results">
      <div className="verdict no-print">
        <strong>Crate {u.size(outer.L, outer.W, outer.H)}</strong>{skids ? `, ${skids} skids` : ", no skids"}, about {u.kg(design.woodKg)} of wood.
        {recordId ? ` Saved as ${recordId}.` : ""}
        <button className="link" onClick={() => window.print()}>Print the build package</button>
      </div>
      <nav className="tabs no-print">
        {(["summary", "cutlist", "boards", "fasteners", "steps"] as Tab[]).map((t) => (
          <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
            {t === "summary" ? "Overview" : t === "cutlist" ? "Pieces to cut" : t === "boards" ? "Cradle boards" : t === "fasteners" ? "Screws" : "Build steps"}
          </button>
        ))}
      </nav>
      <div className="tab-body no-print">
        {tab === "summary" && <Summary design={design} recordId={recordId} problems={problems} />}
        {tab === "cutlist" && <CutList design={design} />}
        {tab === "boards" && <Boards design={design} />}
        {tab === "fasteners" && <Fasteners design={design} />}
        {tab === "steps" && <Steps design={design} recordId={recordId} problems={problems} onReportProblem={onReportProblem} checklist />}
      </div>
      {/* Print package (SPEC R19): summary, cut list, fasteners, board drawings, steps. */}
      <div className="print-only print-package">
        <PrintHeader design={design} recordId={recordId} fileName={fileName} />
        <Summary design={design} recordId={recordId} problems={problems} />
        <h2>Pieces to cut</h2>
        <CutList design={design} />
        <h2>Screws</h2>
        <Fasteners design={design} />
        <h2>Cradle boards and their pockets</h2>
        <Boards design={design} />
        <h2>Build steps</h2>
        <Steps design={design} recordId={recordId} problems={problems} />
      </div>
    </div>
  );
}

function PrintHeader({ design, recordId, fileName }: { design: Design; recordId: string | null; fileName?: string | null }) {
  const u = useUnits();
  return (
    <div className="print-header">
      <strong>Crate Designer</strong> · Design {recordId ?? "not saved"} · {fileName ? `${fileName} · ` : ""}{design.inputs.quantity} × part, {u.kg(design.inputs.weightKg)} each · measurements in {u.unit === "mm" ? "millimetres" : "inches"} · printed {new Date().toLocaleDateString()}
    </div>
  );
}

export function Summary({ design, recordId, problems = [] }: { design: Design; recordId: string | null; problems?: ProblemMark[] }) {
  const u = useUnits();
  const { crate, layout, tier, inputs } = design;
  const orientation = design.frame.rules.map((r) => (r === "native" ? "as modelled" : r === "laid-down" ? "laid on its side" : "turned 90°")).join(", ");
  return (
    <section>
      <h2>Overview</h2>
      <table className="kv">
        <tbody>
          <tr><th>Design ID</th><td>{recordId ?? "not saved"}</td></tr>
          <tr><th>Parts in crate</th><td>{inputs.quantity} ({layout.rows} row{layout.rows > 1 ? "s" : ""} × {layout.cols} column{layout.cols > 1 ? "s" : ""}), each {u.kg(inputs.weightKg)}</td></tr>
          <tr><th>Part orientation</th><td>{orientation}; long side along the crate length</td></tr>
          <tr><th>Outer size (L × W × H)</th><td>{u.size(crate.outer.L, crate.outer.W, crate.outer.H)}{crate.skids ? " including skids" : ""}</td></tr>
          <tr><th>Inside size (L × W × H)</th><td>{u.size(crate.inner.L, crate.inner.W, crate.inner.H)}</td></tr>
          <tr><th>Wood to use</th><td>plywood {tier.plywoodLabel}, lumber {tier.stockLabel}{crate.skids ? `, ${crate.skids} skids ${tier.skid.label}` : ", no skids"}</td></tr>
          <tr><th>Weights</th><td>parts {u.kg(design.netKg)} + wood {u.kg(design.woodKg)} = about {u.kg(design.grossKg)}</td></tr>
          <tr><th>Cradle boards</th><td>{design.restraint.stations.length} along each part, at {design.restraint.stations.map((s) => u.len(s.x)).join(", ")} from the part's end</td></tr>
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
    <>
    <p className="muted">Every wooden piece you need, with its size. Cut them first and write the ID on each one.</p>
    <table className="grid">
      <thead><tr><th>ID</th><th>Piece</th><th>Qty</th><th>Material</th><th>Length</th><th>Width</th><th>Thick</th><th>Notes</th></tr></thead>
      <tbody>
        {design.crate.pieces.map((p, i) => (
          <tr key={`${p.id}-${i}`}>
            <td><strong>{p.id}</strong></td><td>{p.name}</td><td>{p.count}</td><td>{u.text(p.material.label)}</td>
            <td>{u.len(p.length)}</td><td>{u.len(p.width)}</td><td>{u.len(p.thickness)}</td>
            <td>{[...p.notes, p.cutouts.length ? `${p.cutouts.length} pocket${p.cutouts.length > 1 ? "s" : ""}, see Cradle boards` : ""].filter(Boolean).join("; ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
}

export function Fasteners({ design }: { design: Design }) {
  const u = useUnits();
  return (
    <>
    <p className="muted">Wood screws only. "About" is rounded up so you have spares.</p>
    <table className="grid">
      <thead><tr><th>Type</th><th>Size</th><th>About</th><th>Used for</th></tr></thead>
      <tbody>
        {design.fasteners.map((f) => (
          <tr key={f.role}><td>{f.type}</td><td>{f.gauge} × {u.len(f.lengthMm)}</td><td>{f.countAbout}</td><td>{f.usedIn.join(", ")}</td></tr>
        ))}
      </tbody>
    </table>
    </>
  );
}

export function Boards({ design }: { design: Design }) {
  const u = useUnits();
  const boards = design.crate.pieces.filter((p) => p.cutouts.length > 0);
  return (
    <div className="boards">
      <p className="muted">One drawing per cradle board, seen from the crate's end, with the pocket table to mark and cut it. The same drawing appears in the pocket-cutting steps.</p>
      {boards.map((b) => <div key={b.id} className="board" dangerouslySetInnerHTML={{ __html: boardSvg(b, u.unit) }} />)}
    </div>
  );
}

/** A step's figure: the cradle board drawing while its pockets are cut, a flat panel drawing while a panel is laid out, else the crate view. */
function figureFor(s: Step, design: Design, unit: "mm" | "in", labelFor: (b: Box) => string | undefined): string {
  const board = s.board ? design.crate.pieces.find((p) => p.id === s.board) : undefined;
  if (board) return boardSvg(board, unit);
  if (s.panel) return panelSvg(s.panel.skin, s.panel.cleats, s.panel.plane, unit, s.panel.title);
  return stepSvg(s, labelFor);
}

export function Steps({ design, recordId = null, problems = [], onReportProblem, checklist = false }: { design: Design; recordId?: string | null; problems?: ProblemMark[]; onReportProblem?: (stepId: string) => void; checklist?: boolean }) {
  const u = useUnits();
  const [done, setDone] = useState<Set<string>>(new Set());
  const labelFor = (b: Box) => design.crate.pieces.find((p) => p.placements.some((q) => q.x === b.x && q.y === b.y && q.z === b.z))?.id;
  const toggle = (id: string) => setDone((d) => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allDone = done.size === design.steps.length;
  // The last thing the builder does, on screen and on paper: mark the crate so its record can be found later (R25).
  const finish = `Write ${recordId ?? "the design ID"} on the lid with a marker, next to the L mark, so this design can be found again.`;
  let lastGroup = 0;
  return (
    <>
    {checklist && !allDone && (
      <p className="progress">{done.size} of {design.steps.length} done. Tick each step as you finish it.</p>
    )}
    {checklist && allDone && (
      <div className="complete"><strong>All {design.steps.length} steps done. The crate is complete.</strong> {finish}</div>
    )}
    <ol className={checklist ? "steps checklist" : "steps"}>
      {design.steps.map((s) => {
        const heading = s.group !== lastGroup ? <h3>{s.group}. {s.groupTitle}</h3> : null;
        lastGroup = s.group;
        return (
          <li key={s.id} className={done.has(s.id) ? "step done" : "step"}>
            {heading}
            <div className="step-row">
              <div className="step-text">
                {checklist && <input type="checkbox" className="tick" checked={done.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Step ${s.id} done`} />}
                <strong>{s.id}</strong> {u.text(s.text)}
                {s.positions && (
                  <table className="positions"><tbody>{s.positions.map((p) => <tr key={p.label + p.mm}><td>{p.label}</td><td>{u.len(p.mm)}</td></tr>)}</tbody></table>
                )}
                {s.note && <div className="note">{u.text(s.note)}</div>}
                {(s.screw || s.tool) && <div className="muted">{[s.screw && `Screws: ${u.text(s.screw)}`, s.tool && `Tool: ${s.tool}`].filter(Boolean).join(" · ")}</div>}
                {problems.filter((p) => p.stepId === s.id).map((p) => <div key={p.recordedAt} className="warning">Problem reported: {p.note || "(no note)"}</div>)}
                {onReportProblem && <button className="link no-print" onClick={() => onReportProblem(s.id)}>Report a problem with this step</button>}
              </div>
              <div className="step-figure" dangerouslySetInnerHTML={{ __html: figureFor(s, design, u.unit, labelFor) }} />
            </div>
          </li>
        );
      })}
    </ol>
    {!checklist && <p className="complete print-finish"><strong>Crate complete.</strong> {finish}</p>}
    </>
  );
}
