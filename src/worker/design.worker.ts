import { DesignError, MESSAGES } from "../core/errors.ts";
import { loadPart, type PartMesh } from "../core/part.ts";
import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

let currentPart: PartMesh | null = null;

function reply(response: WorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    switch (request.type) {
      case "loadPart": {
        currentPart = loadPart(request.bytes, { modelUnits: request.modelUnits, upAxis: request.upAxis });
        const { triangleCount, dims, warnings } = currentPart;
        reply({ id: request.id, type: "partLoaded", summary: { triangleCount, dims, warnings } });
        break;
      }
      default:
        // Never leave the caller waiting on a request we do not understand.
        reply({ id: (request as { id: number }).id, type: "error", code: "E1", message: "Unknown worker request" });
    }
  } catch (err) {
    currentPart = null;
    if (err instanceof DesignError) {
      reply({ id: request.id, type: "error", code: err.code, message: err.message });
    } else {
      // Anything unexpected while reading a file is reported as an unreadable model (SPEC E1).
      reply({ id: request.id, type: "error", code: "E1", message: MESSAGES.E1 });
    }
  }
};
