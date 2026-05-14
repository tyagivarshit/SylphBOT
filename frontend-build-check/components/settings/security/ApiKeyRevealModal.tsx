"use client";

import { Copy, KeyRound, ShieldAlert } from "lucide-react";
import type { ApiKeySecret } from "@/lib/security";
import {
  copyText,
  formatDateTime,
  formatKeyName,
} from "./securityUtils";

type ApiKeyRevealModalProps = {
  apiKey: ApiKeySecret | null;
  mode: "created" | "rotated";
  onClose: () => void;
};

export default function ApiKeyRevealModal({
  apiKey,
  mode,
  onClose,
}: ApiKeyRevealModalProps) {
  if (!apiKey) {
    return null;
  }

  const title =
    mode === "created" ? "API key created" : "API key rotated";
  const description =
    mode === "created"
      ? "Store this credential in your secure secret manager before closing this dialog."
      : "The previous credential has been revoked. Replace it anywhere this key is used.";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="brand-panel-strong w-full max-w-2xl rounded-[30px] p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)]">
            <KeyRound size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
              Secret reveal
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              {title}
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-slate-200/90 bg-slate-950 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Full API key
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {formatKeyName(apiKey.name)} · Created {formatDateTime(apiKey.createdAt)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => copyText(apiKey.rawKey, "API key copied")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/14 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              <Copy size={16} />
              Copy key
            </button>
          </div>

          <pre className="mt-4 overflow-x-auto rounded-[20px] border border-white/10 bg-white/6 px-4 py-4 font-mono text-sm leading-6 text-white whitespace-pre-wrap break-all">
            {apiKey.rawKey}
          </pre>
        </div>

        <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <div className="flex items-start gap-3">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">This will not be shown again.</p>
              <p className="mt-1 leading-6">
                Save the key now. Only a masked version will remain visible in
                the security panel after you close this modal.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="brand-button-primary"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
