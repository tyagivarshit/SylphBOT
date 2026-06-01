import { apiFetch } from "@/lib/apiClient";

const CHECKOUT_CONFIRM_TIMEOUT_MS = 7_000;
const CHECKOUT_REDIRECT_PATH = "/api/billing/checkout/instant";
const buildCheckoutAttemptToken = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const TERMINAL_CONFIRM_FAILURE_CODES = new Set([
  "SESSION_ID_MISSING",
  "BUSINESS_CONTEXT_MISSING",
  "CHECKOUT_SESSION_NOT_FOUND",
  "PAYMENT_INTENT_TERMINAL",
]);

export type CheckoutConfirmLifecycleState =
  | "PENDING"
  | "PROCESSING"
  | "CONFIRMED"
  | "FAILED_TERMINAL";

export type CheckoutConfirmResponse = {
  state: "SUCCESS" | "ALREADY_PROCESSED" | "PENDING" | "FAILED";
  lifecycleState: CheckoutConfirmLifecycleState;
  terminal: boolean;
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
  const lifecycleStateRaw = String(row.lifecycleState || "")
    .trim()
    .toUpperCase();
  const shouldPoll = Boolean(row.shouldPoll);
  const code = String(row.code || "").trim() || null;
  const mappedLifecycleState: CheckoutConfirmLifecycleState =
    lifecycleStateRaw === "PENDING" ||
    lifecycleStateRaw === "PROCESSING" ||
    lifecycleStateRaw === "CONFIRMED" ||
    lifecycleStateRaw === "FAILED_TERMINAL"
      ? (lifecycleStateRaw as CheckoutConfirmLifecycleState)
      : normalizedState === "SUCCESS" || normalizedState === "ALREADY_PROCESSED"
      ? "CONFIRMED"
      : normalizedState === "FAILED" && !shouldPoll
      ? "FAILED_TERMINAL"
      : normalizedState === "PENDING"
      ? "PROCESSING"
      : "PROCESSING";
  const retryAfterMs = Number(row.retryAfterMs);

  return {
    state: normalizedState,
    lifecycleState: mappedLifecycleState,
    terminal:
      mappedLifecycleState === "FAILED_TERMINAL" ||
      (normalizedState === "FAILED" &&
        !shouldPoll &&
        TERMINAL_CONFIRM_FAILURE_CODES.has(String(code || "").trim().toUpperCase())),
    sessionId: String(row.sessionId || sessionId || "").trim(),
    message:
      String(row.message || "").trim() ||
      (mappedLifecycleState === "PROCESSING"
        ? "Payment is being verified and your subscription is activating."
        : mappedLifecycleState === "FAILED_TERMINAL"
        ? "Checkout confirmation failed."
        : "Payment confirmed."),
    shouldPoll,
    retryAfterMs:
      Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? Math.floor(retryAfterMs)
        : null,
    reason: String(row.reason || "").trim() || null,
    code,
  };
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

export const confirmCheckout = async (
  sessionId: string,
  options?: {
    signal?: AbortSignal;
  }
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
        signal: options?.signal,
      }
    );

    if (!response.success || !response.data) {
      const code = String(response.code || "").trim().toUpperCase();
      const shouldPoll = !TERMINAL_CONFIRM_FAILURE_CODES.has(code);
      return normalizeConfirmResponse(
        {
          state: "FAILED",
          sessionId,
          shouldPoll,
          message:
            response.message || "Checkout confirmation is temporarily unavailable.",
          reason: "confirm_request_failed",
          code: code || "CONFIRM_REQUEST_FAILED",
        },
        sessionId
      );
    }

    return normalizeConfirmResponse(response.data, sessionId);
  } catch (error: unknown) {
    console.error("Checkout confirmation error:", error);
    const fallbackMessage = getErrorMessage(error, "Checkout confirmation failed");
    const isTimeout = /timeout/i.test(fallbackMessage);

    return normalizeConfirmResponse(
      {
        state: "FAILED",
        sessionId,
        shouldPoll: true,
        message: fallbackMessage,
        reason: isTimeout ? "confirm_timeout" : "confirm_exception",
        code: isTimeout ? "CONFIRM_TIMEOUT" : "CONFIRM_EXCEPTION",
      },
      sessionId
    );
  }
};
