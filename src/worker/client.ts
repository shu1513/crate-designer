import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

type Pending = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void };

/** One long-lived design worker; requests are matched to responses by id. */
class DesignWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./design.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(event.data.id);
      if (!p) return;
      this.pending.delete(event.data.id);
      p.resolve(event.data);
    };
    const failAll = (message: string) => {
      for (const p of this.pending.values()) p.reject(new Error(message));
      this.pending.clear();
      worker.terminate();
      this.worker = null;
    };
    worker.onerror = (event) => failAll(event.message || "Worker crashed");
    worker.onmessageerror = () => failAll("Worker response could not be read");
    this.worker = worker;
    return worker;
  }

  send(request: Omit<WorkerRequest, "id">, transfer: Transferable[] = []): Promise<WorkerResponse> {
    const id = this.nextId++;
    const full = { ...request, id } as WorkerRequest;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.ensure().postMessage(full, transfer);
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}

export const designWorker = new DesignWorkerClient();
