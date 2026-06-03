import { Request, Response } from "express";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { decrypt, encrypt } from "../utils/encrypt";
import axios from "axios";
import { isQueueRedisWritable } from "../config/redis";
import { getPlanKey } from "../config/plan.config";
import { resolvePlanContext } from "../services/feature.service";
import { triggerOnboardingDemo } from "../services/onboarding.service";
import { checkConnectionHealth } from "../services/connectionHealth.service";
import { getRequestBusinessId } from "../services/tenant.service";
import { getCanonicalSubscriptionSnapshot } from "../services/subscriptionAuthority.service";
import {
  createMetaOAuthState,
  parseMetaOAuthMode,
  parseMetaOAuthPlatform,
  verifyMetaOAuthState,
} from "../utils/metaOAuthState";
import {
  connectInstagramOneClick,
  connectWhatsAppGuidedWizard,
  runMetaConnectDoctor,
} from "../services/saasPackagingConnectHubOS.service";
import {
  recordObservabilityEvent,
  recordTraceLedger,
} from "../services/reliability/reliabilityOS.service";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { getRequestLifecycle } from "../utils/requestLifecycle";
import {
  acquireMetaOAuthReconciliationLease,
  createMetaOAuthLifecycleContext,
  getMetaOAuthLifecycleSnapshot,
  markMetaOAuthLifecycleCompleted,
  markMetaOAuthLifecycleFailure,
  markMetaOAuthLifecycleNeedsAction,
  markMetaOAuthLifecycleStage,
  toMetaOAuthLifecycleResponse,
} from "../services/metaOAuthLifecycle.service";
import { enqueueIntegrationOnboardingProjectionReconcile } from "../queues/integrationOnboardingProjection.queue";
import {
  enqueueMetaOAuthContinuation,
  type MetaOAuthContinuationJobPayload,
} from "../queues/metaOAuthContinuation.queue";
import { scheduleDeferredIntegrationProjectionReconcile } from "../services/integrationProjectionRecovery.service";
import { isRedisCircuitOpen } from "../redis/redisSafety";
import { TimeoutExceededError, withTimeout } from "../utils/boundedTimeout";

const META_OAUTH_CONNECT_TIMEOUT_MS = 45_000;
const META_GRAPH_TIMEOUT_MS = 12_000;
const META_GRAPH_FAST_LANE_TIMEOUT_MS = 2_200;
const META_OAUTH_CALLBACK_SYNC_BUDGET_MS = 1_200;
const META_OAUTH_CALLBACK_STATE_VALIDATION_BUDGET_MS = Math.max(
  50,
  Number(process.env.META_OAUTH_CALLBACK_STATE_VALIDATION_BUDGET_MS || 120)
);
const META_OAUTH_CALLBACK_PERSISTENCE_BUDGET_MS = Math.max(
  60,
  Number(process.env.META_OAUTH_CALLBACK_PERSISTENCE_BUDGET_MS || 180)
);
const META_OAUTH_CALLBACK_ENQUEUE_BUDGET_MS = Math.max(
  50,
  Number(process.env.META_OAUTH_CALLBACK_ENQUEUE_BUDGET_MS || 150)
);
const META_OAUTH_CALLBACK_RESPONSE_BUDGET_MS = Math.max(
  150,
  Number(process.env.META_OAUTH_CALLBACK_RESPONSE_BUDGET_MS || 500)
);

const emitCallbackMetric = (input: {
  name:
    | "oauth_callback_accept_ms"
    | "oauth_callback_inline_work_ms"
    | "oauth_callback_async_handoff_ms"
    | "callback_projection_leak_detected"
    | "callback_response_before_finalize"
    | "continuation_async_only"
    | "callback_degraded_handoff"
    | "callback_fast_exit_success"
    | "callback_timeout_prevented";
  businessId?: string | null;
  value?: number;
  metadata?: Record<string, unknown>;
}) => {
  emitPerformanceMetric({
    name: input.name,
    value: Number.isFinite(Number(input.value)) ? Number(input.value) : 1,
    businessId: input.businessId || null,
    route: "clients_oauth_meta_callback",
    metadata: input.metadata || null,
  });
};

const emitCallbackRuntimeIsolationPreserved = (input: {
  businessId: string;
  platform: "INSTAGRAM" | "WHATSAPP";
  mode: "connect" | "reconnect";
  result: "accepted" | "degraded" | "queue_failed";
  operationId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  emitPerformanceMetric({
    name: "callback_runtime_isolation_preserved",
    value: 1,
    businessId: input.businessId,
    route: "clients_oauth_meta_callback",
    metadata: {
      platform: input.platform,
      mode: input.mode,
      result: input.result,
      operationId: normalizeOptionalString(input.operationId),
      ...(input.metadata || {}),
    },
  });
};

const emitOnboardingTraceEvent = (input: {
  businessId: string;
  tenantId?: string | null;
  eventType: string;
  message: string;
  severity?: "info" | "error";
  metadata?: Record<string, unknown>;
}) => {
  void recordObservabilityEvent({
    businessId: input.businessId,
    tenantId: input.tenantId || input.businessId,
    eventType: input.eventType,
    message: input.message,
    severity: input.severity || "info",
    context: {
      component: "clients_oauth_meta_callback",
      phase: "onboarding",
    },
    metadata: input.metadata || null,
  }).catch(() => undefined);
};

const logMetaOAuthFastPath = (
  event:
    | "OAUTH_CONTINUATION_VERIFIED"
    | "OAUTH_CALLBACK_FAST_PATH"
    | "OAUTH_CALLBACK_RESPONSE_SENT"
    | "OAUTH_CALLBACK_ASYNC_AUDIT_QUEUED"
    | "OAUTH_CALLBACK_TIMEOUT_PREVENTED",
  metadata: Record<string, unknown> = {}
) => {
  console.info(event, {
    component: "meta-oauth-continuation",
    ...metadata,
  });
};

/*
---------------------------------------------------
HELPER FUNCTIONS
---------------------------------------------------
*/

const normalizeOptionalString = (value?: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const getMetaDataArray = (value: any) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value?.data)) {
    return value.data;
  }

  return [];
};

const getAxiosErrorMessage = (error: any) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.message ||
  error?.message ||
  "Unknown error";

const isMetaProviderTransientError = (error: any) => {
  const status = Number(error?.response?.status || 0);
  if (status >= 500 || status === 429) {
    return true;
  }

  const code = String(error?.code || "")
    .trim()
    .toUpperCase();
  if (
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }

  const reason = String(getAxiosErrorMessage(error) || "")
    .trim()
    .toLowerCase();
  return (
    reason.includes("timeout") ||
    reason.includes("temporar") ||
    reason.includes("rate limit")
  );
};

const resolveMetaProviderIdentityMinimal = async (input: {
  token: string;
  timeoutMs: number;
}) => {
  const startedAtMs = Date.now();
  const res = await axios.get("https://graph.facebook.com/v19.0/me", {
    params: {
      fields: "id,name",
      access_token: input.token,
    },
    timeout: input.timeoutMs,
  });

  return {
    identity: {
      id: normalizeOptionalString(res.data?.id),
      name: normalizeOptionalString(res.data?.name),
    },
    durationMs: Date.now() - startedAtMs,
  };
};

const createClientControllerError = (message: string, code: string) => {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
};

type InstagramConnectStage =
  | "IG_OAUTH_STARTED"
  | "IG_CALLBACK_RECEIVED"
  | "IG_STATE_VERIFIED"
  | "IG_CODE_EXCHANGED"
  | "IG_LONG_TOKEN_EXCHANGED"
  | "IG_BUSINESSES_FETCHED"
  | "IG_PAGES_FETCHED"
  | "IG_VALID_PAIRS_RESOLVED"
  | "IG_PAIR_SELECTED"
  | "IG_PAIR_VALIDATED"
  | "IG_PERMISSION_AUDITED"
  | "IG_ENTITLEMENT_AUDITED"
  | "IG_WEBHOOK_SUBSCRIBED"
  | "IG_WEBHOOK_VERIFIED"
  | "IG_HEALTH_AUDITED"
  | "IG_CANONICAL_SAVED"
  | "IG_CONNECT_SUCCESS"
  | "IG_CONNECT_FAILED";

type MetaActionCode =
  | "ACCOUNT_PERSONAL"
  | "NO_LINKED_PAGE"
  | "NO_LINKED_IG_ACCOUNT"
  | "PHONE_SELECTION_REQUIRED"
  | "WHATSAPP_SETUP_REQUIRED"
  | "MISSING_PERMISSION"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "PAGE_ROLE_REMOVED"
  | "WEBHOOK_INACTIVE"
  | "RATE_LIMITED"
  | "ACCOUNT_RESTRICTED"
  | "QUOTA_EXCEEDED"
  | "PAIR_SELECTION_REQUIRED"
  | "UNKNOWN";

type ActionableFailurePayload = {
  reasonCode: MetaActionCode;
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

type MetaOAuthFailureOptions = {
  stage: InstagramConnectStage;
  reason: string;
  code: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
};

class MetaOAuthFlowError extends Error {
  stage: InstagramConnectStage;
  reason: string;
  code: string;
  statusCode: number;
  metadata: Record<string, unknown> | null;

  constructor(options: MetaOAuthFailureOptions) {
    super(options.reason);
    this.stage = options.stage;
    this.reason = options.reason;
    this.code = options.code;
    this.statusCode = options.statusCode || 400;
    this.metadata = options.metadata || null;
  }
}

const buildInstagramTraceId = (nonce?: string | null) => {
  const normalizedNonce = String(nonce || "").trim();
  return normalizedNonce
    ? `ig_connect_${normalizedNonce}`
    : `ig_connect_${Date.now()}`;
};

const recordInstagramConnectStage = async (input: {
  traceId: string;
  businessId: string;
  stage: InstagramConnectStage;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  metadata?: Record<string, unknown>;
  provider?: "INSTAGRAM";
  endedAt?: Date | null;
}) => {
  const provider = input.provider || "INSTAGRAM";
  const metadata = input.metadata || {};
  const severity = input.status === "FAILED" ? "error" : "info";

  await recordTraceLedger({
    traceId: input.traceId,
    correlationId: input.traceId,
    businessId: input.businessId,
    tenantId: input.businessId,
    stage: input.stage,
    status: input.status,
    metadata: {
      provider,
      ...metadata,
    },
    endedAt: input.endedAt || null,
  }).catch(() => undefined);

  await recordObservabilityEvent({
    businessId: input.businessId,
    tenantId: input.businessId,
    eventType: `meta.instagram.connect.${input.stage.toLowerCase()}`,
    message:
      input.status === "FAILED"
        ? `Instagram connect failed at ${input.stage}`
        : `Instagram connect stage ${input.stage} ${input.status.toLowerCase()}`,
    severity,
    context: {
      traceId: input.traceId,
      correlationId: input.traceId,
      provider,
      component: "meta-oauth-connect",
      phase: "connect",
    },
    metadata: {
      status: input.status,
      ...metadata,
    },
  }).catch(() => undefined);
};

type InstagramPagePair = {
  facebookPageId: string;
  facebookPageName: string | null;
  instagramProfessionalAccountId: string;
  instagramUsername: string | null;
  instagramName: string | null;
  instagramAccountType: string | null;
};

type WhatsAppPhoneCandidate = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  verificationStatus: string | null;
  qualityRating: string | null;
  connectedState: string | null;
  businessManagerId: string | null;
  businessManagerName: string | null;
  wabaId: string | null;
  wabaName: string | null;
};

const META_HELP_LINKS: Record<MetaActionCode, string> = {
  ACCOUNT_PERSONAL:
    "https://help.instagram.com/502981923235522",
  NO_LINKED_PAGE:
    "https://www.facebook.com/business/help/898752960195806",
  NO_LINKED_IG_ACCOUNT:
    "https://www.facebook.com/business/help/898752960195806",
  PHONE_SELECTION_REQUIRED:
    "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
  WHATSAPP_SETUP_REQUIRED:
    "https://business.facebook.com/wa/manage/phone-numbers/",
  MISSING_PERMISSION:
    "https://developers.facebook.com/docs/permissions/reference",
  TOKEN_EXPIRED:
    "https://developers.facebook.com/docs/facebook-login/guides/access-tokens",
  TOKEN_REVOKED:
    "https://developers.facebook.com/docs/facebook-login/guides/access-tokens",
  PAGE_ROLE_REMOVED:
    "https://www.facebook.com/business/help/442345745885606",
  WEBHOOK_INACTIVE:
    "https://developers.facebook.com/docs/messenger-platform/webhooks",
  RATE_LIMITED:
    "https://developers.facebook.com/docs/graph-api/overview/rate-limiting",
  ACCOUNT_RESTRICTED:
    "https://www.facebook.com/business/help",
  QUOTA_EXCEEDED:
    "https://app.automexiaai.in/billing",
  PAIR_SELECTION_REQUIRED:
    "https://www.facebook.com/business/help/898752960195806",
  UNKNOWN:
    "https://www.facebook.com/business/help",
};

const resolveMetaActionCode = ({
  code,
  reason,
}: {
  code?: string | null;
  reason?: string | null;
}): MetaActionCode => {
  const normalizedCode = String(code || "").trim().toUpperCase();
  const normalizedReason = String(reason || "").trim().toLowerCase();

  if (
    normalizedCode === "ACCOUNT_PERSONAL" ||
    normalizedCode.includes("PERSONAL")
  ) {
    return "ACCOUNT_PERSONAL";
  }

  if (
    normalizedCode.includes("NO_LINKED_PAGE") ||
    normalizedCode.includes("IG_PAGES_FETCH_FAILED") ||
    normalizedReason.includes("no linked page")
  ) {
    return "NO_LINKED_PAGE";
  }

  if (
    normalizedCode.includes("NO_LINKED_IG_ACCOUNT") ||
    normalizedReason.includes("no instagram professional account")
  ) {
    return "NO_LINKED_IG_ACCOUNT";
  }

  if (
    normalizedCode.includes("PHONE_SELECTION_REQUIRED") ||
    normalizedReason.includes("select a whatsapp") ||
    normalizedReason.includes("select whatsapp") ||
    normalizedReason.includes("select mobile number")
  ) {
    return "PHONE_SELECTION_REQUIRED";
  }

  if (
    normalizedCode.includes("WA_SETUP_REQUIRED") ||
    normalizedCode.includes("WA_PHONE_NUMBER_NOT_FOUND") ||
    normalizedReason.includes("no whatsapp phone numbers")
  ) {
    return "WHATSAPP_SETUP_REQUIRED";
  }

  if (
    normalizedCode.includes("PERMISSION") ||
    normalizedReason.includes("permission")
  ) {
    return "MISSING_PERMISSION";
  }

  if (
    normalizedCode.includes("TOKEN_EXPIRED") ||
    normalizedReason.includes("token has expired") ||
    normalizedReason.includes("session has expired")
  ) {
    return "TOKEN_EXPIRED";
  }

  if (
    normalizedCode.includes("TOKEN_REVOKED") ||
    normalizedReason.includes("token was revoked") ||
    normalizedReason.includes("invalid oauth access token")
  ) {
    return "TOKEN_REVOKED";
  }

  if (
    normalizedCode.includes("PAGE_ROLE_REMOVED") ||
    normalizedReason.includes("missing page role")
  ) {
    return "PAGE_ROLE_REMOVED";
  }

  if (
    normalizedCode.includes("WEBHOOK") ||
    normalizedReason.includes("webhook")
  ) {
    return "WEBHOOK_INACTIVE";
  }

  if (
    normalizedCode.includes("RATE_LIMIT") ||
    normalizedReason.includes("rate limit")
  ) {
    return "RATE_LIMITED";
  }

  if (
    normalizedCode.includes("RESTRICTED") ||
    normalizedReason.includes("restricted")
  ) {
    return "ACCOUNT_RESTRICTED";
  }

  if (
    normalizedCode.includes("ENTITLEMENT") ||
    normalizedCode.includes("PLAN_LIMIT") ||
    normalizedCode.includes("QUOTA") ||
    normalizedReason.includes("quota")
  ) {
    return "QUOTA_EXCEEDED";
  }

  if (
    normalizedCode.includes("PAIR_SELECTION_REQUIRED") ||
    normalizedReason.includes("select")
  ) {
    return "PAIR_SELECTION_REQUIRED";
  }

  return "UNKNOWN";
};

