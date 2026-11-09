import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

/** One-shot request/response over the design worker. */
export function callWorker(request: WorkerRequest): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./design.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = (event) => {
      reject(new Error(event.message));
      worker.terminate();
    };
    worker.postMessage(request);
  });
}
