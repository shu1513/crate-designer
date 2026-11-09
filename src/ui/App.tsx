import { useEffect, useState } from "react";
import { callWorker } from "../worker/client.ts";

type Health = { ok: boolean; version: string } | null;

export function App() {
  const [health, setHealth] = useState<Health>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [workerEcho, setWorkerEcho] = useState<string>("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Health) => setHealth(data))
      .catch((err: Error) => setHealthError(err.message));
    callWorker({ type: "echo", payload: "worker ready" })
      .then((res) => setWorkerEcho(res.payload))
      .catch((err: Error) => setWorkerEcho(`worker error: ${err.message}`));
  }, []);

  return (
    <div className="layout">
      <aside className="column inputs">
        <h1>Crate Designer</h1>
        <p className="muted">Inputs go here (module 7).</p>
        <p className="status">
          Service: {health ? `ok (v${health.version})` : healthError ? `unreachable (${healthError})` : "checking…"}
        </p>
        <p className="status">Worker: {workerEcho || "starting…"}</p>
      </aside>
      <main className="column preview">
        <p className="muted">3D preview goes here (module 7).</p>
      </main>
      <section className="column results">
        <p className="muted">Summary, cut list, fasteners, and steps go here (modules 5 to 7).</p>
      </section>
    </div>
  );
}
