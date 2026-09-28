"use client";

import { useActionState } from "react";
import { authenticate } from "./actions";
import { Loader2 } from "lucide-react";

export default function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(authenticate, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="username" className="label">Username</label>
        <input id="username" name="username" className="input" autoComplete="username" autoCapitalize="none" autoFocus required maxLength={80} />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required maxLength={200} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Sign in
      </button>
    </form>
  );
}
