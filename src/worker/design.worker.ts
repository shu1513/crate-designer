import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const response: WorkerResponse = { type: "echo", payload: request.payload };
  self.postMessage(response);
};
