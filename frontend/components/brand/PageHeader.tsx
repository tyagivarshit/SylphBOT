"use client";

import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  chip?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export default function PageHeader({
  eyebrow,
  title,
  description,
  chip,
  action,
  className = "",
}: PageHeaderProps) {
  return (
    <section className={`brand-header-card rounded-[28px] p-5 sm:p-6 ${className}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="brand-eyebrow">{eyebrow}</span>
            {chip}
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {title}
            </h1>

            {description ? (
              <p className="max-w-3xl text-sm leading-6 text-slate-500 sm:text-[0.95rem]">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {action ? (
          <div className="flex flex-wrap items-center gap-3">{action}</div>
        ) : null}
      </div>
    </section>
  );
}
