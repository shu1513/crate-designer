import type { Box, Crate, Piece } from "./crate.ts";
import { CLEARANCE } from "./constants.ts";
import { screwToken, TWO_ROW_MIN_WIDTH, type Fastener } from "./fasteners.ts";
import type { Layout } from "./layout.ts";
import { fitsReversed, type Restraint } from "./restraint.ts";
import type { PartFrame } from "./orientation.ts";
import { wordCount } from "./format.ts";

/**
 * Build steps (SPEC 5.6, R18): one action per step, verb first, ≤ 20 words, exact
 * screw named when fastening, conditionals start with "If". Lengths are {{mm:N}} tokens
 * so the printout can switch units (R20). Every screw is driven through the face that is up.
 */
export interface Step {
  /** "3a", "3b", ... */
  id: string;
  group: number;
  groupTitle: string;
  text: string;
  note?: string;
  pieceIds: string[];
  /** Screw named in this step (token form), if any. */
  screw?: string;
  tool?: string;
  /** The builder turns a panel over in this step (drawing shows a turn arrow). */
  flip?: boolean;
  /** Boxes to highlight (pieces added or handled in this step). */
  highlight: Box[];
  /** Boxes already in place, drawn gray. */
  inPlace: Box[];
  /** Part bounding boxes to draw (loading steps). */
  parts?: Box[];
  /** Labels drawn on the figure. */
  labels?: string[];
  /** Positions printed as a small table under the text (mm from the named reference edge). */
  positions?: { label: string; mm: number }[];
  /** When set, the figure is this flat panel drawing instead of the crate view. */
  panel?: { plane: "side" | "end" | "lid" | "floor"; skin: Box; cleats: { id: string; b: Box }[]; title: string };
}

const GROUPS: Record<number, string> = {
  1: "Check the pieces", 2: "Cut the pockets", 3: "Fix the cradles to the floor panel", 4: "Build the base",
  5: "Fit the floor panel", 6: "Build the end panels", 7: "Build the side panels", 8: "Put up the walls",
  9: "Build the lid", 10: "Load the parts", 11: "Close the crate",
};

export const STEP_VERBS = ["Lay", "Mark", "Cut", "Saw", "Chisel", "Place", "Clamp", "Turn", "Drive", "Stand", "Screw", "Set", "Lower", "Measure", "If", "Repeat", "Line", "Fit", "Check", "Put"];

interface Ctx {
  crate: Crate;
  restraint: Restraint;
  layout: Layout;
  frame: PartFrame;
  fasteners: Fastener[];
}

const byId = (pieces: Piece[], re: RegExp) => pieces.filter((p) => re.test(p.id));
const boxesOf = (pieces: Piece[]) => pieces.flatMap((p) => p.placements);
const ids = (pieces: Piece[]) => [...new Set(pieces.map((p) => p.id))];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const mm = (v: number) => `{{mm:${Math.round(v)}}}`;
/** How far the bottom horizontal cleat sits above the skin's bottom edge (the base-frame height). */
function bottomCleatOffset(crate: Crate, skinId: string, cleatId: string): number {
  const skin = crate.pieces.find((p) => p.id === skinId)!.placements[0]!;
  const cleat = Math.min(...crate.pieces.filter((p) => p.id === cleatId).flatMap((p) => p.placements.map((b) => b.z)));
  return cleat - skin.z;
}

/** Lumber thickness c for this design (every cradle board and cleat is this thick). */
function restraintThickness(ctx: Ctx): number {
  return ctx.restraint.bottomBoards[0]?.thickness ?? ctx.crate.pieces.find((p) => p.id === "SC-V")!.thickness;
}

