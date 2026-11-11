import { z } from 'zod';

export const isoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Expected a valid YYYY-MM-DD date');

export const timezoneSchema = z.string().trim().refine((value) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; }
  catch { return false; }
}, 'Expected an IANA timezone');

export function dateInZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export const periodSchema = z.object({ from: isoDate, to: isoDate }).refine(
  ({ from, to }) => from <= to && Date.parse(to) - Date.parse(from) < 366 * 86_400_000,
  'Period must be ordered and contain at most 366 days',
);
