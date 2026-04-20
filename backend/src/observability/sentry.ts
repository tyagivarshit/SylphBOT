import * as Sentry from "@sentry/node";
import { env } from "../config/env";
import { getRequestContext } from "./requestContext";

const SENTRY_DSN = process.env.SENTRY_DSN?.trim();
const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0);
let initialized = false;

const safeValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 497)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map(safeValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) =>
          !/password|token|secret|authorization|cookie|signature/i.test(key)
        )
        .slice(0, 50)
        .map(([key, entryValue]) => [key, safeValue(entryValue)])
    );
  }

  return value;
};

export const isSentryEnabled = () => Boolean(SENTRY_DSN);

export const initializeSentry = () => {
  if (initialized || !SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: true,
    environment: env.NODE_ENV,
    tracesSampleRate:
      Number.isFinite(tracesSampleRate) && tracesSampleRate > 0
        ? tracesSampleRate
        : 0,
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;

        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
          delete event.request.headers["stripe-signature"];
          delete event.request.headers["x-hub-signature"];
          delete event.request.headers["x-hub-signature-256"];
        }
      }

      return event;
    },
  });

  initialized = true;
};

type CaptureExceptionOptions = {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extras?: Record<string, unknown>;
};

export const captureExceptionWithContext = (
  error: unknown,
  options?: CaptureExceptionOptions
) => {
  if (!initialized || !SENTRY_DSN) {
    return;
  }

  const context = getRequestContext();
  const normalizedError =
    error instanceof Error ? error : new Error(String(error || "Unknown error"));

  Sentry.withScope((scope) => {
    if (context?.requestId) {
      scope.setTag("requestId", context.requestId);
    }

    if (context?.businessId) {
      scope.setTag("businessId", context.businessId);
    }

    if (context?.route) {
      scope.setTag("route", context.route);
    }

    if (context?.queueName) {
      scope.setTag("queueName", context.queueName);
    }

    if (context?.jobId) {
      scope.setTag("jobId", context.jobId);
    }

    if (context?.source) {
      scope.setTag("source", context.source);
    }

    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }

    scope.setContext(
      "requestContext",
      safeValue({
        requestId: context?.requestId,
        userId: context?.userId,
        businessId: context?.businessId,
        route: context?.route,
        method: context?.method,
        queueName: context?.queueName,
        jobId: context?.jobId,
        leadId: context?.leadId,
        source: context?.source,
      }) as Record<string, unknown>
    );

    if (options?.tags) {
      for (const [key, value] of Object.entries(options.tags)) {
        if (value !== undefined && value !== null) {
          scope.setTag(key, String(value));
        }
      }
    }

    if (options?.extras) {
      scope.setContext(
        "extra",
        safeValue(options.extras) as Record<string, unknown>
      );
    }

    Sentry.captureException(normalizedError);
  });
};
