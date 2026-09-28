// Dumps every table to .data/backups/backup-<timestamp>.json (a safety copy before bulk changes).
//   node scripts/backup-data.mjs
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const models = [
  "user", "teacher", "subject", "schoolDay", "uploadedDocument", "extractionDraft", "extractionLog",
  "routine", "routineClass", "routinePeriod", "modDuty", "weeklyOff", "notice", "remedialSchedule", "clubActivity",
];
const out = {};
for (const m of models) out[m] = await db[m].findMany();
const dir = path.resolve(".data/backups");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(out));
console.log("backup written:", file, Object.fromEntries(models.map((m) => [m, out[m].length])));
await db.$disconnect();
