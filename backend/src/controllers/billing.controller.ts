import { Request, Response } from "express";
import crypto from "crypto";
import prisma from "../config/prisma";
import redis from "../config/redis";
import { env } from "../config/env";
import { resolveBillingCurrency } from "../services/billingGeo.service";
import { prewarmState } from "../services/prewarmState";
import {
  loadBillingContext,
  type BillingContext,
  invalidateBillingContextCache,
} from "../middleware/subscription.middleware";
import { commerceProjectionService } from "../services/commerceProjection.service";
import { paymentIntentService } from "../services/paymentIntent.service";
import { proposalEngineService } from "../services/proposalEngine.service";
import { subscriptionEngineService } from "../services/subscriptionEngine.service";
import {
  getAddonCatalog,
  getPricingPlanConfig,
  getPublicPricingPlans,
  TRIAL_DAYS,
} from "../config/pricing.config";
import {
  getStripePriceId,
  type BillingInterval,
  type PlanType,
  type PricingCurrency,
} from "../config/stripe.price.map";
import { getUsageOverview } from "../services/usage.service";
import { resolveUserWorkspaceIdentity } from "../services/tenant.service";
import { stripe } from "../services/stripe.service";
import { assertStripeConfigReady } from "../services/commerce/providers/stripeConfig.service";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { runProjectionComputeTask } from "../services/projectionCoordinator.service";
import {
  getRequestAbortSignal,
  getRequestRemainingMs,
  isRequestLifecycleAborted,
  throwIfRequestLifecycleAborted,
} from "../utils/requestLifecycle";
import { getPlanKey } from "../config/plan.config";

const EMPTY_USAGE_SUMMARY = {
  aiCallsUsed: 0,
  messagesUsed: 0,
  followupsUsed: 0,
  summary: {
    plan: "LOCKED",
    planLabel: "Locked",
    trialActive: false,
    daysLeft: 0,
    warning: false,
    warningMessage: null,
    addonCredits: 0,
    ai: {
      usedToday: 0,
      limit: 0,
      remaining: 0,
    },
    usage: {
      ai: {
        used: 0,
        dailyLimit: 0,
        monthlyUsed: 0,
        monthlyLimit: 0,
        dailyRemaining: 0,
        monthlyRemaining: 0,
        warning: false,
      },
      contacts: {
        used: 0,
        limit: 0,
        remaining: 0,
      },
      messages: {
        used: 0,
        limit: 0,
        remaining: 0,
      },
      automation: {
        used: 0,
        limit: 0,
        remaining: 0,
      },
    },
    addons: {
      aiCredits: 0,
      contacts: 0,
    },
  },
};

const EMPTY_BILLING_CONTEXT: BillingContext = {
  subscription: null,
  plan: null,
  planKey: "FREE_LOCKED",
  status: "INACTIVE",
  isLimited: true,
  upgradeRequired: true,
  allowEarly: false,
  remainingEarly: 0,
};

type BillingConfirmApiState = "SUCCESS" | "ALREADY_PROCESSED" | "PENDING" | "FAILED";
type BillingConfirmLifecycleState =
  | "PENDING"
  | "PROCESSING"
  | "CONFIRMED"
  | "FAILED_TERMINAL";

const BILLING_CONFIRM_DUPLICATE_WINDOW_MS = 60_000;
const BILLING_PROJECTION_CACHE_TTL_MS = 12_000;
const BILLING_PROJECTION_MAX_WAIT_MS = 2_200;
const BILLING_PROJECTION_TIMEOUT_BUFFER_MS = 350;
const BILLING_PROJECTION_REDIS_CACHE_PREFIX = "billing:projection:v2:";
const BILLING_PROJECTION_REDIS_CACHE_TTL_SECONDS = 45;
const BILLING_PROJECTION_STALE_MAX_AGE_MS = 90_000;
const BILLING_PROJECTION_COMPUTE_BUDGET_MS = 6_500;
const RESPONSE_FINAL_WRITE_LOCAL_KEY = "__runtimeFinalWriteInvoked";
const CHECKOUT_IN_FLIGHT_WINDOW_MS = 20_000;
const CHECKOUT_CONFIRM_IN_FLIGHT_WINDOW_MS = 30_000;
const INSTANT_CHECKOUT_IN_FLIGHT_WINDOW_MS = 10_000;

const billingProjectionCache = new Map<
  string,
  {
    value?: Record<string, unknown>;
    expiresAt: number;
    updatedAt?: number;
    promise?: Promise<Record<string, unknown>>;
  }
>();
const checkoutInFlight = new Map<
  string,
  {
    startedAt: number;
    requestId: string | null;
  }
>();
const checkoutConfirmInFlight = new Map<
  string,
  {
    startedAt: number;
    promise: Promise<void>;
  }
>();
const instantCheckoutInFlight = new Map<
  string,
  {
    startedAt: number;
    requestId: string | null;
  }
>();

const getBillingProjectionCacheKey = (
  businessId: string,
  currencyHint: string
) => `${businessId}:${currencyHint}`;

const getBillingProjectionRedisKey = (cacheKey: string) =>
  `${BILLING_PROJECTION_REDIS_CACHE_PREFIX}${cacheKey}`;

const emitProjectionTelemetry = (input: {
  name:
    | "projection_compute_ms"
    | "projection_cache_hit"
    | "projection_deduped"
    | "projection_cancelled"
    | "projection_budget_exceeded";
  value?: number;
  businessId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  emitPerformanceMetric({
    name: input.name,
    value: input.value,
    businessId: input.businessId || null,
    route: "billing_projection",
    metadata: input.metadata || null,
  });
};

const readRedisBillingProjectionSnapshot = async (cacheKey: string) => {
  const raw = await redis
    .get(getBillingProjectionRedisKey(cacheKey))
    .catch(() => null);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      await redis
        .del(getBillingProjectionRedisKey(cacheKey))
        .catch(() => undefined);
      return null;
    }

    const payload = parsed as Record<string, unknown>;
    const updatedAt = Number(payload.updatedAt || 0);
    const data =
      payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? (payload.data as Record<string, unknown>)
        : null;

    if (!data || !Number.isFinite(updatedAt) || updatedAt <= 0) {
      await redis
        .del(getBillingProjectionRedisKey(cacheKey))
        .catch(() => undefined);
      return null;
    }

    return {
      data,
      updatedAt,
    };
  } catch {
    await redis.del(getBillingProjectionRedisKey(cacheKey)).catch(() => undefined);
    return null;
  }
};

const writeRedisBillingProjectionSnapshot = async (
  cacheKey: string,
  value: Record<string, unknown>
) => {
  const payload = {
    updatedAt: Date.now(),
    data: value,
  };
  await redis
    .set(
      getBillingProjectionRedisKey(cacheKey),
      JSON.stringify(payload),
      "EX",
      BILLING_PROJECTION_REDIS_CACHE_TTL_SECONDS
    )
    .catch(() => undefined);
};

const markBillingSnapshotAsStale = (
  value: Record<string, unknown>,
  reason: string
): Record<string, unknown> => {
  const meta =
    value.meta && typeof value.meta === "object" && !Array.isArray(value.meta)
      ? (value.meta as Record<string, unknown>)
      : {};
  return {
    ...value,
    meta: {
      ...meta,
      degraded: true,
      reason,
    },
  };
};

type BillingProjectionWaitResult =
  | {
      timedOut: false;
      cancelled: false;
      value: Record<string, unknown>;
    }
  | {
      timedOut: true;
      cancelled: false;
    }
  | {
      timedOut: false;
      cancelled: true;
    };

const hasExplicitFinalResponseWrite = (res: Response) =>
  Boolean(
    (res.locals as Record<string, unknown> | undefined)?.[
      RESPONSE_FINAL_WRITE_LOCAL_KEY
    ]
  );

const isResponseCommitted = (res: Response) =>
  res.headersSent || res.writableEnded || hasExplicitFinalResponseWrite(res);

const isRequestLifecycleClosed = (req: Request, res: Response) =>
  Boolean((res.locals as Record<string, unknown> | undefined)?.requestTimedOut) ||
  req.aborted ||
  isResponseCommitted(res);

const resolveBillingProjectionWaitBudgetMs = (res: Response) => {
  const locals = (res.locals || {}) as Record<string, unknown>;
  const deadlineAt = Number(locals.requestDeadlineAt || 0);
  const maxWait = prewarmState.isCold ? 5500 : BILLING_PROJECTION_MAX_WAIT_MS;

  if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) {
    return maxWait;
  }

  const remainingBudgetMs = Math.floor(
    deadlineAt - Date.now() - BILLING_PROJECTION_TIMEOUT_BUFFER_MS
  );
  return Math.max(1, Math.min(maxWait, remainingBudgetMs));
};

const waitForBillingProjection = async (
  promise: Promise<Record<string, unknown>>,
  timeoutMs: number,
  requestSignal?: AbortSignal | null
): Promise<BillingProjectionWaitResult> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const boundedTimeoutMs = Math.max(1, Math.floor(timeoutMs));
    const signal = requestSignal || null;

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      clearTimeout(timeoutHandle);
    };

    const settle = (value: BillingProjectionWaitResult) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const onAbort = () => {
      settle({
        timedOut: false,
        cancelled: true,
      });
    };

    const timeoutHandle = setTimeout(() => {
      settle({
        timedOut: true,
        cancelled: false,
      });
    }, boundedTimeoutMs);

    if (signal?.aborted) {
      settle({
        timedOut: false,
        cancelled: true,
      });
      return;
    }

    if (signal) {
      signal.addEventListener("abort", onAbort, {
        once: true,
      });
    }

    promise
      .then((value) => {
        settle({
          timedOut: false,
          cancelled: false,
          value,
        });
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      });
  });

const hasProjectionValue = (
  result: BillingProjectionWaitResult
): result is {
  timedOut: false;
  cancelled: false;
  value: Record<string, unknown>;
} => !result.timedOut && !result.cancelled;

type PlanRow = {
  id: string;
  name: string;
  type: string;
  priceIdINR: string | null;
  priceIdUSD: string | null;
};

const mapPublicPlans = (plans: PlanRow[] = []) => {
  const planMap = new Map(
    plans.map((plan) => [String(plan.type || plan.name).toUpperCase(), plan])
  );

  return getPublicPricingPlans().map((plan) => {
    const existing =
      planMap.get(plan.key) || planMap.get(plan.label.toUpperCase());

    return {
      id: existing?.id || plan.key,
      name: plan.label,
      type: existing?.type || plan.key,
      priceIdINR: existing?.priceIdINR || null,
      priceIdUSD: existing?.priceIdUSD || null,
      description: plan.description,
      popular: Boolean(plan.popular),
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      limits: plan.limits,
      features: plan.features,
    };
  });
};

const buildPlansPayload = (input?: {
  plans?: PlanRow[];
  degraded?: boolean;
  reason?: string | null;
}) => ({
  success: true,
  trialDays: TRIAL_DAYS,
  addons: getAddonCatalog(),
  plans: mapPublicPlans(input?.plans || []),
  meta: {
    degraded: Boolean(input?.degraded),
    reason: String(input?.reason || "").trim() || null,
  },
});
const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

type UserContext = {
  userId: string;
  businessId: string | null;
  email: string;
};

const mapInvoiceForClient = (invoice: {
  invoiceKey: string;
  status: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  dueAt: Date | null;
  issuedAt: Date | null;
  paidAt: Date | null;
  externalInvoiceId: string | null;
  createdAt: Date;
  metadata?: unknown;
}) => ({
  ...(toRecord(invoice.metadata).providerInvoiceId
    ? {
        providerInvoiceId: String(toRecord(invoice.metadata).providerInvoiceId || "")
          .trim()
          .toLowerCase(),
      }
    : {}),
  id: invoice.invoiceKey,
  invoiceKey: invoice.invoiceKey,
  status: String(invoice.status || "").toLowerCase(),
  currency: invoice.currency,
  amount: invoice.totalMinor,
  subtotal: invoice.subtotalMinor,
  taxAmount: invoice.taxMinor,
  paidAmount: invoice.paidMinor,
  created: Math.floor(invoice.createdAt.getTime() / 1000),
  createdAt: invoice.createdAt,
  dueAt: invoice.dueAt,
  issuedAt: invoice.issuedAt,
  paidAt: invoice.paidAt,
  externalInvoiceId: invoice.externalInvoiceId,
  hosted_invoice_url:
    String(
      toRecord(invoice.metadata).hostedInvoiceUrl ||
        toRecord(invoice.metadata).hosted_invoice_url ||
        ""
    ).trim() || null,
  invoice_pdf:
    String(
      toRecord(invoice.metadata).invoicePdf ||
        toRecord(invoice.metadata).invoice_pdf ||
        ""
    ).trim() || null,
});

type CheckoutConfirmIntentRow = {
  id: string;
  businessId: string;
  paymentIntentKey: string;
  providerPaymentIntentId: string | null;
  status: string;
  metadata: unknown;
  proposal: {
    proposalKey: string;
  } | null;
};

const TERMINAL_PAYMENT_INTENT_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

const getCheckoutConfirmMetadata = (value: unknown) =>
  toRecord(toRecord(value).checkoutConfirm);

const getCheckoutConfirmState = (value: unknown) =>
  String(getCheckoutConfirmMetadata(value).state || "")
    .trim()
    .toUpperCase();

const isCheckoutConfirmStillProcessing = (value: unknown) => {
  const checkoutConfirm = getCheckoutConfirmMetadata(value);
  const state = String(checkoutConfirm.state || "")
    .trim()
    .toUpperCase();
  const startedAt = new Date(String(checkoutConfirm.startedAt || ""));
  const startedAtMs = startedAt.getTime();

  if (state !== "PROCESSING" || Number.isNaN(startedAtMs)) {
    return false;
  }

  return Date.now() - startedAtMs <= BILLING_CONFIRM_DUPLICATE_WINDOW_MS;
};

const userContextCache = new Map<string, { value: UserContext; expiresAt: number }>();

