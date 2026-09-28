import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { groqEnabled } from "@/lib/extraction/groq";
import { getActiveRoutine } from "@/lib/queries";
import { addDays } from "@/lib/roster/generate";
import { loadRosterTeachers } from "@/lib/roster/service";
import { todayISO } from "@/lib/time";
import GeneratorForm from "./GeneratorForm";

export const metadata: Metadata = { title: "Generate roster" };
export const dynamic = "force-dynamic";

/** First and last day of next month. */
function nextMonth(today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const first = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const last = addDays(new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 10), -1);
  return { from: first, to: last };
}

export default async function GeneratePage() {
  const [teachers, routine] = await Promise.all([loadRosterTeachers(), getActiveRoutine()]);
  const range = nextMonth(todayISO());
  return (
    <div>
      <PageHeader
        title="Generate roster"
        subtitle="Make MOD, Sunday duty, weekly off and remedial classes automatically, without clashes or overloaded teachers. Only an admin can do this, and nothing goes live until you publish."
      />
      <GeneratorForm
        teachers={teachers.map((t) => ({ id: t.id, name: t.name, code: t.code }))}
        defaultFrom={range.from}
        defaultTo={range.to}
        aiEnabled={groqEnabled()}
        hasRoutine={!!routine}
      />
    </div>
  );
}