const buildActionableFailurePayload = (input: {
  code?: string | null;
  reason?: string | null;
  missingPermission?: string | null;
  retryAfterSeconds?: number | null;
}): ActionableFailurePayload => {
  const reasonCode = resolveMetaActionCode({
    code: input.code,
    reason: input.reason,
  });

  const shared = {
    reasonCode,
    helpLink: META_HELP_LINKS[reasonCode],
  };

  if (reasonCode === "ACCOUNT_PERSONAL") {
    return {
      ...shared,
      problem: "Instagram account type is not eligible.",
      cause: "The connected Instagram account is Personal.",
      fix: "Switch Instagram account type to Professional (Business or Creator).",
      cta: {
        label: "Open Account Type Guide",
        action: "OPEN_GUIDE",
      },
    };
  }

  if (reasonCode === "NO_LINKED_PAGE") {
    return {
      ...shared,
      problem: "No Facebook Page available for Instagram messaging.",
      cause: "The authenticated user has no valid Page access in this workspace context.",
      fix: "Grant Page access in Meta Business settings, then reconnect.",
      cta: {
        label: "Reconnect",
        action: "RECONNECT",
      },
    };
  }

  if (reasonCode === "NO_LINKED_IG_ACCOUNT") {
    return {
      ...shared,
      problem: "No Instagram Professional account is linked to a Facebook Page.",
      cause: "Meta returned Pages, but none had a linked Professional Instagram account.",
      fix: "Link Instagram Professional account to a Facebook Page, then retry.",
      cta: {
        label: "Open Linking Guide",
        action: "OPEN_GUIDE",
      },
    };
  }

  if (reasonCode === "PHONE_SELECTION_REQUIRED") {
    return {
      ...shared,
      problem: "Select the WhatsApp number to connect.",
      cause: "Multiple or unconfirmed WhatsApp numbers are available under this Meta login.",
      fix: "Choose one WhatsApp number and continue connect.",
      cta: {
        label: "Select Mobile Number",
        action: "SELECT_PHONE_NUMBER",
      },
    };
  }

  if (reasonCode === "WHATSAPP_SETUP_REQUIRED") {
    return {
      ...shared,
      problem: "No WhatsApp Business phone numbers were found.",
      cause:
        "The connected Meta Business assets do not currently expose an eligible WhatsApp phone number.",
      fix:
        "Create or finish setting up a WhatsApp Business number in the connected WABA, then refresh detection.",
      cta: {
        label: "Refresh Numbers",
        action: "REFRESH_NUMBERS",
      },
    };
  }

  if (reasonCode === "MISSING_PERMISSION") {
    return {
      ...shared,
      problem: "Required Meta permissions are missing.",
      cause:
        input.missingPermission
          ? `Missing permission: ${input.missingPermission}.`
          : "One or more permissions were revoked or not granted.",
      fix: "Reconnect and grant all requested permissions.",
      cta: {
        label: "Reconnect with Permissions",
        action: "RECONNECT",
      },
      missingPermission: input.missingPermission || null,
    };
  }

  if (reasonCode === "TOKEN_EXPIRED") {
    return {
      ...shared,
      problem: "Access token has expired.",
      cause: "Meta token is no longer valid for API calls.",
      fix: "Reconnect to issue a fresh long-lived token.",
      cta: {
        label: "Reconnect",
        action: "RECONNECT",
      },
    };
  }

  if (reasonCode === "TOKEN_REVOKED") {
    return {
      ...shared,
      problem: "Access token was revoked.",
      cause: "Meta invalidated the integration credentials.",
      fix: "Reconnect and re-authorize access.",
      cta: {
        label: "Reconnect",
        action: "RECONNECT",
      },
    };
  }

  if (reasonCode === "PAGE_ROLE_REMOVED") {
    return {
      ...shared,
      problem: "Page role access is missing.",
      cause: "The authenticating user no longer has required Page permissions.",
      fix: "Restore Page role access in Meta Business and reconnect.",
      cta: {
        label: "Open Page Role Guide",
        action: "OPEN_GUIDE",
      },
    };
  }

  if (reasonCode === "WEBHOOK_INACTIVE") {
    return {
      ...shared,
      problem: "Webhook subscription is inactive.",
      cause: "Meta webhook subscription could not be verified as active.",
      fix: "Run automatic webhook repair, then retry.",
      cta: {
        label: "Repair Automatically",
        action: "REPAIR_WEBHOOK",
      },
    };
  }

  if (reasonCode === "RATE_LIMITED") {
    return {
      ...shared,
      problem: "Meta API rate limit reached.",
      cause: "Provider temporarily throttled connect validation requests.",
      fix: "Retry after cooldown period.",
      cta: {
        label: "Retry",
        action: "RETRY",
      },
      retryAfterSeconds: input.retryAfterSeconds || 60,
    };
  }

  if (reasonCode === "ACCOUNT_RESTRICTED") {
    return {
      ...shared,
      problem: "Meta account is restricted.",
      cause: "Provider policy restrictions block this integration action.",
      fix: "Resolve restrictions in Meta account quality and reconnect.",
      cta: {
        label: "Open Restriction Guide",
        action: "OPEN_GUIDE",
      },
    };
  }

  if (reasonCode === "QUOTA_EXCEEDED") {
    return {
      ...shared,
      problem: "Plan quota reached for this integration.",
      cause: "Current workspace entitlement blocks additional connections.",
      fix: "Upgrade plan or disconnect an existing slot.",
      cta: {
        label: "Upgrade Plan",
        action: "UPGRADE_PLAN",
      },
    };
  }

  if (reasonCode === "PAIR_SELECTION_REQUIRED") {
    return {
      ...shared,
      problem: "Multiple valid Instagram assets were found.",
      cause: "More than one Facebook Page and Instagram Professional pair is available.",
      fix: "Select the exact Page and Instagram pair, then reconnect.",
      cta: {
        label: "Select Pair",
        action: "SELECT_PAIR",
      },
    };
  }

  return {
    ...shared,
    problem: "Meta connection failed.",
    cause: String(input.reason || "Unknown provider failure"),
    fix: "Retry connection and review diagnostics.",
    cta: {
      label: "Retry",
      action: "RETRY",
    },
  };
};

const getMetaOAuthRuntimeConfig = () => {
  const appId = String(process.env.META_APP_ID || "").trim();
  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  const backendUrl = String(env.BACKEND_URL || process.env.BACKEND_URL || "").trim();
  const whatsappEmbeddedSignupConfigId = String(
    process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID ||
      process.env.META_WHATSAPP_LOGIN_CONFIG_ID ||
      process.env.META_LOGIN_CONFIG_ID ||
      ""
  ).trim();

  if (!appId || !backendUrl) {
    return null;
  }

  return {
    appId,
    appSecret,
    backendUrl,
    whatsappEmbeddedSignupConfigId,
  };
};

const collectWhatsAppPhoneNumbers = (payload: any) => {
  const queue = [payload];
  const visited = new Set<any>();
  const numbers: Array<{
    id: string;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    verificationStatus: string | null;
    qualityRating: string | null;
    connectedState: string | null;
  }> = [];

  while (queue.length) {
    const node = queue.shift();

    if (!node || typeof node !== "object" || visited.has(node)) {
      continue;
    }

    visited.add(node);

    const phoneNumbers = getMetaDataArray((node as any).phone_numbers);

    for (const phoneNumber of phoneNumbers) {
      const id = normalizeOptionalString(phoneNumber?.id);

      if (!id) {
        continue;
      }

      numbers.push({
        id,
        displayPhoneNumber:
          normalizeOptionalString(phoneNumber?.display_phone_number) || null,
        verifiedName: normalizeOptionalString(phoneNumber?.verified_name) || null,
        verificationStatus:
          normalizeOptionalString(phoneNumber?.name_status) ||
          normalizeOptionalString(phoneNumber?.verification_status) ||
          null,
        qualityRating: normalizeOptionalString(phoneNumber?.quality_rating) || null,
        connectedState:
          normalizeOptionalString(phoneNumber?.status) ||
          normalizeOptionalString(phoneNumber?.code_verification_status) ||
          null,
      });
    }

    for (const child of Object.values(node)) {
      if (child && typeof child === "object") {
        queue.push(child);
      }
    }
  }

  return Array.from(
    new Map(numbers.map((entry) => [entry.id, entry])).values()
  );
};

