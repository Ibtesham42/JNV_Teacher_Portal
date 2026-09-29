import type { Metadata } from "next";
import { config } from "@/lib/config";
import { getActiveRoutine } from "@/lib/queries";
import { getSchoolSettings } from "@/lib/settings";
import { adminPageUser } from "@/lib/session";
import ReviewClient from "./ReviewClient";

export const metadata: Metadata = { title: "Extraction review" };
export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await adminPageUser();
  const { id } = await params;
  const [active, school] = await Promise.all([getActiveRoutine(), getSchoolSettings()]);
  return (
    <ReviewClient
      id={id}
      classes={[...school.classes]}
      sections={[...school.sections]}
      lowConfidence={config.lowConfidence}
      activeVersion={active?.version ?? null}
      activeRoutineId={active?.id ?? null}
    />
  );
}
