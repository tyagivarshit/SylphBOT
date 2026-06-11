import { Request, Response } from "express";
import * as service from "../services/analytics.service"
import {
  buildAnalyticsDashboardFallback,
  getAnalyticsDashboard,
} from "../services/analyticsDashboard.service";
import prisma from "../config/prisma";
import { recordConversionEvent } from "../services/salesAgent/conversionTracker.service";
import { scheduleFollowups } from "../queues/followup.queue";
import { getRequestBusinessId } from "../services/tenant.service";
import {
  getRequestAbortSignal,
  getRequestRemainingMs,
  isRequestLifecycleAborted,
  throwIfRequestLifecycleAborted,
} from "../utils/requestLifecycle";
import {
  getAnalyticsDashboardLifecycleElapsedMs,
  isAnalyticsDashboardRequest,
  logAnalyticsDashboardLifecycle,
} from "../utils/analyticsDashboardLifecycleTrace";

const getBusinessId = async (
  userId: string,
  requestBusinessId?: string | null
) => {
  if (requestBusinessId) {
    return requestBusinessId;
  }

  const business = await prisma.business.findFirst({
    where: { ownerId: userId }
  });

  if (!business) throw new Error("Business not found");

  return business.id;
};

const isResponseCommitted = (res: Response) => res.headersSent || res.writableEnded;

const withLifecycleBudget = async <T>(input: {
  req: Request;
  res: Response;
  label: string;
  fallback: T;
  task: () => Promise<T>;
}) => {
  throwIfRequestLifecycleAborted({
    req: input.req,
    res: input.res,
    stage: `${input.label}.start`,
  });

  const remainingMs = getRequestRemainingMs(
    {
      req: input.req,
      res: input.res,
    },
    1200
  );
  const timeoutMs = Math.max(120, Math.min(2500, remainingMs - 150));
  const taskOutcome = input
    .task()
    .then(
      (value) =>
        ({
          timedOut: false,
          value,
          error: null as Error | null,
        }) as const
    )
    .catch((error) => ({
      timedOut: false,
      value: input.fallback,
      error: error as Error,
    }));
  const timeoutOutcome = new Promise<{
    timedOut: true;
    value: T;
    error: null;
  }>((resolve) => {
    setTimeout(() => {
      resolve({
        timedOut: true,
        value: input.fallback,
        error: null,
      });
    }, timeoutMs);
  });

  const outcome = await Promise.race([taskOutcome, timeoutOutcome]);
  if (outcome.timedOut) {
    console.warn("REQUEST_DEGRADED", {
      requestId: input.req.requestId || null,
      route: input.req.originalUrl,
      method: input.req.method,
      reason: `${input.label}_projection_budget_exceeded`,
      timeoutMs,
    });
    return {
      value: input.fallback,
      degraded: true,
      reason: "projection_timeout",
    } as const;
  }

  if (!outcome.error) {
    throwIfRequestLifecycleAborted({
      req: input.req,
      res: input.res,
      stage: `${input.label}.completed`,
    });
    return {
      value: outcome.value,
      degraded: false,
      reason: null as string | null,
    } as const;
  }

  throw outcome.error;
};

