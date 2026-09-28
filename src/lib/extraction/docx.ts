import type { PageContent, Word } from "./types";

const CELL_W = 150;
const LINE_H = 12;
const CHAR_W = 6;

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cellLines(html: string): string[] {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

type Block = { type: "text"; lines: string[] } | { type: "table"; rows: { lines: string[]; span: number }[][] };
export type TableText = { heading: string; rows: string[][] };

function parseHtml(html: string): { blocks: Block[]; tables: TableText[] } {
  const blocks: Block[] = [];
  const tables: TableText[] = [];
  const re = /<table[\s\S]*?<\/table>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (chunk: string) => {
    const lines = cellLines(chunk);
    if (lines.length) blocks.push({ type: "text", lines });
  };
  while ((m = re.exec(html))) {
    pushText(html.slice(last, m.index));
    const prevText = [...blocks].reverse().find((b) => b.type === "text") as { lines: string[] } | undefined;
    const rows: { lines: string[]; span: number }[][] = [];
    // logical rows (cells carried down for row-spans, e.g. one date covering four teachers)
    const grid: string[][] = [];
    const carry = new Map<number, { left: number; text: string }>();
    for (const tr of m[0].match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells: { lines: string[]; span: number }[] = [];
      const row: string[] = [];
      let col = 0;
      const fill = () => {
        while (carry.has(col)) {
          const c = carry.get(col)!;
          row[col] = c.text;
          if (--c.left <= 0) carry.delete(col);
          col++;
        }
      };
      const cre = /<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
      let c: RegExpExecArray | null;
      while ((c = cre.exec(tr))) {
        const span = Math.max(1, Number(/colspan="?(\d+)/i.exec(c[1])?.[1] ?? 1));
        const rowspan = Math.max(1, Number(/rowspan="?(\d+)/i.exec(c[1])?.[1] ?? 1));
        const lines = cellLines(c[2]);
        cells.push({ lines, span });
        const text = lines.join(" ");
        fill();
        for (let k = 0; k < span; k++) {
          row[col] = text;
          if (rowspan > 1) carry.set(col, { left: rowspan - 1, text });
          col++;
          fill();
        }
      }
      fill();
      if (cells.length) rows.push(cells);
      if (row.length) grid.push(row.map((x) => x ?? ""));
    }
    blocks.push({ type: "table", rows });
    tables.push({ heading: (prevText?.lines ?? []).slice(-3).join(" "), rows: grid });
    last = m.index + m[0].length;
  }
  pushText(html.slice(last));
  return { blocks, tables };
}

function wordsForLine(text: string, xStart: number, yCenter: number): Word[] {
  const out: Word[] = [];
  let x = xStart;
  for (const t of text.split(/\s+/).filter(Boolean)) {
    const w = t.length * CHAR_W;
    out.push({ text: t, x0: x, x1: x + w, y0: yCenter - LINE_H / 2, y1: yCenter + LINE_H / 2, conf: 100 });
    x += w + CHAR_W;
  }
  return out;
}

/** Turn Word content into positioned "words" so the same grid parser can read it. */
export function blocksToPage(blocks: Block[]): PageContent {
  const words: Word[] = [];
  let y = 20;
  let maxX = 800;
  for (const b of blocks) {
    if (b.type === "text") {
      for (const line of b.lines) {
        words.push(...wordsForLine(line, 10, y));
        y += LINE_H + 4;
      }
      y += 8;
      continue;
    }
    const maxLines = Math.max(1, ...b.rows.flatMap((r) => r.map((c) => c.lines.length)));
    const rowH = maxLines * LINE_H + 10;
    for (const row of b.rows) {
      let col = 0;
      for (const cell of row) {
        const width = CELL_W * cell.span;
        const n = cell.lines.length;
        cell.lines.forEach((line, k) => {
          const yy = y + rowH / 2 + (k - (n - 1) / 2) * LINE_H;
          const textW = line.length * CHAR_W;
          const x = col * CELL_W + Math.max(4, (width - textW) / 2);
          words.push(...wordsForLine(line, x, yy));
        });
        col += cell.span;
      }
      maxX = Math.max(maxX, col * CELL_W + 20);
      y += rowH;
    }
    y += 20;
  }
  return { pageNumber: 1, width: maxX, height: y + 20, words, source: "structured", meanConf: 100 };
}

export async function readDocx(buffer: Buffer): Promise<PageContent[]> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ buffer });
  const { blocks, tables } = parseHtml(value);
  const page = blocksToPage(blocks);
  page.tables = tables;
  return [page];
}

export async function readDoc(buffer: Buffer): Promise<PageContent[]> {
  const WordExtractor = (await import("word-extractor")).default;
  const doc = await new WordExtractor().extract(buffer);
  const body: string = doc.getBody();
  const blocks: Block[] = [];
  let rows: { lines: string[]; span: number }[][] = [];
  const flush = () => {
    if (rows.length) blocks.push({ type: "table", rows });
    rows = [];
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/\u0007/g, "\t");
    if (line.includes("\t")) {
      rows.push(line.split("\t").map((c) => ({ lines: c.trim() ? [c.replace(/\s+/g, " ").trim()] : [], span: 1 })));
    } else {
      flush();
      if (line.trim()) blocks.push({ type: "text", lines: [line.trim()] });
    }
  }
  flush();
  return [blocksToPage(blocks)];
}
