"use client";

import type { Route } from "next";
import Link from "next/link";

type UpgradeCtaBannerProps = {
  show: boolean;
  headline: string;
  message: string;
  reasons: string[];
  href: Route;
};

const getReasonLabel = (reason: string) => {
  if (reason === "usage_80") {
    return "AI usage at 80%";
  }

  if (reason === "trial_ending") {
    return "Trial almost over";
  }

  if (reason === "results") {
    return "Real replies are landing";
  }

  return "Momentum detected";
};

export default function UpgradeCtaBanner({
  show,
  headline,
  message,
  reasons,
  href,
}: UpgradeCtaBannerProps) {
  if (!show) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] p-5 text-white shadow-[0_24px_70px_rgba(8,18,35,0.22)] md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
            Upgrade
          </p>
          <h2 className="mt-2 text-xl font-semibold">{headline}</h2>
          <p className="mt-2 text-sm text-white/80">{message}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <span
                key={reason}
                className="rounded-full border border-white/16 bg-white/10 px-3 py-1 text-xs font-semibold text-white/88"
              >
                {getReasonLabel(reason)}
              </span>
            ))}
          </div>
        </div>

        <Link
          href={href}
          className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          Upgrade plan
        </Link>
      </div>
    </div>
  );
}
