import { useEffect, useState } from "react";
import { PartInput, type LoadedPart } from "./PartInput.tsx";

type Health = { ok: boolean; version: string } | null;

export function App() {
  const [health, setHealth] = useState<Health>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [part, setPart] = useState<LoadedPart | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Health) => setHealth(data))
      .catch((err: Error) => setHealthError(err.message));
  }, []);

  return (
    <div className="layout">
      <aside className="column inputs">
        <h1>Crate Designer</h1>
        <PartInput onLoaded={setPart} />
        <p className="status muted">
          Service: {health ? `ok (v${health.version})` : healthError ? `unreachable (${healthError})` : "checking…"}
        </p>
      </aside>
      <main className="column preview">
        <p className="muted">{part ? `3D preview of ${part.fileName} comes in module 7.` : "3D preview goes here (module 7)."}</p>
      </main>
      <section className="column results">
        <p className="muted">Summary, cut list, fasteners, and steps go here (modules 5 to 7).</p>
      </section>
    </div>
  );
}
