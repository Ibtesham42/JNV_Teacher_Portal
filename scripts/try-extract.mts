// Dev helper: run the read + OCR + rule-based extraction on a file (no database, no AI).
//   npx tsx scripts/try-extract.ts .data/samples/sample-text.pdf
import fs from "node:fs";
import { heuristicExtract } from "../src/lib/extraction/heuristic";
import { ocrImage, shutdownOcr } from "../src/lib/extraction/ocr";
import { pdfTextLayer, renderPdfPages } from "../src/lib/extraction/pdf";
import type { PageContent } from "../src/lib/extraction/types";

const file = process.argv[2];
const kind = (process.argv[3] as any) || "ROUTINE";
const buf = fs.readFileSync(file);
const t0 = Date.now();
let pages: PageContent[] = [];

if (file.endsWith(".pdf")) {
  const layer = await pdfTextLayer(buf);
  const chars = layer.reduce((a, p) => a + p.chars, 0);
  console.log(`pdf pages=${layer.length} text chars=${chars}`);
  if (chars > 30 * layer.length) {
    pages = layer.map((p) => ({ ...p, source: "text-layer" as const, meanConf: 100 }));
  } else {
    const imgs = await renderPdfPages(buf, { scale: 3 });
    for (const im of imgs) {
      const r = await ocrImage(im.png);
      console.log(`ocr page ${im.pageNumber}: words=${r.words.length} conf=${r.meanConf.toFixed(1)} rot=${r.rotation}`);
      pages.push({ pageNumber: im.pageNumber, width: r.width, height: r.height, words: r.words, source: "ocr", meanConf: r.meanConf, rules: r.rules });
    }
  }
} else if (file.endsWith(".docx")) {
  pages = await (await import("../src/lib/extraction/docx")).readDocx(buf);
  console.log(`docx words=${pages[0].words.length}`);
} else {
  const r = await ocrImage(buf);
  console.log(`ocr: words=${r.words.length} conf=${r.meanConf.toFixed(1)} rot=${r.rotation}`);
  pages = [{ pageNumber: 1, width: r.width, height: r.height, words: r.words, source: "ocr", meanConf: r.meanConf, rules: r.rules }];
}

const draft = heuristicExtract(pages, kind, []);
console.log(`\nextracted periods=${draft.periods.length} mod=${draft.modDuties.length} off=${draft.weeklyOffs.length} remedial=${draft.remedial.length} clubs=${draft.clubs.length}`);
console.log("kind:", draft.kind, "session:", draft.session);
console.log("notes:", draft.notes);
for (const r of draft.remedial) console.log(`R ${r.className}${r.section ? "-" + r.section : ""} ${r.day} ${r.startTime}-${r.endTime} | ${r.activity} | ${r.teacherName} (${r.confidence})`);
const by = new Map<string, typeof draft.periods>();
for (const p of draft.periods) {
  const k = `${p.className}-${p.section}`;
  by.set(k, [...(by.get(k) ?? []), p]);
}
for (const [k, list] of by) {
  console.log(`\n== ${k} (${list.length})`);
  for (const day of ["MONDAY", "TUESDAY", "SATURDAY"]) {
    const row = list
      .filter((p) => p.day === day)
      .sort((a, b) => a.slot - b.slot)
      .map((p) => (p.isBreak ? "[BREAK]" : `${p.periodNumber}:${p.subject}/${p.teacherName}(${p.confidence})@${p.startTime}`));
    console.log(day.padEnd(9), row.join(" | "));
  }
}
console.log(`\n${Date.now() - t0} ms`);
await shutdownOcr();
