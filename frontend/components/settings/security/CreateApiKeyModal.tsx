"use client";

import { useMemo, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import type { ApiKeyScope, CreateApiKeyInput } from "@/lib/security";
import { notify } from "@/lib/toast";
import LoadingButton from "@/components/ui/LoadingButton";
import { API_KEY_SCOPE_OPTIONS } from "./securityUtils";

type CreateApiKeyModalProps = {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onCreate: (input: CreateApiKeyInput) => Promise<void>;
};

const DEFAULT_SCOPES: ApiKeyScope[] = ["READ_ONLY"];

export default function CreateApiKeyModal({
  open,
  loading,
  onClose,
  onCreate,
}: CreateApiKeyModalProps) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(DEFAULT_SCOPES);

  const selectedScopeDescriptions = useMemo(
    () =>
      API_KEY_SCOPE_OPTIONS.filter((option) => scopes.includes(option.value))
        .map((option) => option.label)
        .join(", "),
    [scopes]
  );

  if (!open) {
    return null;
  }

  const handleClose = () => {
    setName("");
    setScopes(DEFAULT_SCOPES);
    onClose();
  };

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((currentScopes) => {
      if (currentScopes.includes(scope)) {
        return currentScopes.filter((value) => value !== scope);
      }

      return [...currentScopes, scope];
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      notify.error("Enter a name for this API key");
      return;
    }

    if (!scopes.length) {
      notify.error("Select at least one scope");
      return;
    }

    await onCreate({
      name: name.trim(),
      scopes,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="brand-panel-strong w-full max-w-2xl rounded-[30px] p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)]">
            <KeyRound size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
              New credential
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Create API key
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Issue a workspace-scoped credential with the minimum access your
              integration needs.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5">
          <div>
            <label
              htmlFor="security-api-key-name"
              className="brand-field-label"
            >
              Key name
            </label>
            <input
              id="security-api-key-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Example: Production webhook bridge"
              className="mt-2 w-full rounded-[18px] border border-slate-200 px-4 py-3 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="brand-field-label">Scopes</label>
              <span className="text-xs text-slate-500">
                {selectedScopeDescriptions || "Select access"}
              </span>
            </div>

            <div className="mt-3 grid gap-3">
              {API_KEY_SCOPE_OPTIONS.map((option) => {
                const active = scopes.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleScope(option.value)}
                    className={`rounded-[20px] border px-4 py-4 text-left transition ${
                      active
                        ? "border-blue-200 bg-blue-50/80 shadow-[0_14px_34px_rgba(30,94,255,0.08)]"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {option.label}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          {option.description}
                        </p>
                      </div>

                      <span
                        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                          active
                            ? "border-blue-200 bg-white text-blue-700"
                            : "border-slate-200 bg-slate-100 text-slate-400"
                        }`}
                      >
                        {active ? "On" : "Off"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  Security guidance
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Use read-only access wherever possible, and rotate long-lived
                  credentials on a regular schedule.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="brand-button-secondary"
          >
            Cancel
          </button>
          <LoadingButton
            type="button"
            loading={loading}
            loadingLabel="Creating..."
            onClick={handleSubmit}
            className="brand-button-primary"
          >
            Create key
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
