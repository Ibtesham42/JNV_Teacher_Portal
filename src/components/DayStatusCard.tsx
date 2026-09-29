"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Coffee, Moon, PlayCircle } from "lucide-react";
import { computeDayStatus, formatClock, mergeTimeline, nowMinutesIn, type TimelineBlock } from "@/lib/common";

const TIMEZONE = "Asia/Kolkata";

function minutesText(n: number): string {
  if (n < 1) return "less than a minute";
  if (n === 1) return "1 minute";
  return `${n} minutes`;
}

function BlockDetails({ block }: { block: TimelineBlock }) {
  return (
    <>
      <p className="text-lg font-extrabold text-slate-900">{block.label}</p>
      {block.sublabel && <p className="text-sm font-semibold text-slate-700">{block.sublabel}</p>}
    </>
  );
}

/** Live "what's happening right now" card, computed entirely from the periods/remedial duty it's given - never guesses. */
export default function DayStatusCard({ periods, remedial, isOff }: { periods: Parameters<typeof mergeTimeline>[0]; remedial: Parameters<typeof mergeTimeline>[1]; isOff: boolean }) {
  const [nowMin, setNowMin] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMin(nowMinutesIn(TIMEZONE));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  if (isOff || nowMin == null) return null;

  const blocks = mergeTimeline(periods, remedial);
  const status = computeDayStatus(blocks, nowMin);

  if (status.kind === "no-classes") {
    return (
      <div className="card card-pad flex items-center gap-3 border-slate-200 bg-slate-50">
        <Moon className="h-6 w-6 shrink-0 text-slate-400" />
        <p className="text-sm font-semibold text-slate-600">No classes scheduled today.</p>
      </div>
    );
  }

  if (status.kind === "day-done") {
    return (
      <div className="card card-pad flex items-center gap-3 border-slate-200 bg-slate-50">
        <Moon className="h-6 w-6 shrink-0 text-slate-400" />
        <p className="text-sm font-semibold text-slate-600">Today&apos;s classes are done.</p>
      </div>
    );
  }

  if (status.kind === "in-class") {
    const duty = status.block.kind === "remedial";
    return (
      <div className={clsx("card card-pad border-2", duty ? "border-gold-400 bg-gold-50" : "border-emerald-400 bg-emerald-50")}>
        <p className={clsx("section-title flex items-center gap-2", duty ? "text-gold-700" : "text-emerald-800")}>
          <PlayCircle className="h-4 w-4" /> {duty ? "CURRENT DUTY" : "CURRENT PERIOD"}
        </p>
        <div className="mt-1"><BlockDetails block={status.block} /></div>
        <p className="mt-1 text-xs text-slate-600">Ends at {formatClock(status.block.endClock)} · in {minutesText(status.endsInMin)}</p>
      </div>
    );
  }

  // upcoming
  const duty = status.block.kind === "remedial";
  return (
    <div className="card card-pad border-2 border-brand-300 bg-brand-50">
      <p className="section-title flex items-center gap-2 text-brand-800">
        <Coffee className="h-4 w-4" /> FREE UNTIL {formatClock(status.block.startClock)}
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-600">NEXT {duty ? "DUTY" : "PERIOD"} · in {minutesText(status.startsInMin)}</p>
      <div className="mt-1"><BlockDetails block={status.block} /></div>
    </div>
  );
}
