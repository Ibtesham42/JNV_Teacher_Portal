import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { storage } from "../storage";
import { config } from "../config";
import { aiEnabled, aiExtract } from "./ai";
import { groqEnabled, groqExtractFromText, groqNormalize, mergeOcrVariants } from "./groq";
import { readDoc, readDocx } from "./docx";
import { heuristicExtract, pageText, type DocKind } from "./heuristic";
import { normalizeKey } from "./normalize";
import { modelImage, ocrImage, shutdownOcr } from "./ocr";
import { pdfPageCount, pdfTextLayer, renderPdfPages } from "./pdf";
import { draftDataSchema, type DraftData } from "./schema";
import type { PageContent } from "./types";

type Level = "INFO" | "WARN" | "ERROR";

async function log(documentId: string, level: Level, stage: string, message: string, meta?: unknown) {
  await db.extractionLog.create({
    data: { documentId, level, stage, message, meta: meta === undefined ? undefined : (meta as Prisma.InputJsonValue) },
  });
}

async function progress(documentId: string, stage: string, percent: number) {
  await db.extractionDraft.update({ where: { documentId }, data: { stage, progress: percent } });
}

/** Lower the confidence of records whose text cannot be found in the machine-read text. */
export function crossCheck(draft: DraftData, rawText: string): DraftData {
  const hay = ` ${normalizeKey(rawText)} `;
  if (hay.trim().length < 20) return draft;
  const seen = (text: string): boolean => {
    const k = normalizeKey(text);
    if (k.length < 2) return true;
    if (hay.includes(k)) return true;
    const tokens = k.split(" ").filter((t) => t.length >= 3);
    return tokens.length > 0 && tokens.every((t) => hay.includes(t));
  };
  for (const p of draft.periods) {
    if (p.isBreak || p.confidence == null) continue;
    let c = p.confidence;
    if (p.subject && !seen(p.subject)) c *= 0.75;
    if (p.teacherName && !seen(p.teacherName)) c *= 0.75;
    p.confidence = Number(c.toFixed(2));
  }
  for (const m of draft.modDuties) if (m.confidence != null && !seen(m.teacherName)) m.confidence = Number((m.confidence * 0.75).toFixed(2));
  for (const w of draft.weeklyOffs) if (w.confidence != null && !seen(w.teacherName)) w.confidence = Number((w.confidence * 0.75).toFixed(2));
  for (const r of draft.remedial) if (r.confidence != null && r.activity && !seen(r.activity)) r.confidence = Number((r.confidence * 0.75).toFixed(2));
  for (const c of draft.clubs) if (c.confidence != null && !seen(c.name)) c.confidence = Number((c.confidence * 0.75).toFixed(2));
  return draft;
}

function countItems(d: DraftData) {
  return d.periods.length + d.modDuties.length + d.weeklyOffs.length + d.remedial.length + d.clubs.length;
}

