"use client";

import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";

type BrandLockupProps = {
  href?: Route;
  className?: string;
  compact?: boolean;
  theme?: "light" | "dark";
  showTagline?: boolean;
  showBadge?: boolean;
};

const LOGO_SRC = "/logo.png";

export default function BrandLockup({
  href = "/",
  className = "",
  compact = false,
  theme = "light",
  showTagline = true,
  showBadge = true,
}: BrandLockupProps) {
  const isDark = theme === "dark";

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-3 ${className}`}
      aria-label="Automexia AI"
    >
      <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#0b2a5b_0%,#1e5eff_50%,#7dd3fc_100%)] shadow-[0_18px_36px_rgba(30,94,255,0.22)] ring-1 ring-white/70">
        <div className="absolute inset-[1px] rounded-[15px] bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.72),transparent_40%),linear-gradient(160deg,rgba(255,255,255,0.12),rgba(11,42,91,0.12))]" />
        <div className="relative size-10 scale-[2.35]">
          <Image
            src={LOGO_SRC}
            alt=""
            fill
            sizes="40px"
            className="object-contain"
            priority={compact}
          />
        </div>
      </div>

      <div className="min-w-0">
        <p
          className={`text-[0.68rem] font-semibold uppercase tracking-[0.32em] ${
            isDark ? "text-white/55" : "text-slate-500"
          }`}
        >
          Automexia
        </p>

        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`truncate font-semibold tracking-tight ${
              compact ? "text-base" : "text-lg"
            } ${isDark ? "text-white" : "text-slate-950"}`}
          >
            Automexia AI
          </span>

          {showBadge ? (
            <span
              className={`hidden rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] md:inline-flex ${
                isDark
                  ? "border-white/16 bg-white/10 text-sky-100"
                  : "border-sky-200 bg-sky-50 text-sky-700"
              }`}
            >
              Lead OS
            </span>
          ) : null}
        </div>

        {showTagline && !compact ? (
          <p
            className={`text-xs ${
              isDark ? "text-white/64" : "text-slate-500"
            }`}
          >
            Enterprise-grade Instagram automation and lead conversion.
          </p>
        ) : null}
      </div>
    </Link>
  );
}
