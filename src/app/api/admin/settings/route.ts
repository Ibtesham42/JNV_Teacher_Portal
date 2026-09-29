import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/audit";
import { requireAdmin, parseJson, route } from "@/lib/security/api";
import { getSchoolSettings, SETTINGS_ID } from "@/lib/settings";
import { schoolSettingsPatch } from "@/lib/validation";

export const GET = route(async () => {
  await requireAdmin();
  const settings = await getSchoolSettings();
  return { settings };
});

/** Edits school identity/branding - replaces what used to be hardcoded in config.ts. */
export const PATCH = route(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const input = await parseJson(req, schoolSettingsPatch);
  const before = await getSchoolSettings();

  const classes = input.classes ? [...new Set(input.classes.map((c) => c.trim().toUpperCase()).filter(Boolean))] : undefined;
  const sections = input.sections ? [...new Set(input.sections.map((s) => s.trim().toUpperCase()).filter(Boolean))] : undefined;

  const settings = await db.schoolSettings.update({
    where: { id: SETTINGS_ID },
    data: { ...input, ...(classes ? { classes } : {}), ...(sections ? { sections } : {}) },
  });

  await logActivity(admin, {
    action: "settings.update",
    entityType: "SchoolSettings",
    entityId: SETTINGS_ID,
    summary: "Updated school settings.",
    oldValue: before,
    newValue: settings,
  });
  return { settings };
});
