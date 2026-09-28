import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { config } from "../config";
import type { Word } from "./types";

// pdfjs is ESM-only; import lazily so it never loads on the client or at build time
async function loadPdfjs() {
  // pdfjs looks for these browser classes; provide them from @napi-rs/canvas (Node < 22 has no process.getBuiltinModule)
  const g = globalThis as any;
  const proc = process as any;
  if (typeof proc.getBuiltinModule !== "function") {
    const nodeModule = await import(/* webpackIgnore: true */ "node:module");
    const req = nodeModule.createRequire(process.cwd() + "/noop.js");
    proc.getBuiltinModule = (name: string) => req(name);
  }
  g.DOMMatrix ??= DOMMatrix;
  g.ImageData ??= ImageData;
  g.Path2D ??= Path2D;
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as any;
}

export type PdfPageText = { pageNumber: number; width: number; height: number; words: Word[]; chars: number };

/** pdfjs must create every canvas from the same @napi-rs/canvas instance we draw on. */
class SharedCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(cc: { canvas: any }, width: number, height: number) {
    cc.canvas.width = Math.max(1, Math.ceil(width));
    cc.canvas.height = Math.max(1, Math.ceil(height));
  }
  destroy(cc: { canvas: any; context: any }) {
    cc.canvas.width = 0;
    cc.canvas.height = 0;
    cc.canvas = null;
    cc.context = null;
  }
}

async function open(data: Buffer) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    CanvasFactory: SharedCanvasFactory,
    canvasFactory: new SharedCanvasFactory(),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  return doc;
}

export async function pdfPageCount(data: Buffer): Promise<number> {
  const doc = await open(data);
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

/** Text layer with positions (top-left origin, PDF points). Empty for scanned PDFs. */
export async function pdfTextLayer(data: Buffer, maxPages = config.maxPages): Promise<PdfPageText[]> {
  const doc = await open(data);
  const pages: PdfPageText[] = [];
  try {
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const words: Word[] = [];
      let chars = 0;
      for (const item of content.items as any[]) {
        const str: string = item.str ?? "";
        if (!str.trim()) continue;
        const [a, b, , d, e, f] = item.transform as number[];
        const h = Math.abs(d) || Math.hypot(a, b) || 10;
        const width = item.width || str.length * h * 0.5;
        const [vx, vy] = viewport.convertToViewportPoint(e, f);
        // split an item into words so column assignment works on real cell text
        const parts = str.split(/(\s{2,}|\t)/).filter((p) => p.trim());
        const total = str.length || 1;
        let offset = 0;
        for (const part of parts) {
          const idx = str.indexOf(part, offset);
          const x0 = vx + (idx / total) * width;
          const x1 = x0 + (part.length / total) * width;
          words.push({ text: part.trim(), x0, x1, y0: vy - h, y1: vy, conf: 100 });
          offset = idx + part.length;
        }
        chars += str.trim().length;
      }
      pages.push({ pageNumber: i, width: viewport.width, height: viewport.height, words, chars });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

/** Render pages to PNG (used for OCR and for the vision model). */
export async function renderPdfPages(
  data: Buffer,
  opts: { scale?: number; maxPages?: number; onPage?: (i: number, total: number) => Promise<void> } = {},
): Promise<{ pageNumber: number; png: Buffer }[]> {
  const scale = opts.scale ?? 3;
  const doc = await open(data);
  const out: { pageNumber: number; png: Buffer }[] = [];
  try {
    const n = Math.min(doc.numPages, opts.maxPages ?? config.maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx as any, viewport, canvas: canvas as any }).promise;
      out.push({ pageNumber: i, png: canvas.toBuffer("image/png") });
      page.cleanup();
      await opts.onPage?.(i, n);
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
