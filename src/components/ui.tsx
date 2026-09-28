import clsx from "clsx";
import Link from "next/link";
import { NOT_AVAILABLE } from "@/lib/queries";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children, title }: { children?: React.ReactNode; title?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
      {title && <p className="font-semibold text-slate-700">{title}</p>}
      <p className="mt-1 text-sm text-slate-500">{children ?? NOT_AVAILABLE}</p>
    </div>
  );
}

export function Pill({ tone = "slate", children }: { tone?: "slate" | "green" | "amber" | "red" | "blue" | "gold"; children: React.ReactNode }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-brand-100 text-brand-800",
    gold: "bg-gold-100 text-gold-600",
  } as const;
  return <span className={clsx("badge", tones[tone])}>{children}</span>;
}

export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={clsx(
            "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition",
            t.key === active ? "bg-brand-700 text-white shadow-card" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: "default" | "warn";
}) {
  const inner = (
    <div className={clsx("card card-pad h-full", tone === "warn" && "border-amber-300 bg-amber-50", href && "transition hover:border-brand-300")}>
      <p className="section-title">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function DocLinks({ id, size = "sm" }: { id: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "btn btn-secondary btn-sm" : "btn btn-secondary";
  return (
    <div className="flex gap-2">
      <a className={cls} href={`/api/documents/${id}/file`} target="_blank" rel="noopener noreferrer">
        View
      </a>
      <a className={cls} href={`/api/documents/${id}/file?download=1`}>
        Download
      </a>
    </div>
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
