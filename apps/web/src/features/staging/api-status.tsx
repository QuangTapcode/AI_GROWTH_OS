"use client";

import { useEffect, useState } from "react";
import { getApiHealth } from "@/lib/api";

type Connection = "checking" | "connected" | "unavailable";

export default function ApiStatus() {
  const [connection, setConnection] = useState<Connection>("checking");

  useEffect(() => {
    const controller = new AbortController();
    getApiHealth(controller.signal)
      .then(() => { if (!controller.signal.aborted) setConnection("connected"); })
      .catch(() => { if (!controller.signal.aborted) setConnection("unavailable"); });
    return () => controller.abort();
  }, []);

  async function refresh() {
    setConnection("checking");
    try {
      await getApiHealth();
      setConnection("connected");
    } catch {
      setConnection("unavailable");
    }
  }

  return (
    <section className="connection-card" aria-label="API connection">
      <div>
        <p className="eyebrow">Service connection</p>
        <p className="connection-status" role="status" aria-live="polite">
          {connection === "connected" ? "API connected" :
            connection === "unavailable" ? "API unavailable" : "Checking API…"}
        </p>
        <p className="muted">This checks the API process. Product features are still being prepared.</p>
      </div>
      <button type="button" onClick={refresh} disabled={connection === "checking"}>
        Check again
      </button>
    </section>
  );
}

