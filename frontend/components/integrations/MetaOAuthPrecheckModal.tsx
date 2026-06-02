"use client";

import { useState } from "react";
import { Check, ExternalLink, Facebook, X } from "lucide-react";

export type MetaOAuthPlatform = "instagram" | "whatsapp";

const STORAGE_PREFIX = "sylph-meta-oauth-precheck-dismissed";

const platformContent: Record<
  MetaOAuthPlatform,
  {
    eyebrow: string;
    title: string;
    description: string;
    checks: string[];
    learnMore: string;
  }
> = {
  instagram: {
    eyebrow: "Instagram setup",
    title: "Ready to connect Instagram?",
    description:
      "Meta will open next so you can approve access for Instagram messaging.",
    checks: [
      "Facebook login required",
      "Instagram Professional account required",
      "Instagram must be linked to a Facebook Page",
      "Admin access to the Facebook Page required",
      "Permissions will be requested by Meta",
    ],
    learnMore:
      "You can continue even if you need to confirm these inside Meta.",
  },
  whatsapp: {
    eyebrow: "WhatsApp setup",
    title: "Ready to connect WhatsApp?",
    description:
      "Meta Embedded Signup will open next so you can authorize your business account.",
    checks: [
      "Meta/Facebook login required",
      "Business Manager access required",
      "WhatsApp Business Account (WABA) required",
      "Phone number must not already be connected elsewhere",
      "Permissions will be requested by Meta",
    ],
    learnMore:
      "You can continue and complete any missing setup steps in Meta.",
  },
};

export const getMetaOAuthPrecheckDismissed = (platform: MetaOAuthPlatform) => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}:${platform}`) === "true";
  } catch {
    return false;
  }
};

type MetaOAuthPrecheckModalProps = {
  platform: MetaOAuthPlatform | null;
  loading?: boolean;
  onClose: () => void;
  onContinue: (options: { dontShowAgain: boolean }) => void;
};

export default function MetaOAuthPrecheckModal({
  platform,
  loading = false,
  onClose,
  onContinue,
}: MetaOAuthPrecheckModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!platform) {
    return null;
  }

  const content = platformContent[platform];

  const handleContinue = () => {
    if (dontShowAgain && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(`${STORAGE_PREFIX}:${platform}`, "true");
      } catch {
        // Storage preferences are best-effort and should never block OAuth.
      }
    }

    onContinue({ dontShowAgain });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-slate-950 text-white shadow-[0_14px_32px_rgba(15,23,42,0.20)]">
              <Facebook size={21} />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
                {content.eyebrow}
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                {content.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {content.description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close Meta pre-check"
            className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">
                Quick pre-check
              </p>
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Meta
              </span>
            </div>

            <ul className="mt-4 space-y-3">
              {content.checks.map((check) => (
                <li key={check} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                    <Check size={14} />
                  </span>
                  <span className="leading-6">{check}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 rounded-[20px] border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-slate-600">
            <span className="font-semibold text-slate-800">Learn more:</span>{" "}
            {content.learnMore}
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Do not show this again for {platform === "instagram" ? "Instagram" : "WhatsApp"}
          </label>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="brand-button-secondary w-full sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={loading}
            className="brand-button-primary w-full sm:w-auto"
          >
            {loading ? "Opening Meta..." : "Continue with Meta"}
            <ExternalLink size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
