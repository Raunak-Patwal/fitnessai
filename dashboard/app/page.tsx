"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const userId = localStorage.getItem("fitness_ai_userId");
    router.replace(userId ? "/dashboard" : "/onboarding");
  }, [router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 px-8 py-6 text-center">
        <p className="text-sm uppercase tracking-[0.35em] text-emerald-400/70">
          Fitness AI
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white">Preparing your session</h1>
        <p className="mt-2 text-slate-400">Routing you to onboarding or your dashboard.</p>
      </div>
    </div>
  );
}
