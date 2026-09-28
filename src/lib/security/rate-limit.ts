// In-memory sliding-window limiter (per server instance). Use Redis if you run several instances.
const hits = new Map<string, number[]>();

export function tooMany(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.set(key, arr);
  return arr.length >= max;
}

export function record(key: string): void {
  const arr = hits.get(key) ?? [];
  arr.push(Date.now());
  hits.set(key, arr);
}

export function clear(key: string): void {
  hits.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) {
    if (!v.some((t) => now - t < 60 * 60 * 1000)) hits.delete(k);
  }
}, 10 * 60 * 1000).unref?.();
