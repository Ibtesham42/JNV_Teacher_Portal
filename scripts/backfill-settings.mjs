// One-time (idempotent) backfill: creates the SchoolSettings singleton row from the
// values that used to be hardcoded in src/lib/config.ts, so the live site is unchanged
// until an admin edits Admin -> School Settings. Safe to re-run - it only fills in the
// row if it does not already exist and never overwrites an admin's edits.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const existing = await db.schoolSettings.findUnique({ where: { id: "singleton" } });
  if (existing) {
    console.log("SchoolSettings already exists - nothing to do.");
    return;
  }
  await db.schoolSettings.create({
    data: {
      id: "singleton",
      schoolName: "JAWAHAR NAVODAYA VIDYALAYA",
      schoolAddress: "RYMBAI, EAST JAINTIA HILLS, MEGHALAYA",
      portalName: "Teacher Routine Portal",
      examSheetUrl:
        process.env.EXAM_SHEET_URL ||
        "https://docs.google.com/spreadsheets/d/1Vj61zHzuVegLPWV-WrglT0leQE87-qCa/edit?gid=1502158322#gid=1502158322",
      classes: ["VI", "VII", "VIII", "IX", "X", "XI", "XII"],
      sections: ["A", "B", "C", "D", "E", "F"],
    },
  });
  console.log("SchoolSettings created from the previous hardcoded defaults.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
