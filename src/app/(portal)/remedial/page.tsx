import type { Metadata } from "next";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { classLabel, getRemedial } from "@/lib/queries";
import { dayLabel, formatRange } from "@/lib/time";

export const metadata: Metadata = { title: "Remedial & Enrichment" };
export const dynamic = "force-dynamic";

const CAT = { REMEDIAL: "Remedial", LIFE_SKILL: "Life Skill", ENRICHMENT: "Enrichment", OTHER: "Other" } as const;

export default async function RemedialPage() {
  const rows = await getRemedial();
  return (
    <div>
      <PageHeader title="Remedial & Enrichment Schedule" subtitle="Remedial classes, life skill and enrichment activities" />
      {rows.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                {["Class", "Day", "Time", "Activity", "Teacher"].map((h) => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td font-semibold">{classLabel(r.className, r.section)}</td>
                  <td className="td">{r.day ? dayLabel(r.day) : "—"}</td>
                  <td className="td whitespace-nowrap">{formatRange(r.startTime, r.endTime) || "—"}</td>
                  <td className="td">
                    <Pill tone={r.category === "REMEDIAL" ? "amber" : r.category === "LIFE_SKILL" ? "green" : "blue"}>{CAT[r.category]}</Pill>{" "}
                    <span className="font-medium">{r.activity}</span>
                  </td>
                  <td className="td">{r.teacherName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Information not available in uploaded document.</Empty>
      )}
    </div>
  );
}
