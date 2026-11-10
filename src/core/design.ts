import { ALGORITHM_VERSION } from "./version.ts";
import { validateInputs } from "./inputs.ts";
import { loadPart, type ModelUnits, type PartMesh, type UpAxis } from "./part.ts";
import { orientPart, type PartFrame } from "./orientation.ts";
import { planLayout, type Layout } from "./layout.ts";
import { designRestraint, type Restraint } from "./restraint.ts";
import { buildCrate, skidRule, woodWeightKg, type Crate } from "./crate.ts";
import { countFasteners, type Fastener } from "./fasteners.ts";
import { buildSteps, type Step } from "./steps.ts";
import { overlappingPieces, piecesHitByPart } from "./checks.ts";
import { DesignError, MESSAGES } from "./errors.ts";
import type { Tier } from "./tier.ts";

export interface DesignInputs {
  quantity: number;
  weightKg: number;
  modelUnits: ModelUnits;
  upAxis: UpAxis;
}

/** The complete design (SPEC 5.1). */
export interface Design {
  algorithmVersion: string;
  inputs: DesignInputs;
  tier: Tier;
  promoted: boolean;
  frame: PartFrame;
  layout: Layout;
  restraint: Restraint;
  crate: Crate;
  fasteners: Fastener[];
  steps: Step[];
  netKg: number;
  woodKg: number;
  grossKg: number;
  warnings: string[];
}

/** Part mesh triangles moved into crate coordinates for one placed copy. */
export function partInCrate(frame: PartFrame, origin: { x: number; y: number; z: number }): Float32Array {
  const out = new Float32Array(frame.positions.length);
  for (let i = 0; i < out.length; i += 3) {
    out[i] = frame.positions[i]! + origin.x;
    out[i + 1] = frame.positions[i + 1]! + origin.y;
    out[i + 2] = frame.positions[i + 2]! + origin.z;
  }
  return out;
}

export function designFromPart(part: PartMesh, inputs: DesignInputs): Design {
  const { quantity, weightKg } = validateInputs(inputs.quantity, inputs.weightKg);
  const frame = orientPart(part);
  const netKg = quantity * weightKg;
  const { tier, layout, promoted } = planLayout(frame, quantity, netKg);
  const restraint = designRestraint(frame, layout, tier);
  const crate = buildCrate(layout, restraint, tier, skidRule, netKg);
  selfCheck(crate, frame, layout);
  const fasteners = countFasteners(crate, restraint, tier);
  const woodKg = woodWeightKg(crate.pieces);
  const steps = buildSteps({ crate, restraint, layout, frame, fasteners });
  return {
    algorithmVersion: ALGORITHM_VERSION,
    inputs: { ...inputs, quantity, weightKg },
    tier, promoted, frame, layout, restraint, crate, fasteners, steps,
    netKg, woodKg, grossKg: netKg + woodKg,
    warnings: [...part.warnings],
  };
}

/**
 * Geometry self-check (SPEC R24, E11): no two pieces overlap, and no cradle board or end stop
 * cuts into any part copy. Only the boards are tested against the mesh: they are the only
 * pieces that come near the part, and testing every triangle against every wall would cost
 * seconds on a 500,000-triangle file for nothing.
 */
function selfCheck(crate: Crate, frame: PartFrame, layout: Layout): void {
  const overlaps = overlappingPieces(crate.pieces);
  if (overlaps.length) throw new DesignError("E11", `${MESSAGES.E11} Pieces ${overlaps[0]![0]} and ${overlaps[0]![1]} overlap.`);
  const boards = crate.pieces.filter((p) => /^(BC|TC|EB)-/.test(p.id));
  for (const o of layout.partOrigins) {
    const hit = piecesHitByPart(boards, partInCrate(frame, o));
    if (hit.length) throw new DesignError("E11", `${MESSAGES.E11} Piece ${hit[0]} cuts into the part.`);
  }
}

export function designCrate(bytes: ArrayBuffer, inputs: DesignInputs): Design {
  return designFromPart(loadPart(bytes, { modelUnits: inputs.modelUnits, upAxis: inputs.upAxis }), inputs);
}
