import type { Line, Word } from "./types";

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const xc = (w: { x0: number; x1: number }) => (w.x0 + w.x1) / 2;
export const yc = (w: { y0: number; y1: number }) => (w.y0 + w.y1) / 2;

/** Group words that share a baseline into lines, top to bottom, left to right. */
export function buildLines(input: Word[]): Line[] {
  const words = input.filter((w) => w.text.trim().length > 0);
  if (!words.length) return [];
  const heights = words.map((w) => w.y1 - w.y0).filter((h) => h > 0);
  const tol = Math.max(2, median(heights) * 0.55);

  const sorted = [...words].sort((a, b) => yc(a) - yc(b) || a.x0 - b.x0);
  const groups: { ycSum: number; words: Word[] }[] = [];
  for (const w of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(yc(w) - g.ycSum / g.words.length) <= tol) {
      g.words.push(w);
      g.ycSum += yc(w);
    } else {
      groups.push({ ycSum: yc(w), words: [w] });
    }
  }
  return groups.map((g) => {
    const ws = g.words.sort((a, b) => a.x0 - b.x0);
    return {
      words: ws,
      x0: Math.min(...ws.map((w) => w.x0)),
      x1: Math.max(...ws.map((w) => w.x1)),
      y0: Math.min(...ws.map((w) => w.y0)),
      y1: Math.max(...ws.map((w) => w.y1)),
      yc: g.ycSum / ws.length,
      text: ws.map((w) => w.text).join(" "),
    };
  });
}

export type Match = { text: string; x0: number; x1: number; words: Word[]; index: number };

/** Run a global regex over a line's text and return each match with the words it covers. */
export function matchesInLine(line: Line, regex: RegExp): Match[] {
  const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
  const re = new RegExp(regex.source, flags);
  const spans: { start: number; end: number; word: Word }[] = [];
  let pos = 0;
  for (const w of line.words) {
    spans.push({ start: pos, end: pos + w.text.length, word: w });
    pos += w.text.length + 1;
  }
  const out: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const s = m.index;
    const e = m.index + m[0].length;
    const cover = spans.filter((sp) => sp.start < e && sp.end > s).map((sp) => sp.word);
    if (!cover.length) continue;
    out.push({
      text: m[0],
      x0: Math.min(...cover.map((w) => w.x0)),
      x1: Math.max(...cover.map((w) => w.x1)),
      words: cover,
      index: s,
    });
  }
  return out;
}

export function meanConf(words: Word[]): number {
  if (!words.length) return 0;
  return words.reduce((a, w) => a + w.conf, 0) / words.length;
}

export { median };

/** Nearest column index for an x position. */
export function nearestColumn(x: number, centers: number[]): number {
  let best = 0;
  let bestD = Infinity;
  centers.forEach((c, i) => {
    const d = Math.abs(c - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function joinCellText(words: Word[]): string[] {
  const lines = buildLines(words);
  return lines.map((l) => l.text.replace(/\s+/g, " ").trim()).filter(Boolean);
}
