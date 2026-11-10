import { describe, expect, it } from "vitest";
import { boardSvg, panelSvg, stepSvg } from "../src/core/drawings.ts";
import { formatLength, formatWeight, renderText, wordCount } from "../src/core/format.ts";
import { designFromPart } from "../src/core/design.ts";
import { loadPart } from "../src/core/part.ts";
import { STEP_VERBS, stepTextProblems } from "../src/core/steps.ts";
import { buildGlb } from "./helpers/glb.ts";
import { loadSample, samplesPresent } from "./helpers/samples.ts";

const mmPart = (glb: ArrayBuffer) => loadPart(glb, { modelUnits: "mm", upAxis: "Z" });
const inputs = (quantity: number, weightKg: number) => ({ quantity, weightKg, modelUnits: "mm" as const, upAxis: "Z" as const });
const shaftLike = () => mmPart(buildGlb([{ size: [1530, 88, 88], center: [765, 0, 86] }, { size: [40, 172, 172], center: [320, 0, 86] }, { size: [80, 142, 142], center: [1300, 0, 86] }]));
const bracketLike = () => mmPart(buildGlb([{ size: [360, 220, 258], center: [180, 0, 129] }]));

describe("R20: formatting", () => {
  it("formats lengths in mm and in sixteenths, weights in kg and lb", () => {
    expect(formatLength(1632, "mm")).toBe("1632 mm");
    expect(formatLength(1632, "in")).toBe("64 1/4 in");
    expect(formatLength(25.4, "in")).toBe("1 in");
    expect(formatLength(1.6, "in")).toBe("1/16 in");
    expect(formatLength(1, "in")).toBe("1/32 in"); // under one inch: 32nds, so a 1 mm limit never rounds up to 1.6 mm
    expect(formatLength(24, "in")).toBe("15/16 in");
    expect(formatLength(25.3, "in")).toBe("1 in");
    expect(formatWeight(27, "mm")).toBe("27 kg");
    expect(formatWeight(27, "in")).toBe("59.5 lb");
    expect(renderText("Mark lines at {{mm:306}} and {{mm:765}}.", "in")).toBe("Mark lines at 12 1/16 in and 30 1/8 in.");
    expect(wordCount("Screw FP down every {{mm:300}} with #8 × 25 mm screws.")).toBe(11);
  });
});

