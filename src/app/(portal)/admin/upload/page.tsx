import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { aiEnabled } from "@/lib/extraction/ai";
import { config } from "@/lib/config";
import { groqEnabled } from "@/lib/extraction/groq";
import UploadForm from "./UploadForm";

export const metadata: Metadata = { title: "Upload document" };

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Upload document" subtitle="PDF, JPG, PNG, DOC or DOCX. Scanned documents are read with OCR." />
      <UploadForm initialKind={kind} aiEnabled={aiEnabled()} groqEnabled={groqEnabled()} maxMb={Math.round(config.maxUploadBytes / 1024 / 1024)} />
    </div>
  );
}
