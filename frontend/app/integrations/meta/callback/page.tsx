"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient, apiFetch } from "@/lib/apiClient";
import { buildAppUrl, fetchClientConnectionStatus } from "@/lib/userApi";
import { recordLifecycleEvent } from "@/lib/lifecycleTelemetry";
import { launchWhatsAppEmbeddedSignupSession } from "@/lib/metaEmbeddedSignup";

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
  verificationStatus?: string | null;
  qualityRating?: string | null;
  connectedState?: string | null;
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
  operationId?: string | null;
  replayToken?: string | null;
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
  setupRequired?: boolean;
  setupGuideUrl?: string | null;
  businessManagerUrl?: string | null;
  requiresReconnect?: boolean;
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
    | "CONTINUATION_SCHEDULED"
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

type MetaEmbeddedSignupConfig = {
  appId: string;
  configId: string;
  graphVersion?: string;
  responseType?: "code";
  overrideDefaultResponseType?: boolean;
  extras?: Record<string, unknown>;
};

type MetaStartResponse = {
  url?: string;
  state?: string;
  mode?: string;
  embeddedSignup?: MetaEmbeddedSignupConfig | null;
};

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (
        callback: (response: {
          authResponse?: { code?: string | null } | null;
          status?: string;
        }) => void,
        options?: Record<string, unknown>
      ) => void;
    };
  }
}

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
  if (normalized === "INITIATED") {
    return "Connection initiated";
  }
  if (normalized === "OAUTH_STARTED") {
    return "OAuth redirect generated";
  }
  if (normalized === "AUTHORIZING") {
    return "Authorizing with Meta services";
  }
  if (normalized === "CODE_RECEIVED") {
    return "Authorization code received";
  }
  if (normalized === "TOKEN_EXCHANGING") {
    return "Exchanging access token";
  }
  if (normalized === "TOKEN_VALIDATED") {
    return "Token validated successfully";
  }
  if (normalized === "ACCOUNT_DISCOVERY") {
    return "Discovering linked Instagram accounts";
  }
  if (normalized === "PAGE_VALIDATION") {
    return "Validating Page linkages";
  }
  if (normalized === "PERMISSION_CHECK") {
    return "Verifying requested permissions";
  }
  if (normalized === "WEBHOOK_SETUP") {
    return "Subscribing to real-time events";
  }
  if (normalized === "FINAL_VERIFICATION") {
    return "Running final verification checks";
  }
  if (normalized === "CONNECTED") {
    return "Instagram connected successfully";
  }
  if (normalized === "OAUTH_AUTHENTICATED") {
    return "OAuth authenticated";
  }
  if (normalized === "CALLBACK_ACCEPTED") {
    return "Callback accepted";
  }
  if (normalized === "CONTINUATION_SCHEDULED") {
    return "Async continuation scheduled";
  }
  if (normalized === "META_ACCOUNT_CONNECTED") {
    return "Meta account connected";
  }
  if (normalized === "WHATSAPP_EMBEDDED_SIGNUP") {
    return "WhatsApp Embedded Signup completed";
  }
  if (normalized === "NUMBER_REQUIRED") {
    return "Phone number required";
  }
  if (normalized === "OTP_REQUIRED") {
    return "OTP verification required";
  }
  if (normalized === "PROVISIONING_PENDING") {
    return "Meta provisioning pending";
  }
  if (normalized === "BUSINESS_VERIFICATION_PENDING") {
    return "Business verification pending";
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

  if (status === "COMPLETED" || connectionState === "READY_MINIMAL" || stage === "CONNECTED") {
    return "ACTIVE";
  }

  if (
    status === "NEEDS_ACTION" ||
    status === "FAILED" ||
    connectionState === "ACTION_REQUIRED"
  ) {
    if (stage === "NUMBER_REQUIRED") {
      return "NUMBER_REQUIRED";
    }
    if (stage === "OTP_REQUIRED") {
      return "OTP_REQUIRED";
    }
    if (stage === "PROVISIONING_PENDING") {
      return "PROVISIONING_PENDING";
    }
    if (stage === "BUSINESS_VERIFICATION_PENDING") {
      return "BUSINESS_VERIFICATION_PENDING";
    }
    return "ACTION_REQUIRED";
  }

  if (
    stage === "INITIATED" ||
    stage === "OAUTH_STARTED" ||
    stage === "AUTHORIZING" ||
    stage === "OAUTH_AUTHENTICATED"
  ) {
    return "CONNECTING";
  }

  if (
    stage === "CODE_RECEIVED" ||
    stage === "TOKEN_EXCHANGING" ||
    stage === "CALLBACK_ACCEPTED" ||
    connectionState === "CONTINUATION_SCHEDULED"
  ) {
    return "PROCESSING";
  }

  if (
    stage === "TOKEN_VALIDATED" ||
    stage === "ACCOUNT_DISCOVERY" ||
    stage === "PAGE_VALIDATION" ||
    stage === "FINAL_VERIFICATION" ||
    stage === "META_ACCOUNT_CONNECTED" ||
    connectionState === "CONNECTED_PENDING"
  ) {
    return "VERIFYING";
  }

  if (
    stage === "PERMISSION_CHECK" ||
    stage === "WEBHOOK_SETUP" ||
    stage === "WEBHOOK_ACTIVATION"
  ) {
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
  setupRequired: false,
  setupGuideUrl: null,
  businessManagerUrl: null,
  requiresReconnect: false,
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

  const payload = {
    platform,
    stage: readString(data.stage || "IG_CONNECT_FAILED"),
    reason: readString(data.reason || root.message || "Meta connect failed"),
    code: readString(data.code || root.code || "UNKNOWN"),
    actionable: actionable || fallback.actionable,
    connectDoctor: data.connectDoctor || null,
    operationId: readString(data.operationId || root.operationId) || null,
    replayToken: readString(data.replayToken || root.replayToken) || null,
    requiresPairSelection: Boolean(data.requiresPairSelection),
    validPairs: Array.isArray(data.validPairs) ? (data.validPairs as PairOption[]) : [],
    requiresPhoneSelection: Boolean(data.requiresPhoneSelection),
    availablePhoneNumbers: Array.isArray(data.availablePhoneNumbers)
      ? (data.availablePhoneNumbers as WhatsAppPhoneOption[])
      : [],
    setupRequired: Boolean(data.setupRequired),
    setupGuideUrl: readString(data.setupGuideUrl) || null,
    businessManagerUrl: readString(data.businessManagerUrl) || null,
    requiresReconnect: Boolean(data.requiresReconnect),
  };

  if (payload.code !== "ACCOUNT_PERSONAL") {
    const isProfessionalError = 
      payload.reason.includes("must be Professional") || 
      payload.actionable?.problem?.includes("must be Professional") ||
      payload.actionable?.cause?.includes("must be Professional");
    
    if (isProfessionalError) {
      if (payload.actionable) {
        payload.actionable.problem = "Meta connection failed.";
        payload.actionable.cause = payload.reason;
        payload.actionable.fix = "Review backend diagnostics and try again.";
      }
    }
  }

  return payload;
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

  const payload = {
    operationId: readString(lifecycle.operationId) || null,
    replayToken: readString(lifecycle.replayToken) || null,
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
    setupRequired: Boolean(metadata.setupRequired),
    setupGuideUrl: readString(metadata.setupGuideUrl) || null,
    businessManagerUrl: readString(metadata.businessManagerUrl) || null,
    requiresReconnect: Boolean(metadata.requiresReconnect),
  };

  if (payload.code !== "ACCOUNT_PERSONAL") {
    const isProfessionalError = 
      payload.reason.includes("must be Professional") || 
      payload.actionable?.problem?.includes("must be Professional") ||
      payload.actionable?.cause?.includes("must be Professional");
    
    if (isProfessionalError) {
      if (payload.actionable) {
        payload.actionable.problem = "Meta connection failed.";
        payload.actionable.cause = payload.reason;
        payload.actionable.fix = "Review backend diagnostics and try again.";
      }
    }
  }

  return payload;
};

function MetaCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackState = searchParams.get("state") || "";
  const callbackMode = readString(searchParams.get("mode") || "connect");
  const connectStartedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<FailurePayload | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecyclePayload | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedPairKey, setSelectedPairKey] = useState<string>("");
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string>("");

  const applyFailure = (nextFailure: FailurePayload) => {
    setFailure(nextFailure);
    setSelectedPairKey(
      nextFailure.validPairs?.length && process.env.NEXT_PUBLIC_UX_AUTO_SELECT === "true"
        ? `${nextFailure.validPairs[0].facebookPageId}:${nextFailure.validPairs[0].instagramProfessionalAccountId}`
        : ""
    );
    setSelectedPhoneNumberId(
      nextFailure.availablePhoneNumbers?.length && process.env.NEXT_PUBLIC_UX_AUTO_SELECT === "true"
        ? nextFailure.availablePhoneNumbers[0].phoneNumberId
        : ""
    );
    setLoading(false);
  };

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (connectStartedRef.current) {
      return;
    }

    connectStartedRef.current = true;
    let cancelled = false;

    const code = searchParams.get("code") || "";
    const state = searchParams.get("state") || "";
    const operationId = searchParams.get("operationId") || "";
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



    const pollLifecycle = async (operationId?: string | null) => {
      const maxAttempts = 120;
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

        const baseDelayMs = Math.min(
          6_000,
          1_200 + attempt * 180 + Math.floor(Math.random() * 120)
        );
        const delayMs =
          typeof document !== "undefined" && document.visibilityState === "hidden"
            ? Math.min(8_500, baseDelayMs + 1_800)
            : baseDelayMs;

        if (attempt > 0) {
          recordLifecycleEvent("polling_backoff_applied", {
            area: "meta_oauth_lifecycle",
            attempt: attempt + 1,
            delayMs,
          });
        }

        await new Promise((resolve) => {
          setTimeout(resolve, delayMs);
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

    if (!code && state) {
      setLifecycle({
        operationId: operationId || null,
        status: "PROCESSING",
        stage: "CONTINUATION_SCHEDULED",
        statusDetail: "Meta Embedded Signup completed. Refreshing WhatsApp assets...",
      });
      void pollLifecycle(operationId || null).then((recovered) => {
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
      });
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
            ? (() => {
                const root = payload as Record<string, unknown>;
                const data =
                  root.data && typeof root.data === "object"
                    ? (root.data as Record<string, unknown>)
                    : null;
                return toLifecyclePayload(
                  root.lifecycle ||
                    (data && data.lifecycle && typeof data.lifecycle === "object"
                      ? data.lifecycle
                      : root.data)
                );
              })()
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

    const response = await apiFetch<MetaStartResponse>(`/api/clients/oauth/meta?${query.toString()}`, {
      method: "GET",
    });

    if (!response.success || !response.data?.url) {
      throw new Error(response.message || "Unable to start reconnect flow");
    }

    if (reconnectPlatform === "whatsapp") {
      if (!response.data.embeddedSignup || !response.data.state) {
        throw new Error("Meta Embedded Signup is not configured for WhatsApp.");
      }

      await launchWhatsAppEmbeddedSignup(response.data);
      return;
    }

    window.location.assign(response.data.url);
  };

  const getLifecycleOperationId = (payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const root = payload as Record<string, unknown>;
    const data =
      root.data && typeof root.data === "object"
        ? (root.data as Record<string, unknown>)
        : root;
    const lifecycle =
      data.lifecycle && typeof data.lifecycle === "object"
        ? (data.lifecycle as Record<string, unknown>)
        : data;
    return readString(lifecycle.operationId || data.operationId) || null;
  };

  const openCallbackLifecycle = (input: {
    state: string;
    operationId?: string | null;
    mode?: string | null;
  }) => {
    const query = new URLSearchParams({
      state: input.state,
      platform: "whatsapp",
      mode: input.mode || callbackMode || "connect",
    });
    if (input.operationId) {
      query.set("operationId", input.operationId);
    }
    window.location.assign(`/integrations/meta/callback?${query.toString()}`);
  };

  const launchWhatsAppEmbeddedSignup = async (start: MetaStartResponse) => {
    const { code, session } = await launchWhatsAppEmbeddedSignupSession(start);

    const finalizeResponse = await apiClient.request({
      url: "/api/clients/oauth/meta",
      method: "POST",
      data: {
        code,
        state: start.state,
        embeddedSignupSession: session,
      },
      timeout: 9000,
      validateStatus: () => true,
    });

    openCallbackLifecycle({
      state: start.state || "",
      operationId: getLifecycleOperationId(finalizeResponse.data),
      mode: start.mode,
    });
    return true;
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

  const pollLifecycleAfterAction = async (
    platform: "instagram" | "whatsapp",
    operationId?: string | null
  ) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (!mountedRef.current) {
        return false;
      }

      const query = new URLSearchParams({
        platform: platform.toUpperCase(),
      });
      if (callbackState) {
        query.set("state", callbackState);
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

      if (snapshot && mountedRef.current) {
        setLifecycle(snapshot);
        const status = normalizeLifecycleStatus(snapshot.status);
        if (status === "COMPLETED") {
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
        if (status === "FAILED" || status === "NEEDS_ACTION") {
          setFailure(failureFromLifecycle(snapshot, platform));
          setLoading(false);
          return true;
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(5_000, 1_000 + attempt * 250))
      );
    }

    if (mountedRef.current) {
      setLoading(false);
    }
    return false;
  };

  const pollLifecycleAfterRefresh = async (operationId?: string | null) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const query = new URLSearchParams({
        platform: "WHATSAPP",
      });
      if (callbackState) {
        query.set("state", callbackState);
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
        const status = normalizeLifecycleStatus(snapshot.status);
        if (status === "COMPLETED") {
          await fetchClientConnectionStatus().catch(() => null);
          router.replace(
            buildSettingsRedirect({
              integration: "success",
              platform: "whatsapp",
              mode: callbackMode,
            }) as Route
          );
          return true;
        }
        if (status === "FAILED" || status === "NEEDS_ACTION") {
          setFailure(failureFromLifecycle(snapshot, "whatsapp"));
          setLoading(false);
          return true;
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(5_000, 1_000 + attempt * 250))
      );
    }

    setLoading(false);
    return false;
  };

  const refreshWhatsAppNumbers = async (phoneNumberId?: string | null) => {
    const response = await apiFetch<LifecyclePayload>(
      "/api/clients/oauth/meta/whatsapp/phone-numbers/refresh",
      {
        method: "POST",
        body: JSON.stringify({
          state: callbackState,
          operationId: lifecycle?.operationId || failure?.operationId || null,
          phoneNumberId: phoneNumberId || null,
        }),
        timeoutMs: 20000,
      }
    );

    const responseData =
      response.data && typeof response.data === "object"
        ? (response.data as Record<string, unknown>)
        : null;
    const snapshot =
      toLifecyclePayload(responseData?.lifecycle) || toLifecyclePayload(response.data);
    if (snapshot) {
      setLifecycle(snapshot);
      const status = normalizeLifecycleStatus(snapshot.status);
      if (status === "COMPLETED") {
        await fetchClientConnectionStatus().catch(() => null);
        router.replace(
          buildSettingsRedirect({
            integration: "success",
            platform: "whatsapp",
            mode: callbackMode,
          }) as Route
        );
        return;
      }

      if (status === "PROCESSING") {
        setLoading(true);
        await pollLifecycleAfterRefresh(snapshot.operationId || null);
        return;
      }

      setFailure(failureFromLifecycle(snapshot, "whatsapp"));
      return;
    }

    if (response.success) {
      await fetchClientConnectionStatus().catch(() => null);
      router.replace(
        buildSettingsRedirect({
          integration: "success",
          platform: "whatsapp",
          mode: callbackMode,
        }) as Route
      );
      return;
    }

    if (!response.success) {
      throw new Error(response.message || "Unable to refresh WhatsApp numbers");
    }
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

        setLoading(true);
        try {
          const response = await apiClient.request({
            url: "/api/clients/oauth/meta",
            method: "POST",
            data: {
              state: callbackState,
              facebookPageId: pair.facebookPageId,
              instagramProfessionalAccountId: pair.instagramProfessionalAccountId,
            },
            timeout: 45000,
            validateStatus: () => true,
          });

          const payload = response?.data;
          const status = Number(response?.status || 500);

          if (status === 408 || status === 504) {
            if (mountedRef.current) {
              setLifecycle({
                status: "PROCESSING",
                stage: "FINAL_ONBOARDING",
                statusDetail: "Request timed out. Reconciling lifecycle state...",
              });
            }
            const recovered = await pollLifecycleAfterAction("instagram", null);
            if (!recovered && mountedRef.current) {
              applyFailure(
                buildFallbackFailure(
                  "Meta connect is still processing. Retry in a moment.",
                  "FINAL_ONBOARDING",
                  "ONBOARDING_PROCESSING",
                  "instagram"
                )
              );
            }
            return;
          }

          if (status < 200 || status >= 300 || payload?.success === false) {
            if (mountedRef.current) {
              const resolvedFailure = readFailurePayload(payload);
              applyFailure(resolvedFailure);
            }
            return;
          }

          const payloadLifecycleCandidate =
            payload && typeof payload === "object"
              ? (() => {
                  const root = payload as Record<string, unknown>;
                  const data =
                    root.data && typeof root.data === "object"
                      ? (root.data as Record<string, unknown>)
                      : null;
                  return toLifecyclePayload(
                    root.lifecycle ||
                      (data && data.lifecycle && typeof data.lifecycle === "object"
                        ? data.lifecycle
                        : root.data)
                  );
                })()
              : null;
          const payloadLifecycle =
            payloadLifecycleCandidate &&
            (readString(payloadLifecycleCandidate.status) ||
              readString(payloadLifecycleCandidate.stage) ||
              readString(payloadLifecycleCandidate.operationId))
              ? payloadLifecycleCandidate
              : null;

          if (payloadLifecycle) {
            if (mountedRef.current) {
              setLifecycle(payloadLifecycle);
            }
            const lifecycleStatus = normalizeLifecycleStatus(payloadLifecycle.status);

            if (lifecycleStatus === "FAILED" || lifecycleStatus === "NEEDS_ACTION") {
              if (mountedRef.current) {
                applyFailure(failureFromLifecycle(payloadLifecycle, "instagram"));
              }
              return;
            }

            if (lifecycleStatus !== "COMPLETED") {
              const recovered = await pollLifecycleAfterAction("instagram", payloadLifecycle.operationId || null);
              if (!recovered && mountedRef.current) {
                applyFailure(
                  buildFallbackFailure(
                    "Meta connect is still processing. Retry in a moment.",
                    readString(payloadLifecycle.stage || "FINAL_ONBOARDING"),
                    "ONBOARDING_PROCESSING",
                    "instagram"
                  )
                );
              }
              return;
            }
          }

          await fetchClientConnectionStatus().catch(() => null);

          if (mountedRef.current) {
            router.replace(
              buildSettingsRedirect({
                integration: "success",
                platform: "instagram",
                mode: callbackMode,
              }) as Route
            );
          }
        } catch (e: any) {
          if (mountedRef.current) {
            applyFailure(
              buildFallbackFailure(
                "Network failure while finalizing Meta connect.",
                "IG_CONNECT_FAILED",
                "NETWORK_FAILURE",
                "instagram"
              )
            );
          }
        }
        return;
      }

      if (action === "SELECT_PHONE_NUMBER") {
        if (!selectedPhoneNumberId) {
          throw new Error("Select a WhatsApp mobile number to continue.");
        }

        await refreshWhatsAppNumbers(selectedPhoneNumberId);
        return;
      }

      if (action === "REFRESH_NUMBERS") {
        await refreshWhatsAppNumbers();
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

  if (loading || !failure) {
    const stage = lifecycle?.stage;
    const normStage = String(stage || "").toUpperCase();
    const isWhatsApp = searchParams.get("platform")?.toLowerCase() === "whatsapp" || lifecycle?.platform?.toLowerCase() === "whatsapp";

    if (isWhatsApp) {
      const lifecycleStatus = normalizeLifecycleStatus(lifecycle?.status);
      const phase = resolveOnboardingPhase(lifecycle);
      const stageLabel = lifecycleStageLabel(stage);
      const statusDetail = readString(lifecycle?.statusDetail);
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 px-6 text-sm text-slate-700">
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="font-medium text-slate-900">Finalizing Meta WhatsApp connection...</p>
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

    const getProgressData = (st?: string | null) => {
      const norm = String(st || "").toUpperCase();
      switch (norm) {
        case "INITIATED":
          return { step: 0, percent: 10, time: "35s" };
        case "OAUTH_STARTED":
          return { step: 0, percent: 20, time: "30s" };
        case "AUTHORIZING":
          return { step: 0, percent: 30, time: "25s" };
        case "CODE_RECEIVED":
          return { step: 0, percent: 40, time: "22s" };
        case "TOKEN_EXCHANGING":
          return { step: 1, percent: 50, time: "18s" };
        case "TOKEN_VALIDATED":
          return { step: 1, percent: 60, time: "15s" };
        case "ACCOUNT_DISCOVERY":
          return { step: 2, percent: 70, time: "12s" };
        case "PAGE_VALIDATION":
          return { step: 2, percent: 75, time: "10s" };
        case "PERMISSION_CHECK":
          return { step: 2, percent: 80, time: "8s" };
        case "WEBHOOK_SETUP":
          return { step: 3, percent: 90, time: "5s" };
        case "FINAL_VERIFICATION":
          return { step: 3, percent: 95, time: "2s" };
        case "CONNECTED":
        case "COMPLETED":
          return { step: 3, percent: 100, time: "0s" };
        default:
          if (norm.includes("CALLBACK") || norm.includes("ACCEPTED")) return { step: 0, percent: 30, time: "25s" };
          if (norm.includes("TOKEN") || norm.includes("PERSISTENCE")) return { step: 1, percent: 60, time: "15s" };
          if (norm.includes("ACCOUNT") || norm.includes("PAIR")) return { step: 2, percent: 75, time: "10s" };
          if (norm.includes("WEBHOOK")) return { step: 3, percent: 90, time: "5s" };
          return { step: 0, percent: 15, time: "30s" };
      }
    };

    const { step, percent, time } = getProgressData(stage);
    const stageLabel = lifecycleStageLabel(stage);
    const statusDetail = readString(lifecycle?.statusDetail);

    const steps = [
      { id: 0, title: "OAuth Exchange", desc: "Verifying credentials with Meta" },
      { id: 1, title: "Token Validation", desc: "Exchanging and verifying access tokens" },
      { id: 2, title: "Account Discovery", desc: "Discovering linked pages and profiles" },
      { id: 3, title: "Webhook Setup", desc: "Subscribing to comments and messages" },
    ];

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-12 text-slate-100 font-sans selection:bg-indigo-500/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-slate-950 -z-10" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] -z-10 opacity-70" />

        <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950/70 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
              </span>
              <span className="text-xs font-semibold tracking-wider text-indigo-400 uppercase">Onboarding Engine</span>
            </div>
            <div className="text-xs font-medium text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full">
              Estimated: {time} remaining
            </div>
          </div>

          <div className="mt-6">
            <h1 className="text-2xl font-bold tracking-tight text-white">Connecting Instagram</h1>
            <p className="mt-2 text-sm text-slate-400">
              We are configuring a highly secure, real-time messaging link with Meta Graph API.
            </p>
          </div>

          <div className="mt-8">
            <div className="flex justify-between text-xs font-semibold text-slate-400 mb-2">
              <span>Overall Progress</span>
              <span className="text-indigo-400">{percent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 transition-all duration-700 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="mt-8 space-y-5">
            {steps.map((s) => {
              const isCompleted = step > s.id;
              const isActive = step === s.id;

              return (
                <div 
                  key={s.id}
                  className={`flex items-start gap-4 p-3.5 rounded-xl border transition-all duration-300 ${
                    isActive 
                      ? "border-slate-700 bg-slate-900/50" 
                      : isCompleted
                      ? "border-slate-800/40 bg-slate-950/20 opacity-80"
                      : "border-transparent bg-transparent opacity-40"
                  }`}
                >
                  <div className="mt-0.5">
                    {isCompleted ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-indigo-400/50 bg-indigo-950 text-indigo-400">
                        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </div>
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-slate-600 text-[10px] font-bold">
                        {s.id + 1}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold transition-colors duration-300 ${isActive ? 'text-white' : 'text-slate-350'}`}>
                      {s.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 truncate">
                      {isActive && statusDetail ? statusDetail : s.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-900 flex justify-between items-center text-xs text-slate-500">
            <span>Stage: {stageLabel}</span>
            <button 
              onClick={() => router.replace(buildSettingsRedirect({}) as Route)}
              className="text-slate-400 hover:text-white transition-colors duration-200"
            >
              Cancel Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  const providerLabel = failure.platform === "whatsapp" ? "WhatsApp" : "Instagram";
  const isWhatsAppSetupRequired =
    failure.platform === "whatsapp" &&
    (failure.setupRequired ||
      failure.actionable.reasonCode === "WHATSAPP_SETUP_REQUIRED" ||
      failure.code === "WA_SETUP_REQUIRED" ||
      failure.code === "SETUP_IN_PROGRESS");

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {isWhatsAppSetupRequired ? "Set Up WhatsApp Number" : `${providerLabel} Connect Needs Action`}
            </h1>
            <p className="mt-2 text-sm text-slate-600">{failure.actionable.problem}</p>
          </div>
          <span className="w-fit rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
            {failure.stage.replaceAll("_", " ")}
          </span>
        </div>

        {isWhatsAppSetupRequired ? (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-950">
              SETUP_IN_PROGRESS
            </p>
            <p className="mt-2 text-sm text-emerald-900">
              Meta is still creating, linking, or verifying the WhatsApp Business number. Finish the Meta-managed OTP/setup step, then refresh detection here.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-700">Cause: {failure.actionable.cause}</p>
            <p className="mt-2 text-sm text-slate-700">How to fix: {failure.actionable.fix}</p>
          </>
        )}

        <p className="mt-3 text-xs text-slate-500">
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
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">
              Select WhatsApp phone number
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {failure.availablePhoneNumbers.map((phone) => {
                const value = phone.phoneNumberId;
                const line =
                  phone.displayPhoneNumber ||
                  phone.verifiedName ||
                  phone.phoneNumberId;
                const verification = readString(phone.verificationStatus) || "Verification pending";
                const quality = readString(phone.qualityRating) || "Quality unavailable";
                const connected = readString(phone.connectedState) || "Available";
                const detail = [phone.businessManagerName, phone.wabaName]
                  .filter(Boolean)
                  .join(" - ");

                return (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-lg border bg-white p-4 text-sm transition ${
                      selectedPhoneNumberId === value
                        ? "border-slate-900 ring-2 ring-slate-900/10"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="phoneNumber"
                        value={value}
                        checked={selectedPhoneNumberId === value}
                        onChange={(event) => setSelectedPhoneNumberId(event.target.value)}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{line}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                            {verification.replaceAll("_", " ")}
                          </span>
                          <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800">
                            {quality.replaceAll("_", " ")}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                            {connected.replaceAll("_", " ")}
                          </span>
                        </div>
                        {detail ? (
                          <p className="mt-2 truncate text-xs text-slate-500">{detail}</p>
                        ) : null}
                        <p className="mt-1 truncate text-xs text-slate-400">{phone.phoneNumberId}</p>
                      </div>
                    </div>
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
          {!isWhatsAppSetupRequired && failure.platform === "whatsapp" ? (
            <button
              onClick={() => {
                setActionBusy(true);
                refreshWhatsAppNumbers()
                  .catch((error) => {
                    const reason =
                      error instanceof Error ? error.message : "Unable to refresh numbers";
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
                  })
                  .finally(() => setActionBusy(false));
              }}
              disabled={actionBusy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
            >
              Refresh Numbers
            </button>
          ) : null}
          {isWhatsAppSetupRequired ? (
            <button
              onClick={() => {
                setActionBusy(true);
                startReconnect({ platform: "whatsapp" })
                  .catch((error) => {
                    const reason =
                      error instanceof Error ? error.message : "Unable to reopen Meta onboarding";
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
                  })
                  .finally(() => setActionBusy(false));
              }}
              disabled={actionBusy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
            >
              Continue Meta Onboarding
            </button>
          ) : null}
          {isWhatsAppSetupRequired && failure.businessManagerUrl ? (
            <button
              onClick={() => window.open(failure.businessManagerUrl || "", "_blank", "noopener,noreferrer")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Open Meta Business Manager
            </button>
          ) : null}
          <button
            onClick={() =>
              window.open(
                failure.setupGuideUrl || failure.actionable.helpLink,
                "_blank",
                "noopener,noreferrer"
              )
            }
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
