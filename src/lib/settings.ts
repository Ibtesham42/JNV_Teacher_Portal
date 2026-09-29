import { cache } from "react";
import { db } from "./db";

const SETTINGS_ID = "singleton";

/** School identity/branding, editable from Admin -> School Settings (no code change/redeploy needed). */
export const getSchoolSettings = cache(async () => {
  const row = await db.schoolSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) throw new Error("School settings are missing. Run scripts/backfill-settings.mjs.");
  return row;
});
