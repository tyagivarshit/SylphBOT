"use client";

import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  chip?: ReactNode;
  action?: ReactNode;
};

export default function PageHeader({
  eyebrow,
  title,
  description,
  chip,
  action,
}: PageHeaderProps) {
  return (
    <div className="brand-header-card rounded-[30px] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {eyebrow ? <span className="brand-eyebrow">{eyebrow}</span> : null}
            {chip}
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {action ? <div className="w-full lg:w-auto">{action}</div> : null}
      </div>
    </div>
  );
}
