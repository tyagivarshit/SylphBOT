import { Request, Response } from "express";
import * as service from "../services/analytics.service"
import { getAnalyticsDashboard } from "../services/analyticsDashboard.service";
import prisma from "../config/prisma";
import { recordConversionEvent } from "../services/salesAgent/conversionTracker.service";
import { scheduleFollowups } from "../queues/followup.queue";
import { getRequestBusinessId } from "../services/tenant.service";

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

export const getAnalyticsOverview = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const range = (req.query.range as string) || "7d";

    const businessId = await getBusinessId(userId, getRequestBusinessId(req));

    const data = await service.getOverview(businessId, range);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Overview Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getAnalyticsCharts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const range = (req.query.range as string) || "7d";

    const businessId = await getBusinessId(userId, getRequestBusinessId(req));

    const data = await service.getCharts(businessId, range);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Charts Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getConversionFunnel = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const businessId = await getBusinessId(userId, getRequestBusinessId(req));

    const data = await service.getFunnel(businessId);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Funnel Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getTopSources = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const businessId = await getBusinessId(userId, getRequestBusinessId(req));

    const data = await service.getSources(businessId);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Sources Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getDeepAnalyticsDashboard = async (
  req: Request,
  res: Response
) => {
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

    const data = await getAnalyticsDashboard(businessId, range, planKey);

    res.json({
      success: true,
      data,
      limited: data.meta.upgradeRequired,
      upgradeRequired: data.meta.upgradeRequired,
    });
  } catch (error) {
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

    const dashboard = await getAnalyticsDashboard(businessId, range, planKey);

    res.json({
      success: true,
      data: dashboard.revenueEngine,
      meta: dashboard.meta,
    });
  } catch (error) {
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
