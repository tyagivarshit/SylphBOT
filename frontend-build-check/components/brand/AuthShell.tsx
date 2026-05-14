"use client";

import type { ReactNode } from "react";
import { Activity, ShieldCheck, Sparkles } from "lucide-react";

import BrandLockup from "./BrandLockup";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

const previewItems = [
  "Premium CRM, inbox, and automation shell",
  "Consistent enterprise-grade trust cues",
  "Mobile-safe product experience without horizontal scroll",
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
        <aside className="brand-auth-aside hidden overflow-hidden rounded-[32px] p-7 text-white lg:block">
          <div className="flex h-full flex-col justify-between gap-8">
            <div className="space-y-7">
              <BrandLockup href="/auth/login" theme="dark" />

              <div className="space-y-4">
                <span className="brand-chip brand-chip-dark">
                  <Sparkles size={14} />
                  Premium revenue workspace
                </span>

                <div>
                  <h2 className="max-w-lg text-4xl font-semibold tracking-tight text-white">
                    One branded operating system for leads, replies, and growth.
                  </h2>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-white/70">
                    Auth, CRM, inbox, and automation now speak the same
                    Automexia design language so the product feels as polished
                    as the marketing site.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {previewItems.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-[22px] border border-white/10 bg-white/8 px-4 py-3"
                  >
                    <span className="mt-0.5 rounded-2xl bg-white/10 p-2 text-sky-100">
                      <ShieldCheck size={15} />
                    </span>
                    <p className="text-sm leading-6 text-white/78">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/8 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/50">
                  Live desk
                </span>
                <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/78">
                  24/7
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="ml-auto max-w-[85%] rounded-[18px] bg-white/10 px-4 py-3 text-sm text-white/88">
                  Customer: Price kya hai?
                </div>
                <div className="max-w-[82%] rounded-[18px] bg-blue-500/18 px-4 py-3 text-sm text-white">
                  AI: Plans start from Rs 999/month with lead capture, CRM, and
                  automation included.
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[18px] bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
                    Leads
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">128</p>
                </div>
                <div className="rounded-[18px] bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
                    Activity
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-white">
                    <Activity size={16} />
                    Live
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex items-center justify-center lg:col-start-2">
          <div className="brand-auth-card w-full max-w-xl rounded-[32px] p-6 sm:p-8">
            <div className="space-y-6">
              <div className="lg:hidden">
                <BrandLockup href="/auth/login" compact showTagline={false} />
              </div>

              <div className="space-y-3">
                <span className="brand-eyebrow">Secure access</span>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.2rem]">
                    {title}
                  </h1>
                  <p className="mt-3 text-sm leading-7 text-slate-500">
                    {subtitle}
                  </p>
                </div>
              </div>

              <div className="space-y-5">{children}</div>

              {footer ? (
                <div className="border-t border-slate-200/80 pt-5 text-sm text-slate-500">
                  {footer}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
