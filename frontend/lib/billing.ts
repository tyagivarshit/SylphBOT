import { apiFetch } from "@/lib/apiClient";

type BillingRequestResult = {
  success?: boolean;
  url?: string;
  message?: string;
};

const CHECKOUT_REQUEST_TIMEOUT_MS = 32_000;
const CHECKOUT_CONFIRM_TIMEOUT_MS = 7_000;
const CHECKOUT_REDIRECT_PATH = "/api/billing/checkout/start";
const buildCheckoutAttemptToken = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const isTimeoutMessage = (message: string) =>
  message.trim().toLowerCase().includes("timeout");

const requestWithTimeout = async <T>(
  path: string,
  options: RequestInit,
  timeout = 10000
) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await apiFetch<T>(path, {
      ...options,
      signal: controller.signal,
      timeoutMs: timeout,
    });

    if (!response.success || response.data == null) {
      throw new Error(response.message || "Request failed");
    }

    return response.data;
  } catch (error: unknown) {
    throw new Error(getErrorMessage(error, "Network error"));
  } finally {
    clearTimeout(id);
  }
};

const requestWithRetry = async <T>(
  path: string,
  options: RequestInit,
  timeout = 10000,
  retries = 1
) => {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    try {
      return await requestWithTimeout<T>(path, options, timeout);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed");
      attempt += 1;

      if (attempt > retries) {
        break;
      }

      await sleep(300 * attempt);
    }
  }

  throw lastError || new Error("Request failed");
};

const resolveCheckoutUrl = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;

  if (typeof row.url === "string" && row.url.trim()) {
    return row.url.trim();
  }

  if (row.data && typeof row.data === "object") {
    const nested = row.data as Record<string, unknown>;
    if (typeof nested.url === "string" && nested.url.trim()) {
      return nested.url.trim();
    }
  }

  return null;
};

export type CheckoutConfirmResponse = {
  state: "SUCCESS" | "ALREADY_PROCESSED" | "PENDING" | "FAILED";
  sessionId: string;
  message: string;
  shouldPoll: boolean;
  retryAfterMs: number | null;
  reason: string | null;
  code: string | null;
};

const normalizeConfirmResponse = (
  payload: unknown,
  sessionId: string
): CheckoutConfirmResponse => {
  const row = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
  const state = String(row.state || "").trim().toUpperCase();
  const normalizedState =
    state === "SUCCESS" ||
    state === "ALREADY_PROCESSED" ||
    state === "PENDING" ||
    state === "FAILED"
      ? (state as CheckoutConfirmResponse["state"])
      : "FAILED";
  const retryAfterMs = Number(row.retryAfterMs);

  return {
    state: normalizedState,
    sessionId: String(row.sessionId || sessionId || "").trim(),
    message:
      String(row.message || "").trim() ||
      (normalizedState === "PENDING"
        ? "Payment is being verified."
        : normalizedState === "FAILED"
        ? "Checkout confirmation failed."
        : "Payment confirmed."),
    shouldPoll: Boolean(row.shouldPoll),
    retryAfterMs:
      Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? Math.floor(retryAfterMs)
        : null,
    reason: String(row.reason || "").trim() || null,
    code: String(row.code || "").trim() || null,
  };
};

export const createCheckoutSession = async (
  plan: string,
  billing: "monthly" | "yearly"
): Promise<BillingRequestResult> => {
  try {
    const data = await requestWithRetry<Record<string, unknown>>(
      "/api/billing/create-checkout-session",
      {
        method: "POST",
        body: JSON.stringify({
          plan,
          billing,
          checkoutAttempt: buildCheckoutAttemptToken(),
        }),
      },
      CHECKOUT_REQUEST_TIMEOUT_MS,
      0
    );
    const url = resolveCheckoutUrl(data);

    if (!url) {
      throw new Error("No checkout URL received");
    }

    return {
      success: true,
      url,
    };
  } catch (error: unknown) {
    console.error("Checkout API error:", error);
    const message = getErrorMessage(error, "Checkout failed");

    return {
      success: false,
      message: isTimeoutMessage(message)
        ? "Checkout is taking longer than expected. Please retry in a few seconds."
        : message,
    };
  }
};

export const buildCheckoutRedirectUrl = (
  plan: string,
  billing: "monthly" | "yearly"
) => {
  const params = new URLSearchParams({
    plan: String(plan || "").trim().toUpperCase(),
    billing,
    attempt: buildCheckoutAttemptToken(),
  });

  return `${CHECKOUT_REDIRECT_PATH}?${params.toString()}`;
};

export const redirectToCheckout = (
  plan: string,
  billing: "monthly" | "yearly"
) => {
  if (typeof window === "undefined") {
    return;
  }

  window.location.assign(buildCheckoutRedirectUrl(plan, billing));
};

export const createCheckout = async (
  plan: string,
  billing: "monthly" | "yearly"
) => createCheckoutSession(plan, billing);

export const upgradePlan = async (
  plan: string,
  billing: "monthly" | "yearly"
) => createCheckoutSession(plan, billing);

export const confirmCheckout = async (
  sessionId: string
): Promise<CheckoutConfirmResponse> => {
  try {
    const response = await apiFetch<Record<string, unknown>>(
      `/api/billing/checkout/confirm?session_id=${encodeURIComponent(
        sessionId
      )}`,
      {
        method: "GET",
        timeoutMs: CHECKOUT_CONFIRM_TIMEOUT_MS,
        cache: "no-store",
      }
    );

    if (!response.success || !response.data) {
      return normalizeConfirmResponse(
        {
          state: "FAILED",
          sessionId,
          shouldPoll: false,
          message:
            response.message || "Checkout confirmation is temporarily unavailable.",
          reason: "confirm_request_failed",
          code: response.code || "CONFIRM_REQUEST_FAILED",
        },
        sessionId
      );
    }

    return normalizeConfirmResponse(response.data, sessionId);
  } catch (error: unknown) {
    console.error("Checkout confirmation error:", error);

    return normalizeConfirmResponse(
      {
        state: "FAILED",
        sessionId,
        shouldPoll: false,
        message: getErrorMessage(error, "Checkout confirmation failed"),
        reason: "confirm_exception",
        code: "CONFIRM_EXCEPTION",
      },
      sessionId
    );
  }
};
