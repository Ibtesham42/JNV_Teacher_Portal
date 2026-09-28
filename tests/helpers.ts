import type { PageContent, Word } from "../src/lib/extraction/types";

/** Build a synthetic page from text rows: each row is a list of [x, text] cells. */
export function pageFromRows(rows: [number, string][][], source: PageContent["source"] = "text-layer"): PageContent {
  const words: Word[] = [];
  rows.forEach((cells, r) => {
    const y = 40 + r * 18;
    for (const [x, text] of cells) {
      let cx = x;
      for (const t of text.split(" ")) {
        const w = t.length * 6;
        words.push({ text: t, x0: cx, x1: cx + w, y0: y - 6, y1: y + 6, conf: 96 });
        cx += w + 5;
      }
    }
  });
  return { pageNumber: 1, width: 900, height: 40 + rows.length * 18 + 40, words, source, meanConf: 96 };
}

/** One text line at x=10. */
export const lines = (...texts: string[]) => pageFromRows(texts.map((t) => [[10, t]]));
