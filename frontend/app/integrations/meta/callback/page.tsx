"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, apiFetch } from "@/lib/apiClient";
import { buildAppUrl, fetchClientConnectionStatus } from "@/lib/userApi";

type PairOption = {
  facebookPageId: string;
  facebookPageName?: string | null;
  instagramProfessionalAccountId: string;
  instagramUsername?: string | null;
  instagramName?: string | null;
  instagramAccountType?: string | null;
};

type ActionableFailure = {
  reasonCode: string;
  problem: string;
  cause: string;
  fix: string;
  cta: {
    label: string;
    action: string;
  };
  helpLink: string;
  missingPermission?: string | null;
  retryAfterSeconds?: number | null;
};

type ConnectDoctorReport = {
  doctorStatus?: string;
  reports?: Array<{
    provider?: string;
    diagnostics?: Array<{
      code?: string;
      message?: string;
      fixAction?: string;
    }>;
  }>;
};

type FailurePayload = {
  stage: string;
  reason: string;
  code: string;
  actionable: ActionableFailure;
  connectDoctor?: ConnectDoctorReport | null;
  requiresPairSelection?: boolean;
  validPairs?: PairOption[];
};

const buildSettingsRedirect = (params: Record<string, string>) => {
  const url = new URL(buildAppUrl("/settings"));

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  return `${url.pathname}${url.search}`;
};

const buildFallbackFailure = (
  reason: string,
  stage = "IG_CONNECT_FAILED",
  code = "UNKNOWN"
): FailurePayload => ({
  stage,
  reason,
  code,
  actionable: {
    reasonCode: "UNKNOWN",
    problem: "Instagram connection failed.",
    cause: reason,
    fix: "Retry connection and review diagnostics.",
    cta: {
      label: "Retry",
      action: "RETRY",
    },
    helpLink: "https://www.facebook.com/business/help",
  },
  connectDoctor: null,
  requiresPairSelection: false,
  validPairs: [],
});

const buildProviderDeniedFailure = (input: {
  stage: string;
  reason: string;
  errorCode: string;
}): FailurePayload => ({
  stage: input.stage,
  reason: input.reason,
  code: input.errorCode,
  actionable: {
    reasonCode: "MISSING_PERMISSION",
    problem: "Meta permissions were not granted.",
    cause: input.reason,
    fix: "Reconnect and approve all requested Meta permissions.",
    cta: {
      label: "Reconnect with Permissions",
      action: "RECONNECT",
    },
    helpLink: "https://developers.facebook.com/docs/permissions/reference",
  },
  connectDoctor: null,
  requiresPairSelection: false,
  validPairs: [],
});

const readString = (value: unknown) => {
  const normalized = String(value || "").trim();
  return normalized;
};

const readFailurePayload = (input: unknown): FailurePayload => {
  const root = input && typeof input === "object" ? (input as any) : {};
  const data =
    root.data && typeof root.data === "object" ? (root.data as any) : {};
  const actionable =
    data.actionable && typeof data.actionable === "object"
      ? (data.actionable as ActionableFailure)
      : null;
  const fallback = buildFallbackFailure(
    readString(data.reason || root.message || "Instagram connect failed")
  );

  return {
    stage: readString(data.stage || "IG_CONNECT_FAILED"),
    reason: readString(data.reason || root.message || "Instagram connect failed"),
    code: readString(data.code || root.code || "UNKNOWN"),
    actionable: actionable || fallback.actionable,
    connectDoctor: data.connectDoctor || null,
    requiresPairSelection: Boolean(data.requiresPairSelection),
    validPairs: Array.isArray(data.validPairs) ? (data.validPairs as PairOption[]) : [],
  };
};

function MetaCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectStartedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<FailurePayload | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedPairKey, setSelectedPairKey] = useState<string>("");

  useEffect(() => {
    if (connectStartedRef.current) {
      return;
    }

    connectStartedRef.current = true;

    const code = searchParams.get("code") || "";
    const state = searchParams.get("state") || "";
    const platform = (searchParams.get("platform") || "").toLowerCase();
    const providerError = readString(searchParams.get("error"));
    const providerReason = readString(
      searchParams.get("error_reason") || searchParams.get("reason")
    );
    const providerDescription = readString(searchParams.get("error_description"));
    const failureStage = readString(searchParams.get("stage") || "IG_CALLBACK_RECEIVED");
    const callbackMode = readString(searchParams.get("mode") || "connect");

    if (providerError || providerReason) {
      setFailure(
        buildProviderDeniedFailure({
          stage: failureStage,
          reason:
            providerDescription ||
            providerReason ||
            providerError ||
            "Meta permissions were denied during connect.",
          errorCode: "MISSING_PERMISSION",
        })
      );
      setLoading(false);
      return;
    }

    if (!code || !state) {
      setFailure(
        buildFallbackFailure(
          "OAuth callback payload is missing required parameters.",
          failureStage || "IG_CALLBACK_RECEIVED",
          "OAUTH_CALLBACK_PAYLOAD_MISSING"
        )
      );
      setLoading(false);
      return;
    }

    const connect = async () => {
      try {
        const response = await apiClient.request({
          url: "/api/clients/oauth/meta",
          method: "POST",
          data: {
            code,
            state,
          },
          validateStatus: () => true,
        });
        const payload = response?.data;
        const status = Number(response?.status || 500);

        if (status < 200 || status >= 300 || payload?.success === false) {
          const resolvedFailure = readFailurePayload(payload);
          setFailure(resolvedFailure);
          setSelectedPairKey(
            resolvedFailure.validPairs?.length
              ? `${resolvedFailure.validPairs[0].facebookPageId}:${resolvedFailure.validPairs[0].instagramProfessionalAccountId}`
              : ""
          );
          setLoading(false);
          return;
        }

        await fetchClientConnectionStatus().catch(() => null);

        const connectedPlatform =
          platform || readString(payload?.platform || "").toLowerCase();

        router.replace(
          buildSettingsRedirect({
            integration: "success",
            platform: connectedPlatform,
            mode: callbackMode,
          }) as Route
        );
      } catch {
        setFailure(
          buildFallbackFailure(
            "Network failure while finalizing Instagram connect.",
            "IG_CONNECT_FAILED",
            "NETWORK_FAILURE"
          )
        );
        setLoading(false);
      }
    };

    void connect();
  }, [router, searchParams]);

  const doctorDiagnostics = useMemo(() => {
    if (!failure?.connectDoctor?.reports?.length) {
      return [];
    }

    const instagramReport = failure.connectDoctor.reports.find(
      (report) => String(report.provider || "").toUpperCase() === "INSTAGRAM"
    );

    return Array.isArray(instagramReport?.diagnostics)
      ? instagramReport.diagnostics
      : [];
  }, [failure]);

  const startReconnect = async (pair?: PairOption) => {
    const query = new URLSearchParams({
      platform: "instagram",
      mode: "reconnect",
    });

    if (pair) {
      query.set("facebookPageId", pair.facebookPageId);
      query.set("instagramAccountId", pair.instagramProfessionalAccountId);
    }

    const response = await apiFetch<{
      url?: string;
    }>(`/api/clients/oauth/meta?${query.toString()}`, {
      method: "GET",
    });

    if (!response.success || !response.data?.url) {
      throw new Error(response.message || "Unable to start reconnect flow");
    }

    window.location.assign(response.data.url);
  };

  const runAutoRepair = async () => {
    await apiFetch("/api/integrations/connect-hub/connect/meta/doctor", {
      method: "POST",
      body: JSON.stringify({
        provider: "INSTAGRAM",
        environment: "LIVE",
        autoResolve: true,
      }),
    });
  };

  const handlePrimaryAction = async () => {
    if (!failure) {
      return;
    }

    setActionBusy(true);
    try {
      const action = String(failure.actionable?.cta?.action || "").toUpperCase();

      if (action === "UPGRADE_PLAN") {
        router.replace("/billing" as Route);
        return;
      }

      if (action === "OPEN_GUIDE") {
        window.open(failure.actionable.helpLink, "_blank", "noopener,noreferrer");
        return;
      }

      if (action === "REPAIR_WEBHOOK") {
        await runAutoRepair();
        await startReconnect();
        return;
      }

      if (action === "SELECT_PAIR") {
        const pair = failure.validPairs?.find(
          (item) =>
            `${item.facebookPageId}:${item.instagramProfessionalAccountId}` ===
            selectedPairKey
        );
        if (!pair) {
          throw new Error("Select a Facebook Page and Instagram pair to continue.");
        }
        await startReconnect(pair);
        return;
      }

      await startReconnect();
    } catch (error: any) {
      const reason =
        String(error?.message || "Action failed. Please retry.").trim() ||
        "Action failed. Please retry.";
      setFailure((current) =>
        current
          ? {
              ...current,
              reason,
              actionable: {
                ...current.actionable,
                cause: reason,
              },
            }
          : current
      );
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-700">
        Finalizing integration connection...
      </div>
    );
  }

  if (!failure) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-700">
        Finalizing integration connection...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Instagram Connect Needs Action</h1>
        <p className="mt-2 text-sm text-slate-600">Problem: {failure.actionable.problem}</p>
        <p className="mt-2 text-sm text-slate-700">Cause: {failure.actionable.cause}</p>
        <p className="mt-2 text-sm text-slate-700">How to fix: {failure.actionable.fix}</p>
        <p className="mt-2 text-xs text-slate-500">
          Reason code: {failure.actionable.reasonCode} | Stage: {failure.stage}
        </p>

        {failure.requiresPairSelection && failure.validPairs?.length ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">
              Select Facebook Page and Instagram Professional Account
            </p>
            <div className="mt-3 space-y-2">
              {failure.validPairs.map((pair) => {
                const value = `${pair.facebookPageId}:${pair.instagramProfessionalAccountId}`;
                return (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm"
                  >
                    <input
                      type="radio"
                      name="pair"
                      value={value}
                      checked={selectedPairKey === value}
                      onChange={(event) => setSelectedPairKey(event.target.value)}
                    />
                    <span className="text-slate-700">
                      {pair.facebookPageName || pair.facebookPageId} <-> @
                      {pair.instagramUsername || pair.instagramProfessionalAccountId} (
                      {pair.instagramAccountType || "UNKNOWN"})
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {doctorDiagnostics.length ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">Connect Doctor Findings</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
              {doctorDiagnostics.slice(0, 5).map((diagnostic, index) => (
                <li key={`${diagnostic.code || "diag"}-${index}`}>
                  {diagnostic.code || "ISSUE"}: {diagnostic.message || "No diagnostic message"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={handlePrimaryAction}
            disabled={actionBusy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {actionBusy ? "Working..." : failure.actionable.cta.label}
          </button>
          <button
            onClick={() => window.open(failure.actionable.helpLink, "_blank", "noopener,noreferrer")}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Open Guide
          </button>
          <button
            onClick={() => router.replace(buildSettingsRedirect({ integration: "error" }) as Route)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Back to Settings
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MetaCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-sm text-slate-600">
          Finalizing integration connection...
        </div>
      }
    >
      <MetaCallbackContent />
    </Suspense>
  );
}

