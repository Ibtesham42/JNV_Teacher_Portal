import { z } from "zod";
import { chatJson, groqEnabled } from "../extraction/groq";
import { WEEKDAYS, type WeekdayName } from "../time";
import type { Restriction, RosterTeacher } from "./generate";

/**
 * Turns the admin's plain-language requests ("Mr X is on leave 5-9 Oct", "no Sunday duty for Y",
 * "Z wants Saturday off") into rules. The AI only picks from the numbered teacher list it is given, and
 * everything it returns is validated here, so it can neither invent a teacher nor bypass the generator's own checks.
 */

const ruleSchema = z.object({
  teacher: z.number().int(),
  type: z.enum(["unavailable", "no_duty", "prefer_off_day"]),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(62).optional(),
  days: z.array(z.enum(WEEKDAYS)).max(7).optional(),
  duties: z.array(z.enum(["MOD", "HOLIDAY", "REMEDIAL"])).max(3).optional(),
});

export type ParsedInstructions = {
  restrictions: Restriction[];
  preferOff: { teacherId: string; day: WeekdayName }[];
  understood: string[];
  warnings: string[];
};

const SYSTEM = `You read instructions from a school administrator about duty rosters and return JSON rules.
Teachers are given as a numbered list. Refer to a teacher ONLY by the number from the list. If a name in the instructions is not clearly one of the listed teachers, do not guess: put the name in "unmatched".
Return {"rules":[...],"unmatched":[...]} where each rule is one of:
 {"teacher":N,"type":"unavailable","dates":["YYYY-MM-DD",...]}  - the teacher cannot be given duty on these dates (leave, exam duty, travel). Expand ranges into every date.
 {"teacher":N,"type":"unavailable","days":["MONDAY",...]}  - cannot be given duty on these weekdays.
 {"teacher":N,"type":"no_duty","duties":["MOD"|"HOLIDAY"|"REMEDIAL"]}  - should never get that kind of duty (MOD = master on duty, HOLIDAY = Sunday/holiday duty).
 {"teacher":N,"type":"prefer_off_day","days":["SATURDAY"]}  - wants that weekday as the weekly off.
Add "duties" to an "unavailable" rule only if the instruction names a kind of duty. Use only what is written; never add rules that were not asked for.`;

export async function parseInstructions(text: string, teachers: RosterTeacher[]): Promise<ParsedInstructions> {
  const out: ParsedInstructions = { restrictions: [], preferOff: [], understood: [], warnings: [] };
  const trimmed = text.trim();
  if (!trimmed) return out;
  if (!groqEnabled()) {
    out.warnings.push("Special instructions were not applied because no AI key (GROQ_API_KEY) is configured.");
    return out;
  }
  let raw: unknown;
  try {
    const list = teachers.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
    raw = await chatJson(SYSTEM, `Teachers:\n${list}\n\nInstructions:\n${trimmed.slice(0, 3000)}`, 3000);
  } catch (e) {
    out.warnings.push(`The AI could not read the instructions (${(e as Error).message}). The roster was generated without them.`);
    return out;
  }
  const obj = (raw ?? {}) as { rules?: unknown[]; unmatched?: unknown[] };
  for (const name of Array.isArray(obj.unmatched) ? obj.unmatched : []) {
    if (typeof name === "string" && name.trim()) out.warnings.push(`"${name.trim().slice(0, 80)}" in the instructions does not match a teacher, so that request was skipped.`);
  }
  for (const r of Array.isArray(obj.rules) ? obj.rules : []) {
    const p = ruleSchema.safeParse(r);
    const t = p.success ? teachers[p.data.teacher - 1] : undefined;
    if (!p.success || !t) {
      out.warnings.push("One instruction could not be understood and was skipped.");
      continue;
    }
    const { type, dates, days, duties } = p.data;
    if (type === "prefer_off_day") {
      const d = days?.find((x) => x !== "SUNDAY");
      if (!d) continue;
      out.preferOff.push({ teacherId: t.id, day: d });
      out.understood.push(`${t.name}: weekly off preferred on ${d.toLowerCase()}`);
    } else if (type === "no_duty") {
      if (!duties?.length) continue;
      out.restrictions.push({ teacherId: t.id, duties });
      out.understood.push(`${t.name}: no ${duties.join(" / ")} duty`);
    } else {
      if (!dates?.length && !days?.length) continue;
      out.restrictions.push({ teacherId: t.id, dates, days, duties });
      const when = [...(dates?.length ? [dates.length > 3 ? `${dates[0]} ... ${dates[dates.length - 1]} (${dates.length} dates)` : dates.join(", ")] : []), ...(days?.map((d) => d.toLowerCase()) ?? [])].join("; ");
      out.understood.push(`${t.name}: not available ${when}${duties?.length ? ` for ${duties.join(" / ")}` : ""}`);
    }
  }
  if (!out.understood.length && !out.warnings.length) out.warnings.push("No usable rule was found in the instructions.");
  return out;
}
