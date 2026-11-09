import { describe, expect, it } from "vitest";
import { boardSvg, stepSvg } from "../src/core/drawings.ts";
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
      const shim = d.steps.find((s) => s.text.startsWith("Screw each strip"))!;
      expect(shim.screw).toBeDefined();
    }
  });

  it("T-R18: steps follow the 5.6 group order and skip empty groups", () => {
    const d = designFromPart(bracketLike(), inputs(1, 21.5)); // light, short: no skids, no joists
    const groups = [...new Set(d.steps.map((s) => s.group))];
    expect(groups).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(d.steps.some((s) => s.pieceIds.includes("SK"))).toBe(false);
    expect(d.steps.filter((s) => s.group === 4)).toHaveLength(2); // stand the rails, screw the corners
    const withSkids = designFromPart(shaftLike(), inputs(1, 27));
    expect(withSkids.steps.some((s) => s.pieceIds.includes("SK") && s.screw)).toBe(true);
    expect(withSkids.steps.filter((s) => s.flip).length).toBeGreaterThanOrEqual(3);
    expect(d.steps.map((s) => s.id).slice(0, 4)).toEqual(["1a", "2a", "2b", "2c"]);
  });

  it("T-R15: every piece ID appears in at least one step", () => {
    for (const d of [designFromPart(shaftLike(), inputs(1, 27)), designFromPart(bracketLike(), inputs(8, 21.5))]) {
      const mentioned = new Set(d.steps.flatMap((s) => s.pieceIds));
      for (const p of d.crate.pieces) expect(mentioned.has(p.id), p.id).toBe(true);
    }
  });

  it("T-R12: the part-loading group states the 6 mm gap threshold as an If step with a unit token", () => {
    const d = designFromPart(shaftLike(), inputs(1, 27));
    const loading = d.steps.filter((s) => s.group === 10);
    const shim = loading.find((s) => s.text.includes("{{mm:6}}"))!;
    expect(shim).toBeDefined();
    expect(shim.text).toMatch(/^If a gap is over \{\{mm:6\}\}/);
    expect(renderText(shim.text, "in")).toContain("1/4 in");
    expect(loading[0]!.text).toMatch(/^If the part has finished surfaces, line each pocket with felt no thicker than \{\{mm:2\}\}/);
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
