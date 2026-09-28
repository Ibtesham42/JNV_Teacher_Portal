// Removes ALL teachers, routines, documents, MOD, weekly-off, notices, clubs and remedial data
// (keeps admin users) and deletes the stored uploads. Use after trying the app with sample files.
//   node scripts/clear-data.mjs --yes
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

if (!process.argv.includes("--yes")) {
  console.log("This deletes every uploaded document and all schedule data. Re-run with --yes to confirm.");
  process.exit(1);
}
const db = new PrismaClient();
await db.$transaction([
  db.routine.deleteMany(),
  db.modDuty.deleteMany(),
  db.weeklyOff.deleteMany(),
  db.remedialSchedule.deleteMany(),
  db.clubActivity.deleteMany(),
  db.notice.deleteMany(),
  db.extractionLog.deleteMany(),
  db.extractionDraft.deleteMany(),
  db.uploadedDocument.deleteMany(),
  db.user.deleteMany({ where: { role: "TEACHER" } }),
  db.teacher.deleteMany(),
  db.subject.deleteMany(),
  db.schoolDay.deleteMany(),
]);
await db.$disconnect();
const dir = path.resolve(process.env.STORAGE_DIR || "./.data/uploads");
fs.rmSync(dir, { recursive: true, force: true });
console.log("Cleared. Admin accounts were kept.");
