/** Poll helper cho test async (W1-MY-01). */
export async function waitFor(
  cond: () => Promise<boolean> | boolean,
  timeoutMs = 10_000,
  intervalMs = 10,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await cond()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timeout after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}