describe("R18: build steps", () => {
  it("T-R18: every step is one verb-first sentence of ≤ 20 words, notes start with Note:, fastening steps name the screw, conditionals start with If", () => {
    for (const [part, n, kg] of [[shaftLike(), 1, 27], [bracketLike(), 8, 21.5], [shaftLike(), 4, 27]] as const) {
      const d = designFromPart(part, inputs(n, kg));
      expect(d.steps.length).toBeGreaterThan(15);
      const problems = d.steps.flatMap(stepTextProblems);
      expect(problems).toEqual([]);
      for (const s of d.steps) {
        if (s.screw) expect(s.screw).toMatch(/^#\d+ × \{\{mm:\d+\}\}$/); // screw lengths are unit tokens (R20)
        expect(STEP_VERBS).toContain(s.text.split(" ")[0]!.replace(/[^A-Za-z]/g, ""));
        if (/\bscrews?\b/i.test(s.text)) expect(s.screw, s.id).toBeDefined();
      }
      // Every screw is driven through the face that is up: panels are built cleats-down, lids and floors are flipped first.
      const flips = d.steps.filter((s) => s.flip).map((s) => s.id);
      expect(flips.length).toBeGreaterThanOrEqual(3);
      const shim = d.steps.find((s) => s.text.startsWith("If you cut a strip"))!;
      expect(shim.screw).toBeDefined();
    }
  });

  it("T-R18: steps follow the 5.6 group order and skip empty groups", () => {
    const d = designFromPart(bracketLike(), inputs(1, 21.5)); // light, short: no skids, no joists
    const groups = [...new Set(d.steps.map((s) => s.group))];
    expect(groups).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(d.steps.some((s) => s.pieceIds.includes("SK"))).toBe(false);
    expect(d.steps.filter((s) => s.group === 4)).toHaveLength(3); // stand the rails, check the diagonals, screw the corners
    const withSkids = designFromPart(shaftLike(), inputs(1, 27));
    expect(withSkids.steps.some((s) => s.pieceIds.includes("SK") && s.screw)).toBe(true);
    expect(withSkids.steps.filter((s) => s.flip).length).toBeGreaterThanOrEqual(3);
    expect(d.steps.map((s) => s.id).slice(0, 5)).toEqual(["1a", "1b", "1c", "1d", "2a"]);
  });

  it("T-R15: every piece ID is placed or fastened in some step after the inventory (group 1 alone does not count)", () => {
    for (const d of [designFromPart(shaftLike(), inputs(1, 27)), designFromPart(bracketLike(), inputs(8, 21.5))]) {
      const mentioned = new Set(d.steps.filter((s) => s.group >= 2).flatMap((s) => s.pieceIds));
      for (const p of d.crate.pieces) expect(mentioned.has(p.id), p.id).toBe(true);
    }
  });

  it("the lid is built boards first, then cleats, so every board web is reachable and cleat screws skip the boards", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    const lid = d.steps.filter((s) => s.group === 9);
    const boardScrews = lid.findIndex((s) => s.screw && s.pieceIds.includes("TC-1"));
    const cleatsPlaced = lid.findIndex((s) => s.text.startsWith("Place LC-"));
    const cleatScrews = lid.findIndex((s) => s.screw && s.pieceIds.includes("LC-L"));
    expect(boardScrews).toBeGreaterThanOrEqual(0);
    expect(boardScrews).toBeLessThan(cleatsPlaced);
    expect(cleatsPlaced).toBeLessThan(cleatScrews);
    expect(lid[cleatScrews]!.note).toMatch(/leave that screw out/);
    expect(lid.filter((s) => s.flip)).toHaveLength(2);
  });

  it("the loading step says which way round only when the part really fits one way, by mirror check at every station", () => {
    // 2400 mm beam (four stations at 480, 960, 1440, 1920) with one collar at the second station:
    // both ends look alike, but the part is one-way.
    const collarMid = mmPart(buildGlb([{ size: [2400, 80, 80], center: [1200, 0, 40] }, { size: [60, 140, 140], center: [960, 0, 70] }]));
    const d = designFromPart(collarMid, inputs(1, 40));
    expect(d.restraint.stations).toHaveLength(4);
    const lower = d.steps.find((s) => s.text.startsWith("Lower each part"))!;
    expect(lower.text).toMatch(/sits fully down/); // no visible end difference, so the check is by feel
    expect(lower.note).toMatch(/turn it end for end/);
    // The same beam with collars at both of those stations is reversible again.
    const twoCollars = mmPart(buildGlb([{ size: [2400, 80, 80], center: [1200, 0, 40] }, { size: [60, 140, 140], center: [960, 0, 70] }, { size: [60, 140, 140], center: [1440, 0, 70] }]));
    expect(designFromPart(twoCollars, inputs(1, 40)).steps.find((s) => s.text.startsWith("Lower each part"))!.note).toMatch(/either way round/);
    // A stub at one end only (outside every station) still makes the part one-way: the end stops are cut to the end faces.
    const stub = mmPart(buildGlb([{ size: [1000, 88, 88], center: [500, 0, 44] }, { size: [30, 100, 100], center: [1015, 0, 50] }]));
    const stubbed = designFromPart(stub, inputs(1, 20));
    expect(stubbed.restraint.endStops.map((s) => s.height)).toEqual([25 + 88, 25 + 100]);
    const lowerStub = stubbed.steps.find((s) => s.text.startsWith("Lower each part"))!;
    expect(lowerStub.text).toMatch(/its taller end toward the far end/);
    expect(lowerStub.note).toMatch(/end stops are cut/);
    // Whatever the cue, the lid step tells the builder how a wrong way round shows up and what to do.
    expect(stubbed.steps.find((s) => s.group === 11 && !s.screw)!.note).toMatch(/lift the lid and turn that part end for end/);
  });

  it("T-R12: the part-loading group states the 6 mm gap threshold as an If step with a unit token", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    const loading = d.steps.filter((s) => s.group === 10);
    const shim = loading.find((s) => s.text.includes("{{mm:6}}"))!;
    expect(shim).toBeDefined();
    expect(shim.text).toMatch(/^If a gap is over \{\{mm:6\}\}/);
    expect(renderText(shim.text, "in")).toContain("1/4 in");
    expect(loading[0]!.text).toMatch(/^Set LP on the empty crate/); // dry fit of the lid before anything goes in
    expect(loading[1]!.text).toMatch(/^If the work order says the part has finished surfaces, line each pocket with felt no thicker than \{\{mm:1\}\}/);
    // The strip has a size and the felt a fixing, so the builder never has to guess materials.
    expect(loading.find((s) => s.text.startsWith("If you lifted a part out, cut"))!.text).toMatch(/gap thick, pocket deep, \{\{mm:19\}\} long/);
    expect(loading[1]!.note).toMatch(/glue it/);
  });

  it("novice-read fixes (T-R18b cold reads): screw heads sunk flush, start point for runs, diagonals, pilot holes, lid dry fit", () => {
    const d = designFromPart(bracketLike(), inputs(1, 21.5));
    const text = (id: string) => { const s = d.steps.find((x) => x.id === id)!; return `${s.text} ${s.note ?? ""} ${s.tool ?? ""}`; };
    expect(text("1a")).toMatch(/start \{\{mm:50\}\} from each end/);
    expect(text("1c")).toMatch(/top face up/);
    const floorScrews = d.steps.find((s) => s.group === 3 && s.screw)!;
    expect(`${floorScrews.text} ${floorScrews.note}`).toMatch(/centred in each web.*Sink every head flush/s);
    const lidScrews = d.steps.find((s) => s.group === 9 && s.screw && s.pieceIds.includes("TC-1"))!;
    expect(lidScrews.note).toMatch(/Sink every head flush/);
    expect(d.steps.find((s) => s.group === 4 && s.text.startsWith("Check"))!.text).toMatch(/diagonals/);
    for (const s of d.steps.filter((x) => x.group === 4 && x.screw)) expect(s.tool).toMatch(/pilot/);
    expect(d.steps.find((s) => s.group === 8 && s.screw && s.pieceIds.includes("SC-V"))!.tool).toMatch(/pilot/);
    expect(d.steps.find((s) => s.group === 8 && s.pieceIds.includes("BF-L"))!.note).toMatch(/\{\{mm:32\}\} up from the skin's bottom edge.*past the corner cleats/s);
    expect(d.steps.find((s) => s.group === 8 && s.text.startsWith("Stand both end"))!.note).toMatch(/Clamp each end panel/);
    expect(d.steps.find((s) => s.group === 9 && s.text.startsWith("Turn LP over so it rests on the boards"))!.note).toBeUndefined(); // both top boards are the same height
  });

  it("marks and station lines are measured from the left end and match the board positions", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    // Panel patterns give the bottom cleat's offset from the skin's bottom edge = base-frame height d.
    const pattern = d.steps.find((s) => s.group === 7 && s.text.startsWith("Lay SC-V"))!;
    expect(pattern.positions!.find((p) => p.label.startsWith("bottom SC-H"))!.mm).toBe(d.tier.d);
    // The floor panel is turned twice: once to screw the boards from below, once back before it goes on the base.
    expect(d.steps.filter((s) => s.flip && s.pieceIds.includes("FP"))).toHaveLength(2);
    const mark = d.steps.find((s) => s.group === 3 && s.text.startsWith("Mark"))!;
    const xs = mark.positions!.map((p) => Math.round(p.mm));
    const boards = d.crate.pieces.filter((p) => /^(BC|EB)-/.test(p.id)).map((p) => Math.round(p.placements[0]!.x)).sort((a, b) => a - b);
    expect(xs).toEqual(boards);
    expect(mark.positions!.map((p) => p.label)).toContain("BC-1");
    const lid = d.steps.find((s) => s.group === 9 && s.text.startsWith("Mark lines across both faces of LP"))!;
    expect(lid.positions!.map((p) => Math.round(p.mm))).toEqual(d.crate.pieces.filter((p) => /^TC-/.test(p.id)).map((p) => Math.round(p.placements[0]!.x + d.crate.w)).sort((a, b) => a - b));
  });
});

