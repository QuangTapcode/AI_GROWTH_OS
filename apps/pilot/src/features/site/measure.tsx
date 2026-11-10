"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { PUBLIC_BASE } from "@/lib/site";
import { requestAssignment, exposeAssignment, currentAssignment, type Assignment } from './experiment';

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
  let eventId = crypto.randomUUID();
  if (eventType === 'page_view') {
    try {
      const key = `tripc_page_event:${location.pathname}`, existing = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (existing?.id && Date.now() - existing.at < 30 * 60_000) eventId = existing.id;
      else sessionStorage.setItem(key, JSON.stringify({ id: eventId, at: Date.now() }));
    } catch { /* Storage is optional; server still deduplicates page views by session and path. */ }
  }
  const body = JSON.stringify({ event_id: eventId, attribution: attribution(), event_type: eventType, session_id: sessionId(), path: location.pathname,
    content_slug: slug, referrer: document.referrer || null });
  fetch(`${PUBLIC_BASE}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
    .catch(() => undefined);
}

/** Last tagged campaign in this tab; direct navigation preserves it. Never stores contact details. */
function attribution(): Record<string, string> {
  const params = new URLSearchParams(location.search), values: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const value = params.get(key);
    if (value) values[key] = value.slice(0, 128);
  }
  try {
    if (Object.keys(values).length) sessionStorage.setItem('tripc_attribution', JSON.stringify(values));
    return Object.keys(values).length ? values : JSON.parse(sessionStorage.getItem('tripc_attribution') ?? '{}');
  } catch { return values; }
}

export function PageView({ slug }: { slug: string | null }) {
  useEffect(() => { send("page_view", slug); }, [slug]);
  return null;
}

export function CtaButton({ slug, label }: { slug: string | null; label: string }) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    requestAssignment(slug).then(value => { if (active) setAssignment(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [slug]);
  useEffect(() => {
    if (!assignment || !button.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        void exposeAssignment(slug, assignment).catch(() => undefined);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(button.current);
    return () => observer.disconnect();
  }, [slug, assignment]);
  return <button ref={button} type="button" className="cta" onClick={() => {
    send("cta_click", slug);
    document.getElementById("request")?.scrollIntoView({ behavior: "smooth" });
  }}>{assignment?.cta ?? label}</button>;
}

type State = "idle" | "sending" | "sent" | "error";

export function LeadForm({ topic, slug }: { topic: string; slug?: string }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const submission = useRef<{ key: string; payload: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    try {
      const payload = JSON.stringify({
        name: String(form.get('name') ?? ''), email: String(form.get('email') ?? ''), interest_topic: topic.slice(0, 64),
        consent: { accepted: form.get('consent') === 'on', policy_version: 'pilot-2026-10' },
        context: { visitor_id: sessionId(), ...(slug ? { content_slug: slug } : {}),
          ...(currentAssignment(slug) ? { assignment_id: currentAssignment(slug)!.assignment_id } : {}), ...attribution() },
      });
      if (!submission.current || submission.current.payload !== payload) submission.current = { key: crypto.randomUUID(), payload };
      const response = await fetch(`${PUBLIC_BASE}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submission.current.key },
        body: submission.current.payload,
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
