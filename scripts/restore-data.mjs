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

// accounts that must not be copied (e.g. a local admin with a weak dev password): SKIP_USERNAMES=admin
const skip = new Set((process.env.SKIP_USERNAMES || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
// records that pointed at a skipped account are re-attributed to the account with the same username in the target
const remap = new Map();
if (skip.size) {
  const skipped = (data.user ?? []).filter((u) => skip.has(String(u.username).toLowerCase()));
  data.user = (data.user ?? []).filter((u) => !skip.has(String(u.username).toLowerCase()));
  for (const u of skipped) {
    const target = await db.user.findUnique({ where: { username: u.username } });
    remap.set(u.id, target?.id ?? null);
  }
}
const USER_FIELDS = ["uploadedById", "createdById"];
const relink = (row) => {
  for (const f of USER_FIELDS) if (f in row && remap.has(row[f])) row[f] = remap.get(row[f]);
  return row;
};

for (const model of order) {
  const rows = (data[model] ?? []).map(revive).map(relink);
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
