import { apiFetch } from "@/lib/apiClient";

const CHECKOUT_CONFIRM_TIMEOUT_MS = 7_000;
const CHECKOUT_REDIRECT_PATH = "/api/billing/checkout/start";
const buildCheckoutAttemptToken = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

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
