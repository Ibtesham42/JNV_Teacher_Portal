import type { Metadata } from "next";
import { config } from "@/lib/config";
import { getActiveRoutine } from "@/lib/queries";
import { adminPageUser } from "@/lib/session";
import ReviewClient from "./ReviewClient";

export const metadata: Metadata = { title: "Extraction review" };
export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await adminPageUser();
  const { id } = await params;
  const active = await getActiveRoutine();
  return (
    <ReviewClient
      id={id}
      classes={[...config.classes]}
      sections={[...config.sections]}
      lowConfidence={config.lowConfidence}
      activeVersion={active?.version ?? null}
    />
  );
}
