import type { Metadata } from "next";
import { ExternalLink, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { getSchoolSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Exams" };

const SHEETS = ["PWT 1", "PWT 2", "PWT 3", "PWT 4", "PWT 5", "Term 1", "Term 2"];

export default async function ExamsPage() {
  const school = await getSchoolSettings();
  return (
    <div>
      <PageHeader title="Exams" subtitle="Mark slips and exam sheets for the session 2026-27" />

      <section className="card overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-gold-500 via-white to-leaf-600" aria-hidden="true" />
        <div className="card-pad flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-leaf-50 text-leaf-700 ring-1 ring-leaf-100">
            <FileSpreadsheet className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900">Term 1 (2026-27) - Mark Slip and Exam Sheets</h2>
            <p className="mt-1 text-sm text-slate-600">
              One Excel workbook with the mark slip and every exam sheet. Each exam is on its own tab.
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {SHEETS.map((s) => (
                <li key={s} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-100">
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <a
            href={school.examSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 py-3 text-sm font-bold text-white shadow-card transition hover:bg-brand-800 active:scale-95"
          >
            Open exam sheet <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      <p className="mt-3 text-xs text-slate-500">
        The sheet opens in Google Sheets in a new tab. If it asks for access, contact the school office.
      </p>
    </div>
  );
}
