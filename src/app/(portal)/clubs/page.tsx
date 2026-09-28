import type { Metadata } from "next";
import { Empty, PageHeader } from "@/components/ui";
import { getClubs } from "@/lib/queries";

export const metadata: Metadata = { title: "Clubs & Activities" };
export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const clubs = await getClubs();
  return (
    <div>
      <PageHeader title="Clubs & Activities" />
      {clubs.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clubs.map((c) => (
            <article key={c.id} className="card card-pad">
              <h2 className="text-lg font-bold text-brand-800">{c.name}</h2>
              <div className="mt-3">
                <p className="section-title">Teacher members</p>
                {c.members.length ? (
                  <ul className="mt-1 list-inside list-disc text-sm text-slate-800">{c.members.map((m) => <li key={m}>{m}</li>)}</ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Not available</p>
                )}
              </div>
              <div className="mt-3">
                <p className="section-title">Suggested activities</p>
                {c.activities.length ? (
                  <ul className="mt-1 list-inside list-disc text-sm text-slate-800">{c.activities.map((a) => <li key={a}>{a}</li>)}</ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Not available</p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty>Information not available in uploaded document.</Empty>
      )}
    </div>
  );
}
