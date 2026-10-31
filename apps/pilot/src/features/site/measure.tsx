"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PUBLIC_BASE } from "@/lib/site";

/** Anonymous per-tab session id; no cookie, no personal data. */
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem("tripc_sid");
    if (existing) return existing;
    const id = crypto.randomUUID().replace(/-/g, "");
    sessionStorage.setItem("tripc_sid", id);
    return id;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

function send(eventType: "page_view" | "cta_click", slug: string | null) {
  const body = JSON.stringify({ event_type: eventType, session_id: sessionId(), path: location.pathname,
    content_slug: slug, referrer: document.referrer || null });
  fetch(`${PUBLIC_BASE}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
    .catch(() => undefined);
}

export function PageView({ slug }: { slug: string | null }) {
  useEffect(() => { send("page_view", slug); }, [slug]);
  return null;
}

export function CtaButton({ slug, label }: { slug: string; label: string }) {
  return <button type="button" className="cta" onClick={() => {
    send("cta_click", slug);
    document.getElementById("request")?.scrollIntoView({ behavior: "smooth" });
  }}>{label}</button>;
}

type State = "idle" | "sending" | "sent" | "error";

export function LeadForm({ topic }: { topic: string }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    try {
      const response = await fetch(`${PUBLIC_BASE}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), interest_topic: topic.slice(0, 64),
          consent: { accepted: form.get("consent") === "on", policy_version: "pilot-2026-10" },
          context: { visitor_id: sessionId() },
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("sent");
    } catch {
      setState("error");
      setMessage("We could not send your request. Please check your details and try again.");
    }
  }
  if (state === "sent") return <p className="notice" role="status">Thanks — TripC will reply to your email.</p>;
  return <form className="lead-form" onSubmit={submit}>
    <label>Name<input name="name" required maxLength={120} autoComplete="name" /></label>
    <label>Email<input name="email" type="email" required autoComplete="email" /></label>
    <label className="consent"><input name="consent" type="checkbox" required /> I agree that TripC may contact me about this request.</label>
    <button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send request"}</button>
    {state === "error" && <p className="error" role="alert">{message}</p>}
  </form>;
}
