// Copies a backup (scripts/backup-data.mjs) - and the uploaded originals - into another database,
// e.g. from your PC to the online (Neon) database used by Vercel.
//
//   DATABASE_URL="postgresql://...neon..." node scripts/restore-data.mjs <backup.json> [uploads-folder]
//
// Existing rows with the same id / unique key are skipped, so it is safe to run twice.
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const [file, uploads = ".data/uploads"] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/restore-data.mjs <backup.json> [uploads-folder]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to the TARGET database first.");
  process.exit(1);
}

const db = new PrismaClient();
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const revive = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "string" && ISO.test(v) ? new Date(v) : v]));

// parents before children
const order = [
  "teacher", "user", "subject", "schoolDay", "uploadedDocument", "extractionDraft", "extractionLog",
  "routine", "routineClass", "routinePeriod", "modDuty", "weeklyOff", "notice", "remedialSchedule", "clubActivity",
];

for (const model of order) {
  const rows = (data[model] ?? []).map(revive);
  let added = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const r = await db[model].createMany({ data: rows.slice(i, i + 400), skipDuplicates: true });
    added += r.count;
  }
  console.log(`${model.padEnd(18)} ${String(added).padStart(5)} added, ${rows.length - added} already there`);
}

// originals -> StoredFile (database storage, STORAGE_DRIVER=db)
let files = 0;
for (const doc of data.uploadedDocument ?? []) {
  const p = path.resolve(uploads, doc.storageKey);
  if (!fs.existsSync(p)) {
    console.log(`  missing file for "${doc.originalName}" (${doc.storageKey})`);
    continue;
  }
  const exists = await db.storedFile.findUnique({ where: { key: doc.storageKey } });
  if (!exists) {
    await db.storedFile.create({ data: { key: doc.storageKey, data: new Uint8Array(fs.readFileSync(p)) } });
    files++;
  }
}
console.log(`uploaded originals copied: ${files}`);
await db.$disconnect();
