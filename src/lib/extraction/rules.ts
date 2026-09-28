import sharp from "sharp";

/** Horizontal rule; `y` is its height at the middle of the segment, `m` its slope (dy/dx). */
export type HSeg = { y: number; x0: number; x1: number; m: number };
export type VSeg = { x: number; y0: number; y1: number };
export type Rules = { width: number; height: number; h: HSeg[]; v: VSeg[] };

type Gray = { data: Buffer; w: number; h: number };

async function gray(png: Buffer, width?: number): Promise<Gray> {
  let img = sharp(png, { failOn: "none", limitInputPixels: 200_000_000 }).greyscale();
  if (width) img = img.resize({ width, kernel: "lanczos3" });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function otsu(data: Buffer): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 3) hist[data[i]]++;
  const total = hist.reduce((a, b) => a + b, 0);
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return Math.min(200, Math.max(70, thr));
}

/** Skew of the page in degrees (positive = text runs downhill to the right). */
export async function estimateSkew(png: Buffer): Promise<number> {
  const g = await gray(png, 900);
  const thr = otsu(g.data);
  const pts: number[] = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x] < thr) pts.push(x, y);
  if (pts.length < 500) return 0;
  const score = (deg: number) => {
    const t = Math.tan((deg * Math.PI) / 180);
    const bins = new Map<number, number>();
    for (let i = 0; i < pts.length; i += 2) {
      const b = Math.round(pts[i + 1] - pts[i] * t);
      bins.set(b, (bins.get(b) ?? 0) + 1);
    }
    let s = 0;
    for (const c of bins.values()) s += c * c;
    return s;
  };
  let best = 0;
  let bestS = -1;
  for (let a = -4; a <= 4.001; a += 0.25) {
    const s = score(a);
    if (s > bestS) {
      bestS = s;
      best = a;
    }
  }
  for (let a = best - 0.25; a <= best + 0.251; a += 0.05) {
    const s = score(a);
    if (s > bestS) {
      bestS = s;
      best = a;
    }
  }
  return Number(best.toFixed(2));
}

/** Straighten a slightly skewed scan. Returns the same buffer when it is already straight. */
export async function deskew(png: Buffer): Promise<{ png: Buffer; angle: number }> {
  const angle = await estimateSkew(png);
  if (Math.abs(angle) < 0.2) return { png, angle: 0 };
  const out = await sharp(png).rotate(-angle, { background: "#ffffff" }).png().toBuffer();
  return { png: out, angle };
}

/**
 * Slope-tolerant search for ruled horizontal lines (scans are often photographed with a little
 * perspective, so rules are not perfectly level): candidate lines come from a small Hough
 * transform over +-1.5 degrees and are verified by walking along the line.
 */
function detectHLines(data: Buffer, w: number, h: number, thr: number, minH: number): HSeg[] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) if (data[row + x] < thr) {
      xs.push(x);
      ys.push(y);
    }
  }
  const out: HSeg[] = [];
  const minCount = Math.round(minH * 0.9);
  const GAP = 3;
  const isDark = (x: number, y: number) => {
    for (let d = -1; d <= 1; d++) {
      const yy = y + d;
      if (yy >= 0 && yy < h && data[yy * w + x] < thr) return true;
    }
    return false;
  };
  for (let deg = -1.5; deg <= 1.501; deg += 0.15) {
    const t = Math.tan((deg * Math.PI) / 180);
    const off = Math.ceil(Math.abs(t) * w) + 3;
    const counts = new Int32Array(h + 2 * off + 3);
    for (let i = 0; i < xs.length; i++) counts[ys[i] - Math.round(xs[i] * t) + off]++;
    for (let bIdx = 2; bIdx < counts.length - 2; bIdx++) {
      const c = counts[bIdx - 1] + counts[bIdx] + counts[bIdx + 1];
      if (c < minCount || counts[bIdx] < counts[bIdx - 1] || counts[bIdx] < counts[bIdx + 1]) continue;
      const b0 = bIdx - off;
      let start = -1;
      let last = -1;
      const flush = () => {
        if (start >= 0 && last - start + 1 >= minH) {
          const y0 = b0 + start * t;
          const y1 = b0 + last * t;
          out.push({ x0: start, x1: last, y: (y0 + y1) / 2, m: t });
        }
        start = -1;
      };
      for (let x = 0; x < w; x++) {
        const y = Math.round(b0 + x * t);
        if (y >= 0 && y < h && isDark(x, y)) {
          if (start < 0) start = x;
          last = x;
        } else if (start >= 0 && x - last > GAP) flush();
      }
      flush();
    }
  }
  return out;
}

/** The same physical line is found at several angles / bins: keep one (the longest) per position. */
function dedupeH(segs: HSeg[]): HSeg[] {
  const sorted = [...segs].sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0));
  const kept: HSeg[] = [];
  for (const s of sorted) {
    const dup = kept.find((k) => {
      const lo = Math.max(k.x0, s.x0);
      const hi = Math.min(k.x1, s.x1);
      if (hi - lo < 0.5 * Math.min(k.x1 - k.x0, s.x1 - s.x0)) return false;
      const mid = (lo + hi) / 2;
      const ky = k.y + k.m * (mid - (k.x0 + k.x1) / 2);
      const sy = s.y + s.m * (mid - (s.x0 + s.x1) / 2);
      return Math.abs(ky - sy) <= 5;
    });
    if (!dup) kept.push(s);
  }
  return kept.sort((a, b) => a.y - b.y);
}

/** y of a horizontal rule at a given x. */
export function yAt(l: HSeg, x: number): number {
  return l.y + l.m * (x - (l.x0 + l.x1) / 2);
}

function mergeV(segs: VSeg[]): VSeg[] {
  const sorted = [...segs].sort((a, b) => a.x - b.x);
  const groups: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const s of sorted) {
    const g = groups.find((q) => s.x - q.x1 <= 2 && s.y0 <= q.y1 && s.y1 >= q.y0);
    if (g) {
      g.x1 = s.x;
      g.y0 = Math.min(g.y0, s.y0);
      g.y1 = Math.max(g.y1, s.y1);
    } else groups.push({ x0: s.x, x1: s.x, y0: s.y0, y1: s.y1 });
  }
  return groups.map((g) => ({ x: (g.x0 + g.x1) / 2, y0: g.y0, y1: g.y1 }));
}

/** Find the ruled lines of tables (long dark horizontal / vertical runs). */
export async function detectRules(png: Buffer): Promise<Rules> {
  const g = await gray(png);
  const { data, w, h } = g;
  const thr = otsu(data);
  const dark = (i: number) => data[i] < thr;
  const GAP = 4;
  const minH = Math.max(120, Math.round(w * 0.055));
  const minV = Math.max(36, Math.round(h * 0.02));

  const hs = detectHLines(data, w, h, thr, minH);

  const vs: VSeg[] = [];
  for (let x = 0; x < w; x++) {
    let start = -1;
    let last = -1;
    for (let y = 0; y < h; y++) {
      if (dark(y * w + x)) {
        if (start < 0) start = y;
        last = y;
      } else if (start >= 0 && y - last > GAP) {
        if (last - start + 1 >= minV) vs.push({ x, y0: start, y1: last });
        start = -1;
      }
    }
    if (start >= 0 && last - start + 1 >= minV) vs.push({ x, y0: start, y1: last });
  }
  return { width: w, height: h, h: dedupeH(hs), v: mergeV(vs) };
}