async function getUserContext(req: Request): Promise<UserContext> {
  const userId = req.user?.id;

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const businessIdFromRequest =
    String((req as any)?.tenant?.businessId || req.user?.businessId || "").trim() ||
    null;
  const emailFromRequest = String(req.user?.email || "").trim().toLowerCase() || null;

  if (businessIdFromRequest && emailFromRequest) {
    return {
      userId,
      businessId: businessIdFromRequest,
      email: emailFromRequest,
    };
  }

  const cacheKey = `${userId}:${businessIdFromRequest || ""}:${emailFromRequest || ""}`;
  const cached = userContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      businessId: true,
    },
  });

  if (!user) {
    throw new Error("Unauthorized");
  }

  const businessIdHint = String(businessIdFromRequest || user.businessId || "").trim() || null;
  const identity = businessIdHint
    ? {
        businessId: businessIdHint,
        workspace: null,
        source: "request",
      }
    : await resolveUserWorkspaceIdentity({
        userId,
        preferredBusinessId:
          req.user?.businessId || user.businessId || businessIdFromRequest || null,
      });
  const resolvedEmail = emailFromRequest || String(user.email || "").trim().toLowerCase();

  const value = {
    userId,
    businessId: identity.businessId,
    email: resolvedEmail,
  };

  userContextCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + 10_000,
  });

  return value;
}

export class BillingController {
  private static getBusinessIdFromRequest(req: Request) {
    const tenantBusinessId = String((req as any)?.tenant?.businessId || "").trim();
    const userBusinessId = String(req.user?.businessId || "").trim();
    return tenantBusinessId || userBusinessId || null;
  }

  private static async findCheckoutIntentForSession(input: {
    businessId: string;
    sessionId: string;
  }): Promise<CheckoutConfirmIntentRow | null> {
    const select = {
      id: true,
      businessId: true,
      paymentIntentKey: true,
      providerPaymentIntentId: true,
      status: true,
      metadata: true,
      proposal: {
        select: {
          proposalKey: true,
        },
      },
    } as const;

    const normalizedSessionId = String(input.sessionId || "").trim();
    if (!normalizedSessionId) {
      return null;
    }

    const byProviderPaymentIntentId = await prisma.paymentIntentLedger.findFirst({
      where: {
        businessId: input.businessId,
        provider: "STRIPE",
        providerPaymentIntentId: normalizedSessionId,
      },
      select,
    });

    if (byProviderPaymentIntentId) {
      return byProviderPaymentIntentId;
    }

    const byPaymentIntentKey = await prisma.paymentIntentLedger.findUnique({
      where: {
        paymentIntentKey: normalizedSessionId,
      },
      select,
    });

    if (byPaymentIntentKey && byPaymentIntentKey.businessId === input.businessId) {
      return byPaymentIntentKey;
    }

    const boundedMetadataFallback = await prisma.paymentIntentLedger.findMany({
      where: {
        businessId: input.businessId,
        provider: "STRIPE",
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 40,
      select,
    });
    const byMetadataSession = boundedMetadataFallback.find((row) => {
      const metadata = toRecord(row.metadata);
      const providerMetadata = toRecord(metadata.providerMetadata);
      const checkoutConfirmMetadata = getCheckoutConfirmMetadata(metadata);
      const metadataSessionId =
        String(
          row.providerPaymentIntentId ||
            metadata.stripeSessionId ||
            providerMetadata.stripeSessionId ||
            checkoutConfirmMetadata.sessionId ||
            ""
        ).trim() || null;
      return metadataSessionId === normalizedSessionId;
    });

    if (byMetadataSession) {
      return byMetadataSession;
    }

    return null;
  }

  private static async updateCheckoutConfirmMetadata(input: {
    paymentIntent: CheckoutConfirmIntentRow;
    sessionId: string;
    state: "PROCESSING" | "SUCCESS" | "PENDING" | "FAILED";
    reason?: string | null;
  }) {
    const metadata = toRecord(input.paymentIntent.metadata);
    const previous = getCheckoutConfirmMetadata(metadata);
    const nowIso = new Date().toISOString();

    const nextCheckoutConfirm = {
      ...previous,
      state: input.state,
      sessionId: input.sessionId,
      reason: String(input.reason || "").trim() || null,
      updatedAt: nowIso,
      ...(input.state === "PROCESSING"
        ? {
            startedAt: nowIso,
          }
        : {}),
      ...(input.state === "SUCCESS" || input.state === "FAILED"
        ? {
            completedAt: nowIso,
          }
        : {}),
    };

    await prisma.paymentIntentLedger
      .update({
        where: {
          id: input.paymentIntent.id,
        },
        data: {
          metadata: {
            ...metadata,
            checkoutConfirm: nextCheckoutConfirm,
          } as any,
        },
      })
      .catch(() => undefined);
  }

  private static async finalizeCheckoutConfirmationAsync(input: {
    businessId: string;
    sessionId: string;
    paymentIntent: CheckoutConfirmIntentRow;
  }) {
    const paidLikeStatuses = new Set(["paid", "no_payment_required"]);

    try {
      assertStripeConfigReady();
    } catch (error) {
      await BillingController.updateCheckoutConfirmMetadata({
        paymentIntent: input.paymentIntent,
        sessionId: input.sessionId,
        state: "FAILED",
        reason: "stripe_config_invalid",
      });

      console.error("BILLING_STAGE_FAIL", {
        stage: "checkout_confirm.stripe_config",
        businessId: input.businessId,
        sessionId: input.sessionId,
        paymentIntentKey: input.paymentIntent.paymentIntentKey,
        reason: String((error as Error)?.message || "stripe_config_invalid"),
      });
      return;
    }

    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>> | null = null;
    try {
      session = await stripe.checkout.sessions.retrieve(input.sessionId);
    } catch {
      session = null;
    }
    const paymentStatus = String(session?.payment_status || "")
      .trim()
      .toLowerCase();

    if (!session) {
      await BillingController.updateCheckoutConfirmMetadata({
        paymentIntent: input.paymentIntent,
        sessionId: input.sessionId,
        state: "PENDING",
        reason: "stripe_session_pending",
      });

      console.info("BILLING_STAGE_OK", {
        stage: "checkout_confirm.pending",
        businessId: input.businessId,
        sessionId: input.sessionId,
        paymentIntentKey: input.paymentIntent.paymentIntentKey,
        reason: "stripe_session_pending",
      });
      return;
    }

    if (!paidLikeStatuses.has(paymentStatus)) {
      await BillingController.updateCheckoutConfirmMetadata({
        paymentIntent: input.paymentIntent,
        sessionId: input.sessionId,
        state: "PENDING",
        reason: `payment_status_${paymentStatus || "unknown"}`,
      });

      console.info("BILLING_STAGE_OK", {
        stage: "checkout_confirm.pending",
        businessId: input.businessId,
        sessionId: input.sessionId,
        paymentIntentKey: input.paymentIntent.paymentIntentKey,
        reason: `payment_status_${paymentStatus || "unknown"}`,
      });
      return;
    }

    try {
      const reconcileResult = await commerceProjectionService.reconcileProviderWebhook({
        provider: "STRIPE",
        headers: {
          "x-commerce-manual-reconcile": "true",
        },
        strictBusinessId: input.businessId,
        body: {
          id: `manual_confirm_${input.paymentIntent.providerPaymentIntentId || input.sessionId}`,
          type: "checkout.session.completed",
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: input.paymentIntent.providerPaymentIntentId || input.sessionId,
              payment_status: session.payment_status || "paid",
              amount_total: session.amount_total || null,
              currency: session.currency || null,
              subscription:
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription?.id || null,
              metadata: {
                businessId: input.businessId,
                paymentIntentKey: input.paymentIntent.paymentIntentKey,
                proposalKey: input.paymentIntent.proposal?.proposalKey || null,
              },
            },
          },
        },
      });
      if ((reconcileResult as any)?.idempotency === "failed") {
        throw new Error("reconcile_failed");
      }
    } catch (error) {
      await BillingController.updateCheckoutConfirmMetadata({
        paymentIntent: input.paymentIntent,
        sessionId: input.sessionId,
        state: "PENDING",
        reason: "reconcile_retry_required",
      });

      console.info("BILLING_STAGE_OK", {
        stage: "checkout_confirm.pending",
        businessId: input.businessId,
        sessionId: input.sessionId,
        paymentIntentKey: input.paymentIntent.paymentIntentKey,
        reason: "reconcile_retry_required",
      });
      console.error("BILLING_STAGE_FAIL", {
        stage: "checkout_confirm.reconcile",
        businessId: input.businessId,
        sessionId: input.sessionId,
        paymentIntentKey: input.paymentIntent.paymentIntentKey,
        reason: String((error as Error)?.message || "reconcile_retry_required"),
      });
      return;
    }

    await BillingController.updateCheckoutConfirmMetadata({
      paymentIntent: input.paymentIntent,
      sessionId: input.sessionId,
      state: "SUCCESS",
      reason: "projection_reconciled",
    });

