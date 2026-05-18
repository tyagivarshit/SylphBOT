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

type WhatsAppPhoneOption = {
  phoneNumberId: string;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  businessManagerId?: string | null;
  businessManagerName?: string | null;
  wabaId?: string | null;
  wabaName?: string | null;
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
  platform: "instagram" | "whatsapp";
  stage: string;
  reason: string;
  code: string;
  actionable: ActionableFailure;
  connectDoctor?: ConnectDoctorReport | null;
  requiresPairSelection?: boolean;
  validPairs?: PairOption[];
  requiresPhoneSelection?: boolean;
  availablePhoneNumbers?: WhatsAppPhoneOption[];
};

type LifecycleStatus = "PROCESSING" | "NEEDS_ACTION" | "FAILED" | "COMPLETED";

type LifecyclePayload = {
  operationId?: string | null;
  replayToken?: string | null;
  platform?: string | null;
  mode?: string | null;
  status?: LifecycleStatus | string | null;
  connectionState?:
    | "PROCESSING"
    | "CONNECTED_PENDING"
    | "ACTION_REQUIRED"
    | "READY_MINIMAL"
    | string
    | null;
  stage?: string | null;
  statusDetail?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  resolutionHint?: string | null;
  actionable?: ActionableFailure | null;
  requiresPairSelection?: boolean;
  requiresPhoneSelection?: boolean;
  validPairs?: PairOption[];
  availablePhoneNumbers?: WhatsAppPhoneOption[];
  clients?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown> | null;
};

const normalizeLifecycleStatus = (value: unknown): LifecycleStatus => {
  const normalized = readString(value).toUpperCase();
  if (normalized === "COMPLETED") {
    return "COMPLETED";
  }
  if (normalized === "NEEDS_ACTION") {
    return "NEEDS_ACTION";
  }
  if (normalized === "FAILED") {
    return "FAILED";
  }
  return "PROCESSING";
};

const toLifecyclePayload = (value: unknown): LifecyclePayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as LifecyclePayload;
};

const lifecycleStageLabel = (stage?: string | null) => {
  const normalized = readString(stage).toUpperCase();
  if (!normalized) {
    return "Preparing onboarding lifecycle";
  }
  if (normalized === "OAUTH_AUTHENTICATED") {
    return "OAuth authenticated";
  }
  if (normalized === "META_ACCOUNT_CONNECTED") {
    return "Meta account connected";
  }
  if (normalized === "PAIR_SELECTION") {
    return "Pair selection required";
  }
  if (normalized === "PHONE_SELECTION") {
    return "Phone selection required";
  }
  if (normalized === "TOKEN_PERSISTENCE") {
    return "Persisting integration token";
  }
  if (normalized === "WEBHOOK_ACTIVATION") {
    return "Activating webhook";
  }
  if (normalized === "CONNECTION_VERIFICATION") {
    return "Verifying connection";
  }
  if (normalized === "FINAL_ONBOARDING") {
    return "Final onboarding in progress";
  }
  if (normalized === "COMPLETED") {
    return "Completed";
  }
  return normalized.replaceAll("_", " ").toLowerCase();
};

