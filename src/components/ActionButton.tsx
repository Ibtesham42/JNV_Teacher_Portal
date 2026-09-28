"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/apiClient";

/** A button that calls the JSON API (after an optional confirmation) and refreshes the page. */
export default function ActionButton({
  label,
  url,
  method = "POST",
  json,
  confirm,
  variant = "secondary",
  small = true,
  onDoneHref,
}: {
  label: string;
  url: string;
  method?: "POST" | "PATCH" | "DELETE" | "PUT";
  json?: unknown;
  confirm?: string;
  variant?: "primary" | "secondary" | "danger" | "success";
  small?: boolean;
  onDoneHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError("");
    try {
      await api(url, { method, json });
      if (onDoneHref) router.push(onDoneHref);
      else router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={run} disabled={busy} className={clsx("btn", small && "btn-sm", `btn-${variant}`)}>
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        {label}
      </button>
      {error && <span className="max-w-[220px] text-xs text-red-600">{error}</span>}
    </span>
  );
}
