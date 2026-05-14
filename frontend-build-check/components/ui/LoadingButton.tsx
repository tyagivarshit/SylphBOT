"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoadingSpinner } from "./feedback";

type LoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
};

export default function LoadingButton({
  loading = false,
  loadingLabel = "Working...",
  children,
  disabled,
  className,
  type = "button",
  ...props
}: LoadingButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      className={className}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {loading ? <LoadingSpinner className="h-4 w-4" /> : null}
        <span>{loading ? loadingLabel : children}</span>
      </span>
    </button>
  );
}