export async function processDocument(documentId: string): Promise<void> {
  const doc = await db.uploadedDocument.findUnique({ where: { id: documentId } });
  if (!doc) return;
  const kind: DocKind = doc.kind === "ROUTINE" || doc.kind === "REMEDIAL" || doc.kind === "CLUB" ? doc.kind : "OTHER";

  try {
    await db.extractionDraft.update({
      where: { documentId },
      data: { status: "PROCESSING", stage: "Reading document", progress: 3, errorMessage: null },
    });
    await db.uploadedDocument.update({ where: { id: documentId }, data: { extractionStatus: "PROCESSING" } });
    await log(documentId, "INFO", "start", `Processing ${doc.originalName} (${doc.mimeType}, ${doc.sizeBytes} bytes).`);

    const buf = await storage.get(doc.storageKey);
    const teachers = await db.teacher.findMany({ select: { id: true, name: true, code: true, aliases: true, active: true } });
    const useAi = aiEnabled();

    let pages: PageContent[] = [];
    let ocrUsed = false;
    let pageCount: number | null = null;
    let ocrConfidence: number | null = null;
    const ocrPageText: string[] = [];
    const providers: string[] = [];

    if (doc.mimeType === "application/pdf") {
      pageCount = await pdfPageCount(buf);
      if (pageCount > config.maxPages) {
        await log(documentId, "WARN", "read", `PDF has ${pageCount} pages; only the first ${config.maxPages} are processed.`);
      }
      const layer = await pdfTextLayer(buf);
      const chars = layer.reduce((a, p) => a + p.chars, 0);
      const scanned = chars < 30 * Math.max(1, layer.length);
      await log(documentId, "INFO", "read", scanned ? "PDF has no usable text layer - treating it as a scanned document." : `PDF text layer found (${chars} characters).`);

      if (!scanned) {
        pages = layer.map((p) => ({ pageNumber: p.pageNumber, width: p.width, height: p.height, words: p.words, source: "text-layer" as const, meanConf: 100 }));
        providers.push("pdf-text");
        if (useAi) {
          await progress(documentId, "Preparing page images", 12);
          const imgs = await renderPdfPages(buf, { scale: 2.2 });
          for (const im of imgs) pages[im.pageNumber - 1].image = await modelImage(im.png);
        }
      } else {
        ocrUsed = true;
        await progress(documentId, "Rendering pages", 10);
        const imgs = await renderPdfPages(buf, {
          scale: 3,
          onPage: async (i, n) => progress(documentId, `Rendering page ${i} of ${n}`, 10 + Math.round((i / n) * 15)),
        });
        let sum = 0;
        for (let i = 0; i < imgs.length; i++) {
          await progress(documentId, `Running OCR on page ${i + 1} of ${imgs.length}`, 25 + Math.round((i / imgs.length) * 45));
          const r = await ocrImage(imgs[i].png);
          sum += r.meanConf;
          if (r.rotation) await log(documentId, "INFO", "ocr", `Page ${i + 1}: scan was rotated ${r.rotation}°, corrected automatically.`);
          if (r.meanConf < 55) await log(documentId, "WARN", "ocr", `Page ${i + 1}: low OCR confidence (${r.meanConf.toFixed(0)}%). Review carefully.`);
          const page: PageContent = {
            pageNumber: imgs[i].pageNumber,
            width: r.width,
            height: r.height,
            words: r.words,
            source: "ocr",
            meanConf: r.meanConf,
            rules: r.rules,
          };
          if (useAi) page.image = await modelImage(imgs[i].png, r.rotation);
          pages.push(page);
        }
        ocrConfidence = pages.length ? sum / pages.length : null;
        providers.push("tesseract-ocr");
      }
    } else if (doc.mimeType.startsWith("image/")) {
      ocrUsed = true;
      pageCount = 1;
      await progress(documentId, "Running OCR", 25);
      const r = await ocrImage(buf);
      if (r.rotation) await log(documentId, "INFO", "ocr", `Image was rotated ${r.rotation}°, corrected automatically.`);
      if (r.meanConf < 55) await log(documentId, "WARN", "ocr", `Low OCR confidence (${r.meanConf.toFixed(0)}%). Review carefully.`);
      const page: PageContent = { pageNumber: 1, width: r.width, height: r.height, words: r.words, source: "ocr", meanConf: r.meanConf, rules: r.rules };
      if (useAi) page.image = await modelImage(buf, r.rotation);
      pages = [page];
      ocrConfidence = r.meanConf;
      providers.push("tesseract-ocr");
    } else if (doc.mimeType === "application/msword") {
      pageCount = 1;
      pages = await readDoc(buf);
      providers.push("word-doc");
      await log(documentId, "WARN", "read", "Legacy .doc files are read on a best-effort basis; .docx or PDF gives better results.");
    } else {
      pageCount = 1;
      pages = await readDocx(buf);
      providers.push("word-docx");
    }

    const wordCount = pages.reduce((a, p) => a + p.words.length, 0);
    await log(documentId, "INFO", "read", `Read ${pages.length} page(s), ${wordCount} words.`, { ocrUsed, ocrConfidence });
    if (wordCount === 0 && !useAi) throw new Error("No text could be read from this document.");

    const rawText = pageText(pages);
    ocrPageText.push(...pages.map((p) => pageText([p])));

    await progress(documentId, "Extracting structured data", 72);
    const rule = heuristicExtract(pages, kind, teachers);
    let draft: DraftData = rule;
    const hasImages = pages.some((p) => p.image);

    if (useAi && (hasImages || countItems(rule) === 0)) {
      try {
        await log(documentId, "INFO", "ai", `Sending ${pages.length} page(s) to ${config.ai.model} for structured extraction.`);
        const ai = await aiExtract(pages, ocrPageText, kind, async (done, total) =>
          progress(documentId, `AI extraction: page ${done} of ${total}`, 72 + Math.round((done / total) * 18)),
        );
        if (countItems(ai) > 0) {
          draft = ai;
          draft.notes.push(...rule.notes.map((n) => `Rule-based reader: ${n}`));
          providers.push(`claude:${config.ai.model}`);
        } else {
          await log(documentId, "WARN", "ai", "AI extraction returned nothing; using the rule-based result.");
          providers.push("rule-based");
        }
      } catch (e) {
        await log(documentId, "ERROR", "ai", `AI extraction failed: ${(e as Error).message}. Using the rule-based result.`);
        providers.push("rule-based");
      }
    } else {
      providers.push("rule-based");
    }

    // free text-model help (Groq): structure unfamiliar layouts, then repair OCR misreadings
    if (!useAi && groqEnabled()) {
      try {
        if (countItems(draft) === 0 && wordCount > 0) {
          await progress(documentId, "AI: structuring the text", 80);
          const g = await groqExtractFromText(pages, kind);
          if (countItems(g) > 0) {
            draft = g;
            draft.notes.push("The rule-based reader did not recognise this layout; the AI read the OCR text instead. Check everything against the original.");
            providers.push("groq");
            await log(documentId, "INFO", "ai", `Groq structured ${countItems(g)} record(s) from the OCR text.`);
          }
        }
        if (countItems(draft) > 0) {
          await progress(documentId, "AI: correcting OCR misreadings", 88);
          draft = mergeOcrVariants(draft).draft; // smaller, cleaner lists for the model
          const r = await groqNormalize(draft);
          draft = r.draft;
          if (r.changes) providers.push("groq");
          await log(documentId, "INFO", "ai", `Groq corrected ${r.changes} OCR misreading(s).`);
        }
      } catch (e) {
        await log(documentId, "WARN", "ai", `Groq step skipped: ${(e as Error).message}`);
      }
    }

    // deterministic (no AI): merge spellings that differ only by OCR look-alike characters
    if (countItems(draft) > 0) {
      const m = mergeOcrVariants(draft);
      draft = m.draft;
      if (m.changes) await log(documentId, "INFO", "clean", `Merged ${m.changes} OCR spelling variant(s).`);
    }

    if (!draft.session) draft.session = rule.session;
    if (!draft.title) draft.title = doc.title;
    draft = crossCheck(draft, rawText);
    draft = draftDataSchema.parse(draft);

    await log(documentId, "INFO", "extract", `Extracted ${draft.periods.length} period(s), ${draft.modDuties.length} MOD, ${draft.weeklyOffs.length} weekly-off, ${draft.remedial.length} remedial, ${draft.clubs.length} club record(s).`, {
      notes: draft.notes,
    });
    if (countItems(draft) === 0) {
      await log(documentId, "WARN", "extract", "Nothing could be recognised automatically. You can enter the data by hand in the review screen.");
    }

    await db.extractionDraft.update({
      where: { documentId },
      data: {
        status: "REVIEW",
        stage: "Extraction completed",
        progress: 100,
        provider: [...new Set(providers)].join(" + "),
        data: draft as unknown as Prisma.InputJsonValue,
        rawText: rawText.slice(0, 200_000),
        ocrConfidence,
      },
    });
    await db.uploadedDocument.update({
      where: { id: documentId },
      data: { extractionStatus: "REVIEW", pageCount, ocrUsed },
    });
    await log(documentId, "INFO", "done", "Extraction completed. Waiting for admin review.");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[extraction]", documentId, e);
    await log(documentId, "ERROR", "failed", message).catch(() => {});
    await db.extractionDraft
      .update({ where: { documentId }, data: { status: "FAILED", stage: "Failed", errorMessage: message } })
      .catch(() => {});
    await db.uploadedDocument.update({ where: { id: documentId }, data: { extractionStatus: "FAILED" } }).catch(() => {});
  }
}