const resolveOnboardingPhase = (lifecycle?: LifecyclePayload | null) => {
  const status = normalizeLifecycleStatus(lifecycle?.status);
  const connectionState = readString(lifecycle?.connectionState).toUpperCase();
  const stage = readString(lifecycle?.stage).toUpperCase();

  if (status === "COMPLETED" || connectionState === "READY_MINIMAL") {
    return "ACTIVE";
  }

  if (
    status === "NEEDS_ACTION" ||
    status === "FAILED" ||
    connectionState === "ACTION_REQUIRED"
  ) {
    return "ACTION_REQUIRED";
  }

  if (stage === "OAUTH_AUTHENTICATED") {
    return "CONNECTING";
  }

  if (stage === "META_ACCOUNT_CONNECTED" || connectionState === "CONNECTED_PENDING") {
    return "VERIFYING";
  }

  if (stage === "WEBHOOK_ACTIVATION") {
    return "ACTIVATING";
  }

  return "PROCESSING";
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
  code = "UNKNOWN",
  platform: "instagram" | "whatsapp" = "instagram"
): FailurePayload => ({
  platform,
  stage,
  reason,
  code,
  actionable: {
    reasonCode: "UNKNOWN",
    problem: "Meta connection failed.",
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
  requiresPhoneSelection: false,
  availablePhoneNumbers: [],
});

const buildProviderDeniedFailure = (input: {
  platform: "instagram" | "whatsapp";
  stage: string;
  reason: string;
  errorCode: string;
}): FailurePayload => ({
  platform: input.platform,
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
  requiresPhoneSelection: false,
  availablePhoneNumbers: [],
});

const readString = (value: unknown) => {
  const normalized = String(value || "").trim();
  return normalized;
};

const readFailurePayload = (input: unknown): FailurePayload => {
  const root =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const dataCandidate = root.data;
  const data =
    dataCandidate && typeof dataCandidate === "object"
      ? (dataCandidate as Record<string, unknown>)
      : {};
  const platformValue = readString(data.platform || root.platform).toLowerCase();
  const platform: "instagram" | "whatsapp" =
    platformValue === "whatsapp" ? "whatsapp" : "instagram";
  const actionableCandidate = data.actionable;
  const actionable =
    actionableCandidate && typeof actionableCandidate === "object"
      ? (actionableCandidate as ActionableFailure)
      : null;
  const fallback = buildFallbackFailure(
    readString(data.reason || root.message || "Meta connect failed"),
    "IG_CONNECT_FAILED",
    "UNKNOWN",
    platform
  );

  return {
    platform,
    stage: readString(data.stage || "IG_CONNECT_FAILED"),
    reason: readString(data.reason || root.message || "Meta connect failed"),
    code: readString(data.code || root.code || "UNKNOWN"),
    actionable: actionable || fallback.actionable,
    connectDoctor: data.connectDoctor || null,
    requiresPairSelection: Boolean(data.requiresPairSelection),
    validPairs: Array.isArray(data.validPairs) ? (data.validPairs as PairOption[]) : [],
    requiresPhoneSelection: Boolean(data.requiresPhoneSelection),
    availablePhoneNumbers: Array.isArray(data.availablePhoneNumbers)
      ? (data.availablePhoneNumbers as WhatsAppPhoneOption[])
      : [],
  };
};

const failureFromLifecycle = (
  lifecycleInput: LifecyclePayload,
  fallbackPlatform: "instagram" | "whatsapp"
): FailurePayload => {
  const lifecycle = lifecycleInput || {};
  const metadata =
    lifecycle.metadata && typeof lifecycle.metadata === "object"
      ? (lifecycle.metadata as Record<string, unknown>)
      : {};
  const platformValue = readString(
    lifecycle.platform || metadata.platform || fallbackPlatform
  ).toLowerCase();
  const platform: "instagram" | "whatsapp" =
    platformValue === "whatsapp" ? "whatsapp" : "instagram";
  const actionableCandidate =
    lifecycle.actionable ||
    (metadata.actionable &&
    typeof metadata.actionable === "object"
      ? (metadata.actionable as ActionableFailure)
      : null);
  const reason =
    readString(lifecycle.errorMessage || lifecycle.statusDetail) ||
    "Meta connect requires attention.";
  const code = readString(lifecycle.errorCode || metadata.code || "UNKNOWN");
  const fallback = buildFallbackFailure(
    reason,
    readString(lifecycle.stage || "IG_CONNECT_FAILED"),
    code || "UNKNOWN",
    platform
  );
  const validPairs = Array.isArray(lifecycle.validPairs)
    ? lifecycle.validPairs
    : Array.isArray(metadata.validPairs)
      ? (metadata.validPairs as PairOption[])
      : [];
  const availablePhoneNumbers = Array.isArray(lifecycle.availablePhoneNumbers)
    ? lifecycle.availablePhoneNumbers
    : Array.isArray(metadata.availablePhoneNumbers)
      ? (metadata.availablePhoneNumbers as WhatsAppPhoneOption[])
      : [];

  return {
    platform,
    stage: readString(lifecycle.stage || "IG_CONNECT_FAILED"),
    reason,
    code: code || "UNKNOWN",
    actionable: actionableCandidate || fallback.actionable,
    connectDoctor:
      lifecycleInput.metadata &&
      typeof lifecycleInput.metadata === "object" &&
      (lifecycleInput.metadata as Record<string, unknown>).connectDoctor
        ? ((lifecycleInput.metadata as Record<string, unknown>)
            .connectDoctor as ConnectDoctorReport)
        : null,
    requiresPairSelection:
      Boolean(lifecycle.requiresPairSelection) || validPairs.length > 0,
    validPairs,
    requiresPhoneSelection:
      Boolean(lifecycle.requiresPhoneSelection) || availablePhoneNumbers.length > 0,
    availablePhoneNumbers,
  };
};

function MetaCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectStartedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<FailurePayload | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecyclePayload | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedPairKey, setSelectedPairKey] = useState<string>("");
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string>("");

  useEffect(() => {
    if (connectStartedRef.current) {
      return;
    }

    connectStartedRef.current = true;
    let cancelled = false;

    const code = searchParams.get("code") || "";
    const state = searchParams.get("state") || "";
    const platformParam = (searchParams.get("platform") || "").toLowerCase();
    const platform: "instagram" | "whatsapp" =
      platformParam === "whatsapp" ? "whatsapp" : "instagram";
    const providerError = readString(searchParams.get("error"));
    const providerReason = readString(
      searchParams.get("error_reason") || searchParams.get("reason")
    );
    const providerDescription = readString(searchParams.get("error_description"));
    const failureStage = readString(searchParams.get("stage") || "IG_CALLBACK_RECEIVED");
    const callbackMode = readString(searchParams.get("mode") || "connect");

    const applyFailure = (nextFailure: FailurePayload) => {
      setFailure(nextFailure);
      setSelectedPairKey(
        nextFailure.validPairs?.length
          ? `${nextFailure.validPairs[0].facebookPageId}:${nextFailure.validPairs[0].instagramProfessionalAccountId}`
          : ""
      );
      setSelectedPhoneNumberId(
        nextFailure.availablePhoneNumbers?.length
          ? nextFailure.availablePhoneNumbers[0].phoneNumberId
          : ""
      );
      setLoading(false);
    };

    const pollLifecycle = async (operationId?: string | null) => {
      const maxAttempts = 120;
      const pollOnboardingProjection = async () => {
        const projectionResponse = await apiFetch<{
          integrationProjection?: {
            processingState?: string | null;
            verificationState?: string | null;
            stale?: boolean;
            degradedRuntime?: {
              deferred?: boolean;
              queueUnavailable?: boolean;
              reason?: string | null;
              retryAttempt?: number | null;
            } | null;
          } | null;
        }>("/api/integrations/onboarding", {
          method: "GET",
          timeoutMs: 7000,
        });

        if (!projectionResponse.success || !projectionResponse.data) {
          return;
        }

        const projectionState = readString(
          projectionResponse.data.integrationProjection?.processingState
        );
        if (!projectionState) {
          return;
        }

        setLifecycle((current) => {
          if (!current) {
            return current;
          }

          const degradedRuntime =
            projectionResponse.data.integrationProjection?.degradedRuntime || null;
          const deferredLabel =
            degradedRuntime?.deferred || degradedRuntime?.queueUnavailable
              ? ` (deferred recovery${degradedRuntime.retryAttempt ? ` #${degradedRuntime.retryAttempt}` : ""})`
              : "";
          const detail = `Projection: ${projectionState
            .replaceAll("_", " ")
            .toLowerCase()}${deferredLabel}`;
          if (readString(current.statusDetail) === detail) {
            return current;
          }

          return {
            ...current,
            statusDetail: detail,
          };
        });
      };

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (cancelled) {
          return false;
        }

        const query = new URLSearchParams({
          platform: platform.toUpperCase(),
        });
        if (state) {
          query.set("state", state);
        }
        if (operationId) {
          query.set("operationId", operationId);
        }

        const lifecycleResponse = await apiFetch<LifecyclePayload>(
          `/api/clients/oauth/meta/lifecycle?${query.toString()}`,
          {
            method: "GET",
            timeoutMs: 12000,
          }
        );

        const snapshot = lifecycleResponse.success
          ? toLifecyclePayload(lifecycleResponse.data)
          : null;

        if (snapshot) {
          setLifecycle(snapshot);
          const lifecycleStatus = normalizeLifecycleStatus(snapshot.status);

          if (lifecycleStatus === "COMPLETED") {
            await fetchClientConnectionStatus().catch(() => null);
            router.replace(
              buildSettingsRedirect({
                integration: "success",
                platform,
                mode: callbackMode,
              }) as Route
            );
            return true;
          }

          if (lifecycleStatus === "FAILED" || lifecycleStatus === "NEEDS_ACTION") {
            applyFailure(failureFromLifecycle(snapshot, platform));
            return true;
          }
        }

        if (attempt === 0 || attempt % 4 === 0) {
          await pollOnboardingProjection().catch(() => undefined);
        }

        await new Promise((resolve) => {
          setTimeout(resolve, 1500);
        });
      }

      return false;
    };

    if (providerError || providerReason) {
      applyFailure(
        buildProviderDeniedFailure({
          platform,
          stage: failureStage,
          reason:
            providerDescription ||
            providerReason ||
            providerError ||
            "Meta permissions were denied during connect.",
          errorCode: "MISSING_PERMISSION",
        })
      );
      return;
    }

    if (!code || !state) {
      applyFailure(
        buildFallbackFailure(
          "OAuth callback payload is missing required parameters.",
          failureStage || "IG_CALLBACK_RECEIVED",
          "OAUTH_CALLBACK_PAYLOAD_MISSING",
          platform
        )
      );
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
          timeout: 9000,
          validateStatus: () => true,
        });
        const payload = response?.data;
        const status = Number(response?.status || 500);

        if (status === 408 || status === 504) {
          setLifecycle({
            status: "PROCESSING",
            stage: "FINAL_ONBOARDING",
            statusDetail: "Request timed out. Reconciling lifecycle state...",
          });
          const recovered = await pollLifecycle(null);
          if (!recovered && !cancelled) {
            applyFailure(
              buildFallbackFailure(
                "Meta connect is still processing. Retry in a moment.",
                "FINAL_ONBOARDING",
                "ONBOARDING_PROCESSING",
                platform
              )
            );
          }
          return;
        }

        if (status < 200 || status >= 300 || payload?.success === false) {
          const resolvedFailure = readFailurePayload(payload);
          applyFailure(resolvedFailure);
          return;
        }

        const payloadLifecycleCandidate =
          payload && typeof payload === "object"
            ? toLifecyclePayload(
                (payload as Record<string, unknown>).lifecycle ||
                  (payload as Record<string, unknown>).data
              )
            : null;
        const payloadLifecycle =
          payloadLifecycleCandidate &&
          (readString(payloadLifecycleCandidate.status) ||
            readString(payloadLifecycleCandidate.stage) ||
            readString(payloadLifecycleCandidate.operationId))
            ? payloadLifecycleCandidate
            : null;

        if (payloadLifecycle) {
          setLifecycle(payloadLifecycle);
          const lifecycleStatus = normalizeLifecycleStatus(payloadLifecycle.status);

          if (lifecycleStatus === "FAILED" || lifecycleStatus === "NEEDS_ACTION") {
            applyFailure(failureFromLifecycle(payloadLifecycle, platform));
            return;
          }

          if (lifecycleStatus !== "COMPLETED") {
            const recovered = await pollLifecycle(payloadLifecycle.operationId || null);
            if (!recovered && !cancelled) {
              applyFailure(
                buildFallbackFailure(
                  "Meta connect is still processing. Retry in a moment.",
                  readString(payloadLifecycle.stage || "FINAL_ONBOARDING"),
                  "ONBOARDING_PROCESSING",
                  platform
                )
              );
            }
            return;
          }
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
        setLifecycle({
          status: "PROCESSING",
          stage: "FINAL_ONBOARDING",
          statusDetail: "Network timeout. Reconciling lifecycle state...",
        });
        const recovered = await pollLifecycle(null);
        if (!recovered && !cancelled) {
          applyFailure(
            buildFallbackFailure(
              "Network failure while finalizing Meta connect.",
              "IG_CONNECT_FAILED",
              "NETWORK_FAILURE",
              platform
            )
          );
        }
      }
    };

    void connect();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  const doctorDiagnostics = useMemo(() => {
    if (!failure?.connectDoctor?.reports?.length) {
      return [];
    }

    const provider = failure.platform === "whatsapp" ? "WHATSAPP" : "INSTAGRAM";
    const providerReport = failure.connectDoctor.reports.find(
      (report) => String(report.provider || "").toUpperCase() === provider
    );

    return Array.isArray(providerReport?.diagnostics)
      ? providerReport.diagnostics
      : [];
  }, [failure]);

  const startReconnect = async (options?: {
    pair?: PairOption;
    phoneNumberId?: string;
    platform?: "instagram" | "whatsapp";
  }) => {
    const reconnectPlatform = options?.platform || failure?.platform || "instagram";
    const query = new URLSearchParams({
      platform: reconnectPlatform.toUpperCase(),
      mode: "reconnect",
    });

    if (options?.pair) {
      query.set("facebookPageId", options.pair.facebookPageId);
      query.set("instagramAccountId", options.pair.instagramProfessionalAccountId);
    }

    if (options?.phoneNumberId) {
      query.set("phoneNumberId", options.phoneNumberId);
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
    const provider = failure?.platform === "whatsapp" ? "WHATSAPP" : "INSTAGRAM";
    await apiFetch("/api/integrations/connect-hub/connect/meta/doctor", {
      method: "POST",
      body: JSON.stringify({
        provider,
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
        await startReconnect({
          pair,
          platform: "instagram",
        });
        return;
      }

      if (action === "SELECT_PHONE_NUMBER") {
        if (!selectedPhoneNumberId) {
          throw new Error("Select a WhatsApp mobile number to continue.");
        }

        await startReconnect({
          phoneNumberId: selectedPhoneNumberId,
          platform: "whatsapp",
        });
        return;
      }

      await startReconnect();
    } catch (error: unknown) {
      const reason =
        String(
          (error instanceof Error ? error.message : "") ||
            "Action failed. Please retry."
        ).trim() ||
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
    const lifecycleStatus = normalizeLifecycleStatus(lifecycle?.status);
    const phase = resolveOnboardingPhase(lifecycle);
    const stageLabel = lifecycleStageLabel(lifecycle?.stage);
    const statusDetail = readString(lifecycle?.statusDetail);
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 px-6 text-sm text-slate-700">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="font-medium text-slate-900">Finalizing Meta connection...</p>
          <p className="mt-1 text-xs text-slate-600">
            Phase: {phase} | Stage: {stageLabel} ({lifecycleStatus})
          </p>
          {statusDetail ? (
            <p className="mt-1 text-xs text-slate-500">{statusDetail}</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!failure) {
    const phase = resolveOnboardingPhase(lifecycle);
    const stageLabel = lifecycleStageLabel(lifecycle?.stage);
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-700">
        {phase}... {stageLabel}
      </div>
    );
  }

  const providerLabel = failure.platform === "whatsapp" ? "WhatsApp" : "Instagram";

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{providerLabel} Connect Needs Action</h1>
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
                      {pair.facebookPageName || pair.facebookPageId} {"-> @"}
                      {pair.instagramUsername || pair.instagramProfessionalAccountId} (
                      {pair.instagramAccountType || "UNKNOWN"})
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {failure.requiresPhoneSelection && failure.availablePhoneNumbers?.length ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">
              Select WhatsApp mobile number
            </p>
            <div className="mt-3 space-y-2">
              {failure.availablePhoneNumbers.map((phone) => {
                const value = phone.phoneNumberId;
                const line =
                  phone.verifiedName ||
                  phone.displayPhoneNumber ||
                  phone.phoneNumberId;
                const detail = [phone.businessManagerName, phone.wabaName]
                  .filter(Boolean)
                  .join(" - ");

                return (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm"
                  >
                    <input
                      type="radio"
                      name="phoneNumber"
                      value={value}
                      checked={selectedPhoneNumberId === value}
                      onChange={(event) => setSelectedPhoneNumberId(event.target.value)}
                    />
                    <span className="text-slate-700">
                      {line} ({phone.phoneNumberId})
                      {detail ? ` - ${detail}` : ""}
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

