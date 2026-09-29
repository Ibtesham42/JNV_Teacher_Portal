import { cache } from "react";
import { db } from "./db";

export const SETTINGS_ID = "singleton";

/** Used only the very first time a database has no SchoolSettings row yet (fresh install/deploy). */
export const DEFAULT_SCHOOL_SETTINGS = {
  schoolName: "JAWAHAR NAVODAYA VIDYALAYA",
  schoolAddress: "RYMBAI, EAST JAINTIA HILLS, MEGHALAYA",
  portalName: "Teacher Routine Portal",
  examSheetUrl:
    process.env.EXAM_SHEET_URL ||
    "https://docs.google.com/spreadsheets/d/1Vj61zHzuVegLPWV-WrglT0leQE87-qCa/edit?gid=1502158322#gid=1502158322",
  classes: ["VI", "VII", "VIII", "IX", "X", "XI", "XII"],
  sections: ["A", "B", "C", "D", "E", "F"],
};

/** School identity/branding, editable from Admin -> School Settings (no code change/redeploy needed).
 *  Self-heals on first use against a fresh database instead of failing the whole site. */
export const getSchoolSettings = cache(async () => {
  return db.schoolSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID, ...DEFAULT_SCHOOL_SETTINGS },
  });
});