// one document at a time - OCR is CPU heavy
let chain: Promise<unknown> = Promise.resolve();
let pending = 0;

export function enqueueExtraction(documentId: string): void {
  pending += 1;
  chain = chain
    .then(() => processDocument(documentId))
    .catch(() => {})
    .finally(async () => {
      pending -= 1;
      if (pending === 0) await shutdownOcr().catch(() => {});
    });
}

/** A crash/restart can leave drafts stuck in PROCESSING; surface them as failed so the admin can retry. */
export async function failStaleExtractions(): Promise<void> {
  const cutoff = new Date(Date.now() - 20 * 60 * 1000);
  const stale = await db.extractionDraft.findMany({
    where: { status: { in: ["PROCESSING", "QUEUED"] }, updatedAt: { lt: cutoff } },
    select: { documentId: true },
  });
  for (const s of stale) {
    await db.extractionDraft.update({
      where: { documentId: s.documentId },
      data: { status: "FAILED", stage: "Failed", errorMessage: "Processing was interrupted. Please retry." },
    });
    await db.uploadedDocument.update({ where: { id: s.documentId }, data: { extractionStatus: "FAILED" } });
  }
}

/**
 * Starts extraction after the HTTP response has been sent.
 * - Vercel: `after()` keeps the function alive until it finishes (bounded by the route's maxDuration).
 * - Own server / Docker: the in-process queue.
 */
export function scheduleExtraction(documentId: string): void {
  if (process.env.VERCEL) {
    try {
      after(async () => {
        await processDocument(documentId);
        await shutdownOcr().catch(() => {});
      });
      return;
    } catch {
      /* not inside a request - fall through to the queue */
    }
  }
  enqueueExtraction(documentId);
}
