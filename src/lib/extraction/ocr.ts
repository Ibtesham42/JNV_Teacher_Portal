import fs from "node:fs/promises";
import sharp from "sharp";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import { config } from "../config";
import { deskew, detectRules, type Rules } from "./rules";
import type { Word } from "./types";

export type OcrResult = { words: Word[]; width: number; height: number; meanConf: number; rules?: Rules };

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      await fs.mkdir(config.tessDataDir, { recursive: true });
      const worker = await createWorker(config.ocrLang, OEM.LSTM_ONLY, {
        cachePath: config.tessDataDir,
        errorHandler: () => {},
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
        user_defined_dpi: "200",
      });
      return worker;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export async function shutdownOcr(): Promise<void> {
  if (!workerPromise) return;
  const w = await workerPromise.catch(() => null);
  workerPromise = null;
  await w?.terminate();
}

/** Grayscale + contrast normalisation + straightening + sensible resolution; the stored original is never touched. */
export async function preprocessForOcr(input: Buffer, rotate = 0): Promise<{ data: Buffer; width: number; height: number; skew: number }> {
  let img = sharp(input, { failOn: "none", limitInputPixels: 120_000_000 }).rotate(); // honour EXIF orientation
  if (rotate) img = img.rotate(rotate);
  const meta = await img.clone().metadata();
  const w = meta.width ?? 0;
  let pipeline = img.grayscale().normalize();
  if (w && w < 1800) pipeline = pipeline.resize({ width: 2200, kernel: "lanczos3" });
  else if (w > 3600) pipeline = pipeline.resize({ width: 3400 });
  const base = await pipeline.png().toBuffer();
  const straight = await deskew(base);
  const { data, info } = await sharp(straight.png).sharpen().png().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, skew: straight.angle };
}

async function recognizeOnce(png: Buffer): Promise<{ words: Word[]; meanConf: number }> {
  const worker = await getWorker();
  const { data } = await worker.recognize(png, {}, { blocks: true });
  const words: Word[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const w of line.words) {
          const text = w.text.trim();
          if (!text) continue;
          words.push({
            text,
            x0: w.bbox.x0,
            y0: w.bbox.y0,
            x1: w.bbox.x1,
            y1: w.bbox.y1,
            conf: w.confidence,
          });
        }
      }
    }
  }
  const meanConf = words.length ? words.reduce((a, w) => a + w.conf, 0) / words.length : 0;
  return { words, meanConf };
}

/**
 * OCR one page image. If the first pass looks like garbage (rotated scan), the other
 * orientations are tried and the most confident one wins.
 */
export async function ocrImage(input: Buffer): Promise<OcrResult & { rotation: number; skew: number }> {
  let best: (OcrResult & { rotation: number; skew: number; png: Buffer }) | null = null;
  for (const rotation of [0, 90, 270, 180]) {
    const pre = await preprocessForOcr(input, rotation);
    const r = await recognizeOnce(pre.data);
    const score = r.meanConf * Math.min(1, r.words.length / 40);
    const cand = { words: r.words, width: pre.width, height: pre.height, meanConf: r.meanConf, rotation, skew: pre.skew, png: pre.data };
    const bestScore = best ? best.meanConf * Math.min(1, best.words.length / 40) : -1;
    if (score > bestScore) best = cand;
    // good enough on the first try -> stop
    if (rotation === 0 && r.meanConf >= 60 && r.words.length >= 25) break;
    if (rotation !== 0 && best && best.meanConf >= 60 && best.words.length >= 25) break;
  }
  const { png, ...rest } = best!;
  const rules = await detectRules(png).catch(() => undefined);
  return { ...rest, rules };
}

/** Compact JPEG of a page for the vision model (max ~2000px on the long side). */
export async function modelImage(input: Buffer, rotate = 0): Promise<{ data: Buffer; mediaType: "image/jpeg" }> {
  let img = sharp(input, { failOn: "none", limitInputPixels: 120_000_000 }).rotate();
  if (rotate) img = img.rotate(rotate);
  const data = await img
    .resize({ width: 2000, height: 2600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { data, mediaType: "image/jpeg" };
}