describe("R18, R11: drawings", () => {
  it("every step has a non-empty SVG that labels its highlighted pieces, grays the rest, and shows a turn arrow on flips", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    const label = (b: { x: number; y: number; z: number }) => d.crate.pieces.find((p) => p.placements.some((q) => q.x === b.x && q.y === b.y && q.z === b.z))?.id;
    for (const s of d.steps) {
      const svg = stepSvg(s, label);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.length).toBeGreaterThan(100);
      if (s.flip) expect(svg).toContain('data-flip="true"');
      else expect(svg).not.toContain('data-flip="true"');
      if (s.highlight.length) expect(svg).toContain("#f59e0b");
      if (s.inPlace.length) expect(svg).toContain("#d1d5db");
    }
    const lay = d.steps.find((s) => s.group === 6 && s.labels?.includes("inside face up"))!;
    expect(stepSvg(lay, label)).toContain("inside face up");
  });

  it("drawings escape every string that comes from a record, so an imported file cannot inject markup", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    const hostile = { ...d.steps[0]!, id: '1a" onload="alert(1)', text: "Lay <b>out</b> & go." };
    const svg = stepSvg(hostile, () => '<img src=x onerror=alert(1)>');
    expect(svg).not.toContain('onload="alert');
    expect(svg).toContain("data-step=\"1a&quot; onload=&quot;alert(1)\"");
    expect(svg).not.toContain("<img");
    const board = { ...d.crate.pieces.find((p) => p.id === "BC-1")!, id: 'BC-1"><script>x</script>' };
    const out = boardSvg(board, "mm");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("panel steps carry a flat panel drawing with every cleat labelled and positioned from the left end and bottom edge", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    const panelSteps = d.steps.filter((s) => s.panel);
    expect(panelSteps.length).toBeGreaterThanOrEqual(3); // end, side, lid
    for (const s of panelSteps) {
      const out = panelSvg(s.panel!.skin, s.panel!.cleats, s.panel!.plane, "mm", s.panel!.title);
      expect(out).toContain(`data-panel="${s.panel!.title}"`);
      for (const c of s.panel!.cleats) expect(out).toContain(`<td>${c.id}</td>`);
      expect(out).toContain(">L</text>");
    }
    const side = panelSteps.find((s) => s.panel!.plane === "side")!;
    const bottomCleat = side.panel!.cleats.filter((c) => c.id === "SC-H").sort((a, b) => a.b.z - b.b.z)[0]!;
    expect(bottomCleat.b.z - side.panel!.skin.z).toBe(d.tier.d); // one base-frame height up
  });

  it("the L-mark convention, screw spacing, and one-way loading are stated", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    expect(d.steps.find((s) => s.group === 1 && s.text.includes("letter L") && s.pieceIds.includes("FP"))).toBeDefined();
    expect(d.steps.find((s) => s.group === 1 && s.text.includes("letter L") && s.pieceIds.includes("BC-1"))).toBeDefined();
    expect(d.steps.find((s) => s.group === 1 && s.text.includes("with F"))).toBeDefined();
    // Boards go in L end toward the F edge, so an off-centre pocket lands where the part is.
    expect(d.steps.filter((s) => `${s.text} ${s.note ?? ""}`.includes("L end toward the F edge")).length).toBe(2);
    expect(d.steps.find((s) => s.group === 11 && !s.screw)!.text).toContain("F over F");
    // Board screws go into the solid webs, a stated distance past the face line; corner and lid screws get their line.
    expect(d.steps.filter((s) => s.text.includes("one centred in each web")).length).toBe(2);
    expect(d.steps.find((s) => s.group === 8 && s.screw && s.text.includes("end edge"))).toBeDefined();
    expect(d.steps.find((s) => s.group === 11 && s.screw)!.text).toContain("from LP's edges");
    // The stepped shaft is wider at the collar end: a loading cue is given; a plain box gets "either way round".
    expect(d.steps.find((s) => s.text.startsWith("Lower each part"))!.text).toMatch(/wide end toward the (L|far) end/);
    expect(d.steps.find((s) => s.group === 11 && !s.screw)!.text).toContain("L over the floor's L");
    const uniform = designFromPart(bracketLike(), inputs(1, 21.5));
    expect(uniform.steps.find((s) => s.text.startsWith("Lower each part"))!.note).toMatch(/either way round/);
    // Pockets are cut in three actions: mark, saw the sides, chisel the waste; the shaft's six boards are all different.
    expect(d.steps.filter((s) => s.group === 2).length).toBe(3 * 6);
    // Each pocket-cutting step points at the board whose drawing and pocket table it shows; no other step does.
    for (const s of d.steps) expect(s.board !== undefined, s.id).toBe(s.group === 2);
    expect(d.steps.find((s) => s.group === 2)!.board).toBe("BC-1");
    // Identical boards share one set of steps: 8 box-brackets have 4 identical bottom boards and 4 identical top boards.
    const many = designFromPart(bracketLike(), inputs(8, 21.5));
    expect(many.steps.filter((s) => s.group === 2).length).toBe(3 * 2);
    expect(many.steps.find((s) => s.group === 2)!.text).toMatch(/BC-1\.1 to BC-2\.2/);
    // Shimming lifts the part out first and every conditional stays one action.
    const lift = d.steps.find((s) => s.text.startsWith("If a gap is over"))!;
    expect(lift.text).toMatch(/lift that part out/);
    expect(d.steps.find((s) => s.text.startsWith("If you cut a strip"))!.screw).toBeDefined();
  });

  it("T-R11: each cradle board drawing has a pocket table with one row per pocket and positive numbers", () => {
    const d = designFromPart(shaftLike(), inputs(4, 27));
    const boards = d.crate.pieces.filter((p) => /^(BC|TC)-/.test(p.id));
    for (const b of boards) {
      const out = boardSvg(b, "mm");
      const rows = out.match(/<tr><td>\d+<\/td>/g) ?? [];
      expect(rows).toHaveLength(b.cutouts.length);
      expect(b.cutouts.length).toBe(4);
      expect(out).toContain(`data-board="${b.id}"`);
      expect(out).toContain('<p class="board-caption">'); // caption outside the SVG so it never clips
      expect(out).not.toMatch(/<td>-?0 mm<\/td>/);
    }
    expect(boardSvg(boards[0]!, "in")).toContain(" in</td>");
  });

  it.skipIf(!samplesPresent)("samples: all three parts produce rule-clean steps with drawings", () => {
    for (const [id, kg] of [["PART-001", 21.5], ["PART-002", 27], ["PART-003", 11.8]] as const) {
      const d = designFromPart(loadSample(id).part, { quantity: 4, weightKg: kg, modelUnits: "m", upAxis: "Z" });
      expect(d.steps.flatMap(stepTextProblems)).toEqual([]);
      for (const s of d.steps) expect(stepSvg(s, () => undefined).length).toBeGreaterThan(100);
    }
  });
});
