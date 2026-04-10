"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

type BrandLockupProps = {
  href?: Route;
  compact?: boolean;
  showTagline?: boolean;
  theme?: "light" | "dark";
  className?: string;
};

const brandLogoSrc = "/logo.png";

export default function BrandLockup({
  href = "/dashboard",
  compact = false,
  showTagline = true,
  theme = "light",
  className = "",
}: BrandLockupProps) {
  const dark = theme === "dark";
  const titleClass = dark ? "text-white" : "text-slate-950";
  const eyebrowClass = dark ? "text-white/58" : "text-slate-500";
  const taglineClass = dark ? "text-white/72" : "text-slate-500";
  const badgeClass = dark
    ? "border-white/12 bg-white/8 text-white/86"
    : "border-slate-200 bg-slate-100/90 text-slate-700";

  return (
    <Link href={href} className={`flex min-w-0 items-center gap-3 ${className}`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-white/16 bg-white/90 shadow-[0_16px_30px_rgba(8,18,35,0.24)]">
              <img
                src={brandLogoSrc}
                alt="Automexia AI"
                className="h-full w-full object-cover"
              />
            </span>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-2">
          <p className={`truncate text-2xl font-semibold tracking-tight ${titleClass}`}>
            Automexia AI
          </p>
        </div>

        {!compact && showTagline ? (
          <p className={`mt-1 max-w-xs text-sm leading-6 ${taglineClass}`}>
            Enterprise-grade Instagram automation and lead conversion.
          </p>
        ) : null}
      </div>
    </Link>
  );
}
