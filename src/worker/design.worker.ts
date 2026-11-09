import { DesignError } from "../core/errors.ts";
import { loadPart, type PartMesh } from "../core/part.ts";
import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

let currentPart: PartMesh | null = null;

function reply(response: WorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "loadPart") {
      currentPart = loadPart(request.bytes, { modelUnits: request.modelUnits, upAxis: request.upAxis });
      const { triangleCount, dims, warnings } = currentPart;
      reply({ id: request.id, type: "partLoaded", summary: { triangleCount, dims, warnings } });
    }
  } catch (err) {
    currentPart = null;
    if (err instanceof DesignError) {
      reply({ id: request.id, type: "error", code: err.code, message: err.message });
    } else {
      reply({ id: request.id, type: "error", code: "E1", message: (err as Error).message });
    }
  }
};
