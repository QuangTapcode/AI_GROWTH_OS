import { PUBLIC_BASE } from '@/lib/site';

export type Assignment = { assignment_id: string; variant: string; cta: string };
const assignments = new Map<string, Assignment>();
let fallbackVisitor: string | undefined;
export function experimentVisitor(): string {
  try {
    const saved = localStorage.getItem('tripc_experiment_visitor');
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const id = crypto.randomUUID(); localStorage.setItem('tripc_experiment_visitor', id); return id;
  } catch { return fallbackVisitor ??= crypto.randomUUID(); }
}
export async function requestAssignment(slug: string | null): Promise<Assignment | null> {
  const response = await fetch(`${PUBLIC_BASE}/experiment`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitor_id: experimentVisitor(), content_slug: slug }) });
  if (!response.ok) return null;
  const value = await response.json() as Assignment | null;
  if (value?.assignment_id) { assignments.set(slug ?? '', value); return value; }
  return null;
}
export function currentAssignment(slug?: string) { return assignments.get(slug ?? ''); }
export async function exposeAssignment(slug: string | null, assignment: Assignment) {
  await fetch(`${PUBLIC_BASE}/experiment`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitor_id: experimentVisitor(), content_slug: slug, assignment_id: assignment.assignment_id }) });
}