export const getAnalyticsOverview = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const range = (req.query.range as string) || "7d";

    const businessId = await getBusinessId(userId, getRequestBusinessId(req));

    const projection = await withLifecycleBudget({
      req,
      res,
      label: "analytics_overview",
      fallback: {
        totalLeads: 0,
        messages: 0,
        aiReplies: 0,
        bookings: 0,
      },
      task: () => service.getOverview(businessId, range, req),
    });
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }

    res.json({ success: true, data: projection.value, meta: { degraded: projection.degraded, reason: projection.reason } });
  } catch (error) {
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }
    console.error("Overview Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getAnalyticsCharts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const range = (req.query.range as string) || "7d";

    const businessId = await getBusinessId(userId, getRequestBusinessId(req));

    const projection = await withLifecycleBudget({
      req,
      res,
      label: "analytics_charts",
      fallback: [] as Array<{ date: string; leads: number }>,
      task: () => service.getCharts(businessId, range, req),
    });
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }

    res.json({ success: true, data: projection.value, meta: { degraded: projection.degraded, reason: projection.reason } });
  } catch (error) {
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }
    console.error("Charts Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getConversionFunnel = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const businessId = await getBusinessId(userId, getRequestBusinessId(req));

    const projection = await withLifecycleBudget({
      req,
      res,
      label: "analytics_funnel",
      fallback: {} as Record<string, unknown>,
      task: () => service.getFunnel(businessId, req),
    });
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }

    res.json({ success: true, data: projection.value, meta: { degraded: projection.degraded, reason: projection.reason } });
  } catch (error) {
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }
    console.error("Funnel Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getTopSources = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const businessId = await getBusinessId(userId, getRequestBusinessId(req));

    const projection = await withLifecycleBudget({
      req,
      res,
      label: "analytics_sources",
      fallback: [] as Array<{ name: string; value: number }>,
      task: () => service.getSources(businessId, req),
    });
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }

    res.json({ success: true, data: projection.value, meta: { degraded: projection.degraded, reason: projection.reason } });
  } catch (error) {
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }
    console.error("Sources Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getDeepAnalyticsDashboard = async (
  req: Request,
  res: Response
) => {
  const isAnalyticsDashboard = isAnalyticsDashboardRequest(req);
  if (isAnalyticsDashboard) {
    logAnalyticsDashboardLifecycle("Controller entered", {
      requestId: req.requestId || null,
      elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
      route: req.originalUrl,
      method: req.method,
    });
  }
  try {
    const businessId = (req as any).user?.businessId as string | null;
    const range = (req.query.range as string) || "30d";
    const planKey =
      ((req as any).billing?.planKey as
        | "FREE_LOCKED"
        | "BASIC"
        | "PRO"
        | "ELITE"
        | undefined) || "FREE_LOCKED";

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Business not found",
      });
    }

    const projection = await withLifecycleBudget({
      req,
      res,
      label: "analytics_dashboard",
      fallback: buildAnalyticsDashboardFallback(range, planKey),
      task: async () => {
        if (isAnalyticsDashboard) {
          logAnalyticsDashboardLifecycle("getAnalyticsDashboard called", {
            requestId: req.requestId || null,
            elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
            businessId,
            range,
            planKey,
          });
        }
        const dashboard = await getAnalyticsDashboard(businessId, range, planKey, {
          requestSignal: getRequestAbortSignal({ req, res }),
        });
        if (isAnalyticsDashboard) {
          logAnalyticsDashboardLifecycle("getAnalyticsDashboard returned", {
            requestId: req.requestId || null,
            elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
            businessId,
            range,
            planKey,
          });
        }
        return dashboard;
      },
    });
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }

    if (isAnalyticsDashboard) {
      logAnalyticsDashboardLifecycle("controller res.json about to invoke", {
        requestId: req.requestId || null,
        elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
        degraded: projection.degraded,
        reason: projection.reason,
      });
    }
    return res.json({
      success: true,
      data: projection.value,
      limited: projection.value.meta.upgradeRequired,
      upgradeRequired: projection.value.meta.upgradeRequired,
      meta: {
        degraded: projection.degraded,
        reason: projection.reason,
      },
    });
  } catch (error) {
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }
    console.error("Deep Analytics Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getRevenueAnalytics = async (req: Request, res: Response) => {
  try {
    const businessId = (req as any).user?.businessId as string | null;
    const range = (req.query.range as string) || "30d";
    const planKey =
      ((req as any).billing?.planKey as
        | "FREE_LOCKED"
        | "BASIC"
        | "PRO"
        | "ELITE"
        | undefined) || "FREE_LOCKED";

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Business not found",
      });
    }

    const projection = await withLifecycleBudget({
      req,
      res,
      label: "analytics_revenue",
      fallback: buildAnalyticsDashboardFallback(range, planKey),
      task: () =>
        getAnalyticsDashboard(businessId, range, planKey, {
          requestSignal: getRequestAbortSignal({ req, res }),
        }),
    });
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }
    const dashboard = projection.value;

    res.json({
      success: true,
      data: dashboard.revenueEngine,
      meta: dashboard.meta,
    });
  } catch (error) {
    if (isResponseCommitted(res) || isRequestLifecycleAborted({ req, res })) {
      return;
    }
    console.error("Revenue Analytics Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const recordConversionOutcome = async (req: Request, res: Response) => {
  try {
    const businessId = (req as any).user?.businessId as string | null;
    const {
      leadId,
      messageId,
      trackingId,
      variantId,
      outcome,
      value,
      idempotencyKey,
      metadata,
    } = req.body || {};

    if (!businessId || !leadId || !outcome) {
      return res.status(400).json({
        success: false,
        message: "businessId, leadId and outcome are required",
      });
    }

    const event = await recordConversionEvent({
      businessId,
      leadId: String(leadId),
      messageId: messageId ? String(messageId) : null,
      trackingId: trackingId ? String(trackingId) : null,
      variantId: variantId ? String(variantId) : null,
      outcome: String(outcome),
      value: typeof value === "number" ? value : null,
      source: "ANALYTICS_API",
      idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
      metadata:
        metadata && typeof metadata === "object"
          ? (metadata as Record<string, unknown>)
          : {},
    });

    if (outcome === "link_clicked") {
      void scheduleFollowups(String(leadId), {
        trigger: "clicked_not_booked",
      }).catch(() => {});
    }

    if (outcome === "opened") {
      void scheduleFollowups(String(leadId), {
        trigger: "opened_not_responded",
      }).catch(() => {});
    }

    res.json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("Conversion Outcome Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
