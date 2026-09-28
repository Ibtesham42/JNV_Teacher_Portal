"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

/** Client-side sign-out: does not depend on a server-action ID, so an open tab keeps working after a redeploy. */
export default function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut({ redirectTo: "/login" });
      }}
      className="btn min-h-[36px] bg-white/10 px-3 text-white hover:bg-white/20"
      aria-label="Sign out"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}
