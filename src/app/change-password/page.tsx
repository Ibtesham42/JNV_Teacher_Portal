"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { api } from "@/lib/apiClient";
import PasswordField from "@/components/PasswordField";

export default function ChangePasswordPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const newPassword = String(f.get("newPassword"));
    if (newPassword !== String(f.get("confirm"))) return setError("The new passwords do not match.");
    setBusy(true);
    setError("");
    try {
      await api("/api/account/password", { method: "POST", json: { currentPassword: f.get("currentPassword"), newPassword } });
      await signOut({ redirectTo: "/login" });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="card card-pad w-full max-w-md space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Change your password</h1>
          <p className="text-sm text-slate-500">Choose a new password (at least 8 characters). You will sign in again afterwards.</p>
        </div>
        <div>
          <label className="label" htmlFor="currentPassword">Current password</label>
          <PasswordField id="currentPassword" name="currentPassword" required autoComplete="current-password" />
        </div>
        <div>
          <label className="label" htmlFor="newPassword">New password</label>
          <PasswordField id="newPassword" name="newPassword" required minLength={8} autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm new password</label>
          <PasswordField id="confirm" name="confirm" required minLength={8} autoComplete="new-password" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>Change password</button>
      </form>
    </div>
  );
}
