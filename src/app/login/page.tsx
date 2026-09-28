import type { Metadata } from "next";
import { config } from "@/lib/config";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-900 to-brand-700 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black text-gold-400">J</div>
          <h1 className="text-xl font-bold tracking-wide">{config.schoolName}</h1>
          <p className="text-sm text-brand-200">{config.schoolAddress}</p>
          <p className="mt-2 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-400">{config.portalName}</p>
        </div>
        <div className="card card-pad">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Sign in</h2>
          <LoginForm next={next ?? ""} />
          <p className="mt-4 text-center text-xs text-slate-500">Forgot your password? Ask the portal administrator to reset it.</p>
        </div>
      </div>
    </div>
  );
}
