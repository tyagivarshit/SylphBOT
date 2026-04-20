"use client";

type TrialBannerProps = {
  active: boolean;
  totalDays: number;
  daysLeft: number;
  nearEnd: boolean;
};

export default function TrialBanner({
  active,
  totalDays,
  daysLeft,
  nearEnd,
}: TrialBannerProps) {
  if (!active) {
    return null;
  }

  return (
    <div className="brand-section-shell overflow-hidden rounded-[28px] p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Trial
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {"\uD83D\uDD25"} {totalDays}-day free trial
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {"\u23F3"} {daysLeft} day{daysLeft === 1 ? "" : "s"} left
          </p>
        </div>

        <div className="max-w-xl rounded-[22px] border border-slate-200/80 bg-white/84 px-4 py-3 text-sm text-slate-600 shadow-sm">
          {nearEnd
            ? "\u26A0\uFE0F Your automation will stop soon"
            : "Keep the trial active by finishing onboarding and driving your first result."}
        </div>
      </div>
    </div>
  );
}
