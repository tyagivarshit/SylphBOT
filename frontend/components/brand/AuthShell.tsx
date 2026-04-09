"use client";

import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import BrandLockup from "./BrandLockup";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

const assuranceCards = [
  {
    icon: ShieldCheck,
    title: "High-trust workflows",
    copy: "Clean access, reliable permissions, and a premium client-facing feel.",
  },
  {
    icon: Workflow,
    title: "Lead-to-revenue system",
    copy: "Instagram automation, CRM visibility, and conversions in one workspace.",
  },
  {
    icon: Sparkles,
    title: "Always-on AI sales desk",
    copy: "Built to feel like a real revenue engine, not a generic bot tool.",
  },
];

const liveDeskMessages = [
  {
    label: "Customer",
    message: "Price kya hai?",
    align: "right",
  },
  {
    label: "AI",
    message: "Plans start from Rs 999/month with conversion-focused automation.",
    align: "left",
  },
  {
    label: "Customer",
    message: "Demo mil sakta hai?",
    align: "right",
  },
];

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="brand-app brand-auth-shell">
      <div className="brand-auth-grid">
        <aside className="brand-auth-aside hidden rounded-[32px] p-8 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="space-y-8">
            <BrandLockup href="/" theme="dark" showBadge />

            <div className="space-y-5">
              <span className="brand-chip brand-chip-dark">
                Premium SaaS automation workspace
              </span>

              <div className="space-y-4">
                <h1 className="max-w-xl text-4xl font-semibold leading-tight">
                  Turn lead conversations into a premium, high-trust revenue
                  workflow.
                </h1>

                <p className="max-w-xl text-sm leading-7 text-white/72">
                  The app stays product-first, but it still carries the same
                  Automexia brand DNA as the main site: sharp, enterprise-ready,
                  and built for conversion.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              {assuranceCards.map(({ icon: Icon, title: cardTitle, copy }) => (
                <div
                  key={cardTitle}
                  className="rounded-[28px] border border-white/12 bg-white/8 p-5 backdrop-blur-sm"
                >
                  <div className="mb-3 inline-flex rounded-2xl border border-white/14 bg-white/10 p-2.5 text-sky-100">
                    <Icon size={18} />
                  </div>
                  <h2 className="text-base font-semibold text-white">
                    {cardTitle}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-white/66">
                    {copy}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-[30px] border border-white/12 bg-white/8 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-100/78">
                <span>Live AI Demo</span>
                <span>24/7</span>
              </div>

              <div className="mt-5 space-y-4">
                {liveDeskMessages.map((item) => (
                  <div
                    key={`${item.label}-${item.message}`}
                    className={`flex ${
                      item.align === "right" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-6 ${
                        item.align === "right"
                          ? "bg-white/10 text-white"
                          : "bg-sky-100/12 text-white/88"
                      }`}
                    >
                      <span className="mr-1 font-semibold text-white/74">
                        {item.label}:
                      </span>
                      {item.message}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-[20px] border border-white/10 bg-white/8 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/42">
                    Leads
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">128</p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/8 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/42">
                    Converted
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">42</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/12 bg-white/8 px-5 py-4 text-sm text-white/72 backdrop-blur-sm">
            Premium automation for Instagram-first businesses that want faster
            replies, cleaner lead pipelines, and a brand that feels bigger than
            its team size.
          </div>
        </aside>

        <div className="flex items-center justify-center">
          <div className="brand-auth-card w-full max-w-xl rounded-[32px] p-6 sm:p-8">
            <div className="mb-8 flex flex-col gap-4">
              <BrandLockup
                href="/"
                compact
                showTagline={false}
                className="lg:hidden"
              />

              <span className="brand-chip w-fit">Always-on AI sales desk</span>

              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  {title}
                </h2>
                <p className="max-w-lg text-sm leading-6 text-slate-500">
                  {subtitle}
                </p>
              </div>
            </div>

            <div className="space-y-6">{children}</div>

            {footer ? (
              <div className="mt-6 border-t border-slate-200/80 pt-5 text-sm text-slate-500">
                {footer}
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-between rounded-[24px] border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-xs text-slate-500">
              <span>Enterprise-grade Instagram automation and conversion ops.</span>
              <ArrowUpRight size={14} className="text-slate-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
