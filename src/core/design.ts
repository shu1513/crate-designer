import { ALGORITHM_VERSION } from "./version.ts";
import { validateInputs } from "./inputs.ts";
import { loadPart, type ModelUnits, type PartMesh, type UpAxis } from "./part.ts";
import { orientPart, type PartFrame } from "./orientation.ts";
import { planLayout, type Layout } from "./layout.ts";
import { designRestraint, type Restraint } from "./restraint.ts";
import { buildCrate, skidRule, woodWeightKg, type Crate } from "./crate.ts";
import { countFasteners, type Fastener } from "./fasteners.ts";
import { buildSteps, type Step } from "./steps.ts";
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

export function designCrate(bytes: ArrayBuffer, inputs: DesignInputs): Design {
  return designFromPart(loadPart(bytes, { modelUnits: inputs.modelUnits, upAxis: inputs.upAxis }), inputs);
}