    console.info("BILLING_STAGE_OK", {
      stage: "checkout_confirm.success",
      businessId: input.businessId,
      sessionId: input.sessionId,
      paymentIntentKey: input.paymentIntent.paymentIntentKey,
    });
    console.info("RECONCILE_OK", {
      businessId: input.businessId,
      sessionId: input.sessionId,
      paymentIntentKey: input.paymentIntent.paymentIntentKey,
    });
  }

  private static buildConfirmPayload(input: {
    state: BillingConfirmApiState;
    sessionId: string;
    message: string;
    shouldPoll: boolean;
    retryAfterMs?: number;
    reason?: string | null;
    code?: string | null;
    lifecycleState?: BillingConfirmLifecycleState;
  }) {
    const normalizedLifecycleState =
      input.lifecycleState ||
      (input.state === "SUCCESS" || input.state === "ALREADY_PROCESSED"
        ? "CONFIRMED"
        : input.state === "FAILED" && !input.shouldPoll
        ? "FAILED_TERMINAL"
        : input.state === "PENDING"
        ? "PROCESSING"
        : "PROCESSING");
    const terminal = normalizedLifecycleState === "FAILED_TERMINAL";

    return {
      state: input.state,
      lifecycleState: normalizedLifecycleState,
      terminal,
      sessionId: input.sessionId,
      message: input.message,
      shouldPoll: input.shouldPoll,
      retryAfterMs:
        input.shouldPoll && Number.isFinite(Number(input.retryAfterMs))
          ? Math.max(500, Math.floor(Number(input.retryAfterMs)))
          : null,
      reason: String(input.reason || "").trim() || null,
      code: String(input.code || "").trim() || null,
    };
  }

  private static async reconcileRecentPortalState(businessId: string) {
    const latestSubscription = await prisma.subscriptionLedger.findFirst({
      where: {
        businessId,
        provider: "STRIPE",
        providerSubscriptionId: {
          not: null,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        providerSubscriptionId: true,
        metadata: true,
      },
    });

    if (!latestSubscription?.providerSubscriptionId) {
      return {
        attempted: false,
        reason: "subscription_missing",
      };
    }

    const metadata = toRecord(latestSubscription.metadata);
    const portalLastOpenedAt = new Date(String(metadata.portalLastOpenedAt || ""));
    const hasRecentPortalActivity =
      !Number.isNaN(portalLastOpenedAt.getTime()) &&
      Date.now() - portalLastOpenedAt.getTime() <= 2 * 60 * 60 * 1000;

    if (!hasRecentPortalActivity) {
      return {
        attempted: false,
        reason: "portal_inactive",
      };
    }

    assertStripeConfigReady();

    const stripeSubscription = await stripe.subscriptions
      .retrieve(latestSubscription.providerSubscriptionId)
      .catch(() => null);

    if (!stripeSubscription) {
      return {
        attempted: true,
        reconciled: false,
        reason: "provider_subscription_unavailable",
      };
    }

    const firstItem = Array.isArray(stripeSubscription.items?.data)
      ? stripeSubscription.items.data[0]
      : null;
    const replayToken = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          id: stripeSubscription.id,
          status: stripeSubscription.status,
          quantity: firstItem?.quantity || 1,
          current_period_start: stripeSubscription.current_period_start || null,
          current_period_end: stripeSubscription.current_period_end || null,
          cancel_at: stripeSubscription.cancel_at || null,
          cancel_at_period_end: Boolean(stripeSubscription.cancel_at_period_end),
          trial_end: stripeSubscription.trial_end || null,
        })
      )
      .digest("hex")
      .slice(0, 16);
    const created = Math.floor(Date.now() / 1000);

    await commerceProjectionService.reconcileProviderWebhook({
      provider: "STRIPE",
      strictBusinessId: businessId,
      body: {
        id: `manual_portal_sync_${stripeSubscription.id}_${replayToken}`,
        type: "customer.subscription.updated",
        created,
        data: {
          object: {
            id: stripeSubscription.id,
            status: stripeSubscription.status,
            currency: stripeSubscription.currency,
            metadata: stripeSubscription.metadata || {},
            quantity: firstItem?.quantity || 1,
            current_period_start: stripeSubscription.current_period_start || null,
            current_period_end: stripeSubscription.current_period_end || null,
            cancel_at: stripeSubscription.cancel_at || null,
            cancel_at_period_end: Boolean(stripeSubscription.cancel_at_period_end),
            trial_end: stripeSubscription.trial_end || null,
            items: {
              data: firstItem
                ? [
                    {
                      id: firstItem.id,
                      quantity: firstItem.quantity,
                      price: {
                        id:
                          typeof firstItem.price === "string"
                            ? firstItem.price
                            : firstItem.price?.id || null,
                      },
                    },
                  ]
                : [],
            },
          },
        },
      },
    });

    return {
      attempted: true,
      reconciled: true,
      subscriptionId: stripeSubscription.id,
    };
  }

  private static async resolveStripeCustomerIdForPortal(input: {
    businessId: string;
    email: string;
    subscriptionProviderId?: string | null;
  }) {
    const normalizedBusinessId = String(input.businessId || "").trim();
    const normalizedEmail = String(input.email || "").trim().toLowerCase();

    if (!normalizedBusinessId || !normalizedEmail) {
      return null;
    }

    const customers = await stripe.customers
      .list({
        email: normalizedEmail,
        limit: 10,
      })
      .then((response) => (Array.isArray(response.data) ? response.data : []))
      .catch(() => []);

    if (!customers.length) {
      return null;
    }

    const customerWithBusinessId =
      customers.find((customer) => {
        const metadata = toRecord(customer.metadata);
        const customerBusinessId = String(metadata.businessId || "").trim();
        return customerBusinessId && customerBusinessId === normalizedBusinessId;
      }) || null;

    if (customerWithBusinessId?.id) {
      return customerWithBusinessId.id;
    }

    const customerWithSubscription =
      input.subscriptionProviderId &&
      (await Promise.all(
        customers.map(async (customer) => {
          if (!customer.id || !input.subscriptionProviderId) {
            return false;
          }

          const subscriptions = await stripe.subscriptions
            .list({
              customer: customer.id,
              status: "all",
              limit: 10,
            })
            .catch(() => ({ data: [] } as { data: Array<{ id?: string }> }));

          return subscriptions.data.some(
            (subscription) => String(subscription.id || "").trim() === input.subscriptionProviderId
          );
        })
      ).then((matches) => {
        const index = matches.findIndex(Boolean);
        return index >= 0 ? customers[index] : null;
      }));

    if (customerWithSubscription?.id) {
      return customerWithSubscription.id;
    }

    return customers[0]?.id || null;
  }

  private static async buildBillingResponse(
    businessId: string | null,
    req: Request,
    options?: {
      lightweight?: boolean;
      isCheckout?: boolean;
    }
  ) {
    const startedAt = Date.now();
    const lightweight = Boolean(options?.lightweight);
    const isCheckout = Boolean(options?.isCheckout);
    if (!businessId) {
      return {
        success: true,
        subscription: null,
        billing: EMPTY_BILLING_CONTEXT,
        usage: EMPTY_USAGE_SUMMARY,
        currency: resolveBillingCurrency(req),
        invoices: [],
        meta: {
          degraded: false,
          reason: null,
        },
      };
    }

    const [billingContext, usage, invoicesRaw] = await Promise.all([
      loadBillingContext(businessId, { skipStripeFallback: lightweight || isCheckout, isCheckout }),
      lightweight ? Promise.resolve(null) : getUsageOverview(businessId),
      prisma.invoiceLedger.findMany({
        where: {
          businessId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: lightweight ? 12 : 20,
        select: {
          invoiceKey: true,
          status: true,
          currency: true,
          subtotalMinor: true,
          taxMinor: true,
          totalMinor: true,
          paidMinor: true,
          dueAt: true,
          issuedAt: true,
          paidAt: true,
          externalInvoiceId: true,
          createdAt: true,
          metadata: true,
        },
      }),
    ]);

    const invoices = invoicesRaw.map(mapInvoiceForClient);
    const effectiveCurrency =
      billingContext.subscription?.currency || resolveBillingCurrency(req);

    const durationMs = Date.now() - startedAt;
    emitPerformanceMetric({
      name: "PROJECTION_MS",
      value: durationMs,
      businessId,
      route: "billing_projection",
      metadata: null,
    });
    emitProjectionTelemetry({
      name: "projection_compute_ms",
      value: durationMs,
      businessId,
      metadata: {
        source: "billing_build_projection",
        lightweight,
      },
    });
    if (durationMs >= 900) {
      emitPerformanceMetric({
        name: "DB_SLOW",
        value: durationMs,
        businessId,
        route: "billing_projection",
      });
    }

    return {
      success: true,
      subscription: billingContext.subscription,
      billing: billingContext.context,
      usage: usage
        ? {
            aiCallsUsed: usage.usage.ai.monthlyUsed,
            messagesUsed: usage.usage.messages.used,
            followupsUsed: usage.usage.automation.used,
            summary: usage,
          }
        : EMPTY_USAGE_SUMMARY,
      currency: effectiveCurrency,
      invoices,
      meta: {
        degraded: false,
        reason: null,
      },
    };
  }

  private static async buildDegradedBillingResponse(input: {
    req: Request;
    fallbackValue?: Record<string, unknown>;
    reason: string;
  }) {
    const normalizedReason = String(input.reason || "").trim() || "projection_timeout";
    const fallbackRecord =
      input.fallbackValue &&
      typeof input.fallbackValue === "object" &&
      !Array.isArray(input.fallbackValue)
        ? input.fallbackValue
        : null;

    if (fallbackRecord) {
      const fallbackMeta = toRecord(fallbackRecord.meta);
      return {
        ...fallbackRecord,
        success: true,
        meta: {
          ...fallbackMeta,
          degraded: true,
          reason: normalizedReason,
        },
      };
    }

    const businessId = BillingController.getBusinessIdFromRequest(input.req);
    if (businessId) {
      try {
        const ledger = await prisma.subscriptionLedger.findFirst({
          where: { businessId },
          orderBy: { updatedAt: "desc" },
        });

        if (ledger) {
          const isTrial =
            ledger.status === "TRIALING" ||
            (ledger.trialEndsAt && new Date(ledger.trialEndsAt).getTime() > Date.now());

          const sub = {
            id: ledger.id,
            status: ledger.status,
            plan: ledger.planCode
              ? {
                  name: ledger.planCode,
                  type: ledger.planCode,
                }
              : null,
            currency: ledger.currency,
            currentPeriodEnd: ledger.currentPeriodEnd || ledger.renewAt || ledger.trialEndsAt || null,
            isTrial,
            provider: ledger.provider,
            providerSubscriptionId: ledger.providerSubscriptionId || null,
            billingCycle: ledger.billingCycle,
          };

          const planKey = getPlanKey(sub.plan);
          const isActive =
            ledger.status === "ACTIVE" ||
            ledger.status === "TRIALING" ||
            ledger.status === "PAST_DUE";

          const billingContext: BillingContext = {
            subscription: sub as any,
            plan: sub.plan as any,
            planKey,
            status: (isActive ? (isTrial ? "TRIAL" : "ACTIVE") : "INACTIVE") as any,
            isLimited: planKey === "FREE_LOCKED",
            upgradeRequired: planKey === "FREE_LOCKED",
            allowEarly: false,
            remainingEarly: 0,
          };

          return {
            success: true,
            subscription: sub,
            billing: billingContext,
            usage: EMPTY_USAGE_SUMMARY,
            currency: ledger.currency || resolveBillingCurrency(input.req),
            invoices: [],
            meta: {
              degraded: true,
              reason: `${normalizedReason}_lkv_ledger`,
            },
          };
        }
      } catch (err) {
        console.error("Failed to query LKV subscription ledger:", err);
      }
    }

    return {
      success: true,
      subscription: null,
      billing: EMPTY_BILLING_CONTEXT,
      usage: EMPTY_USAGE_SUMMARY,
      currency: resolveBillingCurrency(input.req),
      invoices: [],
      meta: {
        degraded: true,
        reason: normalizedReason,
      },
    };
  }

  private static buildCheckoutFailureRedirect(reason: string) {
    const normalizedReason = String(reason || "").trim() || "checkout_failed";
    const appBaseUrl = String(env.FRONTEND_URL || "").replace(/\/$/, "");
    const query = new URLSearchParams({
      checkout: "failed",
      reason: normalizedReason,
    });

    return `${appBaseUrl}/billing?${query.toString()}`;
  }

  static async instantCheckout(req: Request, res: Response) {
    const startedAt = Date.now();
    const requestId = String(req.requestId || "").trim() || null;
    const stageTimings: Array<{ stage: string; stageMs: number; elapsedMs: number }> = [];
    let lastStageAt = startedAt;
    let inFlightKey: string | null = null;
    const normalizeStage = (value: string) =>
      String(value || "stage")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 48) || "stage";
    const markStage = (stage: string, details?: Record<string, unknown>) => {
      const now = Date.now();
      const timing = {
        stage,
        stageMs: now - lastStageAt,
        elapsedMs: now - startedAt,
      };
      lastStageAt = now;
      stageTimings.push(timing);
      console.info("INSTANT_CHECKOUT_STAGE_OK", {
        requestId,
        stage,
        stageMs: timing.stageMs,
        elapsedMs: timing.elapsedMs,
        ...(details || {}),
      });
    };
    const setTimingHeaders = (outcome: "success" | "failed") => {
      if (res.headersSent || res.writableEnded) {
        return;
      }

      const totalMs = Date.now() - startedAt;
      const slowestStage =
        stageTimings.reduce<(typeof stageTimings)[number] | null>((slowest, stage) => {
          if (!slowest || stage.stageMs > slowest.stageMs) {
            return stage;
          }
          return slowest;
        }, null) || null;

      res.setHeader("X-Checkout-Mode", "instant");
      res.setHeader("X-Checkout-Outcome", outcome);
      res.setHeader("X-Checkout-Request-Id", requestId || "");
      res.setHeader("X-Checkout-Total-Ms", String(Math.max(0, Math.floor(totalMs))));
      res.setHeader(
        "X-Checkout-Stage-Timings",
        stageTimings
          .map(
            (timing) =>
              `${normalizeStage(timing.stage)}=${Math.max(0, Math.floor(timing.stageMs))};e=${Math.max(
                0,
                Math.floor(timing.elapsedMs)
              )}`
          )
          .join(",")
          .slice(0, 3500)
      );
      if (slowestStage) {
        res.setHeader(
          "X-Checkout-Slowest-Stage",
          `${normalizeStage(slowestStage.stage)}:${Math.max(0, Math.floor(slowestStage.stageMs))}`
        );
      }
      res.setHeader(
        "Server-Timing",
        [
          `instant_checkout_total;dur=${Math.max(0, Math.floor(totalMs))}`,
          ...stageTimings.map(
            (timing) =>
              `instant_${normalizeStage(timing.stage)};dur=${Math.max(
                0,
                Math.floor(timing.stageMs)
              )}`
          ),
        ]
          .join(", ")
          .slice(0, 3500)
      );
    };
    const fail = (status: number, reason: string, message: string) => {
      setTimingHeaders("failed");
      console.error("INSTANT_CHECKOUT_FAIL", {
        requestId,
        status,
        reason,
        elapsedMs: Date.now() - startedAt,
        stages: stageTimings,
      });

      if (String(req.method || "").toUpperCase() === "GET") {
        return res.redirect(303, BillingController.buildCheckoutFailureRedirect(reason));
      }

      return res.status(status).json({
        success: false,
        message,
        reason,
      });
    };

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const requestBody =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const requestQuery =
      req.query && typeof req.query === "object" && !Array.isArray(req.query)
        ? (req.query as Record<string, unknown>)
        : {};
    const readInput = (key: string) => {
      const bodyValue = requestBody[key];
      if (bodyValue !== undefined && bodyValue !== null && bodyValue !== "") {
        return bodyValue;
      }

      const queryValue = requestQuery[key];
      if (Array.isArray(queryValue)) {
        return queryValue[0];
      }

      return queryValue;
    };

    try {
      const businessId = BillingController.getBusinessIdFromRequest(req);
      const userId = String(req.user?.id || "").trim();
      const email = String(req.user?.email || "").trim().toLowerCase();
      markStage("context.resolved", {
        businessId: businessId || null,
        userId: userId || null,
      });

      if (!businessId || !userId) {
        return fail(403, "business_context_required", "Business context is required");
      }

      const normalizedPlan = String(readInput("plan") || "")
        .trim()
        .toUpperCase() as PlanType;
      const normalizedBilling = String(readInput("billing") || "monthly")
        .trim()
        .toLowerCase() as BillingInterval;
      const requestedQuantity = Number(readInput("seats") || readInput("quantity") || 1);
      const quantity = Math.max(
        1,
        Math.min(500, Math.floor(Number.isFinite(requestedQuantity) ? requestedQuantity : 1))
      );
      const allowedPlans = new Set<PlanType>(["BASIC", "PRO", "ELITE"]);
      const allowedBilling = new Set<BillingInterval>(["monthly", "yearly"]);

      if (!allowedPlans.has(normalizedPlan)) {
        return fail(400, "invalid_plan", "Invalid plan selected");
      }

      if (!allowedBilling.has(normalizedBilling)) {
        return fail(400, "invalid_billing", "Invalid billing cycle");
      }

      const currency = resolveBillingCurrency(req) as PricingCurrency;
      const priceId = getStripePriceId({
        plan: normalizedPlan,
        currency,
        billing: normalizedBilling,
        early: false,
      });
      markStage("pricing.resolved", {
        businessId,
        plan: normalizedPlan,
        billingCycle: normalizedBilling,
        currency,
        priceIdConfigured: Boolean(priceId),
      });

      if (!priceId) {
        return fail(503, "stripe_price_mapping_missing", "Stripe price is not configured");
      }

      const activeSubscription = await prisma.subscriptionLedger.findFirst({
        where: {
          businessId,
          status: {
            in: ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"],
          },
        },
        select: {
          planCode: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });
      markStage("subscription.checked", {
        businessId,
        activePlanCode: activeSubscription?.planCode || null,
      });

      if (
        activeSubscription?.planCode &&
        String(activeSubscription.planCode || "").trim().toUpperCase() === normalizedPlan
      ) {
        return fail(409, "already_subscribed", "You are already subscribed to this plan");
      }

      assertStripeConfigReady({
        requireWebhookSecret: true,
      });
      markStage("stripe.config_ready", {
        businessId,
      });

      const checkoutAttemptRaw = String(
        readInput("attempt") || readInput("checkoutAttempt") || ""
      ).trim();
      const checkoutAttempt =
        checkoutAttemptRaw
          .replace(/[^a-zA-Z0-9._-]/g, "")
          .slice(0, 80) || crypto.randomUUID().replace(/-/g, "");
      inFlightKey = `${businessId}:${normalizedPlan}:${normalizedBilling}:instant`;
      const currentInFlight = instantCheckoutInFlight.get(inFlightKey);
      if (
        currentInFlight &&
        Date.now() - currentInFlight.startedAt <= INSTANT_CHECKOUT_IN_FLIGHT_WINDOW_MS
      ) {
        return fail(409, "checkout_in_progress", "Another checkout is already in progress");
      }
      instantCheckoutInFlight.set(inFlightKey, {
        startedAt: Date.now(),
        requestId,
      });

      const successUrl =
        `${env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}` +
        `&plan=${encodeURIComponent(normalizedPlan)}` +
        `&billing=${encodeURIComponent(normalizedBilling)}` +
        `&mode=instant&attempt=${encodeURIComponent(checkoutAttempt)}`;
      const cancelUrl =
        `${env.FRONTEND_URL}/billing/cancel?plan=${encodeURIComponent(normalizedPlan)}` +
        `&billing=${encodeURIComponent(normalizedBilling)}&mode=instant`;
      const metadata: Record<string, string> = {
        businessId,
        userId,
        checkoutMode: "instant",
        checkoutAttempt,
        checkoutStartRequestId: requestId || "",
        planCode: normalizedPlan,
        billingCycle: normalizedBilling,
        quantity: String(quantity),
        currency,
      };
      const stripeStartedAt = Date.now();
      const session = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          client_reference_id: checkoutAttempt,
          customer_email: email || undefined,
          allow_promotion_codes: true,
          metadata,
          subscription_data: {
            metadata,
          },
          line_items: [
            {
              price: priceId,
              quantity,
            },
          ],
          success_url: successUrl,
          cancel_url: cancelUrl,
          after_expiration: {
            recovery: {
              enabled: true,
              allow_promotion_codes: true,
            },
          },
          expires_at: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
        },
        {
          idempotencyKey: `instant_checkout:${businessId}:${normalizedPlan}:${normalizedBilling}:${checkoutAttempt}`,
        }
      );
      markStage("stripe.session_created", {
        businessId,
        sessionId: session.id,
        stripeMs: Date.now() - stripeStartedAt,
      });

      const checkoutUrl = String(session.url || "").trim();
      if (!checkoutUrl) {
        return fail(503, "checkout_url_missing", "Stripe checkout link is temporarily unavailable");
      }

      setTimingHeaders("success");
      console.info("INSTANT_CHECKOUT_SUCCESS", {
        requestId,
        businessId,
        sessionId: session.id,
        plan: normalizedPlan,
        billingCycle: normalizedBilling,
        elapsedMs: Date.now() - startedAt,
        stages: stageTimings,
      });
      return res.redirect(303, checkoutUrl);
    } catch (error: any) {
      const reason = String(error?.message || "instant_checkout_failed");
      return fail(
        reason.includes("stripe_config_invalid") ? 503 : 500,
        reason.includes("stripe_config_invalid") ? "provider_unavailable" : "instant_checkout_failed",
        reason.includes("stripe_config_invalid")
          ? "Billing provider is temporarily unavailable. Please retry shortly."
          : "Instant checkout failed"
      );
    } finally {
      if (inFlightKey) {
        instantCheckoutInFlight.delete(inFlightKey);
      }
    }
  }

  private static async handleCheckout(
    req: Request,
    res: Response,
    options?: {
      redirectOnSuccess?: boolean;
    }
  ) {
    const redirectOnSuccess = Boolean(options?.redirectOnSuccess);
    const checkoutStartedAt = Date.now();
    let checkoutLastStageAt = checkoutStartedAt;
    const checkoutStageTimings: Array<{
      stage: string;
      stageMs: number;
      elapsedMs: number;
    }> = [];
    let checkoutTimingReported = false;
    const checkoutRequestId = String((req as any)?.requestId || "").trim() || null;
const emitCheckoutMetric = (
      name:
        | "auth_ms"
        | "billing_context_ms"
        | "pricing_ms"
        | "proposal_ms"
        | "payment_intent_ms"
        | "total_checkout_ms",
      value: number,
      metadata?: Record<string, unknown>
    ) => {
      setImmediate(() => {
        emitPerformanceMetric({
          name,
          value,
          businessId: BillingController.getBusinessIdFromRequest(req),
          route: "billing_checkout",
          metadata: {
            requestId: checkoutRequestId,
            redirectOnSuccess,
            ...(metadata || {}),
          },
        });
      });
    };
    const hasExplicitFinalResponseWrite = () =>
      Boolean(
        (res.locals as Record<string, unknown> | undefined)?.[
          RESPONSE_FINAL_WRITE_LOCAL_KEY
        ]
      );
    const isResponseCommitted = () =>
      res.headersSent || res.writableEnded || hasExplicitFinalResponseWrite();
    const pushCheckoutStageTiming = (stage: string) => {
      const now = Date.now();
      const timing = {
        stage,
        stageMs: now - checkoutLastStageAt,
        elapsedMs: now - checkoutStartedAt,
      };
      checkoutLastStageAt = now;
      checkoutStageTimings.push(timing);
      return timing;
    };
    const normalizeTimingHeaderName = (value: string) =>
      String(value || "stage")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 48) || "stage";
    const getCheckoutTimingSnapshot = () => {
      const totalCheckoutMs = Date.now() - checkoutStartedAt;
      const requestStartedAt = Number(
        (res.locals as Record<string, unknown> | undefined)?.requestTimeoutStartedAt ||
          0
      );
      const totalRequestMs =
        Number.isFinite(requestStartedAt) && requestStartedAt > 0
          ? Date.now() - requestStartedAt
          : totalCheckoutMs;
      const stages = checkoutStageTimings.map((timing) => ({
        stage: timing.stage,
        stageMs: Math.max(0, Math.floor(timing.stageMs)),
        elapsedMs: Math.max(0, Math.floor(timing.elapsedMs)),
      }));
      const slowestStage =
        stages.reduce<(typeof stages)[number] | null>((slowest, stage) => {
          if (!slowest || stage.stageMs > slowest.stageMs) {
            return stage;
          }
          return slowest;
        }, null) || null;

      return {
        totalCheckoutMs,
        totalRequestMs,
        stages,
        slowestStage,
      };
    };
    const setCheckoutTimingHeaders = (outcome: "success" | "failed") => {
      if (isResponseCommitted()) {
        return;
      }

      const snapshot = getCheckoutTimingSnapshot();
      const stageHeader = snapshot.stages
        .map(
          (timing) =>
            `${normalizeTimingHeaderName(timing.stage)}=${timing.stageMs};e=${timing.elapsedMs}`
        )
        .join(",");
      const serverTiming = [
        `checkout_total;dur=${Math.max(0, Math.floor(snapshot.totalCheckoutMs))}`,
        `request_total;dur=${Math.max(0, Math.floor(snapshot.totalRequestMs))}`,
        ...snapshot.stages.map(
          (timing) =>
            `checkout_${normalizeTimingHeaderName(timing.stage)};dur=${timing.stageMs}`
        ),
      ].join(", ");

      res.setHeader("X-Checkout-Outcome", outcome);
      res.setHeader("X-Checkout-Request-Id", checkoutRequestId || "");
      res.setHeader(
        "X-Checkout-Total-Ms",
        String(Math.max(0, Math.floor(snapshot.totalCheckoutMs)))
      );
      res.setHeader(
        "X-Checkout-Request-Total-Ms",
        String(Math.max(0, Math.floor(snapshot.totalRequestMs)))
      );
      res.setHeader("X-Checkout-Stage-Timings", stageHeader.slice(0, 3500));
      if (snapshot.slowestStage) {
        res.setHeader(
          "X-Checkout-Slowest-Stage",
          `${normalizeTimingHeaderName(snapshot.slowestStage.stage)}:${snapshot.slowestStage.stageMs}`
        );
      }
      res.setHeader("Server-Timing", serverTiming.slice(0, 3500));
    };
    const reportCheckoutTiming = (
      outcome: "success" | "failed",
      details?: Record<string, unknown>
    ) => {
      if (checkoutTimingReported) {
        return;
      }
      checkoutTimingReported = true;
      const timingSnapshot = getCheckoutTimingSnapshot();
      setImmediate(() => {
        emitCheckoutMetric("total_checkout_ms", timingSnapshot.totalCheckoutMs, {
          outcome,
          ...(details || {}),
        });
        console.info("CHECKOUT_TIMING_BREAKDOWN", {
          requestId: checkoutRequestId,
          route: req.originalUrl,
          method: req.method,
          outcome,
          totalMs: timingSnapshot.totalCheckoutMs,
          requestTotalMs: timingSnapshot.totalRequestMs,
          slowestStage: timingSnapshot.slowestStage,
          stages: timingSnapshot.stages,
          ...(details || {}),
        });
      });
    };
    const logStageOk = (
      stage: string,
      details?: Record<string, unknown>
    ) => {
      const timing = pushCheckoutStageTiming(stage);
      setImmediate(() => {
        console.info("BILLING_STAGE_OK", {
          stage,
          requestId: checkoutRequestId,
          route: req.originalUrl,
          method: req.method,
          elapsedMs: timing.elapsedMs,
          stageMs: timing.stageMs,
          ...(details || {}),
        });
        console.info("CHECKOUT_STAGE_OK", {
          stage,
          requestId: checkoutRequestId,
          elapsedMs: timing.elapsedMs,
          stageMs: timing.stageMs,
          ...(details || {}),
        });
      });
    };
    const logStageFail = (
      stage: string,
      reason: string,
      details?: Record<string, unknown>
    ) => {
      const timing = pushCheckoutStageTiming(stage);
      setImmediate(() => {
        console.error("CHECKOUT_STAGE_FAIL", {
          stage,
          reason,
          requestId: checkoutRequestId,
          route: req.originalUrl,
          method: req.method,
          elapsedMs: timing.elapsedMs,
          stageMs: timing.stageMs,
          ...(details || {}),
        });
      });
    };
    setImmediate(() => {
      console.info("BILLING_START", {
        requestId: checkoutRequestId,
        route: req.originalUrl,
        method: req.method,
        redirectOnSuccess,
      });
      console.info("CHECKOUT_START", {
        requestId: checkoutRequestId,
        route: req.originalUrl,
        method: req.method,
        redirectOnSuccess,
        remainingMs: getRequestRemainingMs({ req, res }, 0),
      });
    });
    if (redirectOnSuccess) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    const requestBody =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const requestQuery =
      req.query && typeof req.query === "object" && !Array.isArray(req.query)
        ? (req.query as Record<string, unknown>)
        : {};
    const readInput = (key: string) => {
      const bodyValue = requestBody[key];
      if (bodyValue !== undefined && bodyValue !== null && bodyValue !== "") {
        return bodyValue;
      }

      const queryValue = requestQuery[key];
      if (Array.isArray(queryValue)) {
        return queryValue[0];
      }

      return queryValue;
    };
    const sendCheckoutError = (input: {
      status: number;
      message: string;
      reason: string;
      code?: string;
    }) => {
      logStageFail("checkout.response", input.reason, {
        status: input.status,
        code: input.code || null,
        redirectOnSuccess,
      });
      setImmediate(() => {
        console.error("BILLING_STAGE_FAIL", {
          stage: "checkout.response",
          reason: input.reason,
          status: input.status,
          code: input.code || null,
          requestId: checkoutRequestId,
          route: req.originalUrl,
          method: req.method,
          elapsedMs: Date.now() - checkoutStartedAt,
          redirectOnSuccess,
        });
      });
      reportCheckoutTiming("failed", {
        status: input.status,
        reason: input.reason,
        code: input.code || null,
      });

      if (isResponseCommitted()) {
        logStageOk("checkout.response.skipped", {
          success: false,
          status: input.status,
          reason: input.reason,
          code: input.code || null,
          skipped: "response_already_committed",
          redirectOnSuccess,
        });
        return res;
      }

      if (redirectOnSuccess) {
        setCheckoutTimingHeaders("failed");
        return res.redirect(303, BillingController.buildCheckoutFailureRedirect(input.reason));
      }

      setCheckoutTimingHeaders("failed");
      return res.status(input.status).json({
        success: false,
        ...(input.code ? { code: input.code } : {}),
        message: input.message,
      });
    };

    try {
      throwIfRequestLifecycleAborted({
        req,
        res,
        stage: "checkout.entry",
      });
      const requestAbortSignal = getRequestAbortSignal({ req, res });
      const plan = readInput("plan");
      const coupon = readInput("coupon");
      const requestedQuantity = Number(readInput("seats") || readInput("quantity") || 1);
      const quantity = Math.max(1, Math.floor(Number.isFinite(requestedQuantity) ? requestedQuantity : 1));
      const billing = String(readInput("billing") || "monthly");
      const checkoutTypeInput = String(
        readInput("checkoutType") || readInput("action") || (coupon ? "coupon" : "subscription")
      )
        .trim()
        .toLowerCase();
      const checkoutAttemptRaw = String(
        readInput("attempt") || readInput("checkoutAttempt") || ""
      ).trim();
      const checkoutAttempt =
        checkoutAttemptRaw
          .replace(/[^a-zA-Z0-9._-]/g, "")
          .slice(0, 80) || crypto.randomUUID().replace(/-/g, "");
      const checkoutType = new Set([
        "subscription",
        "one_time",
        "trial",
        "coupon",
        "upgrade",
        "downgrade",
        "addon",
      ]).has(checkoutTypeInput)
        ? checkoutTypeInput
        : "subscription";
      const trialDays =
        checkoutType === "trial"
          ? Math.max(1, Math.min(30, Math.floor(Number(readInput("trialDays") || TRIAL_DAYS))))
          : 0;
      const addonLineItems = Array.isArray(requestBody.lineItems)
        ? requestBody.lineItems
        : Array.isArray(requestBody.addons)
        ? requestBody.addons.map((item: any, index: number) => ({
            type: String(item?.type || item?.addonType || "").trim().toLowerCase(),
            credits: Math.max(0, Math.floor(Number(item?.credits || item?.quantity || 0))),
            label: String(item?.label || `addon_${index + 1}`).trim(),
          }))
        : [];
      const couponCode = String(coupon || readInput("couponId") || "").trim() || null;
      const normalizedPlan = String(plan || "").trim().toUpperCase();
      const normalizedBilling =
        billing === "yearly"
          ? "yearly"
          : billing === "monthly"
          ? "monthly"
          : null;
      const allowedPlans = new Set(["BASIC", "PRO", "ELITE"]);

      if (!normalizedPlan) {
        return sendCheckoutError({
          status: 400,
          message: "Plan is required",
          reason: "plan_required",
        });
      }

      if (!allowedPlans.has(normalizedPlan)) {
        return sendCheckoutError({
          status: 400,
          message: "Invalid plan selected",
          reason: "invalid_plan",
        });
      }

      if (!normalizedBilling) {
        return sendCheckoutError({
          status: 400,
          message: "Invalid billing cycle",
          reason: "invalid_billing",
        });
      }

      const authStartedAt = Date.now();
      let businessId = BillingController.getBusinessIdFromRequest(req);
      let email = String(req.user?.email || "").trim().toLowerCase();
      const hasFastPathContext = Boolean(businessId && email);
      if (!hasFastPathContext) {
        const userContext = await getUserContext(req);
        businessId = businessId || userContext.businessId;
        email = email || userContext.email;
      }
      emitCheckoutMetric("auth_ms", Date.now() - authStartedAt, {
        stage: "auth_resolved",
        source: hasFastPathContext ? "request_context_fast_path" : "user_context_lookup",
      });
      throwIfRequestLifecycleAborted({
        req,
        res,
        stage: "checkout.auth_resolved",
      });
      logStageOk("auth.resolved", {
        userId: String(req.user?.id || "").trim() || null,
        businessId: businessId || null,
      });

      if (!businessId) {
        return sendCheckoutError({
          status: 403,
          message: "Business context is required",
          reason: "business_context_required",
        });
      }

      const billingContextStartedAt = Date.now();
      logStageOk("checkout.context.validated", {
        businessId,
        plan: normalizedPlan,
        billingCycle: normalizedBilling,
        checkoutType,
        quantity,
      });
      assertStripeConfigReady();
      throwIfRequestLifecycleAborted({
        req,
        res,
        stage: "checkout.stripe_config",
      });
      emitCheckoutMetric("billing_context_ms", Date.now() - billingContextStartedAt, {
        businessId,
        stage: "context_validated",
      });

      const pricingStartedAt = Date.now();
      const currency = resolveBillingCurrency(req);
      const pricingPlan = getPricingPlanConfig(normalizedPlan);
      const unitPrice =
        normalizedBilling === "yearly"
          ? pricingPlan.yearlyPrice[currency]
          : pricingPlan.monthlyPrice[currency];

      if (!Number.isFinite(Number(unitPrice)) || Number(unitPrice) <= 0) {
        return sendCheckoutError({
          status: 400,
          message: `Pricing is not configured for ${normalizedPlan} (${currency}, ${normalizedBilling})`,
          reason: "pricing_unavailable",
        });
      }

      const explicitUnitAmountMinor = Number(readInput("unitAmountMinor") || readInput("amountMinor") || 0);
      const customUnitPriceMinor =
        Number.isFinite(explicitUnitAmountMinor) && explicitUnitAmountMinor > 0
          ? Math.floor(explicitUnitAmountMinor)
          : Math.round(Number(unitPrice || 0) * 100);
      logStageOk("pricing.resolved", {
        businessId,
        plan: normalizedPlan,
        billingCycle: normalizedBilling,
        currency,
        quantity,
        unitPrice,
        customUnitPriceMinor,
      });

      const preloadedSubscription = (req as any).subscription;

      // Active-plan protection check (prevent duplicate checkouts on active plan)
      let activePlanCode: string | null = null;
      let activeSubscription = preloadedSubscription && ["ACTIVE", "TRIAL", "TRIALING", "PAST_DUE", "PAUSED"].includes(preloadedSubscription.status)
        ? {
            metadata: preloadedSubscription.metadata || {},
            subscriptionKey: preloadedSubscription.subscriptionKey || `sub_${preloadedSubscription.stripeSubscriptionId || preloadedSubscription.id}`,
            providerSubscriptionId: preloadedSubscription.providerSubscriptionId || preloadedSubscription.stripeSubscriptionId || null,
          }
        : null;

      if (preloadedSubscription && ["ACTIVE", "TRIAL", "TRIALING", "PAST_DUE", "PAUSED"].includes(preloadedSubscription.status)) {
        activePlanCode = preloadedSubscription.plan?.name || preloadedSubscription.plan?.type || null;
      }

      if (!activePlanCode || !activeSubscription) {
        const foundActive = await prisma.subscriptionLedger.findFirst({
          where: {
            businessId,
            status: {
              in: ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"],
            },
          },
          select: {
            planCode: true,
            metadata: true,
            subscriptionKey: true,
            providerSubscriptionId: true,
          },
          orderBy: {
            updatedAt: "desc",
          },
        });

        if (foundActive) {
          activePlanCode = activePlanCode || foundActive.planCode;
          activeSubscription = activeSubscription || {
            metadata: foundActive.metadata || {},
            subscriptionKey: foundActive.subscriptionKey,
            providerSubscriptionId: foundActive.providerSubscriptionId,
          };
        } else {
          // Fall back to checking PENDING subscriptions if no ACTIVE/TRIAL subscription is found.
          const foundPending = await prisma.subscriptionLedger.findFirst({
            where: {
              businessId,
              status: "PENDING",
            },
            select: {
              metadata: true,
              subscriptionKey: true,
              providerSubscriptionId: true,
            },
            orderBy: {
              updatedAt: "desc",
            },
          });

          if (foundPending) {
            activeSubscription = {
              metadata: foundPending.metadata || {},
              subscriptionKey: foundPending.subscriptionKey,
              providerSubscriptionId: foundPending.providerSubscriptionId,
            };
          }
        }
      }

      if (activePlanCode && String(activePlanCode).trim().toUpperCase() === normalizedPlan) {
        return sendCheckoutError({
          status: 409,
          message: `You are already subscribed to the ${normalizedPlan.charAt(0) + normalizedPlan.slice(1).toLowerCase()} plan.`,
          reason: "already_subscribed",
          code: "ALREADY_SUBSCRIBED",
        });
      }
      throwIfRequestLifecycleAborted({
        req,
        res,
        stage: "checkout.subscription_lookup",
      });
      emitCheckoutMetric("pricing_ms", Date.now() - pricingStartedAt, {
        businessId,
        plan: normalizedPlan,
        billingCycle: normalizedBilling,
        currency,
      });
      const subscriptionMeta = (activeSubscription?.metadata || {}) as Record<string, unknown>;
      const checkoutProposalFingerprint = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            businessId,
            normalizedPlan,
            normalizedBilling,
            currency,
            quantity,
            checkoutType,
            trialDays,
            couponCode,
            addonLineItems,
            activeSubscriptionKey: activeSubscription?.subscriptionKey || null,
            prorationBehavior: readInput("prorationBehavior") || null,
          })
        )
        .digest("hex")
        .slice(0, 24);

      const inFlightKey = `${businessId}:${normalizedPlan}:${normalizedBilling}:${checkoutType}`;
      const currentInFlight = checkoutInFlight.get(inFlightKey);
      if (
        currentInFlight &&
        Date.now() - currentInFlight.startedAt <= CHECKOUT_IN_FLIGHT_WINDOW_MS
      ) {
        return sendCheckoutError({
          status: 409,
          message: "Another checkout is already in progress. Please wait a moment and retry.",
          reason: "checkout_in_progress",
          code: "CHECKOUT_IN_PROGRESS",
        });
      }
      checkoutInFlight.set(inFlightKey, {
        startedAt: Date.now(),
        requestId: checkoutRequestId,
      });

      try {
        throwIfRequestLifecycleAborted({
          req,
          res,
          stage: "checkout.proposal_start",
        });
        const proposalStartedAt = Date.now();
        const proposal = await proposalEngineService.createProposal({
            businessId,
            planCode: normalizedPlan,
            billingCycle: normalizedBilling,
            currency,
            quantity,
            customUnitPriceMinor,
            lineItems: addonLineItems,
            source: "SELF",
            requestedBy: "SELF",
            metadata: {
              checkoutSource: "billing_controller",
              checkoutType,
              trialDays,
              coupon: couponCode,
              prorationBehavior:
                String(readInput("prorationBehavior") || "").trim().toLowerCase() || null,
              providerSubscriptionId:
                String(readInput("providerSubscriptionId") || activeSubscription?.providerSubscriptionId || "").trim() ||
                null,
              stripeCustomerId:
                String(readInput("stripeCustomerId") || subscriptionMeta.stripeCustomerId || "").trim() ||
                null,
              seatBased: quantity > 1,
            },
            idempotencyKey: `checkout:proposal:${businessId}:${checkoutProposalFingerprint}`,
            requestSignal: requestAbortSignal,
            deferNonCriticalWork: true,
          });
        throwIfRequestLifecycleAborted({
          req,
          res,
          stage: "checkout.proposal_created",
        });

        const readyProposal =
          proposal.status === "APPROVED" || proposal.status === "SENT"
            ? proposal
            : await proposalEngineService.sendProposal({
                businessId,
                proposalKey: proposal.proposalKey,
              });
        throwIfRequestLifecycleAborted({
          req,
          res,
          stage: "checkout.proposal_ready",
        });
        emitCheckoutMetric("proposal_ms", Date.now() - proposalStartedAt, {
          businessId,
          plan: normalizedPlan,
          billingCycle: normalizedBilling,
          checkoutType,
        });
        logStageOk("proposal.created", {
          businessId,
          proposalKey: readyProposal.proposalKey,
          proposalStatus: readyProposal.status,
        });

        const paymentIntentStartedAt = Date.now();
        let paymentIntent: Awaited<ReturnType<typeof paymentIntentService.createCheckout>>;
        try {
          throwIfRequestLifecycleAborted({
            req,
            res,
            stage: "checkout.payment_intent_start",
          });
          paymentIntent = await paymentIntentService.createCheckout({
              businessId,
              proposalKey: readyProposal.proposalKey,
              proposalPreloaded: readyProposal,
              provider: "STRIPE",
              source: "SELF",
              description: `${normalizedPlan} ${normalizedBilling} plan checkout`,
              successUrl: `${env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${normalizedPlan}&billing=${normalizedBilling}&proposal=${readyProposal.proposalKey}`,
              cancelUrl: `${env.FRONTEND_URL}/billing/cancel?plan=${normalizedPlan}&billing=${normalizedBilling}&proposal=${readyProposal.proposalKey}`,
              metadata: {
                coupon: couponCode,
                origin: "billing_controller",
                planCode: normalizedPlan,
                billingCycle: normalizedBilling,
                quantity,
                checkoutType,
                trialDays,
                providerSubscriptionId:
                  String(readInput("providerSubscriptionId") || activeSubscription?.providerSubscriptionId || "").trim() ||
                  null,
                stripeCustomerId:
                  String(readInput("stripeCustomerId") || subscriptionMeta.stripeCustomerId || "").trim() ||
                  null,
                customerEmail: email,
                checkoutAttempt,
                checkoutStartRequestId: checkoutRequestId,
                checkoutStartPath: req.originalUrl,
                prorationBehavior:
                  String(readInput("prorationBehavior") || "").trim().toLowerCase() || null,
                seatBased: quantity > 1,
              },
              idempotencyKey: `checkout:payment_intent:${businessId}:${readyProposal.proposalKey}:${checkoutAttempt}`,
              requestSignal: requestAbortSignal,
              deferNonCriticalWork: true,
            });
        } finally {
          emitCheckoutMetric("payment_intent_ms", Date.now() - paymentIntentStartedAt, {
            businessId,
            proposalKey: readyProposal.proposalKey,
          });
        }
        throwIfRequestLifecycleAborted({
          req,
          res,
          stage: "checkout.payment_intent_created",
        });
        logStageOk("payment_intent.created", {
          businessId,
          proposalKey: readyProposal.proposalKey,
          paymentIntentKey: paymentIntent.paymentIntentKey,
          provider: paymentIntent.provider,
          paymentIntentStatus: paymentIntent.status,
        });

        const checkoutUrl = String(paymentIntent.checkoutUrl || "").trim();
        logStageOk("checkout_url.evaluated", {
          businessId,
          proposalKey: readyProposal.proposalKey,
          paymentIntentKey: paymentIntent.paymentIntentKey,
          hasCheckoutUrl: Boolean(checkoutUrl),
        });

        if (!checkoutUrl) {
          return sendCheckoutError({
            status: 503,
            message: "Stripe checkout link is temporarily unavailable. Please retry shortly.",
            reason: "checkout_url_missing",
          });
        }

        throwIfRequestLifecycleAborted({
          req,
          res,
          stage: "checkout.response_finalize",
        });
        if (isResponseCommitted()) {
          logStageOk("checkout.response.skipped", {
            success: true,
            businessId,
            proposalKey: readyProposal.proposalKey,
            paymentIntentKey: paymentIntent.paymentIntentKey,
            skipped: "response_already_committed",
            redirectOnSuccess,
          });
          return;
        }

        if (redirectOnSuccess) {
          console.info("CHECKOUT_SUCCESS", {
            requestId: checkoutRequestId,
            businessId,
            proposalKey: readyProposal.proposalKey,
            paymentIntentKey: paymentIntent.paymentIntentKey,
            elapsedMs: Date.now() - checkoutStartedAt,
            action: "redirect",
          });
          logStageOk("checkout.response.redirect", {
            success: true,
            status: 303,
            businessId,
            proposalKey: readyProposal.proposalKey,
            paymentIntentKey: paymentIntent.paymentIntentKey,
            redirectOnSuccess,
          });
          console.info("CHECKOUT_REDIRECT_SENT", {
            requestId: checkoutRequestId,
            status: 303,
            checkoutUrl,
            elapsedMs: Date.now() - checkoutStartedAt,
          });
          reportCheckoutTiming("success", {
            status: 303,
            businessId,
            proposalKey: readyProposal.proposalKey,
            paymentIntentKey: paymentIntent.paymentIntentKey,
          });
          setCheckoutTimingHeaders("success");
          return res.redirect(303, checkoutUrl);
        }

        console.info("CHECKOUT_SUCCESS", {
          requestId: checkoutRequestId,
          businessId,
          proposalKey: readyProposal.proposalKey,
          paymentIntentKey: paymentIntent.paymentIntentKey,
          elapsedMs: Date.now() - checkoutStartedAt,
          action: "json",
        });
        logStageOk("checkout.response.json", {
          success: true,
          status: 200,
          businessId,
          proposalKey: readyProposal.proposalKey,
          paymentIntentKey: paymentIntent.paymentIntentKey,
          redirectOnSuccess,
        });
        reportCheckoutTiming("success", {
          status: 200,
          businessId,
          proposalKey: readyProposal.proposalKey,
          paymentIntentKey: paymentIntent.paymentIntentKey,
        });
        setCheckoutTimingHeaders("success");
        return res.json({
          success: true,
          url: checkoutUrl,
          proposalKey: readyProposal.proposalKey,
          paymentIntentKey: paymentIntent.paymentIntentKey,
        });
      } finally {
        checkoutInFlight.delete(inFlightKey);
      }
    } catch (error: any) {
      if (isRequestLifecycleAborted({ req, res }) || isResponseCommitted()) {
        return;
      }
      const stripeCode = String(error?.code || "").trim().toLowerCase();
      const stripeType = String(error?.type || "").trim().toLowerCase();

      if (error.message === "Unauthorized") {
        return sendCheckoutError({
          status: 401,
          message: "Unauthorized",
          reason: "unauthorized",
        });
      }

      if (
        error.message?.includes("Currency cannot be changed") ||
        error.message?.includes("Invalid plan") ||
        error.message?.includes("Invalid billing") ||
        error.message?.includes("proposal_not_checkout_ready") ||
        error.message?.includes("stripe_subscription_amount_invalid") ||
        error.message?.includes("stripe_price_mapping_missing") ||
        error.message?.includes("unknown parameter") ||
        error.message?.includes("parameter_unknown") ||
        error.message?.includes("invalid_request_error") ||
        stripeCode === "parameter_unknown" ||
        stripeType === "invalid_request_error"
      ) {
        return sendCheckoutError({
          status: 400,
          message: "Checkout configuration is invalid. Please contact support if this persists.",
          reason: "checkout_invalid",
        });
      }

      if (error.message?.includes("checkout_manual_review_required")) {
        return sendCheckoutError({
          status: 409,
          code: "CHECKOUT_MANUAL_REVIEW_REQUIRED",
          message: "Checkout is temporarily paused for risk review. Please contact support.",
          reason: "manual_review_required",
        });
      }

      if (error.message?.includes("provider_timeout")) {
        return sendCheckoutError({
          status: 504,
          code: "BILLING_PROVIDER_TIMEOUT",
          message: "Stripe took too long to respond. Please retry in a few seconds.",
          reason: "provider_timeout",
        });
      }

      if (error.message?.includes("provider_credential_")) {
        return sendCheckoutError({
          status: 503,
          code: "BILLING_PROVIDER_UNAVAILABLE",
          message: "Billing provider is temporarily unavailable. Please retry shortly.",
          reason: "provider_unavailable",
        });
      }

      if (error.message?.includes("stripe_config_invalid")) {
        return sendCheckoutError({
          status: 503,
          code: "BILLING_PROVIDER_UNAVAILABLE",
          message: "Billing provider is temporarily unavailable. Please retry shortly.",
          reason: "provider_unavailable",
        });
      }

      console.error("BILLING_STAGE_FAIL", {
        stage: "checkout.exception",
        reason: String(error?.message || "checkout_failed"),
      });
      console.error("CHECKOUT_FAIL", {
        requestId: checkoutRequestId,
        reason: String(error?.message || "checkout_failed"),
        elapsedMs: Date.now() - checkoutStartedAt,
      });

      return sendCheckoutError({
        status: 500,
        message: error.message || "Checkout failed",
        reason: "checkout_failed",
      });
    }
  }

  static async getPlans(req: Request, res: Response) {
    try {
      const plans = await prisma.plan.findMany({
        where: {
          type: {
            in: ["BASIC", "PRO", "ELITE"],
          },
        },
        select: {
          id: true,
          name: true,
          type: true,
          priceIdINR: true,
          priceIdUSD: true,
        },
      });

      return res.json(
        buildPlansPayload({
          plans: plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            type: String(plan.type || "").trim(),
            priceIdINR: plan.priceIdINR,
            priceIdUSD: plan.priceIdUSD,
          })),
          degraded: false,
          reason: null,
        })
      );
    } catch (error) {
      console.error("BILLING_STAGE_FAIL", {
        stage: "plans.fetch",
        reason: String((error as Error)?.message || "plans_unavailable"),
      });
      return res.status(503).json({
        success: false,
        message: "Billing plans are temporarily unavailable.",
      });
    }
  }

  static async getBilling(req: Request, res: Response) {
    try {
      const surface = String(req.query.surface || "").trim().toLowerCase();
      const lightweight = surface === "checkout" || surface === "billing";
      let businessId = BillingController.getBusinessIdFromRequest(req);
      if (!businessId) {
        const context = await getUserContext(req);
        businessId = context.businessId;
      }
      res.setHeader("Cache-Control", "no-store");
      const currencyHint = resolveBillingCurrency(req);
      const cacheKey = businessId
        ? getBillingProjectionCacheKey(businessId, currencyHint)
        : null;

      const isCheckoutSurface =
        surface === "checkout" ||
        String(req.originalUrl || "").includes("/checkout") ||
        String(req.originalUrl || "").includes("surface=checkout");

      if (isCheckoutSurface) {
        let cachedVal: any = null;
        if (cacheKey) {
          const cached = billingProjectionCache.get(cacheKey);
          if (cached?.value) {
            cachedVal = cached.value;
          }
        }

        if (cachedVal) {
          // Spawn background projection repair if not already computing
          if (cacheKey) {
            const activeCached = billingProjectionCache.get(cacheKey);
            if (!activeCached?.promise) {
              const computeProjection = runProjectionComputeTask({
                cacheKey,
                label: "billing_projection",
                businessId,
                computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                bypassCoordination: true,
                task: () =>
                  BillingController.buildBillingResponse(
                    businessId,
                    req,
                    { lightweight: true, isCheckout: true }
                  ) as Promise<Record<string, unknown>>,
              });
              const sharedProjectionPromise = computeProjection
                .then((value) => {
                  const updatedAt = Date.now();
                  billingProjectionCache.set(cacheKey, {
                    value,
                    updatedAt,
                    expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                  });
                  void writeRedisBillingProjectionSnapshot(cacheKey, value);
                  return value;
                })
                .catch((error) => {
                  billingProjectionCache.delete(cacheKey);
                  throw error;
                });
              billingProjectionCache.set(cacheKey, {
                expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                value: cachedVal,
                updatedAt: Date.now(),
                promise: sharedProjectionPromise,
              });
            }
          }

          const isStale = (billingProjectionCache.get(cacheKey)?.expiresAt || 0) <= Date.now();
          return res.status(200).json(
            isStale ? markBillingSnapshotAsStale(cachedVal, "stale_revalidate") : cachedVal
          );
        }

        // LKV fallback
        const lkvSub = prewarmState.lastKnownValidSubscription.get(businessId);
        const lkvBill = prewarmState.lastKnownValidBilling.get(businessId);
        if (lkvSub && lkvBill) {
          const prewarmFallback = {
            success: true,
            subscription: lkvSub,
            billing: lkvBill,
            usage: EMPTY_USAGE_SUMMARY,
            currency: lkvSub.currency || resolveBillingCurrency(req),
            invoices: [],
            meta: {
              degraded: true,
              reason: "lightweight_prewarm_lkv",
            },
          };

          // Spawn background projection repair if not already computing
          if (cacheKey) {
            const activeCached = billingProjectionCache.get(cacheKey);
            if (!activeCached?.promise) {
              const computeProjection = runProjectionComputeTask({
                cacheKey,
                label: "billing_projection",
                businessId,
                computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                bypassCoordination: true,
                task: () =>
                  BillingController.buildBillingResponse(
                    businessId,
                    req,
                    { lightweight: true, isCheckout: true }
                  ) as Promise<Record<string, unknown>>,
              });
              const sharedProjectionPromise = computeProjection
                .then((value) => {
                  const updatedAt = Date.now();
                  billingProjectionCache.set(cacheKey, {
                    value,
                    updatedAt,
                    expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                  });
                  void writeRedisBillingProjectionSnapshot(cacheKey, value);
                  return value;
                })
                .catch((error) => {
                  billingProjectionCache.delete(cacheKey);
                  throw error;
                });
              billingProjectionCache.set(cacheKey, {
                expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                value: undefined,
                updatedAt: Date.now(),
                promise: sharedProjectionPromise,
              });
            }
          }

          return res.status(200).json(prewarmFallback);
        }

        // Default degraded response
        const defaultResponse = {
          success: true,
          subscription: null,
          billing: EMPTY_BILLING_CONTEXT,
          usage: EMPTY_USAGE_SUMMARY,
          currency: resolveBillingCurrency(req),
          invoices: [],
          meta: {
            degraded: true,
            reason: "lightweight_degraded_sync",
          },
        };

        // Spawn background projection repair if not already computing
        if (cacheKey) {
          const activeCached = billingProjectionCache.get(cacheKey);
          if (!activeCached?.promise) {
            const computeProjection = runProjectionComputeTask({
              cacheKey,
              label: "billing_projection",
              businessId,
              computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
              bypassCoordination: true,
              task: () =>
                BillingController.buildBillingResponse(
                  businessId,
                  req,
                  { lightweight: true, isCheckout: true }
                ) as Promise<Record<string, unknown>>,
            });
            const sharedProjectionPromise = computeProjection
              .then((value) => {
                const updatedAt = Date.now();
                billingProjectionCache.set(cacheKey, {
                  value,
                  updatedAt,
                  expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                });
                void writeRedisBillingProjectionSnapshot(cacheKey, value);
                return value;
              })
              .catch((error) => {
                billingProjectionCache.delete(cacheKey);
                throw error;
              });
            billingProjectionCache.set(cacheKey, {
              expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
              value: undefined,
              updatedAt: Date.now(),
              promise: sharedProjectionPromise,
            });
          }
        }

        return res.status(200).json(defaultResponse);
      }

      if (lightweight) {
        if (cacheKey) {
          // 1. Memory Cache check
          const cached = billingProjectionCache.get(cacheKey);
          if (cached?.value) {
            const isStale = cached.expiresAt <= Date.now();
            
            // Kick off background computation if stale and not already computing
            if (isStale && !cached.promise) {
              const computeProjection = runProjectionComputeTask({
                cacheKey,
                label: "billing_projection",
                businessId,
                computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                task: () =>
                  BillingController.buildBillingResponse(
                    businessId,
                    req,
                    { lightweight }
                  ) as Promise<Record<string, unknown>>,
              });
              const sharedProjectionPromise = computeProjection
                .then((value) => {
                  const updatedAt = Date.now();
                  billingProjectionCache.set(cacheKey, {
                    value,
                    updatedAt,
                    expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                  });
                  void writeRedisBillingProjectionSnapshot(cacheKey, value);
                  return value;
                })
                .catch((error) => {
                  billingProjectionCache.delete(cacheKey);
                  throw error;
                });
              billingProjectionCache.set(cacheKey, {
                expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                value: cached.value,
                updatedAt: cached.updatedAt,
                promise: sharedProjectionPromise,
              });
            }

            return res.status(200).json(
              isStale ? markBillingSnapshotAsStale(cached.value, "stale_revalidate") : cached.value
            );
          }

          // 2. Redis Cache check (non-blocking for checkout!)
          const redisSnapshot = await readRedisBillingProjectionSnapshot(cacheKey).catch(() => null);
          if (redisSnapshot?.data) {
            billingProjectionCache.set(cacheKey, {
              value: redisSnapshot.data,
              updatedAt: redisSnapshot.updatedAt,
              expiresAt: Date.now() + Math.floor(BILLING_PROJECTION_CACHE_TTL_MS / 2),
            });

            // Trigger background compute task if not already computing
            const computeProjection = runProjectionComputeTask({
              cacheKey,
              label: "billing_projection",
              businessId,
              computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
              task: () =>
                BillingController.buildBillingResponse(
                  businessId,
                  req,
                  { lightweight }
                ) as Promise<Record<string, unknown>>,
            });
            const sharedProjectionPromise = computeProjection
              .then((value) => {
                const updatedAt = Date.now();
                billingProjectionCache.set(cacheKey, {
                  value,
                  updatedAt,
                  expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                });
                void writeRedisBillingProjectionSnapshot(cacheKey, value);
                return value;
              })
              .catch((error) => {
                billingProjectionCache.delete(cacheKey);
                throw error;
              });
            billingProjectionCache.set(cacheKey, {
              expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
              value: redisSnapshot.data,
              updatedAt: redisSnapshot.updatedAt,
              promise: sharedProjectionPromise,
            });

            return res.status(200).json(
              markBillingSnapshotAsStale(redisSnapshot.data, "stale_revalidate")
            );
          }

          // 3. Prewarm LKV check (instant, memory-only)
          const lkvSub = prewarmState.lastKnownValidSubscription.get(businessId);
          const lkvBill = prewarmState.lastKnownValidBilling.get(businessId);
          if (lkvSub && lkvBill) {
            // Kick off background computation in background
            const computeProjection = runProjectionComputeTask({
              cacheKey,
              label: "billing_projection",
              businessId,
              computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
              task: () =>
                BillingController.buildBillingResponse(
                  businessId,
                  req,
                  { lightweight }
                ) as Promise<Record<string, unknown>>,
            });
            const sharedProjectionPromise = computeProjection
              .then((value) => {
                const updatedAt = Date.now();
                billingProjectionCache.set(cacheKey, {
                  value,
                  updatedAt,
                  expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                });
                void writeRedisBillingProjectionSnapshot(cacheKey, value);
                return value;
              })
              .catch((error) => {
                billingProjectionCache.delete(cacheKey);
                throw error;
              });
            billingProjectionCache.set(cacheKey, {
              expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
              value: undefined,
              updatedAt: Date.now(),
              promise: sharedProjectionPromise,
            });

            const prewarmFallback = {
              success: true,
              subscription: lkvSub,
              billing: lkvBill,
              usage: EMPTY_USAGE_SUMMARY,
              currency: lkvSub.currency || resolveBillingCurrency(req),
              invoices: [],
              meta: {
                degraded: true,
                reason: "lightweight_prewarm_lkv",
              },
            };
            return res.status(200).json(prewarmFallback);
          }

          // 4. Memory/Redis/LKV Cache Miss: serve default degraded immediately without blocking DB/Stripe calls!
          // Kick off the background hydration to populate cache for subsequent requests
          const computeProjection = runProjectionComputeTask({
            cacheKey,
            label: "billing_projection",
            businessId,
            computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
            task: () =>
              BillingController.buildBillingResponse(
                businessId,
                req,
                { lightweight }
              ) as Promise<Record<string, unknown>>,
          });
          const sharedProjectionPromise = computeProjection
            .then((value) => {
              const updatedAt = Date.now();
              billingProjectionCache.set(cacheKey, {
                value,
                updatedAt,
                expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
              });
              void writeRedisBillingProjectionSnapshot(cacheKey, value);
              return value;
            })
            .catch((error) => {
              billingProjectionCache.delete(cacheKey);
              throw error;
            });
          billingProjectionCache.set(cacheKey, {
            expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
            value: undefined,
            updatedAt: Date.now(),
            promise: sharedProjectionPromise,
          });

          // Serve degraded response instantly
          const defaultResponse = {
            success: true,
            subscription: null,
            billing: EMPTY_BILLING_CONTEXT,
            usage: EMPTY_USAGE_SUMMARY,
            currency: resolveBillingCurrency(req),
            invoices: [],
            meta: {
              degraded: true,
              reason: "lightweight_degraded_sync",
            },
          };
          return res.status(200).json(defaultResponse);
        } else {
          return res.status(200).json({
            success: true,
            subscription: null,
            billing: EMPTY_BILLING_CONTEXT,
            usage: EMPTY_USAGE_SUMMARY,
            currency: resolveBillingCurrency(req),
            invoices: [],
            meta: {
              degraded: false,
              reason: null,
            },
          });
        }
      }

      const waitBudgetMs = resolveBillingProjectionWaitBudgetMs(res);
      let staleCacheValue: Record<string, unknown> | undefined;
      let staleCacheUpdatedAt = 0;
      let projectionPromise: Promise<Record<string, unknown>> | null = null;

      if (cacheKey) {
        const cached = billingProjectionCache.get(cacheKey);
        staleCacheValue = cached?.value;
        staleCacheUpdatedAt = Number(cached?.updatedAt || 0);

        if (cached?.value && (cached.expiresAt > Date.now() || lightweight)) {
          const isStale = cached.expiresAt <= Date.now();
          emitPerformanceMetric({
            name: "CACHE_HIT",
            businessId,
            route: "billing_projection",
            metadata: {
              cache: "memory_billing_projection",
              stale: isStale,
            },
          });
          emitProjectionTelemetry({
            name: "projection_cache_hit",
            value: 1,
            businessId,
            metadata: {
              cache: "memory_billing_projection",
              stale: isStale,
            },
          });
          console.info("BILLING_STAGE_OK", {
            stage: "billing_projection.ready",
            businessId,
            invoiceCount: Array.isArray(cached.value.invoices)
              ? cached.value.invoices.length
              : 0,
            hasSubscription: Boolean(cached.value.subscription),
            source: isStale ? "stale_cache_hit" : "cache_hit",
          });

          // Kick off background computation if stale and not already computing
          if (isStale && !cached.promise) {
            const computeProjection = runProjectionComputeTask({
              cacheKey,
              label: "billing_projection",
              businessId,
              computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
              task: () =>
                BillingController.buildBillingResponse(
                  businessId,
                  req,
                  { lightweight }
                ) as Promise<Record<string, unknown>>,
            });
            const sharedProjectionPromise = computeProjection
              .then((value) => {
                const updatedAt = Date.now();
                billingProjectionCache.set(cacheKey, {
                  value,
                  updatedAt,
                  expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                });
                void writeRedisBillingProjectionSnapshot(cacheKey, value);
                return value;
              })
              .catch((error) => {
                billingProjectionCache.delete(cacheKey);
                throw error;
              });
            billingProjectionCache.set(cacheKey, {
              expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
              value: cached.value,
              updatedAt: cached.updatedAt,
              promise: sharedProjectionPromise,
            });
          }

          return res.json(isStale ? markBillingSnapshotAsStale(cached.value, "stale_revalidate") : cached.value);
        }

        if (!staleCacheValue) {
          const redisSnapshot = await readRedisBillingProjectionSnapshot(cacheKey);
          if (redisSnapshot?.data) {
            staleCacheValue = redisSnapshot.data;
            staleCacheUpdatedAt = redisSnapshot.updatedAt;
            billingProjectionCache.set(cacheKey, {
              value: redisSnapshot.data,
              updatedAt: redisSnapshot.updatedAt,
              expiresAt: Date.now() + Math.floor(BILLING_PROJECTION_CACHE_TTL_MS / 2),
            });
            emitPerformanceMetric({
              name: "CACHE_HIT",
              businessId,
              route: "billing_projection",
              metadata: {
                cache: "redis_billing_projection",
              },
            });
            emitProjectionTelemetry({
              name: "projection_cache_hit",
              value: 1,
              businessId,
              metadata: {
                cache: "redis_billing_projection",
                stale: true,
              },
            });

            if (lightweight) {
              console.info("BILLING_STAGE_OK", {
                stage: "billing_projection.ready",
                businessId,
                source: "redis_stale_cache_hit",
              });

              // Trigger background compute task if not already computing
              const activeCached = billingProjectionCache.get(cacheKey);
              if (!activeCached?.promise) {
                const computeProjection = runProjectionComputeTask({
                  cacheKey,
                  label: "billing_projection",
                  businessId,
                  computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
                  task: () =>
                    BillingController.buildBillingResponse(
                      businessId,
                      req,
                      { lightweight }
                    ) as Promise<Record<string, unknown>>,
                });
                const sharedProjectionPromise = computeProjection
                  .then((value) => {
                    const updatedAt = Date.now();
                    billingProjectionCache.set(cacheKey, {
                      value,
                      updatedAt,
                      expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
                    });
                    void writeRedisBillingProjectionSnapshot(cacheKey, value);
                    return value;
                  })
                  .catch((error) => {
                    billingProjectionCache.delete(cacheKey);
                    throw error;
                  });
                billingProjectionCache.set(cacheKey, {
                  expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
                  value: redisSnapshot.data,
                  updatedAt: redisSnapshot.updatedAt,
                  promise: sharedProjectionPromise,
                });
              }

              return res.json(markBillingSnapshotAsStale(redisSnapshot.data, "stale_revalidate"));
            }
          }
        }

        const activeCached = billingProjectionCache.get(cacheKey);
        if (activeCached?.promise) {
          projectionPromise = activeCached.promise;
          emitProjectionTelemetry({
            name: "projection_deduped",
            value: 1,
            businessId,
            metadata: {
              cache: "memory_billing_projection",
            },
          });
        } else {
          emitPerformanceMetric({
            name: "CACHE_MISS",
            businessId,
            route: "billing_projection",
            metadata: {
              cache: "memory_billing_projection",
            },
          });

          const computeProjection = runProjectionComputeTask({
            cacheKey,
            label: "billing_projection",
            businessId,
            computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
            task: () =>
              BillingController.buildBillingResponse(
                businessId,
                req,
                { lightweight }
              ) as Promise<Record<string, unknown>>,
          });
          const sharedProjectionPromise = computeProjection
            .then((value) => {
              const updatedAt = Date.now();
              billingProjectionCache.set(cacheKey, {
                value,
                updatedAt,
                expiresAt: updatedAt + BILLING_PROJECTION_CACHE_TTL_MS,
              });
              void writeRedisBillingProjectionSnapshot(cacheKey, value);
              return value;
            })
            .catch((error) => {
              billingProjectionCache.delete(cacheKey);
              throw error;
            });

          billingProjectionCache.set(cacheKey, {
            expiresAt: Date.now() + BILLING_PROJECTION_CACHE_TTL_MS,
            value: staleCacheValue,
            updatedAt: staleCacheUpdatedAt || Date.now(),
            promise: sharedProjectionPromise,
          });
          projectionPromise = sharedProjectionPromise;
        }

        if (lightweight && staleCacheValue) {
          return res.status(200).json(
            markBillingSnapshotAsStale(staleCacheValue, "stale_revalidate")
          );
        }

        const staleAgeMs =
          staleCacheUpdatedAt > 0 ? Date.now() - staleCacheUpdatedAt : Number.POSITIVE_INFINITY;
        if (
          staleCacheValue &&
          staleAgeMs <= BILLING_PROJECTION_STALE_MAX_AGE_MS &&
          waitBudgetMs < 1_400
        ) {
          emitPerformanceMetric({
            name: "TIMEOUT_PREVENTED",
            value: waitBudgetMs,
            businessId,
            route: "billing_projection",
            metadata: {
              reason: "stale_snapshot_served",
              staleAgeMs,
            },
          });
          emitProjectionTelemetry({
            name: "projection_cache_hit",
            value: 1,
            businessId,
            metadata: {
              cache: "stale_billing_projection",
              stale: true,
              staleAgeMs,
            },
          });
          return res.status(200).json(
            markBillingSnapshotAsStale(staleCacheValue, "stale_revalidate")
          );
        }
      }

      if (lightweight) {
        if (cacheKey) {
          const lkvSub = prewarmState.lastKnownValidSubscription.get(businessId);
          const lkvBill = prewarmState.lastKnownValidBilling.get(businessId);
          if (lkvSub && lkvBill) {
            const prewarmFallback = {
              success: true,
              subscription: lkvSub,
              billing: lkvBill,
              usage: EMPTY_USAGE_SUMMARY,
              currency: lkvSub.currency || resolveBillingCurrency(req),
              invoices: [],
              meta: {
                degraded: true,
                reason: "lightweight_prewarm_lkv",
              },
            };
            return res.status(200).json(prewarmFallback);
          }

          const degradedResponse = await BillingController.buildDegradedBillingResponse({
            req,
            fallbackValue: undefined,
            reason: "lightweight_degraded_sync",
          });
          return res.status(200).json(degradedResponse);
        } else {
          return res.status(200).json({
            success: true,
            subscription: null,
            billing: EMPTY_BILLING_CONTEXT,
            usage: EMPTY_USAGE_SUMMARY,
            currency: resolveBillingCurrency(req),
            invoices: [],
            meta: {
              degraded: false,
              reason: null,
            },
          });
        }
      }

      if (!projectionPromise) {
        projectionPromise = runProjectionComputeTask({
          cacheKey: cacheKey || `billing:anon:${String(req.requestId || "unknown")}`,
          label: "billing_projection",
          businessId,
          computeBudgetMs: BILLING_PROJECTION_COMPUTE_BUDGET_MS,
          task: () =>
            BillingController.buildBillingResponse(
              businessId,
              req,
              { lightweight }
            ) as Promise<Record<string, unknown>>,
        });
      }

      const projection = await waitForBillingProjection(
        projectionPromise,
        waitBudgetMs,
        getRequestAbortSignal({ req, res })
      );
      if (projection.cancelled) {
        emitProjectionTelemetry({
          name: "projection_cancelled",
          value: 1,
          businessId,
          metadata: {
            reason: "request_aborted",
          },
        });
        if (staleCacheValue && !isResponseCommitted(res)) {
          return res.status(200).json(
            markBillingSnapshotAsStale(staleCacheValue, "projection_request_cancelled")
          );
        }
        return;
      }

      if (!hasProjectionValue(projection)) {
        emitPerformanceMetric({
          name: "TIMEOUT_PREVENTED",
          value: waitBudgetMs,
          businessId,
          route: "billing_projection",
          metadata: {
            timeoutMs: waitBudgetMs,
            reason: "projection_wait_budget_exceeded",
          },
        });
        emitProjectionTelemetry({
          name: "projection_budget_exceeded",
          value: 1,
          businessId,
          metadata: {
            timeoutMs: waitBudgetMs,
            reason: "projection_wait_budget_exceeded",
          },
        });

        if (isResponseCommitted(res)) {
          return;
        }

        if (staleCacheValue) {
          return res.status(200).json(
            markBillingSnapshotAsStale(staleCacheValue, "projection_timeout_stale")
          );
        }

        const degradedResponse = await BillingController.buildDegradedBillingResponse({
          req,
          fallbackValue: staleCacheValue,
          reason: "projection_timeout",
        });
        return res.status(200).json(degradedResponse);
      }

      if (isRequestLifecycleClosed(req, res)) {
        return;
      }

      const value = projection.value;
      console.info("BILLING_STAGE_OK", {
        stage: "billing_projection.ready",
        businessId,
        invoiceCount: Array.isArray((value as any).invoices)
          ? (value as any).invoices.length
          : 0,
        hasSubscription: Boolean((value as any).subscription),
        source: "projection",
      });

      if (isResponseCommitted(res)) {
        return;
      }

      return res.json(value);
    } catch (error: any) {
      if (isRequestLifecycleClosed(req, res) || isResponseCommitted(res)) {
        return;
      }
      if (String(error?.message || "").includes("projection_budget_exceeded")) {
        emitProjectionTelemetry({
          name: "projection_budget_exceeded",
          value: 1,
          businessId: BillingController.getBusinessIdFromRequest(req),
          metadata: {
            reason: String(error?.message || "projection_budget_exceeded"),
          },
        });
      }

      if (error?.message === "Unauthorized") {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      console.error("BILLING_STAGE_FAIL", {
        stage: "billing.fetch",
        reason: String(error?.message || "billing_unavailable"),
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        success: false,
        message: "Billing projection is temporarily unavailable.",
      });
    }
  }

  static async checkout(req: Request, res: Response) {
    return BillingController.handleCheckout(req, res);
  }

  static async createCheckoutSession(req: Request, res: Response) {
    return BillingController.handleCheckout(req, res);
  }

  static async startCheckoutRedirect(req: Request, res: Response) {
    return BillingController.handleCheckout(req, res, {
      redirectOnSuccess: true,
    });
  }

  static async confirmCheckout(req: Request, res: Response) {
    const sessionId = String(req.query.session_id || req.body?.session_id || "").trim();
    const businessId = BillingController.getBusinessIdFromRequest(req);
    const respond = (payload: ReturnType<typeof BillingController.buildConfirmPayload>) => {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        success: true,
        data: payload,
      });
    };

    console.info("BILLING_START", {
      stage: "checkout_confirm",
      businessId,
      sessionId: sessionId || null,
    });

    if (!sessionId) {
      console.error("BILLING_STAGE_FAIL", {
        stage: "checkout_confirm.validate",
        businessId,
        sessionId: null,
        reason: "session_id_missing",
      });

      return respond(
        BillingController.buildConfirmPayload({
          state: "FAILED",
          lifecycleState: "FAILED_TERMINAL",
          sessionId: "",
          message: "session_id is required",
          shouldPoll: false,
          reason: "session_id_missing",
          code: "SESSION_ID_MISSING",
        })
      );
    }

    if (!businessId) {
      console.error("BILLING_STAGE_FAIL", {
        stage: "checkout_confirm.validate",
        businessId: null,
        sessionId,
        reason: "business_context_missing",
      });

      return respond(
        BillingController.buildConfirmPayload({
          state: "FAILED",
          lifecycleState: "FAILED_TERMINAL",
          sessionId,
          message: "Business context is required",
          shouldPoll: false,
          reason: "business_context_missing",
          code: "BUSINESS_CONTEXT_MISSING",
        })
      );
    }

    try {
      const paymentIntent = await BillingController.findCheckoutIntentForSession({
        businessId,
        sessionId,
      });

      if (!paymentIntent) {
        console.error("BILLING_STAGE_FAIL", {
          stage: "checkout_confirm.lookup",
          businessId,
          sessionId,
          reason: "checkout_session_not_found",
        });

        return respond(
          BillingController.buildConfirmPayload({
            state: "FAILED",
            lifecycleState: "FAILED_TERMINAL",
            sessionId,
            message: "Checkout session could not be matched with your workspace.",
            shouldPoll: false,
            reason: "checkout_session_not_found",
            code: "CHECKOUT_SESSION_NOT_FOUND",
          })
        );
      }

      const status = String(paymentIntent.status || "")
        .trim()
        .toUpperCase();
      const confirmState = getCheckoutConfirmState(paymentIntent.metadata);
      const alreadyProcessed =
        status === "SUCCEEDED" ||
        confirmState === "SUCCESS" ||
        confirmState === "ALREADY_PROCESSED";

      if (alreadyProcessed) {
        console.info("BILLING_STAGE_OK", {
          stage: "checkout_confirm.already_processed",
          businessId,
          sessionId,
          paymentIntentKey: paymentIntent.paymentIntentKey,
          status,
          confirmState,
        });

        return respond(
          BillingController.buildConfirmPayload({
            state: "ALREADY_PROCESSED",
            lifecycleState: "CONFIRMED",
            sessionId,
            message: "Payment confirmation is already complete.",
            shouldPoll: false,
            reason: "already_processed",
            code: "ALREADY_PROCESSED",
          })
        );
      }

      if (TERMINAL_PAYMENT_INTENT_STATUSES.has(status)) {
        console.error("BILLING_STAGE_FAIL", {
          stage: "checkout_confirm.terminal",
          businessId,
          sessionId,
          paymentIntentKey: paymentIntent.paymentIntentKey,
          status,
          reason: "payment_intent_terminal_non_success",
        });

        return respond(
          BillingController.buildConfirmPayload({
            state: "FAILED",
            lifecycleState: "FAILED_TERMINAL",
            sessionId,
            message: "Checkout confirmation cannot continue for this session.",
            shouldPoll: false,
            reason: "payment_intent_terminal_non_success",
            code: "PAYMENT_INTENT_TERMINAL",
          })
        );
      }

      const confirmInFlightKey = `${businessId}:${sessionId}`;
      const activeConfirmInFlight = checkoutConfirmInFlight.get(confirmInFlightKey);
      if (
        activeConfirmInFlight &&
        Date.now() - activeConfirmInFlight.startedAt <=
          CHECKOUT_CONFIRM_IN_FLIGHT_WINDOW_MS
      ) {
        console.info("BILLING_STAGE_OK", {
          stage: "checkout_confirm.pending",
          businessId,
          sessionId,
          paymentIntentKey: paymentIntent.paymentIntentKey,
          reason: "confirm_inflight_deduped",
        });

        return respond(
          BillingController.buildConfirmPayload({
            state: "PENDING",
            lifecycleState: "PROCESSING",
            sessionId,
            message: "Payment verification is already in progress.",
            shouldPoll: true,
            retryAfterMs: 900,
            reason: "confirm_inflight_deduped",
            code: "CONFIRM_INFLIGHT_DEDUPED",
          })
        );
      }

      if (isCheckoutConfirmStillProcessing(paymentIntent.metadata)) {
        console.info("BILLING_STAGE_OK", {
          stage: "checkout_confirm.pending",
          businessId,
          sessionId,
          paymentIntentKey: paymentIntent.paymentIntentKey,
          reason: "duplicate_confirm",
        });

        return respond(
          BillingController.buildConfirmPayload({
            state: "PENDING",
            lifecycleState: "PROCESSING",
            sessionId,
            message: "Payment is already being verified.",
            shouldPoll: true,
            retryAfterMs: 1_000,
            reason: "duplicate_confirm",
            code: "DUPLICATE_CONFIRM",
          })
        );
      }

      await BillingController.updateCheckoutConfirmMetadata({
        paymentIntent,
        sessionId,
        state: "PROCESSING",
        reason: "queued_for_async_confirmation",
      });

      if (status === "CREATED" || status === "REQUIRES_ACTION") {
        await paymentIntentService
          .transitionPaymentIntentStatus({
            paymentIntentId: paymentIntent.id,
            nextStatus: "PROCESSING",
            metadata: {
              manualConfirmSessionId: sessionId,
              manualConfirmQueuedAt: new Date().toISOString(),
            },
          })
          .catch(() => undefined);
      }

      const inFlightPromise = BillingController.finalizeCheckoutConfirmationAsync({
        businessId,
        sessionId,
        paymentIntent,
      })
        .catch((error) => {
          console.error("BILLING_STAGE_FAIL", {
            stage: "checkout_confirm.async",
            businessId,
            sessionId,
            paymentIntentKey: paymentIntent.paymentIntentKey,
            reason: String((error as Error)?.message || "confirm_async_failed"),
          });
        })
        .finally(() => {
          const active = checkoutConfirmInFlight.get(confirmInFlightKey);
          if (active?.promise === inFlightPromise) {
            checkoutConfirmInFlight.delete(confirmInFlightKey);
          }
        });
      checkoutConfirmInFlight.set(confirmInFlightKey, {
        startedAt: Date.now(),
        promise: inFlightPromise,
      });
      void inFlightPromise;

      console.info("BILLING_STAGE_OK", {
        stage: "checkout_confirm.pending",
        businessId,
        sessionId,
        paymentIntentKey: paymentIntent.paymentIntentKey,
        reason: "queued_for_async_confirmation",
      });

      return respond(
        BillingController.buildConfirmPayload({
          state: "PENDING",
          lifecycleState: "PROCESSING",
          sessionId,
          message: "Payment is being verified. We will activate your plan shortly.",
          shouldPoll: true,
          retryAfterMs: 1_200,
          reason: "queued_for_async_confirmation",
          code: "CONFIRM_QUEUED",
        })
      );
    } catch (error: any) {
      console.error("BILLING_STAGE_FAIL", {
        stage: "checkout_confirm.exception",
        businessId,
        sessionId,
        reason: String(error?.message || "confirm_failed"),
      });

      return respond(
        BillingController.buildConfirmPayload({
          state: "FAILED",
          lifecycleState: "PROCESSING",
          sessionId,
          message: "Checkout confirmation is temporarily unavailable. Please retry.",
          shouldPoll: true,
          retryAfterMs: 1_200,
          reason: String(error?.message || "confirm_failed"),
          code: "CONFIRM_FAILED",
        })
      );
    }
  }

  static async createPortal(req: Request, res: Response) {
    try {
      const { businessId, email } = await getUserContext(req);

      if (!businessId) {
        return res.status(403).json({
          success: false,
          message: "Business context is required",
        });
      }

      const subscription = await prisma.subscriptionLedger.findFirst({
        where: {
          businessId,
          provider: "STRIPE",
          status: {
            in: ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"],
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      if (!subscription) {
        return res.status(400).json({
          success: false,
          message: "No Stripe subscription found",
        });
      }

      assertStripeConfigReady();

      const subscriptionMetadata =
        subscription.metadata &&
        typeof subscription.metadata === "object" &&
        !Array.isArray(subscription.metadata)
          ? (subscription.metadata as Record<string, unknown>)
          : {};
      let stripeCustomerId =
        String(req.body?.customerId || subscriptionMetadata.stripeCustomerId || "").trim() ||
        null;

      if (!stripeCustomerId) {
        const recentPaymentIntent = await prisma.paymentIntentLedger.findFirst({
          where: {
            businessId,
            provider: "STRIPE",
            status: "SUCCEEDED",
          },
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            metadata: true,
          },
        });

        const metadata =
          recentPaymentIntent?.metadata &&
          typeof recentPaymentIntent.metadata === "object" &&
          !Array.isArray(recentPaymentIntent.metadata)
            ? (recentPaymentIntent.metadata as Record<string, unknown>)
            : {};
        const providerMetadata =
          metadata.providerMetadata &&
          typeof metadata.providerMetadata === "object" &&
          !Array.isArray(metadata.providerMetadata)
            ? (metadata.providerMetadata as Record<string, unknown>)
            : {};

        stripeCustomerId =
          String(
            metadata.stripeCustomerId ||
              providerMetadata.stripeCustomerId ||
              ""
          ).trim() || null;
      }

      if (!stripeCustomerId && subscription.providerSubscriptionId) {
        const stripeSubscription = await stripe.subscriptions
          .retrieve(subscription.providerSubscriptionId)
          .catch(() => null);

        stripeCustomerId =
          typeof stripeSubscription?.customer === "string"
            ? stripeSubscription.customer
            : null;
      }

      if (!stripeCustomerId) {
        stripeCustomerId = await BillingController.resolveStripeCustomerIdForPortal({
          businessId,
          email,
          subscriptionProviderId: subscription.providerSubscriptionId,
        });
      }

      if (!stripeCustomerId) {
        return res.status(409).json({
          success: false,
          message: "stripe_customer_missing_for_portal",
        });
      }

      await prisma.subscriptionLedger
        .update({
          where: {
            id: subscription.id,
          },
          data: {
            metadata: {
              ...subscriptionMetadata,
              stripeCustomerId,
              portalLastOpenedAt: new Date().toISOString(),
            } as any,
          },
        })
        .catch(() => undefined);

      const returnUrl =
        String(req.body?.returnUrl || "").trim() ||
        env.STRIPE_BILLING_PORTAL_RETURN_URL ||
        `${env.FRONTEND_URL}/billing`;
      const session = await stripe.billingPortal.sessions.create(
        {
          customer: stripeCustomerId,
          return_url: returnUrl,
        },
        {
          idempotencyKey: `portal:${businessId}:${stripeCustomerId}`,
        }
      );

      return res.json({
        success: true,
        url: session.url,
      });
    } catch (error: any) {
      console.error("BILLING_STAGE_FAIL", {
        stage: "portal.create",
        reason: String((error as Error)?.message || "portal_create_failed"),
      });

      if (error?.message?.includes("stripe_config_invalid")) {
        return res.status(503).json({
          success: false,
          code: "BILLING_PROVIDER_UNAVAILABLE",
          message: "Billing portal is temporarily unavailable. Please retry shortly.",
        });
      }

      return res.status(500).json({
        success: false,
        message: error?.message || "billing_portal_failed",
      });
    }
  }

  static async cancelSubscription(req: Request, res: Response) {
    try {
      const { businessId } = await getUserContext(req);

      if (!businessId) {
        return res.status(403).json({
          success: false,
          message: "Business context is required",
        });
      }

      const subscription = await prisma.subscriptionLedger.findFirst({
        where: {
          businessId,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      if (!subscription) {
        return res.status(400).json({
          success: false,
          message: "No active subscription found",
        });
      }

      await subscriptionEngineService.applyLifecycleAction({
        businessId,
        subscriptionKey: subscription.subscriptionKey,
        action: "cancel",
        metadata: {
          source: "billing_controller",
          requestedBy: "SELF",
        },
      });
      await invalidateBillingContextCache(businessId);

      return res.json({
        success: true,
        message: "Subscription cancellation submitted",
      });
    } catch (error) {
      console.error("BILLING_STAGE_FAIL", {
        stage: "subscription.cancel",
        reason: String((error as Error)?.message || "subscription_cancel_failed"),
      });

      return res.status(500).json({
        success: false,
        message: "Cancel failed",
      });
    }
  }

  static async upgradePlan(req: Request, res: Response) {
    return BillingController.handleCheckout(req, res);
  }
}