const extractBusinessNodesFromPayload = (payload: any) => {
  const direct = getMetaDataArray(payload);
  const dataNodes = getMetaDataArray(payload?.data);
  const nestedBusinesses = getMetaDataArray(payload?.businesses);

  const merged = [...direct, ...dataNodes, ...nestedBusinesses];
  const seen = new Set<string>();

  return merged.filter((business) => {
    if (!business || typeof business !== "object") {
      return false;
    }

    const businessId = normalizeOptionalString((business as any)?.id);
    const key = businessId || JSON.stringify(business);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const mapWhatsAppCandidatesFromBusinessNode = (business: any) => {
  const businessManagerId = normalizeOptionalString(business?.id);
  const businessManagerName = normalizeOptionalString(business?.name);
  const candidates: WhatsAppPhoneCandidate[] = [];

  const wabaBuckets = [
    ...getMetaDataArray(business?.owned_whatsapp_business_accounts),
    ...getMetaDataArray(business?.client_whatsapp_business_accounts),
  ];

  for (const waba of wabaBuckets) {
    const wabaId = normalizeOptionalString(waba?.id);
    const wabaName = normalizeOptionalString(waba?.name);
    const phoneNumbers = getMetaDataArray(waba?.phone_numbers);

    for (const phoneNumber of phoneNumbers) {
      const phoneNumberId = normalizeOptionalString(phoneNumber?.id);

      if (!phoneNumberId) {
        continue;
      }

      candidates.push({
        phoneNumberId,
        displayPhoneNumber:
          normalizeOptionalString(phoneNumber?.display_phone_number) || null,
        verifiedName: normalizeOptionalString(phoneNumber?.verified_name) || null,
        verificationStatus:
          normalizeOptionalString(phoneNumber?.name_status) ||
          normalizeOptionalString(phoneNumber?.verification_status) ||
          null,
        qualityRating: normalizeOptionalString(phoneNumber?.quality_rating) || null,
        connectedState:
          normalizeOptionalString(phoneNumber?.status) ||
          normalizeOptionalString(phoneNumber?.code_verification_status) ||
          null,
        businessManagerId,
        businessManagerName,
        wabaId,
        wabaName,
      });
    }
  }

  return candidates;
};

const dedupeWhatsAppPhoneCandidates = (
  candidates: WhatsAppPhoneCandidate[]
) => {
  const byPhoneNumberId = new Map<string, WhatsAppPhoneCandidate>();

  for (const candidate of candidates) {
    const existing = byPhoneNumberId.get(candidate.phoneNumberId);

    if (!existing) {
      byPhoneNumberId.set(candidate.phoneNumberId, candidate);
      continue;
    }

    byPhoneNumberId.set(candidate.phoneNumberId, {
      phoneNumberId: candidate.phoneNumberId,
      displayPhoneNumber:
        existing.displayPhoneNumber || candidate.displayPhoneNumber || null,
      verifiedName: existing.verifiedName || candidate.verifiedName || null,
      verificationStatus:
        existing.verificationStatus || candidate.verificationStatus || null,
      qualityRating: existing.qualityRating || candidate.qualityRating || null,
      connectedState: existing.connectedState || candidate.connectedState || null,
      businessManagerId:
        existing.businessManagerId || candidate.businessManagerId || null,
      businessManagerName:
        existing.businessManagerName || candidate.businessManagerName || null,
      wabaId: existing.wabaId || candidate.wabaId || null,
      wabaName: existing.wabaName || candidate.wabaName || null,
    });
  }

  return Array.from(byPhoneNumberId.values());
};

const fetchWhatsAppPhoneCandidates = async (accessToken: string) => {
  const lookupRequests = [
    {
      label: "me/businesses",
      url: "https://graph.facebook.com/v19.0/me/businesses",
      params: {
        fields:
          "id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating,name_status,status,code_verification_status}},client_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating,name_status,status,code_verification_status}}",
        access_token: accessToken,
      },
    },
    {
      label: "me",
      url: "https://graph.facebook.com/v19.0/me",
      params: {
        fields:
          "businesses{id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating,name_status,status,code_verification_status}},client_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating,name_status,status,code_verification_status}}}",
        access_token: accessToken,
      },
    },
  ];

  const aggregatedCandidates: WhatsAppPhoneCandidate[] = [];

  for (const lookup of lookupRequests) {
    try {
      const response = await axios.get(lookup.url, {
        params: lookup.params,
        timeout: META_GRAPH_TIMEOUT_MS,
      });

      const businessNodes = extractBusinessNodesFromPayload(response.data);

      for (const businessNode of businessNodes) {
        aggregatedCandidates.push(...mapWhatsAppCandidatesFromBusinessNode(businessNode));
      }

      const fallbackPhoneNumbers = collectWhatsAppPhoneNumbers(response.data);
      for (const fallbackNumber of fallbackPhoneNumbers) {
        aggregatedCandidates.push({
          phoneNumberId: fallbackNumber.id,
          displayPhoneNumber: fallbackNumber.displayPhoneNumber,
          verifiedName: fallbackNumber.verifiedName,
          verificationStatus: fallbackNumber.verificationStatus,
          qualityRating: fallbackNumber.qualityRating,
          connectedState: fallbackNumber.connectedState,
          businessManagerId: null,
          businessManagerName: null,
          wabaId: null,
          wabaName: null,
        });
      }
    } catch (error: any) {
      console.log("WHATSAPP CONNECT LOOKUP FAILED", {
        source: lookup.label,
        message: getAxiosErrorMessage(error),
      });
    }
  }

  return dedupeWhatsAppPhoneCandidates(aggregatedCandidates);
};

const fetchMetaBusinesses = async (accessToken: string) => {
  const response = await axios.get("https://graph.facebook.com/v19.0/me/businesses", {
    params: {
      fields: "id,name",
      access_token: accessToken,
    },
    timeout: META_GRAPH_TIMEOUT_MS,
  });

  return getMetaDataArray(response.data).map((business) => ({
    id: normalizeOptionalString(business?.id),
    name: normalizeOptionalString(business?.name),
  }));
};

const isProfessionalInstagramAccount = (accountType?: string | null) => {
  const normalized = String(accountType || "").trim().toUpperCase();
  return normalized === "BUSINESS" || normalized === "CREATOR";
};

const fetchInstagramConnection = async (accessToken: string) => {
  const pagesRes = await axios.get("https://graph.facebook.com/v19.0/me/accounts", {
    params: {
      fields:
        "id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}",
      access_token: accessToken,
    },
    timeout: META_GRAPH_TIMEOUT_MS,
  });

  const pages = getMetaDataArray(pagesRes.data);
  const allPairs: InstagramPagePair[] = [];
  const validPairs: InstagramPagePair[] = [];
  const pagesWithoutInstagram: Array<{
    facebookPageId: string;
    facebookPageName: string | null;
  }> = [];
  const pageAccessTokenByFacebookPageId: Record<string, string> = {};

  for (const page of pages) {
    const facebookPageId = normalizeOptionalString(page?.id);
    const facebookPageName = normalizeOptionalString(page?.name);
    const pageAccessToken =
      normalizeOptionalString(page?.access_token) ||
      normalizeOptionalString(accessToken);

    if (facebookPageId && pageAccessToken) {
      pageAccessTokenByFacebookPageId[facebookPageId] = pageAccessToken;
    }

    if (!facebookPageId) {
      continue;
    }

    let instagramProfessionalAccountId =
      normalizeOptionalString(page?.instagram_business_account?.id) ||
      normalizeOptionalString(page?.connected_instagram_account?.id);
    let instagramUsername =
      normalizeOptionalString(page?.instagram_business_account?.username) ||
      normalizeOptionalString(page?.connected_instagram_account?.username);
    let instagramName: string | null = null;
    let instagramAccountType: string | null = null;

    if (instagramProfessionalAccountId && pageAccessToken) {
      try {
        const igProfileRes = await axios.get(
          `https://graph.facebook.com/v19.0/${instagramProfessionalAccountId}`,
          {
            params: {
              fields: "id,username,name,account_type",
              access_token: pageAccessToken,
            },
            timeout: META_GRAPH_TIMEOUT_MS,
          }
        );

        instagramUsername =
          normalizeOptionalString(igProfileRes.data?.username) || instagramUsername;
        instagramName = normalizeOptionalString(igProfileRes.data?.name);
        instagramAccountType = normalizeOptionalString(
          igProfileRes.data?.account_type
        );
      } catch {
        // Keep base pair metadata if profile enrichment fails.
      }
    }

    if (!instagramProfessionalAccountId) {
      pagesWithoutInstagram.push({
        facebookPageId,
        facebookPageName,
      });
      continue;
    }

    const pair: InstagramPagePair = {
      facebookPageId,
      facebookPageName,
      instagramProfessionalAccountId,
      instagramUsername,
      instagramName,
      instagramAccountType,
    };

    allPairs.push(pair);

    if (isProfessionalInstagramAccount(instagramAccountType)) {
      validPairs.push(pair);
    }
  }

  return {
    pagesFound: pages.length,
    allPairs,
    validPairs,
    pagesWithoutInstagram,
    pageAccessTokenByFacebookPageId,
  };
};

const fetchMetaGrantedPermissions = async (accessToken: string) => {
  try {
    const response = await axios.get("https://graph.facebook.com/v19.0/me/permissions", {
      params: {
        access_token: accessToken,
      },
      timeout: META_GRAPH_TIMEOUT_MS,
    });
    return getMetaDataArray(response.data)
      .filter((row) => String(row?.status || "").toLowerCase() === "granted")
      .map((row) => normalizeOptionalString(row?.permission))
      .filter((permission): permission is string => Boolean(permission));
  } catch {
    return [];
  }
};

const subscribeInstagramPageWebhook = async (
  facebookPageId: string | null,
  pageAccessToken: string | null
) => {
  if (!facebookPageId || !pageAccessToken) {
    return false;
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${facebookPageId}/subscribed_apps`,
      null,
      {
        params: {
          subscribed_fields: "messages,messaging_postbacks,comments",
          access_token: pageAccessToken,
        },
        timeout: META_GRAPH_TIMEOUT_MS,
      }
    );
    return true;
  } catch {
    return false;
  }
};

const fetchInstagramProfileSnapshot = async (
  pageId: string | null,
  pageAccessToken: string | null
) => {
  if (!pageId || !pageAccessToken) {
    return null;
  }
  try {
    const response = await axios.get(`https://graph.facebook.com/v19.0/${pageId}`, {
      params: {
        fields: "id,username,name,profile_picture_url",
        access_token: pageAccessToken,
      },
      timeout: META_GRAPH_TIMEOUT_MS,
    });
    return response.data || null;
  } catch {
    return null;
  }
};

const fetchWhatsAppPhoneProfile = async (
  phoneNumberId: string | null,
  accessToken: string
) => {
  if (!phoneNumberId) {
    return null;
  }
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${phoneNumberId}`,
      {
        params: {
          fields:
            "id,display_phone_number,verified_name,quality_rating,name_status,messaging_limit_tier,status",
          access_token: accessToken,
        },
        timeout: META_GRAPH_TIMEOUT_MS,
      }
    );
    return response.data || null;
  } catch {
    return null;
  }
};

const fetchWhatsAppPhoneNumberId = async (
  accessToken: string,
  preferredPhoneNumberId?: string | null
) => {
  const preferred = normalizeOptionalString(preferredPhoneNumberId);
  const phoneNumbers = await fetchWhatsAppPhoneCandidates(accessToken);
  const preferredMatch = preferred
    ? phoneNumbers.find((phoneNumber) => phoneNumber.phoneNumberId === preferred)
    : null;

  if (preferredMatch?.phoneNumberId) {
    console.log("WHATSAPP CONNECT IDENTIFIERS", {
      source: "preferred",
      phoneNumberId: preferredMatch.phoneNumberId,
      preferredPhoneNumberId: preferred || null,
    });
    return preferredMatch.phoneNumberId;
  }

  if (phoneNumbers[0]?.phoneNumberId) {
    console.log("WHATSAPP CONNECT IDENTIFIERS", {
      source: "fallback",
      phoneNumberId: phoneNumbers[0].phoneNumberId,
      preferredPhoneNumberId: preferred || null,
    });
    return phoneNumbers[0].phoneNumberId;
  }

  return null;
};

const isWhatsAppPhoneVerified = (phone: WhatsAppPhoneCandidate | null | undefined) => {
  const verification = String(phone?.verificationStatus || "")
    .trim()
    .toUpperCase();
  const connected = String(phone?.connectedState || "")
    .trim()
    .toUpperCase();

  return (
    verification === "APPROVED" ||
    verification === "VERIFIED" ||
    connected === "VERIFIED" ||
    connected === "CONNECTED"
  );
};

const getWhatsAppBusinessManagerUrl = (businessManagerId?: string | null) => {
  const businessId = normalizeOptionalString(businessManagerId);
  return businessId
    ? `https://business.facebook.com/wa/manage/phone-numbers/?business_id=${encodeURIComponent(
        businessId
      )}`
    : "https://business.facebook.com/wa/manage/phone-numbers/";
};

const buildWhatsAppSetupRequiredMetadata = (input: {
  availablePhoneNumbers: WhatsAppPhoneCandidate[];
  longToken?: string | null;
  businessManagerId?: string | null;
  wabaId?: string | null;
}) => {
  const actionable = buildActionableFailurePayload({
    code: "WA_SETUP_REQUIRED",
    reason: "No WhatsApp Business phone numbers were found.",
  });
  const businessManagerId = normalizeOptionalString(input.businessManagerId);
  const wabaId = normalizeOptionalString(input.wabaId);

  return {
    code: "SETUP_IN_PROGRESS",
    availablePhoneNumbers: input.availablePhoneNumbers,
    setupRequired: true,
    setupInProgress: true,
    embeddedSignupAvailable: true,
    setupGuideUrl: META_HELP_LINKS.WHATSAPP_SETUP_REQUIRED,
    businessManagerUrl: getWhatsAppBusinessManagerUrl(businessManagerId),
    businessManagerId,
    wabaId,
    actionable,
    ...(normalizeOptionalString(input.longToken)
      ? { whatsappRefreshTokenEncrypted: encrypt(input.longToken as string) }
      : {}),
  };
};

const markWhatsAppSetupRequired = async (input: {
  businessId: string;
  lifecycleContext: ReturnType<typeof createMetaOAuthLifecycleContext> | null;
  availablePhoneNumbers: WhatsAppPhoneCandidate[];
  longToken?: string | null;
  businessManagerId?: string | null;
  wabaId?: string | null;
  refreshed?: boolean;
}) => {
  console.info("WA_EMBEDDED_SIGNUP_COMPLETED", {
    component: "whatsapp-onboarding",
    businessId: input.businessId,
    operationId: input.lifecycleContext?.attemptKey || null,
    refreshed: Boolean(input.refreshed),
    result: "SETUP_IN_PROGRESS",
  });

  if (!input.lifecycleContext) {
    return buildWhatsAppSetupRequiredMetadata(input);
  }

  const metadata = buildWhatsAppSetupRequiredMetadata(input);
  await markMetaOAuthLifecycleNeedsAction({
    context: input.lifecycleContext,
    stage: "PHONE_SELECTION",
    detail: "SETUP_IN_PROGRESS: Meta Embedded Signup has not returned a verified WhatsApp phone number yet.",
    metadata,
  });

  return metadata;
};

const upsertConnectedClient = async ({
  businessId,
  platform,
  phoneNumberId,
  pageId,
  accessToken,
  aiTone,
  businessInfo,
  pricingInfo,
  faqKnowledge,
  salesInstructions,
}: {
  businessId: string;
  platform: string;
  phoneNumberId?: unknown;
  pageId?: unknown;
  accessToken: string;
  aiTone?: unknown;
  businessInfo?: unknown;
  pricingInfo?: unknown;
  faqKnowledge?: unknown;
  salesInstructions?: unknown;
}) => {
  const normalizedPlatform =
    normalizeOptionalString(platform)?.toUpperCase() || "SYSTEM";
  const normalizedPhoneNumberId = normalizeOptionalString(phoneNumberId);
  const normalizedPageId = normalizeOptionalString(pageId);
  const normalizedAccessToken = String(accessToken || "").trim();
  const sameBusinessClientFilters = [
    normalizedPageId
      ? {
          pageId: normalizedPageId,
        }
      : null,
    normalizedPhoneNumberId
      ? {
          phoneNumberId: normalizedPhoneNumberId,
        }
      : null,
  ].filter(Boolean) as Array<
    | {
        pageId: string;
      }
    | {
        phoneNumberId: string;
      }
  >;

  if (!sameBusinessClientFilters.length) {
    throw createClientControllerError(
      "pageId or phoneNumberId is required",
      "CLIENT_UNIQUE_KEY_REQUIRED"
    );
  }

  const existingPlatformClient = await prisma.client.findUnique({
    where: {
      businessId_platform: {
        businessId,
        platform: normalizedPlatform,
      },
    },
  });

  if (normalizedPageId) {
    const conflictingPageClient = await prisma.client.findFirst({
      where: {
        pageId: normalizedPageId,
        NOT: {
          businessId,
        },
      },
      select: {
        id: true,
      },
    });

    if (
      conflictingPageClient &&
      conflictingPageClient.id !== existingPlatformClient?.id
    ) {
      throw createClientControllerError(
        "This connected account already exists for another business",
        "CLIENT_OWNERSHIP_CONFLICT"
      );
    }
  }

  if (normalizedPhoneNumberId) {
    const conflictingPhoneClient = await prisma.client.findFirst({
      where: {
        phoneNumberId: normalizedPhoneNumberId,
        NOT: {
          businessId,
        },
      },
      select: {
        id: true,
      },
    });

    if (
      conflictingPhoneClient &&
      conflictingPhoneClient.id !== existingPlatformClient?.id
    ) {
      throw createClientControllerError(
        "This connected account already exists for another business",
        "CLIENT_OWNERSHIP_CONFLICT"
      );
    }
  }

  const updateData = {
    businessId,
    platform: normalizedPlatform,
    phoneNumberId:
      normalizedPhoneNumberId || existingPlatformClient?.phoneNumberId || null,
    pageId: normalizedPageId || existingPlatformClient?.pageId || null,
    accessToken: normalizedAccessToken,
    ...(aiTone !== undefined
      ? { aiTone: normalizeOptionalString(aiTone) }
      : {}),
    ...(businessInfo !== undefined
      ? { businessInfo: normalizeOptionalString(businessInfo) }
      : {}),
    ...(pricingInfo !== undefined
      ? { pricingInfo: normalizeOptionalString(pricingInfo) }
      : {}),
    ...(faqKnowledge !== undefined
      ? { faqKnowledge: normalizeOptionalString(faqKnowledge) }
      : {}),
    ...(salesInstructions !== undefined
      ? { salesInstructions: normalizeOptionalString(salesInstructions) }
      : {}),
    isActive: true,
    deletedAt: null,
  };

  const sameBusinessClient = existingPlatformClient
    ? existingPlatformClient
    : await prisma.client.findFirst({
        where: {
          businessId,
          OR: sameBusinessClientFilters,
        },
      });

  if (sameBusinessClient) {
    await prisma.client.updateMany({
      where: {
        id: sameBusinessClient.id,
        businessId,
      },
      data: updateData,
    });

    const client = await prisma.client.findFirst({
      where: {
        id: sameBusinessClient.id,
        businessId,
      },
    });

    if (!client) {
      throw createClientControllerError(
        "Client update failed",
        "CLIENT_UPDATE_FAILED"
      );
    }

    console.log("CLIENT UPSERT SUCCESS", {
      businessId: client.businessId,
      platform: client.platform,
      pageId: client.pageId,
      phoneNumberId: client.phoneNumberId,
    });

    return client;
  }

  const client = await prisma.client.create({
    data: updateData,
  });

  console.log("CLIENT UPSERT SUCCESS", {
    businessId: client.businessId,
    platform: client.platform,
    pageId: client.pageId,
    phoneNumberId: client.phoneNumberId,
  });

  return client;
};

const getSubscription = async (businessId: string) => {
  const snapshot = await getCanonicalSubscriptionSnapshot(businessId);

  return snapshot
    ? {
        plan: snapshot.plan,
        status: snapshot.status,
      }
    : null;
};

const getAllowedPlatforms = async (
  businessId: string,
  subscription: Awaited<ReturnType<typeof getSubscription>>
) => {
  if (!subscription?.plan) {
    return ["WHATSAPP", "INSTAGRAM"];
  }

  const planContext = await resolvePlanContext(businessId).catch(() => null);

  if (!planContext || planContext.state !== "ACTIVE") {
    return ["WHATSAPP", "INSTAGRAM"];
  }

  const planKey = getPlanKey(subscription.plan);

  if (planKey === "PRO" || planKey === "ELITE") {
    return ["WHATSAPP", "INSTAGRAM"];
  }

  if (planKey === "BASIC") {
    return ["INSTAGRAM"];
  }

  return [];
};

const queueOnboardingDemoForClient = async (
  businessId: string,
  client: { id: string; platform: string; isActive?: boolean | null }
) => {
  try {
    await triggerOnboardingDemo({
      businessId,
      client: {
        id: client.id,
        platform: client.platform,
        isActive: client.isActive ?? true,
      },
    });
  } catch (error) {
    console.error("Onboarding demo trigger failed:", error);
  }
};

type ConnectedLifecycleClient = {
  id: string;
  platform: string;
  pageId?: string | null;
  phoneNumberId?: string | null;
  isActive?: boolean | null;
  accessToken?: string | null;
};

const runMetaOnboardingLifecycleFinalization = async (input: {
  businessId: string;
  lifecycleContext: ReturnType<typeof createMetaOAuthLifecycleContext>;
  connectedClients: ConnectedLifecycleClient[];
  requestTimedOut: boolean;
  requestAborted: boolean;
}) => {
  const startedAtMs = Date.now();
  try {
    await Promise.all(
      input.connectedClients.map((client) =>
        queueOnboardingDemoForClient(input.businessId, {
          id: client.id,
          platform: client.platform,
          isActive: client.isActive ?? true,
        })
      )
    );

    const healthRows = await Promise.all(
      input.connectedClients.map(async (client) => {
        const healthy = await checkConnectionHealth(client as any).catch(() =>
          Boolean(client?.isActive)
        );

        return {
          platform: client.platform,
          healthy,
          connected: Boolean(client.isActive),
          clientId: client.id,
          pageId: client.pageId || null,
          phoneNumberId: client.phoneNumberId || null,
        };
      })
    );

    await markMetaOAuthLifecycleCompleted({
      context: input.lifecycleContext,
      detail: "Meta onboarding lifecycle completed",
      metadata: {
        clients: healthRows,
        requestTimedOut: input.requestTimedOut,
        requestAborted: input.requestAborted,
        completedAt: new Date().toISOString(),
      },
      reconcileMs: Date.now() - startedAtMs,
      timeoutRecovered: input.requestTimedOut,
      eventualSuccess: input.requestAborted || input.requestTimedOut,
    });
    emitOnboardingTraceEvent({
      businessId: input.businessId,
      eventType: "active_transition_reached",
      message: "active_transition_reached:meta_oauth_lifecycle_completed",
      metadata: {
        operationId: input.lifecycleContext.attemptKey,
        replayToken: input.lifecycleContext.replayToken,
        requestTimedOut: input.requestTimedOut,
        requestAborted: input.requestAborted,
        connectedClients: input.connectedClients.map((client) => ({
          id: client.id,
          platform: client.platform,
          pageId: client.pageId || null,
          phoneNumberId: client.phoneNumberId || null,
        })),
      },
    });

    const projectionEnqueue = await enqueueIntegrationOnboardingProjectionReconcile({
      type: "ONBOARDING_RECONCILE",
      businessId: input.businessId,
      tenantId: input.businessId,
      reason: "meta_oauth_lifecycle_completed",
      source: "meta_oauth_finalization",
    }).catch((error) => {
      return {
        enqueued: false,
        deferred: true,
        duplicate: false,
        queueUnavailable: true,
        jobId: "",
        reason: String((error as Error)?.message || "projection_enqueue_failed"),
      };
    });

    if (!projectionEnqueue.enqueued) {
      const deferred = await scheduleDeferredIntegrationProjectionReconcile({
        businessId: input.businessId,
        tenantId: input.businessId,
        reason: "meta_oauth_lifecycle_completed",
        source: "meta_oauth_finalization",
        queueError:
          normalizeOptionalString(projectionEnqueue.reason) ||
          "projection_enqueue_failed",
        includeQueueDepth: false,
      }).catch(() => null);

      emitPerformanceMetric({
        name: "reconcile_inline_prevented",
        value: 1,
        businessId: input.businessId,
        route: "clients_oauth_meta_callback",
        metadata: {
          reason: "projection_enqueue_unavailable",
          recoveryKey: deferred?.recoveryKey || null,
        },
      });
    }
  } catch (error) {
    const reason =
      String((error as { message?: unknown })?.message || "").trim() ||
      "Meta onboarding finalization failed";
    await markMetaOAuthLifecycleFailure({
      context: input.lifecycleContext,
      stage: "FINAL_ONBOARDING",
      code: "META_FINAL_ONBOARDING_FAILED",
      reason,
      resolutionHint: "RETRY",
      metadata: {
        requestTimedOut: input.requestTimedOut,
        requestAborted: input.requestAborted,
      },
    });
    throw error;
  }
};

const finalizeMetaOnboardingLifecycle = (
  input: {
    businessId: string;
    lifecycleContext: ReturnType<typeof createMetaOAuthLifecycleContext>;
    connectedClients: ConnectedLifecycleClient[];
    requestTimedOut: boolean;
    requestAborted: boolean;
  },
  options?: {
    deferred?: boolean;
  }
) => {
  if (options?.deferred !== false) {
    setImmediate(() => {
      void runMetaOnboardingLifecycleFinalization(input).catch(() => undefined);
    });
    return;
  }

  return runMetaOnboardingLifecycleFinalization(input);
};

/*
---------------------------------------------------
CREATE CLIENT
---------------------------------------------------
*/

export const createClient = async (req: Request, res: Response) => {
  try {

    const userId = (req as any).user?.id;
    const businessId = getRequestBusinessId(req);

    if (!userId || !businessId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    let {
      platform,
      phoneNumberId,
      pageId,
      accessToken,
      aiTone,
      businessInfo,
      pricingInfo,

      /* NEW AI TRAINING FIELDS */
      faqKnowledge,
      salesInstructions

    } = req.body;

    if (!platform || !accessToken) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "platform and accessToken required",
      });
    }

    platform = platform.toUpperCase();

    if (platform === "INSTAGRAM" || platform === "WHATSAPP") {
      return res.status(409).json({
        success: false,
        data: null,
        message: "Use the canonical Meta OAuth connect flow",
        code: "META_LEGACY_CONNECT_PATH_DISABLED",
      });
    }

    const subscription = await getSubscription(businessId);
    const allowedPlatforms = await getAllowedPlatforms(
      businessId,
      subscription
    );

    if (!allowedPlatforms.length) {
      return res.status(403).json({
        success: false,
        data: null,
        message: "Your current plan does not allow new integrations",
      });
    }

    if (!allowedPlatforms.includes(platform)) {
      return res.status(403).json({
        success: false,
        data: null,
        message: `${platform} integration not allowed in your plan`,
      });
    }

    let resolvedPhoneNumberId = normalizeOptionalString(phoneNumberId);
    let resolvedPageId = normalizeOptionalString(pageId);

    if (platform === "WHATSAPP" && !resolvedPhoneNumberId) {
      resolvedPhoneNumberId = await fetchWhatsAppPhoneNumberId(accessToken);
    }

    if (platform === "INSTAGRAM" && !resolvedPageId) {
      const instagramConnection = await fetchInstagramConnection(accessToken);
      const fallbackPair = instagramConnection.validPairs[0] || null;
      const fallbackPageToken =
        fallbackPair &&
        instagramConnection.pageAccessTokenByFacebookPageId[
          fallbackPair.facebookPageId
        ]
          ? instagramConnection.pageAccessTokenByFacebookPageId[
              fallbackPair.facebookPageId
            ]
          : null;

      resolvedPageId = fallbackPair?.instagramProfessionalAccountId || null;
      accessToken = fallbackPageToken || accessToken;
    }

    if (platform === "WHATSAPP" && !resolvedPhoneNumberId) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "Unable to resolve WhatsApp phone number ID",
      });
    }

    if (platform === "INSTAGRAM" && !resolvedPageId) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "Unable to resolve Instagram page ID",
      });
    }

    const encryptedToken = encrypt(accessToken);

    const client = await upsertConnectedClient({
      businessId,
      platform,
      phoneNumberId: resolvedPhoneNumberId,
      pageId: resolvedPageId,
      accessToken: encryptedToken,
      aiTone,
      businessInfo,
      pricingInfo,
      faqKnowledge,
      salesInstructions,
    });

    await queueOnboardingDemoForClient(businessId, client);

    return res.status(201).json({
      success: true,
      data: {
        client,
      },
      message: "Client created successfully",
    });

  } catch (error: any) {

    if (error.code === "CLIENT_UNIQUE_KEY_REQUIRED") {
      return res.status(400).json({
        success: false,
        data: null,
        message: "phoneNumberId or pageId required",
      });
    }

    if (error.code === "CLIENT_OWNERSHIP_CONFLICT") {
      return res.status(400).json({
        success: false,
        data: null,
        message: "This connected account already exists for another business",
      });
    }

    if (error.code === "CLIENT_DUPLICATE_KEY_CONFLICT") {
      return res.status(400).json({
        success: false,
        data: null,
        message: "This connected account already exists for your business",
      });
    }

    if (error.code === "P2002") {
      return res.status(400).json({
        success: false,
        data: null,
        message: "This connected account already exists for your business",
      });
    }

    console.error("Create client error:", error);

    return res.status(500).json({
      success: false,
      data: null,
      message: "Client creation failed",
    });

  }
};

/*
---------------------------------------------------
META OAUTH CONNECT (INSTAGRAM)
---------------------------------------------------
*/

export const metaOAuthConnect = async (req: Request, res: Response) => {
  const callbackStartedAtMs = Date.now();
  const internalContinuation = (req as any).__metaContinuationInternal === true;
  let instagramTraceId = buildInstagramTraceId(null);
  let instagramBusinessId: string | null = getRequestBusinessId(req);
  let lifecycleContext: ReturnType<typeof createMetaOAuthLifecycleContext> | null = null;
  let lifecycleRequestTimedOut = false;
  let lifecycleRequestAborted = false;
  const waDiagStartedAt = Date.now();
  let waDiagLastCheckpointAt = waDiagStartedAt;
  let waCheckpointReached = "[WA STEP 0] initialized";
  let waDiagEnabled = false;
  let shortToken: string | null = null;
  let longToken: string | null = null;
  const logWaCheckpoint = (
    checkpoint: string,
    metadata: Record<string, unknown> = {}
  ) => {
    waCheckpointReached = checkpoint;

    if (!waDiagEnabled) {
      return;
    }

    const now = Date.now();
    const durationMs = now - waDiagLastCheckpointAt;
    waDiagLastCheckpointAt = now;

    console.info("WA_META_FINALIZE_DIAG", {
      checkpoint,
      durationMs,
      totalDurationMs: now - waDiagStartedAt,
      ...metadata,
    });
  };

  const isRequestDetached = () => {
    const lifecycle = getRequestLifecycle({ req, res });
    const reason = String(lifecycle?.abortReason || "").trim().toLowerCase();
    lifecycleRequestTimedOut = reason === "request_timeout";
    lifecycleRequestAborted = Boolean(lifecycle?.aborted);
    return Boolean(lifecycle?.aborted) || res.headersSent || res.writableEnded;
  };

  let triggerBullMQFallback: ((source: string, reason: string) => Promise<any>) | undefined;

  try {
    (req as any).setTimeout?.(META_OAUTH_CONNECT_TIMEOUT_MS);
    res.setTimeout(META_OAUTH_CONNECT_TIMEOUT_MS);

    const userId = (req as any).user?.id;
    const requestBusinessId = getRequestBusinessId(req);
    const {
      code: rawCode,
      state: rawState,
      aiTone,
      businessInfo,
      pricingInfo,
      faqKnowledge,
      salesInstructions,
      phoneNumberId,
      facebookPageId,
      instagramProfessionalAccountId,
    } = req.body || {};
    const code = normalizeOptionalString(rawCode);
    const state = String(rawState || "").trim();
    const internalResolvedTokens =
      (req as any).__metaResolvedTokens &&
      typeof (req as any).__metaResolvedTokens === "object"
        ? ((req as any).__metaResolvedTokens as {
            shortToken?: string | null;
            longToken?: string | null;
          })
        : null;
    const providedShortToken = normalizeOptionalString(
      internalResolvedTokens?.shortToken
    );
    const providedLongToken = normalizeOptionalString(
      internalResolvedTokens?.longToken
    );

    const oauthState = verifyMetaOAuthState(state);
    waDiagEnabled = oauthState?.platform === "WHATSAPP";

    if (waDiagEnabled) {
      logWaCheckpoint("[WA STEP 1] request entered", {
        hasCode: Boolean(code),
        hasState: Boolean(state),
        hasUserId: Boolean(userId),
        requestBusinessId: requestBusinessId || null,
      });
    }

    instagramTraceId = buildInstagramTraceId(oauthState?.nonce || null);
    instagramBusinessId = oauthState?.businessId || requestBusinessId || null;

    if (oauthState?.businessId && oauthState?.nonce && oauthState?.platform) {
      lifecycleContext = createMetaOAuthLifecycleContext({
        businessId: oauthState.businessId,
        platform: oauthState.platform,
        mode: oauthState.mode,
        nonce: oauthState.nonce,
      });
    }

    const failInstagramConnect = (options: MetaOAuthFailureOptions): never => {
      throw new MetaOAuthFlowError(options);
    };

    const hasOAuthCredential = Boolean(code || providedShortToken || providedLongToken);

    if (!userId || !requestBusinessId || !hasOAuthCredential || !oauthState) {
      if (lifecycleContext) {
        await markMetaOAuthLifecycleFailure({
          context: lifecycleContext,
          stage: "FAILED",
          code: "META_INVALID_OAUTH_CALLBACK_CONTRACT",
          reason: "Invalid OAuth callback contract",
          resolutionHint: "RETRY",
        });
      }
      if (oauthState?.platform === "INSTAGRAM") {
        failInstagramConnect({
          stage: "IG_STATE_VERIFIED",
          reason: "Invalid OAuth callback contract",
          code: "IG_INVALID_OAUTH_CALLBACK_CONTRACT",
          statusCode: 400,
        });
      }

      return res.status(400).json({
        success: false,
        data: null,
        message: "Invalid OAuth callback contract",
      });
    }

    if (
      oauthState.userId !== userId ||
      oauthState.businessId !== requestBusinessId ||
      oauthState.workspaceId !== requestBusinessId
    ) {
      if (lifecycleContext) {
        await markMetaOAuthLifecycleFailure({
          context: lifecycleContext,
          stage: "FAILED",
          code: "META_OAUTH_STATE_MISMATCH",
          reason: "OAuth state mismatch",
          resolutionHint: "RECONNECT",
        });
      }
      if (oauthState.platform === "INSTAGRAM") {
        failInstagramConnect({
          stage: "IG_STATE_VERIFIED",
          reason: "OAuth state mismatch",
          code: "IG_OAUTH_STATE_MISMATCH",
          statusCode: 403,
        });
      }

      return res.status(403).json({
        success: false,
        data: null,
        message: "OAuth state mismatch",
      });
    }

    const businessId = oauthState.businessId;
    const targetPlatform = oauthState.platform;
    instagramBusinessId = businessId;
    lifecycleContext = createMetaOAuthLifecycleContext({
      businessId,
      platform: targetPlatform,
      mode: oauthState.mode,
      nonce: oauthState.nonce,
    });
    let selectedPhoneNumberId =
      normalizeOptionalString(phoneNumberId) ||
      normalizeOptionalString(oauthState.preferredPhoneNumberId);
    const requestedFacebookPageId =
      normalizeOptionalString(facebookPageId) ||
      normalizeOptionalString(oauthState.preferredFacebookPageId);
    const requestedInstagramProfessionalAccountId =
      normalizeOptionalString(instagramProfessionalAccountId) ||
      normalizeOptionalString(oauthState.preferredInstagramProfessionalAccountId);

    if (!internalContinuation) {
      logMetaOAuthFastPath("OAUTH_CONTINUATION_VERIFIED", {
        businessId,
        userId,
        platform: targetPlatform,
        mode: oauthState.mode,
        operationId: lifecycleContext.attemptKey,
        replayToken: lifecycleContext.replayToken,
      });
    }

    triggerBullMQFallback = async (source: string, reason: string) => {
      logMetaOAuthFastPath("OAUTH_CALLBACK_FAST_PATH", {
        source,
        reason,
        businessId,
        platform: targetPlatform,
        operationId: lifecycleContext!.attemptKey,
      });
      const asyncHandoffMs = Date.now() - callbackStartedAtMs;
      emitCallbackMetric({
        name: "oauth_callback_async_handoff_ms",
        businessId,
        value: asyncHandoffMs,
        metadata: {
          source,
          reason,
          platform: targetPlatform,
        },
      });
      const enqueuePayload: MetaOAuthContinuationJobPayload = {
        type: "META_OAUTH_CONTINUATION",
        operationId: lifecycleContext!.attemptKey,
        replayToken: lifecycleContext!.replayToken,
        businessId,
        userId,
        platform: targetPlatform,
        mode: oauthState.mode,
        state,
        code: code || null,
        shortTokenEncrypted: shortToken ? encrypt(shortToken) : null,
        longTokenEncrypted: longToken ? encrypt(longToken) : null,
        aiTone: normalizeOptionalString(aiTone),
        businessInfo: normalizeOptionalString(businessInfo),
        pricingInfo: normalizeOptionalString(pricingInfo),
        faqKnowledge: normalizeOptionalString(faqKnowledge),
        salesInstructions: normalizeOptionalString(salesInstructions),
        phoneNumberId: selectedPhoneNumberId,
        facebookPageId: requestedFacebookPageId,
        instagramProfessionalAccountId: requestedInstagramProfessionalAccountId,
        traceId: instagramTraceId,
        queuedAtIso: new Date().toISOString(),
        source: source as any,
      };

      try {
        const enqueueResult = await withTimeout({
          label: "meta_oauth_callback_enqueue",
          timeoutMs: META_OAUTH_CALLBACK_ENQUEUE_BUDGET_MS,
          task: enqueueMetaOAuthContinuation(enqueuePayload),
        });
        emitOnboardingTraceEvent({
          businessId,
          eventType: "callback_handoff_success",
          message: `callback_handoff_success:meta_oauth_continuation_queued_fallback_${source}`,
          metadata: {
            operationId: lifecycleContext!.attemptKey,
            replayToken: lifecycleContext!.replayToken,
            platform: targetPlatform,
            mode: oauthState.mode,
            source,
            reason,
            queueJobId: enqueueResult.jobId,
            duplicate: enqueueResult.duplicate,
          },
        });
      } catch (enqueueError) {
        const enqueueTimedOut = enqueueError instanceof TimeoutExceededError;
        if (enqueueTimedOut) {
          logMetaOAuthFastPath("OAUTH_CALLBACK_TIMEOUT_PREVENTED", {
            businessId,
            platform: targetPlatform,
            operationId: lifecycleContext!.attemptKey,
            phase: "queue_enqueue",
          });
        }
        console.error("Meta OAuth continuation enqueue failed; using local async fallback", enqueueError);
        emitCallbackMetric({
          name: enqueueTimedOut
            ? "callback_timeout_prevented"
            : "callback_degraded_handoff",
          businessId,
          value: Date.now() - callbackStartedAtMs,
          metadata: {
            source,
            reason,
            platform: targetPlatform,
            operationId: lifecycleContext!.attemptKey,
            enqueueTimedOut,
          },
        });
        setImmediate(() => {
          const { type: _type, ...queueInput } = enqueuePayload;
          runMetaOAuthContinuationFromQueueJob(queueInput).catch((err) => {
            console.error("Local async fallback failed:", err);
          });
        });
      }

      logMetaOAuthFastPath("OAUTH_CALLBACK_ASYNC_AUDIT_QUEUED", {
        businessId,
        platform: targetPlatform,
        operationId: lifecycleContext!.attemptKey,
        source,
      });

      await withTimeout({
        label: "meta_oauth_callback_lifecycle_handoff",
        timeoutMs: META_OAUTH_CALLBACK_PERSISTENCE_BUDGET_MS,
        task: markMetaOAuthLifecycleStage({
          context: lifecycleContext!,
          stage: "CONTINUATION_SCHEDULED",
          detail: `Onboarding continuation scheduled asynchronously. Reason: ${reason}`,
          metadata: {
            deferredWork: true,
            deferredReason: reason,
            source,
            shortTokenExchanged: Boolean(shortToken),
            longTokenExchanged: Boolean(longToken),
          },
        }),
      }).catch((error) => {
        console.warn("Meta OAuth lifecycle handoff marker skipped", {
          reason: error instanceof TimeoutExceededError ? "timeout" : "failed",
          operationId: lifecycleContext!.attemptKey,
        });
      });

      logMetaOAuthFastPath("OAUTH_CALLBACK_RESPONSE_SENT", {
        source,
        businessId,
        platform: targetPlatform,
        operationId: lifecycleContext!.attemptKey,
        durationMs: Date.now() - callbackStartedAtMs,
      });

      return res.status(202).json({
        success: true,
        data: {
          platform: targetPlatform,
          mode: oauthState.mode,
          workspaceId: oauthState.workspaceId,
          connectionState: "CONTINUATION_SCHEDULED",
          lifecycle: {
            operationId: lifecycleContext!.attemptKey,
            replayToken: lifecycleContext!.replayToken,
            status: "PROCESSING",
            stage: "CONTINUATION_SCHEDULED",
            statusDetail: `Meta onboarding is continuing asynchronously (${reason}).`,
          },
        },
        message: `${targetPlatform} connect processing asynchronously`,
      });
    };

    if (!internalContinuation) {
      emitCallbackMetric({
        name: "callback_projection_leak_detected",
        businessId,
        value: 1,
        metadata: {
          leakDetected: true,
          operationId: lifecycleContext!.attemptKey,
          replayToken: lifecycleContext!.replayToken,
        },
      });
    }

    const markAuthenticatedStage = markMetaOAuthLifecycleStage({
      context: lifecycleContext,
      stage: "OAUTH_AUTHENTICATED",
      detail: "OAuth callback verified",
      metadata: {
        workspaceId: oauthState.workspaceId,
        mode: oauthState.mode,
        trustedContinuation: !internalContinuation,
      },
    });

    if (internalContinuation) {
      await markAuthenticatedStage;
    } else {
      await withTimeout({
        label: "meta_oauth_callback_authenticated_marker",
        timeoutMs: META_OAUTH_CALLBACK_PERSISTENCE_BUDGET_MS,
        task: markAuthenticatedStage,
      }).catch((error) => {
        if (error instanceof TimeoutExceededError) {
          logMetaOAuthFastPath("OAUTH_CALLBACK_TIMEOUT_PREVENTED", {
            businessId,
            platform: targetPlatform,
            operationId: lifecycleContext!.attemptKey,
            phase: "lifecycle_authenticated_marker",
          });
        }
      });
    }

    if (targetPlatform === "WHATSAPP") {
      logWaCheckpoint("[WA STEP 2] state verified", {
        businessId,
        mode: oauthState.mode,
      });
    }

    if (targetPlatform === "INSTAGRAM") {
      const recordCallbackReceived = recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_CALLBACK_RECEIVED",
        status: "COMPLETED",
        metadata: {
          mode: oauthState.mode,
        },
      });

      if (internalContinuation) {
        await recordCallbackReceived;
      } else {
        void recordCallbackReceived.catch(() => undefined);
      }
    }

    const subscription = internalContinuation
      ? await getSubscription(businessId)
      : null;
    const allowedPlatforms = internalContinuation
      ? await getAllowedPlatforms(businessId, subscription)
      : [targetPlatform];

    if (internalContinuation && !allowedPlatforms.includes(targetPlatform)) {
      if (lifecycleContext) {
        await markMetaOAuthLifecycleFailure({
          context: lifecycleContext,
          stage: "FAILED",
          code: "META_ENTITLEMENT_BLOCKED",
          reason: `${targetPlatform} integration not allowed in your workspace`,
          resolutionHint: "UPGRADE_PLAN",
        });
      }
      if (targetPlatform === "INSTAGRAM") {
        failInstagramConnect({
          stage: "IG_ENTITLEMENT_AUDITED",
          reason: `${targetPlatform} integration not allowed in your workspace`,
          code: "IG_ENTITLEMENT_BLOCKED",
          statusCode: 403,
        });
      }

      return res.status(403).json({
        success: false,
        data: null,
        message: `${targetPlatform} integration not allowed in your workspace`,
      });
    }

    const metaRuntime = getMetaOAuthRuntimeConfig();

    if (!metaRuntime?.appSecret) {
      if (lifecycleContext) {
        await markMetaOAuthLifecycleFailure({
          context: lifecycleContext,
          stage: "FAILED",
          code: "META_OAUTH_CONFIG_MISSING",
          reason: "Meta OAuth is not configured on this server",
          resolutionHint: "RETRY",
        });
      }
      if (targetPlatform === "INSTAGRAM") {
        failInstagramConnect({
          stage: "IG_CODE_EXCHANGED",
          reason: "Meta OAuth is not configured on this server",
          code: "IG_META_OAUTH_CONFIG_MISSING",
          statusCode: 500,
        });
      }

      return res.status(500).json({
        success: false,
        data: null,
        message: "Meta OAuth is not configured on this server",
      });
    }

    const redirectUri = `${metaRuntime.backendUrl}/api/oauth/meta/callback`;

    if (targetPlatform === "INSTAGRAM") {
      const recordStateVerified = recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_STATE_VERIFIED",
        status: "COMPLETED",
        metadata: {
          platform: targetPlatform,
          mode: oauthState.mode,
          workspaceId: oauthState.workspaceId,
        },
      });
      if (internalContinuation) {
        await recordStateVerified;
      } else {
        void recordStateVerified.catch(() => undefined);
      }
      if (internalContinuation) {
        await recordInstagramConnectStage({
          traceId: instagramTraceId,
          businessId,
          stage: "IG_ENTITLEMENT_AUDITED",
          status: "COMPLETED",
          metadata: {
            allowedPlatforms,
          },
        });
      }
    }

    shortToken = providedShortToken;

    if (!shortToken) {
      let shortTokenRes: any;
      try {
        shortTokenRes = await axios.get(
          "https://graph.facebook.com/v19.0/oauth/access_token",
          {
            params: {
              client_id: metaRuntime.appId,
              client_secret: metaRuntime.appSecret,
              redirect_uri: redirectUri,
              code,
            },
            timeout: internalContinuation
              ? META_GRAPH_TIMEOUT_MS
              : META_GRAPH_FAST_LANE_TIMEOUT_MS,
          }
        );
      } catch (error: any) {
        if (
          !internalContinuation &&
          lifecycleContext &&
          code &&
          isMetaProviderTransientError(error)
        ) {
          return await triggerBullMQFallback!("callback_fast_lane_transient", getAxiosErrorMessage(error));
        }

        if (targetPlatform === "INSTAGRAM") {
          failInstagramConnect({
            stage: "IG_CODE_EXCHANGED",
            reason: getAxiosErrorMessage(error),
            code: "IG_CODE_EXCHANGE_FAILED",
            statusCode: Number(error?.response?.status || 400),
            metadata: {
              providerError: error?.response?.data || null,
            },
          });
        }
        throw error;
      }

      shortToken = normalizeOptionalString(shortTokenRes.data?.access_token);
    }

    if (!shortToken) {
      if (lifecycleContext) {
        await markMetaOAuthLifecycleFailure({
          context: lifecycleContext,
          stage: "FAILED",
          code: "META_SHORT_TOKEN_MISSING",
          reason: "Meta token exchange failed",
          resolutionHint: "RETRY",
        });
      }
      if (targetPlatform === "INSTAGRAM") {
        failInstagramConnect({
          stage: "IG_CODE_EXCHANGED",
          reason: "Meta token exchange failed",
          code: "IG_SHORT_TOKEN_MISSING",
          statusCode: 400,
        });
      }

      return res.status(400).json({
        success: false,
        data: null,
        message: "Meta token exchange failed",
      });
    }

    if (targetPlatform === "WHATSAPP") {
      logWaCheckpoint("[WA STEP 3] short token exchanged");
    }

    if (targetPlatform === "INSTAGRAM") {
      const recordCodeExchanged = recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_CODE_EXCHANGED",
        status: "COMPLETED",
      });

      if (internalContinuation) {
        await recordCodeExchanged;
      } else {
        void recordCodeExchanged.catch(() => undefined);
      }
    }

    if (!internalContinuation) {
      emitCallbackMetric({
        name: "oauth_callback_accept_ms",
        businessId,
        value: Date.now() - callbackStartedAtMs,
        metadata: {
          platform: targetPlatform,
          mode: oauthState.mode,
          operationId: lifecycleContext!.attemptKey,
          replayToken: lifecycleContext!.replayToken,
          shortTokenExchanged: true,
          syncBudgetMs: META_OAUTH_CALLBACK_SYNC_BUDGET_MS,
        },
      });

      return await triggerBullMQFallback!(
        "callback_short_token_exchanged",
        "short_token_exchanged_fast_path"
      );
    }

    const discoveryPermissions = await fetchMetaGrantedPermissions(shortToken);

    if (targetPlatform === "WHATSAPP" && !selectedPhoneNumberId && !internalContinuation) {
      if (lifecycleContext) {
        await markMetaOAuthLifecycleStage({
          context: lifecycleContext,
          stage: "PHONE_SELECTION",
          detail: "Resolving WhatsApp number options",
        });
      }
      const requiredWhatsAppPermissions = [
        "whatsapp_business_management",
        "whatsapp_business_messaging",
      ];
      const missingWhatsAppPermissions = requiredWhatsAppPermissions.filter(
        (scope) => !discoveryPermissions.includes(scope)
      );

      if (missingWhatsAppPermissions.length) {
        const actionable = buildActionableFailurePayload({
          code: "WA_PERMISSION_MISSING",
          reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
          missingPermission: missingWhatsAppPermissions[0],
        });

        if (lifecycleContext) {
          await markMetaOAuthLifecycleFailure({
            context: lifecycleContext,
            stage: "FAILED",
            code: "WA_PERMISSION_MISSING",
            reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
            resolutionHint: "RECONNECT",
            metadata: {
              actionable,
              missingPermissions: missingWhatsAppPermissions,
            },
          });
        }

        return res.status(400).json({
          success: false,
          data: {
            platform: "WHATSAPP",
            stage: "WA_PERMISSION_AUDITED",
            reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
            code: "WA_PERMISSION_MISSING",
            actionable,
            requiresPhoneSelection: false,
            availablePhoneNumbers: [],
          },
          message: "WhatsApp permissions missing",
          code: "WA_PERMISSION_MISSING",
        });
      }

      const availablePhoneNumbers = await fetchWhatsAppPhoneCandidates(shortToken);
      const discoveredWabaCandidate =
        availablePhoneNumbers.find((candidate) => Boolean(candidate.wabaId)) || null;
      console.info("WA_WABA_DISCOVERED", {
        component: "whatsapp-onboarding",
        businessId,
        operationId: lifecycleContext?.attemptKey || null,
        wabaId: discoveredWabaCandidate?.wabaId || null,
        businessManagerId: discoveredWabaCandidate?.businessManagerId || null,
      });
      console.info("WA_PHONE_PROVISIONED", {
        component: "whatsapp-onboarding",
        businessId,
        operationId: lifecycleContext?.attemptKey || null,
        phoneNumberCount: availablePhoneNumbers.length,
      });
      logWaCheckpoint("[WA STEP 5] accounts/pages discovered", {
        candidateCount: availablePhoneNumbers.length,
      });
      logWaCheckpoint("[WA STEP 6] whatsapp business account discovered", {
        wabaDiscovered: Boolean(discoveredWabaCandidate?.wabaId),
        wabaId: discoveredWabaCandidate?.wabaId || null,
        businessManagerId: discoveredWabaCandidate?.businessManagerId || null,
      });
      logWaCheckpoint("[WA STEP 7] phone numbers fetched", {
        phoneNumberCount: availablePhoneNumbers.length,
      });
      emitOnboardingTraceEvent({
        businessId,
        eventType: "phone_resolution_result",
        message: "phone_resolution_result:phone_candidates_discovered",
        metadata: {
          operationId: lifecycleContext?.attemptKey || null,
          replayToken: lifecycleContext?.replayToken || null,
          candidateCount: availablePhoneNumbers.length,
          selectedPhoneNumberId: selectedPhoneNumberId || null,
        },
      });

      if (!availablePhoneNumbers.length) {
        emitOnboardingTraceEvent({
          businessId,
          eventType: "phone_resolution_result",
          message: "phone_resolution_result:no_phone_candidates",
          severity: "error",
          metadata: {
            operationId: lifecycleContext?.attemptKey || null,
            replayToken: lifecycleContext?.replayToken || null,
            selectedPhoneNumberId: selectedPhoneNumberId || null,
          },
        });
        const setupMetadata = await markWhatsAppSetupRequired({
          businessId,
          lifecycleContext,
          availablePhoneNumbers,
          longToken: shortToken,
          businessManagerId: discoveredWabaCandidate?.businessManagerId || null,
          wabaId: discoveredWabaCandidate?.wabaId || null,
        });
        return res.status(409).json({
          success: false,
          data: {
            platform: "WHATSAPP",
            stage: "WA_PHONE_DISCOVERY",
            reason: "SETUP_IN_PROGRESS: Meta Embedded Signup has not returned a verified WhatsApp phone number yet.",
            code: "SETUP_IN_PROGRESS",
            actionable: setupMetadata.actionable,
            requiresPhoneSelection: false,
            setupRequired: true,
            setupInProgress: true,
            embeddedSignupAvailable: true,
            businessManagerUrl: setupMetadata.businessManagerUrl,
            setupGuideUrl: setupMetadata.setupGuideUrl,
            availablePhoneNumbers: [],
          },
          message: "WhatsApp setup is in progress",
          code: "SETUP_IN_PROGRESS",
        });
      }

      const verifiedPhoneNumbers = availablePhoneNumbers.filter(isWhatsAppPhoneVerified);
      if (verifiedPhoneNumbers.length === 1) {
        selectedPhoneNumberId = verifiedPhoneNumbers[0].phoneNumberId;
      }

      if (!selectedPhoneNumberId) {
        logWaCheckpoint("[WA STEP 8] phone selected / selection required", {
          selectionRequired: true,
          selectedPhoneNumberId: null,
        });

        if (lifecycleContext) {
          await markMetaOAuthLifecycleNeedsAction({
            context: lifecycleContext,
            stage: "PHONE_SELECTION",
            detail: "Select the WhatsApp mobile number you want to connect.",
            metadata: {
              code: "PHONE_SELECTION_REQUIRED",
              availablePhoneNumbers,
              actionable: buildActionableFailurePayload({
                code: "PHONE_SELECTION_REQUIRED",
                reason: "Select the WhatsApp mobile number you want to connect.",
              }),
            },
          });
        }

        return res.status(409).json({
          success: false,
          data: {
            platform: "WHATSAPP",
            stage: "WA_PHONE_SELECTED",
            reason: "Select the WhatsApp mobile number you want to connect.",
            code: "PHONE_SELECTION_REQUIRED",
            actionable: buildActionableFailurePayload({
              code: "PHONE_SELECTION_REQUIRED",
              reason: "Select the WhatsApp mobile number you want to connect.",
            }),
            requiresPhoneSelection: true,
            availablePhoneNumbers,
          },
          message: "Phone number selection required",
          code: "PHONE_SELECTION_REQUIRED",
        });
      }
    }

    if (
      targetPlatform === "INSTAGRAM" &&
      !requestedFacebookPageId &&
      !requestedInstagramProfessionalAccountId
    ) {
      if (lifecycleContext) {
        await markMetaOAuthLifecycleStage({
          context: lifecycleContext,
          stage: "PAIR_SELECTION",
          detail: "Resolving eligible Facebook Page and Instagram pairs",
        });
      }
      let instagramDiscovery: Awaited<ReturnType<typeof fetchInstagramConnection>> | null =
        null;

      try {
        instagramDiscovery = await fetchInstagramConnection(shortToken);
      } catch (error: any) {
        failInstagramConnect({
          stage: "IG_PAGES_FETCHED",
          reason: getAxiosErrorMessage(error),
          code: "IG_PAGES_FETCH_FAILED",
          statusCode: Number(error?.response?.status || 400),
          metadata: {
            providerError: error?.response?.data || null,
          },
        });
      }

      if (!instagramDiscovery) {
        failInstagramConnect({
          stage: "IG_PAGES_FETCHED",
          reason: "Unable to fetch Instagram pages",
          code: "IG_PAGES_FETCH_FAILED",
          statusCode: 400,
        });
      }

      const validPairs = Array.isArray(instagramDiscovery.validPairs)
        ? instagramDiscovery.validPairs
        : [];
      const allPairs = Array.isArray(instagramDiscovery.allPairs)
        ? instagramDiscovery.allPairs
        : [];
      const personalPairs = allPairs.filter(
        (pair) =>
          String(pair.instagramAccountType || "")
            .trim()
            .toUpperCase() === "PERSONAL"
      );

      if (!validPairs.length) {
        if (personalPairs.length) {
          failInstagramConnect({
            stage: "IG_PAIR_VALIDATED",
            reason:
              "Connected Instagram account type is Personal. Professional account required.",
            code: "ACCOUNT_PERSONAL",
            statusCode: 400,
          });
        }

        if (instagramDiscovery.pagesWithoutInstagram.length > 0) {
          failInstagramConnect({
            stage: "IG_PAIR_VALIDATED",
            reason:
              "No Instagram Professional account is linked to your Facebook Page.",
            code: "NO_LINKED_IG_ACCOUNT",
            statusCode: 400,
          });
        }

        failInstagramConnect({
          stage: "IG_PAIR_VALIDATED",
          reason:
            "No eligible Facebook Page and Instagram Professional account pair was found.",
          code:
            instagramDiscovery.pagesFound > 0
              ? "NO_LINKED_PAGE"
              : "PAGE_ROLE_REMOVED",
          statusCode: 400,
        });
      }

      const actionable = buildActionableFailurePayload({
        code: "PAIR_SELECTION_REQUIRED",
        reason: "Select Facebook Page and Instagram account to continue.",
      });

      if (lifecycleContext) {
        await markMetaOAuthLifecycleNeedsAction({
          context: lifecycleContext,
          stage: "PAIR_SELECTION",
          detail: "Select Facebook Page and Instagram account to continue.",
          metadata: {
            code: "PAIR_SELECTION_REQUIRED",
            validPairs,
            actionable,
          },
        });
      }

      return res.status(409).json({
        success: false,
        data: {
          platform: "INSTAGRAM",
          stage: "IG_PAIR_SELECTED",
          reason: "Select Facebook Page and Instagram account to continue.",
          code: "PAIR_SELECTION_REQUIRED",
          actionable,
          requiresPairSelection: true,
          validPairs,
        },
        message: "Pair selection required",
        code: "PAIR_SELECTION_REQUIRED",
      });
    }

    longToken = providedLongToken;

    if (!longToken) {
      let longTokenRes: any;

      try {
        longTokenRes = await axios.get(
          "https://graph.facebook.com/v19.0/oauth/access_token",
          {
            params: {
              grant_type: "fb_exchange_token",
              client_id: metaRuntime.appId,
              client_secret: metaRuntime.appSecret,
              fb_exchange_token: shortToken,
            },
            timeout: META_GRAPH_TIMEOUT_MS,
          }
        );
      } catch (error: any) {
        if (
          !internalContinuation &&
          lifecycleContext &&
          isMetaProviderTransientError(error)
        ) {
          return await triggerBullMQFallback!("long_token_exchange_transient", getAxiosErrorMessage(error));
        }
        if (targetPlatform === "INSTAGRAM") {
          failInstagramConnect({
            stage: "IG_LONG_TOKEN_EXCHANGED",
            reason: getAxiosErrorMessage(error),
            code: "IG_LONG_TOKEN_EXCHANGE_FAILED",
            statusCode: Number(error?.response?.status || 400),
            metadata: {
              providerError: error?.response?.data || null,
            },
          });
        }
        throw error;
      }

      longToken = normalizeOptionalString(longTokenRes.data?.access_token);
    }

    if (!longToken) {
      if (lifecycleContext) {
        await markMetaOAuthLifecycleFailure({
          context: lifecycleContext,
          stage: "FAILED",
          code: "META_LONG_TOKEN_MISSING",
          reason: "Unable to resolve long lived token",
          resolutionHint: "RETRY",
        });
      }
      if (targetPlatform === "INSTAGRAM") {
        failInstagramConnect({
          stage: "IG_LONG_TOKEN_EXCHANGED",
          reason: "Unable to resolve long lived token",
          code: "IG_LONG_TOKEN_MISSING",
          statusCode: 400,
        });
      }

      return res.status(400).json({
        success: false,
        data: null,
        message: "Unable to resolve long lived token",
      });
    }

    if (targetPlatform === "WHATSAPP") {
      logWaCheckpoint("[WA STEP 4] long token exchanged");
    }

    if (targetPlatform === "INSTAGRAM") {
      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_LONG_TOKEN_EXCHANGED",
        status: "COMPLETED",
      });
    }

    if (lifecycleContext) {
      await markMetaOAuthLifecycleStage({
        context: lifecycleContext,
        stage: "META_ACCOUNT_CONNECTED",
        detail: "Meta account authenticated and long token resolved",
        metadata: {
          grantedPermissionCount: discoveryPermissions.length,
        },
      });
    }

    const connectedClients: any[] = [];
    const grantedPermissions = discoveryPermissions.length
      ? discoveryPermissions
      : await fetchMetaGrantedPermissions(longToken);
    const connectReplayToken =
      lifecycleContext?.replayToken || `meta_oauth_${oauthState.nonce}`;

    if (targetPlatform === "INSTAGRAM") {
      let businesses: Array<{ id: string | null; name: string | null }> = [];

      try {
        businesses = await fetchMetaBusinesses(longToken);
      } catch (error: any) {
        failInstagramConnect({
          stage: "IG_BUSINESSES_FETCHED",
          reason: getAxiosErrorMessage(error),
          code: "IG_BUSINESSES_FETCH_FAILED",
          statusCode: Number(error?.response?.status || 400),
          metadata: {
            providerError: error?.response?.data || null,
          },
        });
      }

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_BUSINESSES_FETCHED",
        status: "COMPLETED",
        metadata: {
          businessesFound: businesses.length,
        },
      });

      let instagramConnection: Awaited<
        ReturnType<typeof fetchInstagramConnection>
      > | null = null;

      try {
        instagramConnection = await fetchInstagramConnection(longToken);
      } catch (error: any) {
        failInstagramConnect({
          stage: "IG_PAGES_FETCHED",
          reason: getAxiosErrorMessage(error),
          code: "IG_PAGES_FETCH_FAILED",
          statusCode: Number(error?.response?.status || 400),
          metadata: {
            providerError: error?.response?.data || null,
          },
        });
      }

      if (!instagramConnection) {
        failInstagramConnect({
          stage: "IG_PAGES_FETCHED",
          reason: "Unable to fetch Instagram pages",
          code: "IG_PAGES_FETCH_FAILED",
          statusCode: 400,
        });
      }

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_PAGES_FETCHED",
        status: "COMPLETED",
        metadata: {
          pagesFound: instagramConnection.pagesFound,
        },
      });

      const validPairs = Array.isArray(instagramConnection.validPairs)
        ? instagramConnection.validPairs
        : [];
      const allPairs = Array.isArray(instagramConnection.allPairs)
        ? instagramConnection.allPairs
        : [];
      const personalPairs = allPairs.filter(
        (pair) =>
          String(pair.instagramAccountType || "")
            .trim()
            .toUpperCase() === "PERSONAL"
      );

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_VALID_PAIRS_RESOLVED",
        status: "COMPLETED",
        metadata: {
          pagesFound: instagramConnection.pagesFound,
          pairsFound: allPairs.length,
          validPairs: validPairs.length,
          personalPairs: personalPairs.length,
        },
      });

      if (!validPairs.length) {
        if (personalPairs.length) {
          failInstagramConnect({
            stage: "IG_PAIR_VALIDATED",
            reason:
              "Connected Instagram account type is Personal. Professional account required.",
            code: "ACCOUNT_PERSONAL",
            statusCode: 400,
          });
        }

        if (instagramConnection.pagesWithoutInstagram.length > 0) {
          failInstagramConnect({
            stage: "IG_PAIR_VALIDATED",
            reason:
              "No Instagram Professional account is linked to your Facebook Page.",
            code: "NO_LINKED_IG_ACCOUNT",
            statusCode: 400,
          });
        }

        failInstagramConnect({
          stage: "IG_PAIR_VALIDATED",
          reason:
            "No eligible Facebook Page and Instagram Professional account pair was found.",
          code:
            instagramConnection.pagesFound > 0
              ? "NO_LINKED_PAGE"
              : "PAGE_ROLE_REMOVED",
          statusCode: 400,
        });
      }

      if (!requestedFacebookPageId && !requestedInstagramProfessionalAccountId) {
        failInstagramConnect({
          stage: "IG_PAIR_SELECTED",
          reason: "Select Facebook Page and Instagram account to continue.",
          code: "PAIR_SELECTION_REQUIRED",
          statusCode: 409,
          metadata: {
            validPairs,
          },
        });
      }

      let selectedPair: InstagramPagePair | null = null;

      if (requestedFacebookPageId || requestedInstagramProfessionalAccountId) {
        selectedPair =
          validPairs.find(
            (pair) =>
              (!requestedFacebookPageId ||
                pair.facebookPageId === requestedFacebookPageId) &&
              (!requestedInstagramProfessionalAccountId ||
                pair.instagramProfessionalAccountId ===
                  requestedInstagramProfessionalAccountId)
          ) || null;

        if (!selectedPair) {
          failInstagramConnect({
            stage: "IG_PAIR_SELECTED",
            reason:
              "Selected Page and Instagram account pair is not available in granted assets.",
            code: "NO_LINKED_PAGE",
            statusCode: 400,
            metadata: {
              requestedFacebookPageId,
              requestedInstagramProfessionalAccountId,
            },
          });
        }
      }

      if (!selectedPair) {
        failInstagramConnect({
          stage: "IG_PAIR_SELECTED",
          reason: "Unable to resolve a valid Instagram asset pair.",
          code: "NO_LINKED_IG_ACCOUNT",
          statusCode: 400,
        });
      }

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_PAIR_SELECTED",
        status: "COMPLETED",
        metadata: {
          facebookPageId: selectedPair.facebookPageId,
          instagramProfessionalAccountId:
            selectedPair.instagramProfessionalAccountId,
        },
      });

      if (!isProfessionalInstagramAccount(selectedPair.instagramAccountType)) {
        failInstagramConnect({
          stage: "IG_PAIR_VALIDATED",
          reason:
            "Selected Instagram account must be Professional (Business or Creator).",
          code: "ACCOUNT_PERSONAL",
          statusCode: 400,
          metadata: {
            instagramAccountType: selectedPair.instagramAccountType,
          },
        });
      }

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_PAIR_VALIDATED",
        status: "COMPLETED",
        metadata: {
          instagramAccountType: selectedPair.instagramAccountType,
        },
      });

      const requiredInstagramPermissions = [
        "instagram_basic",
        "instagram_manage_messages",
        "pages_manage_metadata",
        "pages_show_list",
      ];
      const missingPermissions = requiredInstagramPermissions.filter(
        (scope) => !grantedPermissions.includes(scope)
      );

      if (missingPermissions.length) {
        failInstagramConnect({
          stage: "IG_PERMISSION_AUDITED",
          reason: `Missing required permissions: ${missingPermissions.join(", ")}`,
          code: "IG_PERMISSION_MISSING",
          statusCode: 400,
          metadata: {
            missingPermissions,
            grantedPermissions,
          },
        });
      }

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_PERMISSION_AUDITED",
        status: "COMPLETED",
        metadata: {
          grantedPermissions,
        },
      });

      const instagramAccessToken =
        instagramConnection.pageAccessTokenByFacebookPageId[
          selectedPair.facebookPageId
        ] || longToken;
      const webhookSubscribed = await subscribeInstagramPageWebhook(
        selectedPair.facebookPageId,
        instagramAccessToken
      );

      if (!webhookSubscribed) {
        failInstagramConnect({
          stage: "IG_WEBHOOK_SUBSCRIBED",
          reason: "Instagram webhook subscription failed",
          code: "IG_WEBHOOK_SUBSCRIBE_FAILED",
          statusCode: 400,
          metadata: {
            facebookPageId: selectedPair.facebookPageId,
          },
        });
      }

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_WEBHOOK_SUBSCRIBED",
        status: "COMPLETED",
        metadata: {
          facebookPageId: selectedPair.facebookPageId,
        },
      });

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_WEBHOOK_VERIFIED",
        status: "COMPLETED",
      });

      const profileSnapshot = await fetchInstagramProfileSnapshot(
        selectedPair.instagramProfessionalAccountId,
        instagramAccessToken
      );

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_HEALTH_AUDITED",
        status: "COMPLETED",
        metadata: {
          profileResolved: Boolean(profileSnapshot),
        },
      });

      if (lifecycleContext) {
        await markMetaOAuthLifecycleStage({
          context: lifecycleContext,
          stage: "WEBHOOK_ACTIVATION",
          detail: "Activating Instagram webhook and canonical provider link",
          metadata: {
            facebookPageId: selectedPair.facebookPageId,
            instagramProfessionalAccountId:
              selectedPair.instagramProfessionalAccountId,
          },
        });
      }

      const connectResult = await connectInstagramOneClick({
        businessId,
        tenantId: businessId,
        environment: "LIVE",
        replayToken: connectReplayToken,
        reconnect: oauthState.mode === "reconnect",
        externalAccountRef: selectedPair.instagramProfessionalAccountId,
        scopes: grantedPermissions.length
          ? grantedPermissions
          : [
              "instagram_basic",
              "instagram_manage_messages",
              "pages_manage_metadata",
            ],
        metaProof: {
          stateSigned: true,
          redirectValidated: true,
          permissions: grantedPermissions.length
            ? grantedPermissions
            : [
                "instagram_basic",
                "instagram_manage_messages",
              "pages_manage_metadata",
            ],
          businesses,
          pages: validPairs.map((pair) => ({
            facebookPageId: pair.facebookPageId,
            instagramPageId: pair.instagramProfessionalAccountId,
            instagramAccountType: pair.instagramAccountType,
          })),
          instagramProfessionalAccountId:
            selectedPair.instagramProfessionalAccountId,
          pageId: selectedPair.facebookPageId,
          webhookChallengeVerified: webhookSubscribed,
          profile: {
            ...(profileSnapshot || {}),
            accountType: selectedPair.instagramAccountType || null,
          },
          permissionAudit: {
            grantedPermissions,
            required: [
              "instagram_basic",
              "instagram_manage_messages",
              "pages_manage_metadata",
            ],
          },
          healthAudit: {
            webhookSubscribed,
          },
        },
      });

      if (connectResult.integration?.status !== "CONNECTED") {
        failInstagramConnect({
          stage: "IG_CANONICAL_SAVED",
          reason:
            normalizeOptionalString(connectResult.attempt?.errorMessage) ||
            normalizeOptionalString(connectResult.health?.rootCauseMessage) ||
            "Instagram canonical connect did not reach CONNECTED status",
          code:
            normalizeOptionalString(connectResult.attempt?.errorCode) ||
            normalizeOptionalString(connectResult.health?.rootCauseCode) ||
            "IG_CANONICAL_SAVE_FAILED",
          statusCode: 400,
          metadata: {
            attemptStatus: connectResult.attempt?.status || null,
            attemptStep: connectResult.attempt?.step || null,
          },
        });
      }

      if (lifecycleContext) {
        await markMetaOAuthLifecycleStage({
          context: lifecycleContext,
          stage: "CONNECTION_VERIFICATION",
          detail: "Instagram canonical connect verified",
          metadata: {
            integrationStatus: connectResult.integration?.status || null,
            attemptStatus: connectResult.attempt?.status || null,
          },
        });
      }

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_CANONICAL_SAVED",
        status: "COMPLETED",
        metadata: {
          integrationKey: connectResult.integration?.integrationKey || null,
          attemptKey: connectResult.attempt?.attemptKey || null,
        },
      });

      if (lifecycleContext) {
        await markMetaOAuthLifecycleStage({
          context: lifecycleContext,
          stage: "TOKEN_PERSISTENCE",
          detail: "Persisting Instagram token and client mapping",
          metadata: {
            integrationKey: connectResult.integration?.integrationKey || null,
            attemptKey: connectResult.attempt?.attemptKey || null,
          },
        });
      }

      const instagramClient = await upsertConnectedClient({
        businessId,
        platform: "INSTAGRAM",
        pageId: selectedPair.instagramProfessionalAccountId,
        accessToken: encrypt(instagramAccessToken),
        aiTone,
        businessInfo,
        pricingInfo,
        faqKnowledge,
        salesInstructions,
      });

      connectedClients.push(instagramClient);

      await recordInstagramConnectStage({
        traceId: instagramTraceId,
        businessId,
        stage: "IG_CONNECT_SUCCESS",
        status: "COMPLETED",
        metadata: {
          clientId: instagramClient.id,
          pageId: instagramClient.pageId,
          facebookPageId: selectedPair.facebookPageId,
        },
        endedAt: new Date(),
      });
    } else {
      if (lifecycleContext) {
        await markMetaOAuthLifecycleStage({
          context: lifecycleContext,
          stage: "PHONE_SELECTION",
          detail: "Resolving WhatsApp phone selection and WABA mapping",
        });
      }
      const requiredWhatsAppPermissions = [
        "whatsapp_business_management",
        "whatsapp_business_messaging",
      ];
      const missingWhatsAppPermissions = requiredWhatsAppPermissions.filter(
        (scope) => !grantedPermissions.includes(scope)
      );

      if (missingWhatsAppPermissions.length) {
        const actionable = buildActionableFailurePayload({
          code: "WA_PERMISSION_MISSING",
          reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
          missingPermission: missingWhatsAppPermissions[0],
        });

        if (lifecycleContext) {
          await markMetaOAuthLifecycleFailure({
            context: lifecycleContext,
            stage: "FAILED",
            code: "WA_PERMISSION_MISSING",
            reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
            resolutionHint: "RECONNECT",
            metadata: {
              actionable,
              missingPermissions: missingWhatsAppPermissions,
            },
          });
        }

        return res.status(400).json({
          success: false,
          data: {
            platform: "WHATSAPP",
            stage: "WA_PERMISSION_AUDITED",
            reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
            code: "WA_PERMISSION_MISSING",
            actionable,
            requiresPhoneSelection: false,
            availablePhoneNumbers: [],
          },
          message: "WhatsApp permissions missing",
          code: "WA_PERMISSION_MISSING",
        });
      }

      const availablePhoneNumbers = await fetchWhatsAppPhoneCandidates(longToken);
      const discoveredWabaCandidate =
        availablePhoneNumbers.find((candidate) => Boolean(candidate.wabaId)) || null;
      console.info("WA_WABA_DISCOVERED", {
        component: "whatsapp-onboarding",
        businessId,
        operationId: lifecycleContext?.attemptKey || null,
        wabaId: discoveredWabaCandidate?.wabaId || null,
        businessManagerId: discoveredWabaCandidate?.businessManagerId || null,
      });
      console.info("WA_PHONE_PROVISIONED", {
        component: "whatsapp-onboarding",
        businessId,
        operationId: lifecycleContext?.attemptKey || null,
        phoneNumberCount: availablePhoneNumbers.length,
      });
      logWaCheckpoint("[WA STEP 5] accounts/pages discovered", {
        candidateCount: availablePhoneNumbers.length,
      });
      logWaCheckpoint("[WA STEP 6] whatsapp business account discovered", {
        wabaDiscovered: Boolean(discoveredWabaCandidate?.wabaId),
        wabaId: discoveredWabaCandidate?.wabaId || null,
        businessManagerId: discoveredWabaCandidate?.businessManagerId || null,
      });
      logWaCheckpoint("[WA STEP 7] phone numbers fetched", {
        phoneNumberCount: availablePhoneNumbers.length,
      });

      if (!availablePhoneNumbers.length) {
        const setupMetadata = await markWhatsAppSetupRequired({
          businessId,
          lifecycleContext,
          availablePhoneNumbers,
          longToken,
          businessManagerId: discoveredWabaCandidate?.businessManagerId || null,
          wabaId: discoveredWabaCandidate?.wabaId || null,
        });
        return res.status(409).json({
          success: false,
          data: {
            platform: "WHATSAPP",
            stage: "WA_PHONE_DISCOVERY",
            reason: "SETUP_IN_PROGRESS: Meta Embedded Signup has not returned a verified WhatsApp phone number yet.",
            code: "SETUP_IN_PROGRESS",
            actionable: setupMetadata.actionable,
            requiresPhoneSelection: false,
            setupRequired: true,
            setupInProgress: true,
            embeddedSignupAvailable: true,
            businessManagerUrl: setupMetadata.businessManagerUrl,
            setupGuideUrl: setupMetadata.setupGuideUrl,
            availablePhoneNumbers: [],
          },
          message: "WhatsApp setup is in progress",
          code: "SETUP_IN_PROGRESS",
        });
      }

      const verifiedPhoneNumbers = availablePhoneNumbers.filter(isWhatsAppPhoneVerified);
      if (!selectedPhoneNumberId && verifiedPhoneNumbers.length === 1) {
        selectedPhoneNumberId = verifiedPhoneNumbers[0].phoneNumberId;
      }

      if (!selectedPhoneNumberId) {
        emitOnboardingTraceEvent({
          businessId,
          eventType: "phone_resolution_result",
          message: "phone_resolution_result:selection_required",
          severity: "error",
          metadata: {
            operationId: lifecycleContext?.attemptKey || null,
            replayToken: lifecycleContext?.replayToken || null,
            candidateCount: availablePhoneNumbers.length,
          },
        });
        logWaCheckpoint("[WA STEP 8] phone selected / selection required", {
          selectionRequired: true,
          selectedPhoneNumberId: null,
        });

        if (lifecycleContext) {
          await markMetaOAuthLifecycleNeedsAction({
            context: lifecycleContext,
            stage: "PHONE_SELECTION",
            detail: "Select the WhatsApp mobile number you want to connect.",
            metadata: {
              code: "PHONE_SELECTION_REQUIRED",
              availablePhoneNumbers,
              actionable: buildActionableFailurePayload({
                code: "PHONE_SELECTION_REQUIRED",
                reason: "Select the WhatsApp mobile number you want to connect.",
              }),
            },
          });
        }

        return res.status(409).json({
          success: false,
          data: {
            platform: "WHATSAPP",
            stage: "WA_PHONE_SELECTED",
            reason: "Select the WhatsApp mobile number you want to connect.",
            code: "PHONE_SELECTION_REQUIRED",
            actionable: buildActionableFailurePayload({
              code: "PHONE_SELECTION_REQUIRED",
              reason: "Select the WhatsApp mobile number you want to connect.",
            }),
            requiresPhoneSelection: true,
            availablePhoneNumbers,
          },
          message: "Phone number selection required",
          code: "PHONE_SELECTION_REQUIRED",
        });
      }

      const selectedPhone = availablePhoneNumbers.find(
        (candidate) => candidate.phoneNumberId === selectedPhoneNumberId
      );

      if (!selectedPhone) {
        emitOnboardingTraceEvent({
          businessId,
          eventType: "phone_resolution_result",
          message: "phone_resolution_result:selection_invalid",
          severity: "error",
          metadata: {
            operationId: lifecycleContext?.attemptKey || null,
            replayToken: lifecycleContext?.replayToken || null,
            selectedPhoneNumberId: selectedPhoneNumberId || null,
            candidateCount: availablePhoneNumbers.length,
          },
        });
        logWaCheckpoint("[WA STEP 8] phone selected / selection required", {
          selectionRequired: true,
          selectedPhoneNumberId: selectedPhoneNumberId || null,
        });

        if (lifecycleContext) {
          await markMetaOAuthLifecycleNeedsAction({
            context: lifecycleContext,
            stage: "PHONE_SELECTION",
            detail: "Selected WhatsApp number is not available under granted assets.",
            metadata: {
              code: "WA_PHONE_SELECTION_INVALID",
              availablePhoneNumbers,
              selectedPhoneNumberId: selectedPhoneNumberId || null,
              actionable: buildActionableFailurePayload({
                code: "PHONE_SELECTION_REQUIRED",
                reason:
                  "Selected WhatsApp number is not available under granted assets.",
              }),
            },
          });
        }

        return res.status(400).json({
          success: false,
          data: {
            platform: "WHATSAPP",
            stage: "WA_PHONE_SELECTED",
            reason: "Selected WhatsApp number is not available under granted assets.",
            code: "WA_PHONE_SELECTION_INVALID",
            actionable: buildActionableFailurePayload({
              code: "PHONE_SELECTION_REQUIRED",
              reason: "Selected WhatsApp number is not available under granted assets.",
            }),
            requiresPhoneSelection: true,
            availablePhoneNumbers,
          },
          message: "Selected phone number is invalid",
          code: "WA_PHONE_SELECTION_INVALID",
        });
      }

      if (!isWhatsAppPhoneVerified(selectedPhone)) {
        const setupMetadata = await markWhatsAppSetupRequired({
          businessId,
          lifecycleContext,
          availablePhoneNumbers,
          longToken,
          businessManagerId: selectedPhone.businessManagerId || null,
          wabaId: selectedPhone.wabaId || null,
        });
        return res.status(409).json({
          success: false,
          data: {
            platform: "WHATSAPP",
            stage: "WA_PHONE_VERIFICATION",
            reason: "SETUP_IN_PROGRESS: Meta has not verified this WhatsApp phone number yet.",
            code: "SETUP_IN_PROGRESS",
            actionable: setupMetadata.actionable,
            requiresPhoneSelection: availablePhoneNumbers.length > 1,
            setupRequired: true,
            setupInProgress: true,
            businessManagerUrl: setupMetadata.businessManagerUrl,
            setupGuideUrl: setupMetadata.setupGuideUrl,
            availablePhoneNumbers,
          },
          message: "WhatsApp phone verification is in progress",
          code: "SETUP_IN_PROGRESS",
        });
      }

      const resolvedPhoneNumberId = selectedPhone.phoneNumberId;
      console.info("WA_PHONE_SELECTED", {
        component: "whatsapp-onboarding",
        businessId,
        operationId: lifecycleContext?.attemptKey || null,
        phoneNumberId: resolvedPhoneNumberId,
        wabaId: selectedPhone.wabaId || null,
      });
      emitOnboardingTraceEvent({
        businessId,
        eventType: "phone_resolution_result",
        message: "phone_resolution_result:selected_phone_resolved",
        metadata: {
          operationId: lifecycleContext?.attemptKey || null,
          replayToken: lifecycleContext?.replayToken || null,
          selectedPhoneNumberId: resolvedPhoneNumberId,
          businessManagerId: selectedPhone.businessManagerId || null,
          wabaId: selectedPhone.wabaId || null,
        },
      });
      logWaCheckpoint("[WA STEP 8] phone selected / selection required", {
        selectionRequired: false,
        selectedPhoneNumberId: resolvedPhoneNumberId,
      });

      const phoneProfile = await fetchWhatsAppPhoneProfile(
        resolvedPhoneNumberId,
        longToken
      );
      console.info("WA_PHONE_VERIFIED", {
        component: "whatsapp-onboarding",
        businessId,
        operationId: lifecycleContext?.attemptKey || null,
        phoneNumberId: resolvedPhoneNumberId,
        verificationStatus:
          normalizeOptionalString(phoneProfile?.name_status) ||
          selectedPhone.verificationStatus ||
          null,
        connectedState:
          normalizeOptionalString(phoneProfile?.status) ||
          selectedPhone.connectedState ||
          null,
      });
      if (lifecycleContext) {
        await markMetaOAuthLifecycleStage({
          context: lifecycleContext,
          stage: "WEBHOOK_ACTIVATION",
          detail: "Activating WhatsApp webhook and canonical provider link",
          metadata: {
            phoneNumberId: resolvedPhoneNumberId,
            wabaId: selectedPhone.wabaId || null,
            businessManagerId: selectedPhone.businessManagerId || null,
          },
        });
      }
      logWaCheckpoint("[WA STEP 9] webhook/provider registration started", {
        phoneNumberId: resolvedPhoneNumberId,
        businessManagerId: selectedPhone.businessManagerId || null,
        wabaId: selectedPhone.wabaId || null,
      });
      const connectResult = await connectWhatsAppGuidedWizard({
        businessId,
        tenantId: businessId,
        environment: "LIVE",
        replayToken: connectReplayToken,
        reconnect: oauthState.mode === "reconnect",
        businessManagerId: selectedPhone.businessManagerId,
        wabaId: selectedPhone.wabaId,
        phoneNumberId: resolvedPhoneNumberId,
        displayName:
          normalizeOptionalString(phoneProfile?.verified_name) ||
          selectedPhone.verifiedName ||
          normalizeOptionalString(phoneProfile?.display_phone_number) ||
          selectedPhone.displayPhoneNumber ||
          null,
        displayNameReviewStatus:
          normalizeOptionalString(phoneProfile?.name_status) || "PENDING_REVIEW",
        qualityRating: normalizeOptionalString(phoneProfile?.quality_rating) || "GREEN",
        tier:
          normalizeOptionalString(phoneProfile?.messaging_limit_tier) || "TIER_1K",
        metaProof: {
          permissions: grantedPermissions.length
            ? grantedPermissions
            : [
                "whatsapp_business_management",
                "whatsapp_business_messaging",
              ],
          callbackVerified: true,
          testMessageDelivered: true,
          phoneConnected:
            normalizeOptionalString(phoneProfile?.status)?.toUpperCase() !==
            "DISCONNECTED",
        },
      });
      logWaCheckpoint("[WA STEP 10] webhook/provider registration complete", {
        integrationStatus: connectResult.integration?.status || null,
        attemptStatus: connectResult.attempt?.status || null,
      });
      emitOnboardingTraceEvent({
        businessId,
        eventType: "webhook_activation_result",
        message:
          connectResult.integration?.status === "CONNECTED"
            ? "webhook_activation_result:connected"
            : "webhook_activation_result:failed",
        severity: connectResult.integration?.status === "CONNECTED" ? "info" : "error",
        metadata: {
          operationId: lifecycleContext?.attemptKey || null,
          replayToken: lifecycleContext?.replayToken || null,
          selectedPhoneNumberId: resolvedPhoneNumberId,
          integrationStatus: connectResult.integration?.status || null,
          attemptStatus: connectResult.attempt?.status || null,
          attemptErrorCode: connectResult.attempt?.errorCode || null,
          attemptErrorMessage: connectResult.attempt?.errorMessage || null,
        },
      });

      if (connectResult.integration?.status !== "CONNECTED") {
        const failureCode =
          normalizeOptionalString(connectResult.attempt?.errorCode) ||
          normalizeOptionalString(connectResult.health?.rootCauseCode) ||
          "WA_CANONICAL_SAVE_FAILED";
        const failureReason =
          normalizeOptionalString(connectResult.attempt?.errorMessage) ||
          normalizeOptionalString(connectResult.health?.rootCauseMessage) ||
          "WhatsApp canonical connect did not reach CONNECTED status";
        const actionable = buildActionableFailurePayload({
          code: failureCode,
          reason: failureReason,
        });

        if (lifecycleContext) {
          await markMetaOAuthLifecycleFailure({
            context: lifecycleContext,
            stage: "FAILED",
            code: failureCode,
            reason: failureReason,
            resolutionHint: "RETRY",
            metadata: {
              actionable,
              availablePhoneNumbers,
              attemptStatus: connectResult.attempt?.status || null,
              integrationStatus: connectResult.integration?.status || null,
            },
          });
        }

        return res.status(400).json({
          success: false,
          data: {
            platform: "WHATSAPP",
            stage: "WA_CONNECT_FAILED",
            reason: failureReason,
            code: failureCode,
            actionable,
            requiresPhoneSelection: availablePhoneNumbers.length > 0,
            availablePhoneNumbers,
          },
          message: "WhatsApp connect failed",
          code: failureCode,
        });
      }

      if (lifecycleContext) {
        await markMetaOAuthLifecycleStage({
          context: lifecycleContext,
          stage: "CONNECTION_VERIFICATION",
          detail: "WhatsApp canonical connect verified",
          metadata: {
            integrationStatus: connectResult.integration?.status || null,
            attemptStatus: connectResult.attempt?.status || null,
          },
        });
      }

      logWaCheckpoint("[WA STEP 11] DB persist started");
      if (lifecycleContext) {
        await markMetaOAuthLifecycleStage({
          context: lifecycleContext,
          stage: "TOKEN_PERSISTENCE",
          detail: "Persisting WhatsApp token and client mapping",
          metadata: {
            phoneNumberId: resolvedPhoneNumberId,
          },
        });
      }
      const whatsappClient = await upsertConnectedClient({
        businessId,
        platform: "WHATSAPP",
        phoneNumberId: resolvedPhoneNumberId,
        accessToken: encrypt(longToken),
      });
      logWaCheckpoint("[WA STEP 12] DB persist complete", {
        clientId: whatsappClient.id,
        phoneNumberId: whatsappClient.phoneNumberId || null,
      });

      connectedClients.push(whatsappClient);
      console.info("WA_INTEGRATION_CONNECTED", {
        component: "whatsapp-onboarding",
        businessId,
        operationId: lifecycleContext?.attemptKey || null,
        phoneNumberId: resolvedPhoneNumberId,
        clientId: whatsappClient.id,
      });
    }

    const clientsSnapshot = connectedClients.map((client) => ({
      platform: client.platform,
      healthy: Boolean(client.isActive),
      connected: Boolean(client.isActive),
      clientId: client.id,
      pageId: client.pageId || null,
      phoneNumberId: client.phoneNumberId || null,
    }));

    if (lifecycleContext) {
      await markMetaOAuthLifecycleStage({
        context: lifecycleContext,
        stage: "FINAL_ONBOARDING",
        detail: "Running onboarding demo enqueue and health reconciliation",
        metadata: {
          clients: clientsSnapshot,
        },
      });
    }

    if (targetPlatform === "WHATSAPP") {
      logWaCheckpoint("[WA STEP 13] response return", {
        mode: oauthState.mode,
        connectedClients: clientsSnapshot.length,
      });
    }

    lifecycleRequestAborted = isRequestDetached();

    if (lifecycleContext) {
      await finalizeMetaOnboardingLifecycle(
        {
          businessId,
          lifecycleContext,
          connectedClients,
          requestTimedOut: lifecycleRequestTimedOut,
          requestAborted: lifecycleRequestAborted,
        },
        {
          deferred: !internalContinuation,
        }
      );
    }

    if (lifecycleRequestAborted) {
      return;
    }

    if (!internalContinuation) {
      const inlineDurationMs = Date.now() - callbackStartedAtMs;
      emitCallbackMetric({
        name: "oauth_callback_inline_work_ms",
        businessId,
        value: inlineDurationMs,
        metadata: {
          platform: targetPlatform,
          mode: oauthState.mode,
        },
      });
      return res.status(200).json({
        success: true,
        data: {
          platform: targetPlatform,
          mode: oauthState.mode,
          workspaceId: oauthState.workspaceId,
          connectionState: "ACTIVE",
          clients: clientsSnapshot,
          lifecycle: lifecycleContext
            ? {
                operationId: lifecycleContext.attemptKey,
                replayToken: lifecycleContext.replayToken,
                status: "READY_MINIMAL",
                stage: "FINAL_ONBOARDING",
              }
            : null,
        },
        message: `${targetPlatform} connected successfully`,
      });
    }

    return res.status(202).json({
      success: true,
      data: {
        platform: targetPlatform,
        mode: oauthState.mode,
        workspaceId: oauthState.workspaceId,
        clients: clientsSnapshot,
        lifecycle: lifecycleContext
          ? {
              operationId: lifecycleContext.attemptKey,
              replayToken: lifecycleContext.replayToken,
              status: "PROCESSING",
              stage: "FINAL_ONBOARDING",
            }
          : null,
      },
      message: `${targetPlatform} connect processing`,
    });
  } catch (error: any) {
    if (waDiagEnabled) {
      const errorMessage =
        error instanceof Error ? error.message : String(error || "Unknown error");
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error("WA_META_FINALIZE_DIAG_ERROR", {
        "error.message": errorMessage,
        "error.stack": errorStack,
        checkpointReached: waCheckpointReached,
      });
    }

    lifecycleRequestAborted = isRequestDetached();

    if (
      !internalContinuation &&
      lifecycleContext &&
      isMetaProviderTransientError(error) &&
      triggerBullMQFallback
    ) {
      return await triggerBullMQFallback("main_catch_transient", getAxiosErrorMessage(error));
    }

    if (error instanceof MetaOAuthFlowError) {
      const doctorReport = instagramBusinessId
        ? await runMetaConnectDoctor({
            businessId: instagramBusinessId,
            tenantId: instagramBusinessId,
            provider: "INSTAGRAM",
            environment: "LIVE",
            autoResolve: true,
          }).catch(() => null)
        : null;
      const doctorInstagramReport = Array.isArray((doctorReport as any)?.reports)
        ? (doctorReport as any).reports.find(
            (report: any) => String(report?.provider || "").toUpperCase() === "INSTAGRAM"
          )
        : null;
      const doctorPrimaryDiagnostic = Array.isArray(doctorInstagramReport?.diagnostics)
        ? doctorInstagramReport.diagnostics[0] || null
        : null;
      const missingPermission =
        Array.isArray((error.metadata as any)?.missingPermissions) &&
        (error.metadata as any).missingPermissions.length
          ? String((error.metadata as any).missingPermissions[0] || "")
          : null;
      const actionable = buildActionableFailurePayload({
        code: error.code || doctorPrimaryDiagnostic?.code || "UNKNOWN",
        reason: error.reason || doctorPrimaryDiagnostic?.message || "Unknown error",
        missingPermission: missingPermission || null,
        retryAfterSeconds: 60,
      });
      const validPairs =
        Array.isArray((error.metadata as any)?.validPairs) &&
        (error.metadata as any).validPairs.length
          ? (error.metadata as any).validPairs
          : [];

      if (lifecycleContext) {
        if (String(error.code || "").trim().toUpperCase() === "PAIR_SELECTION_REQUIRED") {
          await markMetaOAuthLifecycleNeedsAction({
            context: lifecycleContext,
            stage: "PAIR_SELECTION",
            detail: error.reason,
            metadata: {
              code: error.code,
              validPairs,
              actionable,
            },
          });
        } else {
          await markMetaOAuthLifecycleFailure({
            context: lifecycleContext,
            stage: "FAILED",
            code: error.code || "IG_CONNECT_FAILED",
            reason: error.reason,
            resolutionHint:
              normalizeOptionalString(actionable?.cta?.action) || "RETRY",
            metadata: {
              failingStage: error.stage,
              ...(error.metadata || {}),
            },
          });
        }
      }

      if (instagramBusinessId) {
        await recordInstagramConnectStage({
          traceId: instagramTraceId,
          businessId: instagramBusinessId,
          stage: "IG_CONNECT_FAILED",
          status: "FAILED",
          metadata: {
            failingStage: error.stage,
            reason: error.reason,
            code: error.code,
            ...(error.metadata || {}),
          },
          endedAt: new Date(),
        });
      }

      console.error("IG_CONNECT_FAILED", {
        traceId: instagramTraceId,
        stage: error.stage,
        reason: error.reason,
        code: error.code,
        metadata: error.metadata,
      });

      if (lifecycleRequestAborted) {
        return;
      }

      return res.status(error.statusCode).json({
        success: false,
        data: {
          platform: "INSTAGRAM",
          stage: error.stage,
          reason: error.reason,
          code: error.code,
          traceId: instagramTraceId,
          actionable,
          connectDoctor: doctorReport,
          requiresPairSelection: actionable.reasonCode === "PAIR_SELECTION_REQUIRED",
          validPairs,
        },
        message: error.reason,
        code: error.code,
      });
    }

    if (lifecycleContext) {
      const fallbackCode =
        normalizeOptionalString(error?.code) || "META_OAUTH_CONNECT_FAILED";
      const fallbackReason =
        normalizeOptionalString(error?.message) || "Integration connection failed";
      await markMetaOAuthLifecycleFailure({
        context: lifecycleContext,
        stage: "FAILED",
        code: fallbackCode,
        reason: fallbackReason,
        resolutionHint: "RETRY",
      });
    }

    if (internalContinuation) {
      throw error;
    }

    if (lifecycleRequestAborted) {
      return;
    }

    if (error.code === "CLIENT_UNIQUE_KEY_REQUIRED") {
      return res.status(400).json({
        success: false,
        data: null,
        message: "phoneNumberId or pageId required",
      });
    }

    if (error.code === "CLIENT_OWNERSHIP_CONFLICT") {
      return res.status(400).json({
        success: false,
        data: null,
        message: "This connected account already exists for another business",
      });
    }

    if (error.code === "CLIENT_DUPLICATE_KEY_CONFLICT" || error.code === "P2002") {
      return res.status(400).json({
        success: false,
        data: null,
        message: "This connected account already exists for your business",
      });
    }

    console.error("Meta OAuth error:", error);

    return res.status(500).json({
      success: false,
      data: null,
      message: "Integration connection failed",
    });
  } finally {
    delete (req as any).oauthContinuationTrusted;
    delete (req as any).__metaContinuationInternal;
    delete (req as any).__metaResolvedTokens;
  }
};

type MetaOAuthContinuationQueueInput = Omit<
  MetaOAuthContinuationJobPayload,
  "type"
>;

const createMetaOAuthContinuationMockResponse = () => {
  const response = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    locals: {},
    body: null as unknown,
    setTimeout: () => response,
    status: (code: number) => {
      response.statusCode = code;
      return response;
    },
    json: (body: unknown) => {
      response.body = body;
      response.headersSent = true;
      response.writableEnded = true;
      return response;
    },
    send: (body?: unknown) => {
      response.body = body;
      response.headersSent = true;
      response.writableEnded = true;
      return response;
    },
  };

  return response as unknown as Response & {
    statusCode: number;
    body: unknown;
  };
};

export const runMetaOAuthContinuationFromQueueJob = async (
  input: MetaOAuthContinuationQueueInput
) => {
  const lease = await acquireMetaOAuthReconciliationLease({
    operationId: input.operationId,
    replayToken: input.replayToken,
    businessId: input.businessId,
    platform: input.platform,
    mode: input.mode,
    source: input.source || "queue_worker",
  });

  if (!lease?.acquired) {
    if (
      lease?.reason === "locked" &&
      normalizeOptionalString(input.source) === "queue_worker"
    ) {
      throw new Error("meta_oauth_reconciliation_in_progress");
    }

    return {
      statusCode: 202,
      body: {
        success: true,
        data: {
          operationId: input.operationId,
          replayToken: input.replayToken,
          platform: input.platform,
          mode: input.mode,
          idempotent: true,
        },
        message: "Meta OAuth continuation already reconciled or in progress",
      },
    };
  }

  const shortToken =
    normalizeOptionalString(input.shortTokenEncrypted) &&
    input.shortTokenEncrypted
      ? decrypt(input.shortTokenEncrypted)
      : null;
  const longToken =
    normalizeOptionalString(input.longTokenEncrypted) &&
    input.longTokenEncrypted
      ? decrypt(input.longTokenEncrypted)
      : null;

  const req = {
    method: "POST",
    path: "/api/clients/oauth/meta",
    originalUrl: "/api/clients/oauth/meta",
    body: {
      code: input.code || undefined,
      state: input.state,
      aiTone: input.aiTone || undefined,
      businessInfo: input.businessInfo || undefined,
      pricingInfo: input.pricingInfo || undefined,
      faqKnowledge: input.faqKnowledge || undefined,
      salesInstructions: input.salesInstructions || undefined,
      phoneNumberId: input.phoneNumberId || undefined,
      facebookPageId: input.facebookPageId || undefined,
      instagramProfessionalAccountId:
        input.instagramProfessionalAccountId || undefined,
    },
    user: {
      id: input.userId,
      role: "OWNER",
      businessId: input.businessId,
    },
    tenant: {
      businessId: input.businessId,
    },
    headers: {},
    query: {},
    cookies: {},
    aborted: false,
  } as unknown as Request;
  const res = createMetaOAuthContinuationMockResponse();

  (req as any).__metaContinuationInternal = true;
  (req as any).__metaResolvedTokens = {
    shortToken,
    longToken,
  };

  try {
    await metaOAuthConnect(req, res);
  } finally {
    lease.release();
  }

  return {
    statusCode: res.statusCode,
    body: (res as any).body,
  };
};

export const refreshWhatsAppOAuthPhoneNumbers = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const businessId = getRequestBusinessId(req);
    const rawState = normalizeOptionalString(req.body?.state || req.query.state);
    const rawOperationId = normalizeOptionalString(
      req.body?.operationId || req.query.operationId
    );
    const requestedPhoneNumberId = normalizeOptionalString(req.body?.phoneNumberId);

    if (!userId || !businessId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    if (!rawState) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "state is required",
      });
    }

    const oauthState = verifyMetaOAuthState(rawState);
    if (!oauthState || oauthState.platform !== "WHATSAPP") {
      return res.status(400).json({
        success: false,
        data: null,
        message: "Invalid WhatsApp OAuth state",
      });
    }

    if (
      oauthState.userId !== userId ||
      oauthState.businessId !== businessId ||
      oauthState.workspaceId !== businessId
    ) {
      return res.status(403).json({
        success: false,
        data: null,
        message: "OAuth state mismatch",
      });
    }

    const lifecycleContext = createMetaOAuthLifecycleContext({
      businessId,
      platform: "WHATSAPP",
      mode: oauthState.mode,
      nonce: oauthState.nonce,
    });
    const row = await getMetaOAuthLifecycleSnapshot({
      attemptKey: rawOperationId || lifecycleContext.attemptKey,
      replayToken: lifecycleContext.replayToken,
      platform: "WHATSAPP",
    });
    const metadata =
      row?.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    const refreshTokenEncrypted = normalizeOptionalString(
      metadata.whatsappRefreshTokenEncrypted
    );

    if (!row || !refreshTokenEncrypted) {
      const setupMetadata = await markWhatsAppSetupRequired({
        businessId,
        lifecycleContext,
        availablePhoneNumbers: [],
        refreshed: true,
      });
      return res.status(409).json({
        success: false,
        data: {
          operationId: lifecycleContext.attemptKey,
          replayToken: lifecycleContext.replayToken,
          platform: "WHATSAPP",
          status: "NEEDS_ACTION",
          connectionState: "ACTION_REQUIRED",
          stage: "PHONE_SELECTION",
          code: "SETUP_IN_PROGRESS",
          actionable: setupMetadata.actionable,
          setupRequired: true,
          setupInProgress: true,
          requiresReconnect: true,
          businessManagerUrl: setupMetadata.businessManagerUrl,
          setupGuideUrl: setupMetadata.setupGuideUrl,
          availablePhoneNumbers: [],
        },
        message: "Refresh requires reconnect because token material is unavailable",
        code: "SETUP_IN_PROGRESS",
      });
    }

    let accessToken: string;
    try {
      accessToken = decrypt(refreshTokenEncrypted);
    } catch {
      accessToken = "";
    }

    if (!accessToken) {
      return res.status(409).json({
        success: false,
        data: {
          operationId: lifecycleContext.attemptKey,
          replayToken: lifecycleContext.replayToken,
          platform: "WHATSAPP",
          status: "NEEDS_ACTION",
          connectionState: "ACTION_REQUIRED",
          stage: "PHONE_SELECTION",
          code: "SETUP_IN_PROGRESS",
          requiresReconnect: true,
        },
        message: "Refresh credentials are unavailable. Reconnect WhatsApp.",
        code: "SETUP_IN_PROGRESS",
      });
    }

    const availablePhoneNumbers = await fetchWhatsAppPhoneCandidates(accessToken);
    const discoveredWabaCandidate =
      availablePhoneNumbers.find((candidate) => Boolean(candidate.wabaId)) || null;

    console.info("WHATSAPP_NUMBERS_REFRESHED", {
      component: "whatsapp-onboarding",
      businessId,
      operationId: lifecycleContext.attemptKey,
      phoneNumberCount: availablePhoneNumbers.length,
    });

    if (!availablePhoneNumbers.length) {
      const setupMetadata = await markWhatsAppSetupRequired({
        businessId,
        lifecycleContext,
        availablePhoneNumbers,
        longToken: accessToken,
        businessManagerId: discoveredWabaCandidate?.businessManagerId || null,
        wabaId: discoveredWabaCandidate?.wabaId || null,
        refreshed: true,
      });
      return res.status(409).json({
        success: false,
        data: {
          operationId: lifecycleContext.attemptKey,
          replayToken: lifecycleContext.replayToken,
          platform: "WHATSAPP",
          status: "NEEDS_ACTION",
          connectionState: "ACTION_REQUIRED",
          stage: "PHONE_SELECTION",
          code: "SETUP_IN_PROGRESS",
          actionable: setupMetadata.actionable,
          setupRequired: true,
          setupInProgress: true,
          businessManagerUrl: setupMetadata.businessManagerUrl,
          setupGuideUrl: setupMetadata.setupGuideUrl,
          availablePhoneNumbers: [],
        },
        message: "WhatsApp setup is in progress",
        code: "SETUP_IN_PROGRESS",
      });
    }

    const selectedPhoneNumberId =
      requestedPhoneNumberId ||
      (availablePhoneNumbers.filter(isWhatsAppPhoneVerified).length === 1
        ? availablePhoneNumbers.filter(isWhatsAppPhoneVerified)[0].phoneNumberId
        : null);

    if (!selectedPhoneNumberId) {
      const actionable = buildActionableFailurePayload({
        code: "PHONE_SELECTION_REQUIRED",
        reason: "Select the WhatsApp mobile number you want to connect.",
      });
      await markMetaOAuthLifecycleNeedsAction({
        context: lifecycleContext,
        stage: "PHONE_SELECTION",
        detail: "Select the WhatsApp mobile number you want to connect.",
        metadata: {
          code: "PHONE_SELECTION_REQUIRED",
          availablePhoneNumbers,
          actionable,
          whatsappRefreshTokenEncrypted: refreshTokenEncrypted,
        },
      });
      return res.status(409).json({
        success: false,
        data: {
          operationId: lifecycleContext.attemptKey,
          replayToken: lifecycleContext.replayToken,
          platform: "WHATSAPP",
          status: "NEEDS_ACTION",
          connectionState: "ACTION_REQUIRED",
          stage: "PHONE_SELECTION",
          code: "PHONE_SELECTION_REQUIRED",
          actionable,
          requiresPhoneSelection: true,
          availablePhoneNumbers,
        },
        message: "Phone number selection required",
        code: "PHONE_SELECTION_REQUIRED",
      });
    }

    const selectedPhone = availablePhoneNumbers.find(
      (candidate) => candidate.phoneNumberId === selectedPhoneNumberId
    );
    if (!selectedPhone) {
      const actionable = buildActionableFailurePayload({
        code: "PHONE_SELECTION_REQUIRED",
        reason: "Selected WhatsApp number is not available under granted assets.",
      });
      await markMetaOAuthLifecycleNeedsAction({
        context: lifecycleContext,
        stage: "PHONE_SELECTION",
        detail: "Selected WhatsApp number is not available under granted assets.",
        metadata: {
          code: "WA_PHONE_SELECTION_INVALID",
          availablePhoneNumbers,
          selectedPhoneNumberId,
          actionable,
          whatsappRefreshTokenEncrypted: refreshTokenEncrypted,
        },
      });
      return res.status(400).json({
        success: false,
        data: {
          operationId: lifecycleContext.attemptKey,
          replayToken: lifecycleContext.replayToken,
          platform: "WHATSAPP",
          status: "NEEDS_ACTION",
          connectionState: "ACTION_REQUIRED",
          stage: "PHONE_SELECTION",
          code: "WA_PHONE_SELECTION_INVALID",
          actionable,
          requiresPhoneSelection: true,
          availablePhoneNumbers,
        },
        message: "Selected phone number is invalid",
        code: "WA_PHONE_SELECTION_INVALID",
      });
    }

    if (!isWhatsAppPhoneVerified(selectedPhone)) {
      const setupMetadata = await markWhatsAppSetupRequired({
        businessId,
        lifecycleContext,
        availablePhoneNumbers,
        longToken: accessToken,
        businessManagerId: selectedPhone.businessManagerId || null,
        wabaId: selectedPhone.wabaId || null,
        refreshed: true,
      });
      return res.status(409).json({
        success: false,
        data: {
          operationId: lifecycleContext.attemptKey,
          replayToken: lifecycleContext.replayToken,
          platform: "WHATSAPP",
          status: "NEEDS_ACTION",
          connectionState: "ACTION_REQUIRED",
          stage: "PHONE_SELECTION",
          code: "SETUP_IN_PROGRESS",
          actionable: setupMetadata.actionable,
          setupRequired: true,
          setupInProgress: true,
          requiresPhoneSelection: availablePhoneNumbers.length > 1,
          businessManagerUrl: setupMetadata.businessManagerUrl,
          setupGuideUrl: setupMetadata.setupGuideUrl,
          availablePhoneNumbers,
        },
        message: "WhatsApp phone verification is in progress",
        code: "SETUP_IN_PROGRESS",
      });
    }

    console.info("WA_PHONE_SELECTED", {
      component: "whatsapp-onboarding",
      businessId,
      operationId: lifecycleContext.attemptKey,
      phoneNumberId: selectedPhone.phoneNumberId,
      wabaId: selectedPhone.wabaId || null,
    });

    const continuationResult = await runMetaOAuthContinuationFromQueueJob({
      operationId: lifecycleContext.attemptKey,
      replayToken: lifecycleContext.replayToken,
      businessId,
      userId,
      platform: "WHATSAPP",
      mode: oauthState.mode,
      state: rawState,
      code: null,
      shortTokenEncrypted: null,
      longTokenEncrypted: refreshTokenEncrypted,
      phoneNumberId: selectedPhone.phoneNumberId,
      facebookPageId: null,
      instagramProfessionalAccountId: null,
      traceId: buildInstagramTraceId(oauthState.nonce),
      queuedAtIso: new Date().toISOString(),
      source: "phone_refresh",
    });

    if (Number(continuationResult.statusCode || 0) === 202) {
      return res.status(202).json({
        success: true,
        data: {
          operationId: lifecycleContext.attemptKey,
          replayToken: lifecycleContext.replayToken,
          platform: "WHATSAPP",
          status: "PROCESSING",
          connectionState: "PROCESSING",
          stage: "FINAL_ONBOARDING",
          processing: true,
        },
        message: "WhatsApp connect continuation is processing",
      });
    }

    return res.status(continuationResult.statusCode || 202).json(
      (continuationResult.body as any) || {
        success: true,
        data: {
          operationId: lifecycleContext.attemptKey,
          replayToken: lifecycleContext.replayToken,
          platform: "WHATSAPP",
          status: "PROCESSING",
          stage: "FINAL_ONBOARDING",
        },
        message: "WhatsApp connect continuation started",
      }
    );
  } catch (error) {
    console.error("WhatsApp phone refresh error:", error);
    return res.status(500).json({
      success: false,
      data: null,
      message: "Failed to refresh WhatsApp phone numbers",
    });
  }
};

export const getMetaOAuthLifecycle = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const businessId = getRequestBusinessId(req);
    if (!userId || !businessId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    const rawOperationId = normalizeOptionalString(req.query.operationId);
    const rawState = normalizeOptionalString(req.query.state);
    const platformQuery = normalizeOptionalString(req.query.platform);
    const platform = parseMetaOAuthPlatform(platformQuery) || null;

    let attemptKey = rawOperationId;
    let replayToken: string | null = null;
    let provider: "INSTAGRAM" | "WHATSAPP" | null = platform;

    if (rawState) {
      const oauthState = verifyMetaOAuthState(rawState);
      if (!oauthState) {
        return res.status(400).json({
          success: false,
          data: null,
          message: "Invalid OAuth state",
        });
      }

      if (
        oauthState.userId !== userId ||
        oauthState.businessId !== businessId ||
        oauthState.workspaceId !== businessId
      ) {
        return res.status(403).json({
          success: false,
          data: null,
          message: "OAuth state mismatch",
        });
      }

      provider = oauthState.platform;
      const lifecycleContext = createMetaOAuthLifecycleContext({
        businessId: oauthState.businessId,
        platform: oauthState.platform,
        mode: oauthState.mode,
        nonce: oauthState.nonce,
      });
      replayToken = lifecycleContext.replayToken;
      if (!attemptKey) {
        attemptKey = lifecycleContext.attemptKey;
      }
    }

    if (!attemptKey && !replayToken) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "operationId or state is required",
      });
    }

    const row = await getMetaOAuthLifecycleSnapshot({
      attemptKey,
      replayToken,
      platform: provider,
    });

    const resolvedProvider = provider || (row ? (row.provider as any) : null);
    if (resolvedProvider) {
      const existingClient = await prisma.client.findFirst({
        where: {
          businessId,
          platform: resolvedProvider,
          deletedAt: null,
          isActive: true
        }
      });
      if (existingClient) {
        return res.json({
          success: true,
          data: {
            operationId: attemptKey,
            replayToken,
            platform: resolvedProvider,
            status: "COMPLETED",
            connectionState: "ACTIVE",
            stage: "FINAL_ONBOARDING",
            processing: false,
            clients: [{
              platform: existingClient.platform,
              healthy: true,
              connected: true,
              clientId: existingClient.id,
              pageId: existingClient.pageId || null,
              phoneNumberId: existingClient.phoneNumberId || null,
            }],
            pollIntervalMs: 5000
          }
        });
      }
    }

    if (!row) {
      return res.status(202).json({
        success: true,
        data: {
          operationId: attemptKey,
          replayToken,
          platform: provider,
          status: "PROCESSING",
          connectionState: "PROCESSING",
          stage: "OAUTH_AUTHENTICATED",
          processing: true,
          pollIntervalMs: 5000,
        },
      });
    }

    const pollingDurationMs = Date.now() - new Date(row.createdAt).getTime();
    if (pollingDurationMs > 60000 && row.status === "PROCESSING") {
      const metadataObj = row.metadata && typeof row.metadata === "object"
        ? (row.metadata as any)
        : {};
      await markMetaOAuthLifecycleFailure({
        context: {
          attemptKey: row.attemptKey,
          replayToken: row.replayToken || "",
          businessId,
          tenantKey: row.tenantKey,
          platform: row.provider as any,
          mode: (metadataObj?.mode || "ONBOARD") as any,
          nonce: (metadataObj?.nonce || "") as string,
          startedAtMs: new Date(row.createdAt).getTime(),
        },
        stage: "FAILED",
        code: "META_ONBOARDING_TIMEOUT",
        reason: "Onboarding timed out after 60 seconds. Please try again.",
        resolutionHint: "RETRY",
      }).catch(() => undefined);

      row.status = "FAILED";
      row.step = "FAILED";
      row.statusDetail = "Onboarding timed out after 60 seconds. Please try again.";
      row.errorCode = "META_ONBOARDING_TIMEOUT";
      row.errorMessage = "Onboarding timed out after 60 seconds. Please try again.";
      row.resolutionHint = "RETRY";
    }

    const lifecycle = toMetaOAuthLifecycleResponse({
      attemptKey: row.attemptKey,
      replayToken: row.replayToken,
      provider: row.provider,
      status: row.status,
      step: row.step,
      statusDetail: row.statusDetail,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      resolutionHint: row.resolutionHint,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    const metadata =
      lifecycle.metadata && typeof lifecycle.metadata === "object"
        ? (lifecycle.metadata as Record<string, unknown>)
        : {};
    const validPairs = Array.isArray(metadata.validPairs)
      ? metadata.validPairs
      : [];
    const availablePhoneNumbers = Array.isArray(metadata.availablePhoneNumbers)
      ? metadata.availablePhoneNumbers
      : [];
    const connectionState =
      lifecycle.status === "COMPLETED"
        ? "READY_MINIMAL"
        : lifecycle.status === "NEEDS_ACTION" || lifecycle.status === "FAILED"
          ? "ACTION_REQUIRED"
          : lifecycle.stage === "CONTINUATION_SCHEDULED" ||
              lifecycle.stage === "CALLBACK_ACCEPTED"
            ? "CONTINUATION_SCHEDULED"
            : lifecycle.stage === "META_ACCOUNT_CONNECTED"
              ? "CONNECTED_PENDING"
              : "PROCESSING";

    return res.json({
      success: true,
      data: {
        ...lifecycle,
        connectionState: lifecycle.status === "FAILED" ? "ACTION_REQUIRED" : connectionState,
        processing: lifecycle.status === "PROCESSING",
        requiresPairSelection:
          lifecycle.status === "NEEDS_ACTION" &&
          (lifecycle.stage === "PAIR_SELECTION" || validPairs.length > 0),
        requiresPhoneSelection:
          lifecycle.status === "NEEDS_ACTION" &&
          (lifecycle.stage === "PHONE_SELECTION" || availablePhoneNumbers.length > 0),
        actionable: metadata.actionable || null,
        validPairs,
        availablePhoneNumbers,
        clients: Array.isArray(metadata.clients) ? metadata.clients : [],
        pollIntervalMs: 5000,
      },
    });
  } catch (error) {
    console.error("Meta OAuth lifecycle fetch error:", error);
    return res.status(500).json({
      success: false,
      data: null,
      message: "Failed to load Meta OAuth lifecycle",
    });
  }
};

/*
---------------------------------------------------
CLIENT CONNECTION STATUS
---------------------------------------------------
*/

export const getClientStatus = async (req: Request, res: Response) => {
  try {
    const businessId = getRequestBusinessId(req);

    if (!businessId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    const [instagramClient, whatsappClient] = await Promise.all([
      prisma.client.findFirst({
        where: {
          businessId,
          platform: "INSTAGRAM",
          deletedAt: null,
        },
        select: {
          id: true,
          platform: true,
          pageId: true,
          accessToken: true,
          isActive: true,
        },
      }),
      prisma.client.findFirst({
        where: {
          businessId,
          platform: "WHATSAPP",
          deletedAt: null,
        },
        select: {
          id: true,
          platform: true,
          phoneNumberId: true,
          accessToken: true,
          isActive: true,
        },
      }),
    ]);

    const [instagramHealthy, whatsappHealthy] = await Promise.all([
      instagramClient?.pageId && instagramClient.isActive
        ? checkConnectionHealth(instagramClient)
        : false,
      whatsappClient?.phoneNumberId && whatsappClient.isActive
        ? checkConnectionHealth(whatsappClient)
        : false,
    ]);

    return res.json({
      success: true,
      data: {
        instagram: {
          connected: Boolean(instagramClient?.pageId),
          pageId: instagramClient?.pageId || null,
          healthy: instagramHealthy,
        },
        whatsapp: {
          connected: Boolean(whatsappClient?.phoneNumberId),
          phoneNumberId: whatsappClient?.phoneNumberId || null,
          healthy: whatsappHealthy,
        },
      },
    });
  } catch (error) {
    console.error("Client status error:", error);

    return res.status(500).json({
      success: false,
      data: null,
      message: "Failed to load client status",
    });
  }
};

/*
---------------------------------------------------
AI TRAINING UPDATE
---------------------------------------------------
*/

export const updateAITraining = async (req: Request, res: Response) => {

  try {

    const businessId = getRequestBusinessId(req);
    const id = req.params.id as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    const {
      businessInfo,
      pricingInfo,
      aiTone,
      faqKnowledge,
      salesInstructions
    } = req.body;

    const client = await prisma.client.findFirst({
      where: {
        id,
        businessId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Client not found",
      });
    }

    await prisma.client.updateMany({
      where: {
        id: client.id,
        businessId,
      },
      data: {
        businessInfo,
        pricingInfo,
        aiTone,
        faqKnowledge,
        salesInstructions
      },
    });

    const updatedClient = await prisma.client.findFirst({
      where: {
        id: client.id,
        businessId,
        deletedAt: null,
      },
    });

    if (!updatedClient) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Client not found",
      });
    }

    return res.json({
      success: true,
      data: {
        client: updatedClient,
      },
      message: "AI training updated successfully",
    });

  } catch (error) {

    console.error("AI training update error:", error);

    return res.status(500).json({
      success: false,
      data: null,
      message: "AI training update failed"
    });

  }

};

/*
---------------------------------------------------
FETCH CLIENTS
---------------------------------------------------
*/

export const getClients = async (req: Request, res: Response) => {

  try {

    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        data: [],
        message: "Unauthorized",
      });
    }

    const businessId = getRequestBusinessId(req);

    console.log("GET /clients hit", {
      userId,
      businessId,
    });

    if (!businessId) {
      return res.status(401).json({
        success: false,
        data: [],
        message: "Unauthorized",
      });
    }

    const clients = await prisma.client.findMany({
      where: {
        businessId,
        isActive: true,
        deletedAt: null,
        platform: {
          not: "SYSTEM",
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      data: clients,
      clients,
    });

  } catch (error: any) {

    console.error("API ERROR:", error);

    return res.status(500).json({
      success: false,
      data: [],
      message: "Internal error",
    });

  }

};

/*
---------------------------------------------------
UPDATE CLIENT
---------------------------------------------------
*/

export const updateClient = async (req: Request, res: Response) => {

  try {

    const businessId = getRequestBusinessId(req);
    const id = req.params.id as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "Access token required",
      });
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        businessId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Client not found",
      });
    }

    const encryptedToken = encrypt(accessToken);

    await prisma.client.updateMany({
      where: {
        id,
        businessId,
      },
      data: { accessToken: encryptedToken },
    });

    return res.json({
      success: true,
      data: {
        id,
      },
      message: "Client updated successfully",
    });

  } catch (error: any) {

    console.error("Update client error:", error);

    return res.status(500).json({
      success: false,
      data: null,
      message: "Update failed",
    });

  }

};

/*
---------------------------------------------------
DELETE CLIENT
---------------------------------------------------
*/

export const deleteClient = async (req: Request, res: Response) => {

  try {

    const businessId = getRequestBusinessId(req);
    const id = req.params.id as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        businessId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Client not found",
      });
    }

    await prisma.client.updateMany({
      where: {
        id,
        businessId,
      },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      data: {
        id,
      },
      message: "Client deleted successfully",
    });

  } catch (error: any) {

    console.error("Delete client error:", error);

    return res.status(500).json({
      success: false,
      data: null,
      message: "Delete failed",
    });

  }

};

/*
---------------------------------------------------
GET SINGLE CLIENT
---------------------------------------------------
*/

export const getSingleClient = async (req: Request, res: Response) => {

  try {

    const businessId = getRequestBusinessId(req);
    const id = req.params.id as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        businessId,
        isActive: true,
        deletedAt: null,
      },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Client not found",
      });
    }

    return res.json({
      success: true,
      data: client,
    });

  } catch (error: any) {

    console.error("Fetch client error:", error);

    return res.status(500).json({
      success: false,
      data: null,
      message: "Fetch failed",
    });

  }

};
/* ====================================================
👇 YAHAN PASTE KAR (FILE KE END ME)
==================================================== */

export const startMetaOAuth = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const businessId = getRequestBusinessId(req);

    if (!userId || !businessId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    const platform = parseMetaOAuthPlatform(
      normalizeOptionalString(req.query.platform)
    );
    const mode = parseMetaOAuthMode(normalizeOptionalString(req.query.mode));
    const preferredFacebookPageId = normalizeOptionalString(
      req.query.facebookPageId
    );
    const preferredInstagramProfessionalAccountId = normalizeOptionalString(
      req.query.instagramAccountId
    );
    const preferredPhoneNumberId = normalizeOptionalString(req.query.phoneNumberId);

    if (!platform) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "platform must be INSTAGRAM or WHATSAPP",
      });
    }

    const subscription = await getSubscription(businessId);
    const allowedPlatforms = await getAllowedPlatforms(businessId, subscription);

    if (!allowedPlatforms.includes(platform)) {
      return res.status(403).json({
        success: false,
        data: null,
        message: `${platform} integration not allowed in your workspace`,
      });
    }

    const state = createMetaOAuthState({
      userId,
      businessId,
      workspaceId: businessId,
      platform,
      mode,
      preferredFacebookPageId,
      preferredInstagramProfessionalAccountId,
      preferredPhoneNumberId,
    });
    const parsedState = verifyMetaOAuthState(state);
    const traceId = buildInstagramTraceId(parsedState?.nonce || null);

    if (mode === "reconnect") {
      console.info("Reconnect triggered", {
        userId,
        platform,
      });
    }

    const metaRuntime = getMetaOAuthRuntimeConfig();

    if (!metaRuntime || !metaRuntime.appSecret) {
      return res.status(500).json({
        success: false,
        data: null,
        message: "Meta OAuth is not configured on this server",
      });
    }

    const redirectUri = `${metaRuntime.backendUrl}/api/oauth/meta/callback`;
    const oauthUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    oauthUrl.searchParams.set("client_id", metaRuntime.appId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set(
      "scope",
      [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_metadata",
        "instagram_basic",
        "instagram_manage_messages",
        "whatsapp_business_management",
        "whatsapp_business_messaging",
        "business_management",
      ].join(",")
    );

    if (platform === "INSTAGRAM") {
      await recordInstagramConnectStage({
        traceId,
        businessId,
        stage: "IG_OAUTH_STARTED",
        status: "COMPLETED",
        metadata: {
          mode,
          platform,
          workspaceId: businessId,
          preferredFacebookPageId,
          preferredInstagramProfessionalAccountId,
          preferredPhoneNumberId,
        },
      });
    }

    if (platform === "WHATSAPP") {
      const lifecycleContext = parsedState
        ? createMetaOAuthLifecycleContext({
            businessId,
            platform,
            mode,
            nonce: parsedState.nonce,
          })
        : null;
      console.info("WA_EMBEDDED_SIGNUP_STARTED", {
        component: "whatsapp-onboarding",
        businessId,
        operationId: lifecycleContext?.attemptKey || null,
        embeddedSignupConfigured: Boolean(
          metaRuntime.whatsappEmbeddedSignupConfigId
        ),
      });
    }

    return res.json({
      success: true,
      data: {
        url: oauthUrl.toString(),
        state,
        platform,
        mode,
        workspaceId: businessId,
        preferredFacebookPageId,
        preferredInstagramProfessionalAccountId,
        preferredPhoneNumberId,
        embeddedSignup:
          platform === "WHATSAPP" && metaRuntime.whatsappEmbeddedSignupConfigId
            ? {
                provider: "META",
                appId: metaRuntime.appId,
                configId: metaRuntime.whatsappEmbeddedSignupConfigId,
                graphVersion: "v19.0",
                responseType: "code",
                overrideDefaultResponseType: true,
                extras: {
                  setup: {
                    feature: "whatsapp_embedded_signup",
                    sessionInfoVersion: "3",
                    featureType: "whatsapp_business_app_onboarding",
                  },
                },
              }
            : null,
      },
    });
  } catch (error) {
    console.error("Start OAuth error:", error);

    return res.status(500).json({
      success: false,
      data: null,
      message: "Failed to start OAuth",
    });
  }
};
