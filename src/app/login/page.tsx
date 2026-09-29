import type { Metadata } from "next";
import BrandLogo, { TricolourBar } from "@/components/BrandLogo";
import { getSchoolSettings } from "@/lib/settings";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const school = await getSchoolSettings();
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-950 via-brand-900 to-brand-700 px-4 py-10">
      <TricolourBar className="absolute inset-x-0 top-0" />
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <BrandLogo size="xl" className="mx-auto mb-4" />
          <h1 className="text-xl font-bold tracking-wide">{school.schoolName}</h1>
          <p className="text-sm text-brand-100" lang="hi">जवाहर नवोदय विद्यालय, रिम्बाई</p>
          <p className="text-sm text-brand-200">{school.schoolAddress}</p>
          <p className="mt-2 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-400">{school.portalName}</p>
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
