import { DesignError, MESSAGES } from "../core/errors.ts";
import { designFromPart } from "../core/design.ts";
import { guessModelUnits, loadPart, rawMaxExtent, type ModelUnits, type PartMesh, type UpAxis } from "../core/part.ts";
import { guessUpAxis, parseGlb } from "../core/glb.ts";
import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

let currentPart: PartMesh | null = null;
let currentSettings: { modelUnits: ModelUnits; upAxis: UpAxis } = { modelUnits: "m", upAxis: "Z" };

function reply(response: WorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    switch (request.type) {
      case "loadPart": {
        const requested = request.modelUnits;
        const guessed = requested === "auto";
        const upGuessed = request.upAxis === "auto";
        const raw = guessed || upGuessed ? parseGlb(request.bytes) : null;
        const modelUnits: ModelUnits = requested === "auto" ? guessModelUnits(rawMaxExtent(raw!.positions)) : requested;
        const upAxis: UpAxis = request.upAxis === "auto" ? guessUpAxis(raw!.generator) : request.upAxis;
        currentSettings = { modelUnits, upAxis };
        currentPart = loadPart(request.bytes, currentSettings);
        const { triangleCount, dims, warnings } = currentPart;
        reply({ id: request.id, type: "partLoaded", summary: { triangleCount, dims, warnings, modelUnits, guessed, upAxis, upGuessed } });
        break;
      }
      case "design": {
        if (!currentPart) throw new DesignError("E1", MESSAGES.E1);
        const design = designFromPart(currentPart, { quantity: request.quantity, weightKg: request.weightKg, ...currentSettings });
        reply({ id: request.id, type: "designed", design });
        break;
      }
      default:
        // Never leave the caller waiting on a request we do not understand.
        reply({ id: (request as { id: number }).id, type: "error", code: "E1", message: "Unknown worker request" });
    }
  } catch (err) {
    if (request.type === "loadPart") currentPart = null;
    if (err instanceof DesignError) {
      reply({ id: request.id, type: "error", code: err.code, message: err.message });
    } else {
      // Anything unexpected while reading a file is reported as an unreadable model (SPEC E1).
      reply({ id: request.id, type: "error", code: "E1", message: MESSAGES.E1 });
    }
  }
};