export function buildSteps(ctx: Ctx): Step[] {
  const { crate, layout, frame, fasteners } = ctx;
  const P = crate.pieces;
  const screw = (role: Fastener["role"]) => screwToken(fasteners.find((f) => f.role === role) ?? fasteners[0]!);
  const wall = screw("wall"), frameScrew = screw("frame"), boardScrew = screw("board"), cornerScrew = screw("corner");
  const steps: Step[] = [];
  const placed: Box[] = [];
  let letter = 0;
  let group = 0;
  const begin = (g: number) => { group = g; letter = 0; };
  const add = (s: Omit<Step, "id" | "group" | "groupTitle" | "inPlace"> & { inPlace?: Box[] }) => {
    const id = `${group}${String.fromCharCode(97 + letter++)}`;
    steps.push({ id, group, groupTitle: GROUPS[group]!, inPlace: s.inPlace ?? [...placed], ...s });
  };
  const place = (pieces: Piece[]) => placed.push(...boxesOf(pieces));
  const w = crate.w;
  const c = restraintThickness(ctx);
  const rowsText = ctx.crate.pieces.find((p) => p.id === "SC-V")!.width >= TWO_ROW_MIN_WIDTH ? "in two staggered rows" : "in one centred row";

  const bottom = byId(P, /^BC-/), top = byId(P, /^TC-/), stops = byId(P, /^EB-/);
  const bf = byId(P, /^BF-/), rails = byId(P, /^BF-(L|S)$/), joists = byId(P, /^BF-J$/), skids = byId(P, /^SK$/);
  const fp = byId(P, /^FP$/), lp = byId(P, /^LP$/);
  const es = byId(P, /^ES$/), ec = byId(P, /^EC-/), ecm = byId(P, /^EC-M$/), ss = byId(P, /^SS$/), sc = byId(P, /^SC-/), scm = byId(P, /^SC-M$/), lc = byId(P, /^LC-/);
  const leftEndPanel = (p: Piece) => p.placements.filter((b) => b.x < 0);
  const rightEndPanel = (p: Piece) => p.placements.filter((b) => b.x > 0);
  const nearSidePanel = (p: Piece) => p.placements.filter((b) => b.y < 0);
  const farSidePanel = (p: Piece) => p.placements.filter((b) => b.y > 0);

  begin(1);
  add({ text: "Lay out all pieces by ID using the cut list.", pieceIds: ids(P), highlight: boxesOf(P), inPlace: [], note: "Note: every piece carries its ID in the drawings." });
  add({ text: "Mark one end of FP and one end of LP with the letter L, on both faces.", pieceIds: ["FP", "LP"], tool: "pencil", highlight: [...boxesOf(fp), ...boxesOf(lp)], inPlace: [], note: `Note: every "from the L end" below is measured from that mark. The lid goes on with its L over the floor's L.${layout.rows > 1 ? " Board IDs read row.board: BC-2.1 is the first bottom board of the second row from the L end." : ""}` });
  add({ text: "Mark each panel's near side edge with F on both faces, with its L end on your left.", pieceIds: ["FP", "LP"], tool: "pencil", highlight: [...boxesOf(fp), ...boxesOf(lp)], inPlace: [], note: "Note: F is the front. Every cradle board goes in with its own L end toward the F edge, so an off-centre pocket lands where the part is." });
  add({ text: "Mark the left end of every cradle board and end stop with the letter L.", pieceIds: [...ids(bottom), ...ids(top), ...ids(stops)], tool: "pencil", highlight: [...boxesOf(bottom), ...boxesOf(top), ...boxesOf(stops)], inPlace: [], note: "Note: the pocket tables measure from this end." });

  begin(2);
  // Boards with the same height and pocket table are cut the same way: one set of steps per run of
  // consecutive identical boards (a range name like "BC-1.1 to BC-2.2" must never skip a different board).
  const order = [...bottom, ...top];
  const keyOf = (b: Piece) => `${b.width}|${b.cutouts.map((c) => `${(c.y - b.placements[0]!.y).toFixed(1)}:${c.dy.toFixed(1)}:${c.dz.toFixed(1)}:${c.z.toFixed(1)}`).join(",")}`;
  const runs: Piece[][] = [];
  for (const b of order) {
    const last = runs.at(-1);
    if (last && keyOf(last[0]!) === keyOf(b)) last.push(b);
    else runs.push([b]);
  }
  for (const boards of runs) {
    const names = boards.length === 1 ? boards[0]!.id : boards.length === 2 ? `${boards[0]!.id} and ${boards[1]!.id}` : `${boards[0]!.id} to ${boards.at(-1)!.id}`;
    const same = boards.length > 1 ? ` (${boards.length} identical boards)` : "";
    const pieceIds = boards.map((b) => b.id);
    const highlight = boards.flatMap((b) => b.placements);
    add({ text: `Mark each pocket on ${names}: its start from the L end, its width, and its depth.`, pieceIds, tool: "tape and pencil", highlight, inPlace: [], note: `Note: depth is measured from the open edge.${same}` });
    add({ text: `Saw the two sides of each pocket in ${names} down to the marked depth.`, pieceIds, tool: "handsaw", highlight, inPlace: [] });
    add({ text: `Chisel out the waste between the cuts in ${names}, flat to the depth line.`, pieceIds, tool: "chisel and mallet", highlight, inPlace: [], note: "Note: a jigsaw also works; the pocket floor must be flat because the part sits on it." });
  }

  begin(3);
  const floorBoards = [...bottom, ...stops];
  const floorLines = floorBoards.map((b) => ({ label: b.id, mm: b.placements[0]!.x })).sort((a, b) => a.mm - b.mm);
  add({ text: "Mark lines across both faces of FP at the positions listed below, from its L end.", pieceIds: ["FP"], tool: "tape and pencil", highlight: boxesOf(fp), inPlace: [], labels: ["top face"], positions: floorLines, note: `Note: each line marks the face of the board nearest the L end; the board's wood lies on the far side of its line, ${mm(c)} thick. The lines on the underside guide the screws after turning over.` });
  add({ text: "Place each bottom cradle board and end stop on its line, pockets up, its L end toward the F edge.", pieceIds: ["FP", ...ids(floorBoards)], highlight: boxesOf(floorBoards), inPlace: boxesOf(fp), note: "Note: the board's face nearest FP's L end sits on the line." });
  add({ text: "Clamp each board to FP.", pieceIds: ["FP", ...ids(floorBoards)], tool: "clamps", highlight: boxesOf(floorBoards), inPlace: boxesOf(fp) });
  add({ text: "Turn FP over with the boards clamped to it.", pieceIds: ["FP"], flip: true, highlight: boxesOf(fp), inPlace: boxesOf(floorBoards) });
  add({ text: `Drive ${boardScrew} screws through FP into each board, ${mm(c / 2)} past its line, one in each solid web.`, pieceIds: ["FP", ...ids(floorBoards)], screw: boardScrew, tool: "drill driver", highlight: boxesOf(floorBoards), inPlace: boxesOf(fp), note: "Note: a web is the full-height wood beside or between the pockets; never screw under a pocket. End stops get three screws spaced evenly." });

  begin(4);
  add({ text: "Stand BF-L and BF-S on edge in a rectangle, long rails outside.", pieceIds: ids(rails), highlight: boxesOf(rails), inPlace: [] });
  add({ text: `Screw each corner with two ${frameScrew} screws.`, pieceIds: ids(rails), screw: frameScrew, tool: "drill driver", highlight: boxesOf(rails), inPlace: [] });
  if (joists.length) {
    const jx = joists.flatMap((j) => j.placements.map((b, i) => ({ label: `BF-J ${i + 1}`, mm: b.x }))).sort((a, b) => a.mm - b.mm);
    add({ text: "Fit BF-J between the long rails at the positions listed below, from either end.", pieceIds: ids(joists), highlight: boxesOf(joists), inPlace: boxesOf(rails), positions: jx, note: "Note: the joists are evenly spaced, so the base frame has no left or right." });
    add({ text: `Screw each joist end with two ${frameScrew} screws.`, pieceIds: ids(joists), screw: frameScrew, tool: "drill driver", highlight: boxesOf(joists), inPlace: boxesOf(rails) });
  }
  if (skids.length) {
    const skidScrew = screw("skid");
    add({ text: `Set the base frame on the skids, outer skids flush with the long rails, overhanging each end by ${mm(w)}.`, pieceIds: ["SK", ...ids(bf)], highlight: boxesOf(skids), inPlace: boxesOf(bf), note: skids.length && (skids[0]!.count === 3) ? "Note: skids stand on their narrow face; the third skid runs under the middle of the base." : "Note: skids stand on their narrow face." });
    add({ text: `Drive ${skidScrew} screws down through the rails into the skids every ${mm(300)}.`, pieceIds: ["SK", ...ids(bf)], screw: skidScrew, tool: "drill driver", highlight: boxesOf(skids), inPlace: boxesOf(bf), note: "Note: two screws where a short rail or joist crosses the middle skid." });
  }
  place(skids); place(bf);

  begin(5);
  add({ text: "Turn FP back over so the cradles point up.", pieceIds: ["FP"], flip: true, highlight: [...boxesOf(fp), ...boxesOf(floorBoards)], inPlace: [] });
  add({ text: "Set FP on the base frame, cradles up, flush with its edges.", pieceIds: ["FP", ...ids(bf)], highlight: [...boxesOf(fp), ...boxesOf(floorBoards)], inPlace: [...placed] });
  add({ text: `Screw FP down into the two long rails every ${mm(300)} with ${wall} screws.`, pieceIds: ["FP", "BF-L"], screw: wall, tool: "drill driver", highlight: boxesOf(fp), inPlace: [...placed, ...boxesOf(floorBoards)], note: "Note: the end rails sit under the end stops and are held by the end walls later." });
  place(fp); place(floorBoards);

  begin(6);
  const ecPerimeter = byId(P, /^EC-(V|H)$/);
  const endPattern = [
    { label: "EC-V, from each end of the panel", mm: 0 },
    { label: "bottom EC-H, from the panel's bottom edge", mm: bottomCleatOffset(crate, "ES", "EC-H") },
    { label: "top EC-H, from the panel's top edge", mm: 0 },
  ];
  const endPanel = { plane: "end" as const, skin: es.flatMap(leftEndPanel)[0]!, cleats: ec.flatMap((p) => leftEndPanel(p).map((b) => ({ id: p.id, b }))), title: "End panel" };
  add({ text: "Lay EC-V and EC-H flat on the bench in the end panel pattern at the positions listed below.", pieceIds: ids(ecPerimeter), highlight: ecPerimeter.flatMap(leftEndPanel), inPlace: [], positions: endPattern, panel: endPanel, note: "Note: the drawing shows the panel flat with the cleat side facing you; the plywood goes on top of the cleats." });
  if (ecm.length) {
    const pos = ecm.flatMap(leftEndPanel).map((b, i) => ({ label: `EC-M ${i + 1}`, mm: b.y })).sort((a, b) => a.mm - b.mm);
    add({ text: "Lay EC-M between them at the positions listed below, from either end of the panel.", pieceIds: ["EC-M"], highlight: ecm.flatMap(leftEndPanel), inPlace: ecPerimeter.flatMap(leftEndPanel), positions: pos, panel: endPanel });
  }
  add({ text: "Set ES on the cleats, inside face up, flush with the outer cleat edges.", pieceIds: ["ES", ...ids(ec)], highlight: es.flatMap(leftEndPanel), inPlace: ec.flatMap(leftEndPanel), labels: ["inside face up"] });
  add({ text: "Mark the cleat centre lines on the face of ES, using the panel drawing.", pieceIds: ["ES", ...ids(ec)], tool: "tape and pencil", highlight: es.flatMap(leftEndPanel), inPlace: ec.flatMap(leftEndPanel), panel: endPanel });
  add({ text: `Screw through ES into each cleat every ${mm(100)} with ${wall} screws, ${rowsText}.`, pieceIds: ["ES", ...ids(ec)], screw: wall, tool: "drill driver", highlight: ec.flatMap(leftEndPanel), inPlace: es.flatMap(leftEndPanel) });
  add({ text: "Repeat for the second end panel.", pieceIds: ["ES", ...ids(ec)], highlight: [...es.flatMap(rightEndPanel), ...ec.flatMap(rightEndPanel)], inPlace: [] });

  begin(7);
  const scPerimeter = byId(P, /^SC-(V|H)$/);
  const sidePattern = [
    { label: "SC-V, from each end of the panel", mm: 0 },
    { label: "bottom SC-H, from the panel's bottom edge", mm: bottomCleatOffset(crate, "SS", "SC-H") },
    { label: "top SC-H, from the panel's top edge", mm: 0 },
  ];
  const sidePanel = { plane: "side" as const, skin: ss.flatMap(nearSidePanel)[0]!, cleats: sc.flatMap((p) => nearSidePanel(p).map((b) => ({ id: p.id, b }))), title: "Side panel" };
  add({ text: "Lay SC-V and SC-H flat on the bench in the side panel pattern at the positions listed below.", pieceIds: ids(scPerimeter), highlight: scPerimeter.flatMap(nearSidePanel), inPlace: [], positions: sidePattern, panel: sidePanel, note: "Note: the bottom SC-H sits one base-frame height up, leaving bare skin over the base rail." });
  if (scm.length) {
    const pos = scm.flatMap(nearSidePanel).map((b, i) => ({ label: `SC-M ${i + 1}`, mm: b.x + w })).sort((a, b) => a.mm - b.mm);
    add({ text: "Lay SC-M between them at the positions listed below, from either end of the panel.", pieceIds: ["SC-M"], highlight: scm.flatMap(nearSidePanel), inPlace: scPerimeter.flatMap(nearSidePanel), positions: pos, panel: sidePanel });
  }
  add({ text: "Set SS on the cleats, inside face up, flush with the outer cleat edges.", pieceIds: ["SS", ...ids(sc)], highlight: ss.flatMap(nearSidePanel), inPlace: sc.flatMap(nearSidePanel), labels: ["inside face up"] });
  add({ text: "Mark the cleat centre lines on the face of SS, using the panel drawing.", pieceIds: ["SS", ...ids(sc)], tool: "tape and pencil", highlight: ss.flatMap(nearSidePanel), inPlace: sc.flatMap(nearSidePanel), panel: sidePanel });
  add({ text: `Screw through SS into each cleat every ${mm(100)} with ${wall} screws, ${rowsText}.`, pieceIds: ["SS", ...ids(sc)], screw: wall, tool: "drill driver", highlight: sc.flatMap(nearSidePanel), inPlace: ss.flatMap(nearSidePanel) });
  add({ text: "Repeat for the second side panel.", pieceIds: ["SS", ...ids(sc)], highlight: [...ss.flatMap(farSidePanel), ...sc.flatMap(farSidePanel)], inPlace: [] });

  begin(8);
  add({ text: "Stand both end panels against the base ends, skins covering the base frame, cleats outside.", pieceIds: ["ES", ...ids(ec)], highlight: [...boxesOf(es), ...boxesOf(ec)], inPlace: [...placed], labels: ["inside face toward the parts"] });
  place(es); place(ec);
  add({ text: "Stand both side panels so their skins cover the end panel edges and the base sides.", pieceIds: ["SS", ...ids(sc)], highlight: [...boxesOf(ss), ...boxesOf(sc)], inPlace: [...placed] });
  place(ss); place(sc);
  add({ text: `Screw each corner every ${mm(100)} with ${cornerScrew} screws, ${mm(c / 2)} in from the side panel's end edge.`, pieceIds: ["SC-V", "EC-V"], screw: cornerScrew, tool: "drill driver", note: "Note: the screw passes through the side cleat and skin into the end cleat, which is only one cleat thickness wide, so keep to that line.", highlight: [...boxesOf(byId(P, /^SC-V$/)), ...boxesOf(byId(P, /^EC-V$/))], inPlace: [...placed] });
  add({ text: `Screw each skin into the base rail behind it every ${mm(100)} along the bottom with ${wall} screws.`, pieceIds: ["SS", "ES", "BF-L", "BF-S"], screw: wall, tool: "drill driver", highlight: [...boxesOf(ss), ...boxesOf(es)], inPlace: [...placed], note: "Note: the bare band of skin below the bottom cleat sits over the rail." });

  begin(9);
  // Top boards first, from the outside face while nothing covers it; the cleats go on afterwards,
  // so every board web is reachable and no cleat ever hides a screw position (D34, D36).
  const topLines = top.map((b) => ({ label: b.id, mm: b.placements[0]!.x + w })).sort((a, b) => a.mm - b.mm);
  add({ text: "Lay LP flat, inside face up.", pieceIds: ["LP"], highlight: boxesOf(lp), inPlace: [], labels: ["inside face up"] });
  add({ text: "Mark lines across both faces of LP at the positions listed below, from its L end.", pieceIds: ["LP"], tool: "tape and pencil", highlight: boxesOf(lp), inPlace: [], labels: ["inside face up"], positions: topLines, note: `Note: each line marks the face of the board nearest the L end; the board lies on the far side, ${mm(c)} thick. The lines on the outside guide the screws after turning over.` });
  add({ text: `Place each top cradle board on its line, pockets up, L end toward F, ${mm(w)} in from each side edge.`, pieceIds: ["LP", ...ids(top)], highlight: boxesOf(top), inPlace: boxesOf(lp), note: "Note: the board's face nearest LP's L end sits on the line; its L end goes toward the F edge." });
  add({ text: "Clamp each board to LP.", pieceIds: ["LP", ...ids(top)], tool: "clamps", highlight: boxesOf(top), inPlace: boxesOf(lp) });
  add({ text: "Turn LP over so it rests on the boards.", pieceIds: ["LP", ...ids(top)], flip: true, highlight: boxesOf(lp), inPlace: boxesOf(top), note: "Note: put blocks under the shorter boards if they differ in height, so LP lies flat." });
  add({ text: `Drive ${boardScrew} screws through LP into each board, ${mm(c / 2)} past its line, one in each solid web.`, pieceIds: ["LP", ...ids(top)], screw: boardScrew, tool: "drill driver", highlight: boxesOf(top), inPlace: boxesOf(lp), note: "Note: a web is the full-height wood beside or between the pockets; never screw into a pocket." });
  const lcPositions = [
    { label: "LC-L, from each side edge of LP", mm: w },
    { label: "LC-S, from each end of LP", mm: w },
    ...byId(P, /^LC-M$/).flatMap((p) => p.placements.map((b, i) => ({ label: `LC-M ${i + 1}, from LP's L end`, mm: b.x + w }))),
  ];
  const lidPanel = { plane: "lid" as const, skin: boxesOf(lp)[0]!, cleats: lc.flatMap((p) => p.placements.map((b) => ({ id: p.id, b }))), title: "Lid, outside face" };
  add({ text: `Place ${list(ids(lc))} on LP's outside face at the positions listed below.`, pieceIds: ["LP", ...ids(lc)], highlight: boxesOf(lc), inPlace: [...boxesOf(lp), ...boxesOf(top)], positions: lcPositions, panel: lidPanel, labels: ["outside face up"] });
  add({ text: "Clamp the cleats to LP.", pieceIds: ["LP", ...ids(lc)], tool: "clamps", highlight: boxesOf(lc), inPlace: [...boxesOf(lp), ...boxesOf(top)] });
  add({ text: "Turn LP over so it rests on the cleats.", pieceIds: ["LP"], flip: true, highlight: boxesOf(lp), inPlace: [...boxesOf(lc), ...boxesOf(top)] });
  add({ text: "Mark the cleat centre lines on the inside face of LP, using the lid drawing.", pieceIds: ["LP", ...ids(lc)], tool: "tape and pencil", highlight: boxesOf(lp), inPlace: [...boxesOf(lc), ...boxesOf(top)], panel: lidPanel });
  add({ text: `Screw through LP into each cleat every ${mm(100)} with ${wall} screws, ${rowsText}.`, pieceIds: ["LP", ...ids(lc)], screw: wall, tool: "drill driver", highlight: boxesOf(lc), inPlace: [...boxesOf(lp), ...boxesOf(top)], note: "Note: where a top cradle board crosses the cleat line, leave that screw out and carry on past the board." });

  begin(10);
  const partBoxes = layout.partOrigins.map((o) => ({ x: o.x, y: o.y, z: o.z, dx: frame.L, dy: frame.W, dz: frame.H }));
  // Does the part fit one way round only? Check every station against its mirror image; when the two
  // ends differ visibly in width or height, say which end goes where, otherwise give a check the builder can feel.
  const st = ctx.restraint.stations;
  const first = st[0]!.extents, last = st[st.length - 1]!.extents;
  const widthDiff = (last.maxY - last.minY) - (first.maxY - first.minY);
  const heightDiff = last.maxZ - first.maxZ;
  const oneWay = !fitsReversed(frame, st, c);
  const visibleCue = Math.abs(widthDiff) > 1 || Math.abs(heightDiff) > 1;
  const cue = Math.abs(heightDiff) > Math.abs(widthDiff)
    ? (heightDiff > 0 ? "its tall end toward the far end" : "its tall end toward the L end")
    : (widthDiff > 0 ? "its wide end toward the far end" : "its wide end toward the L end");
  add({ text: `If the part has finished surfaces, line each pocket with felt no thicker than ${mm(1)}.`, pieceIds: ids(bottom), highlight: boxesOf(bottom), inPlace: [...placed], note: `Note: bottom and top linings together must stay under the ${mm(CLEARANCE.g_c)} of clearance above the part.` });
  add({
    text: oneWay && visibleCue ? `Lower each part into its pockets with ${cue} of the crate.` : oneWay ? "Lower each part into its pockets until it sits fully down in every pocket." : "Lower each part into its pockets.",
    pieceIds: ids(bottom), highlight: [], parts: partBoxes, inPlace: [...placed],
    note: oneWay && visibleCue ? "Note: the part fits one way round only; the other way the lid will not close."
      : oneWay ? "Note: the part fits one way round only; if it does not sit fully down, turn it end for end."
      : "Note: the part is the same at both ends, so either way round is fine.",
  });
  add({ text: "Measure the gap on both sides of each bottom pocket.", pieceIds: ids(bottom), tool: "tape", highlight: boxesOf(bottom), parts: partBoxes, inPlace: [...placed] });
  add({ text: `If a gap is over ${mm(CLEARANCE.shimThreshold)}, lift that part out again.`, pieceIds: ids(bottom), highlight: boxesOf(bottom), parts: partBoxes, inPlace: [...placed] });
  add({ text: "If you lifted a part out, cut a wood strip to fill the gap.", pieceIds: ids(bottom), tool: "handsaw", highlight: boxesOf(bottom), inPlace: [...placed] });
  add({ text: `If you cut a strip, screw it to the pocket wall with two ${wall} screws.`, pieceIds: ids(bottom), screw: wall, tool: "drill driver", highlight: boxesOf(bottom), inPlace: [...placed] });
  add({ text: "If you lifted a part out, lower it back in the same way round.", pieceIds: ids(bottom), highlight: [], parts: partBoxes, inPlace: [...placed], note: "Note: top pockets cannot be checked after closing; the pocket table is their check." });

  begin(11);
  add({ text: "Lower the lid, L over the floor's L and F over F, so the top cradles sit over the parts.", pieceIds: ["LP", ...ids(top), ...ids(lc)], highlight: [...boxesOf(lp), ...boxesOf(top), ...boxesOf(lc)], parts: partBoxes, inPlace: [...placed] });
  add({ text: `Screw the lid into the top wall cleats every ${mm(100)} with ${frameScrew} screws, ${mm(c / 2)} from LP's edges.`, pieceIds: ["LP", "SC-H", "EC-H"], screw: frameScrew, tool: "drill driver", highlight: boxesOf(lp), inPlace: [...placed, ...boxesOf(top), ...boxesOf(lc)], note: "Note: the top wall cleat is one cleat thickness wide, just inside the lid's edge; keep to that line." });
  return steps;
}

/** R18 text rules. Returns a list of violations (empty when the step is fine). */
export function stepTextProblems(step: Step): string[] {
  const problems: string[] = [];
  const sentences = step.text.split(/(?<=\.)\s+/).filter(Boolean);
  if (sentences.length !== 1) problems.push(`${step.id}: text must be exactly one sentence`);
  const first = sentences[0] ?? "";
  const verb = first.split(/\s+/)[0] ?? "";
  if (!STEP_VERBS.includes(verb.replace(/[^A-Za-z]/g, ""))) problems.push(`${step.id}: must start with an action verb, got "${verb}"`);
  if (wordCount(first) > 20) problems.push(`${step.id}: ${wordCount(first)} words, limit 20`);
  if (step.note && !step.note.startsWith("Note:")) problems.push(`${step.id}: note must start with "Note:"`);
  if (/\bscrews?\b/i.test(first) && !step.screw) problems.push(`${step.id}: fastening step must name the screw size`);
  if (step.screw && !first.includes(step.screw)) problems.push(`${step.id}: named screw must appear in the text`);
  return problems;
}
