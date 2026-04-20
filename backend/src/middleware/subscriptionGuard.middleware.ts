import type { NextFunction, Request, RequestHandler, Response } from "express";
import { resolvePlanContext } from "../services/feature.service";
import logger from "../utils/logger";

type SubscriptionAccessResult = {
  allowed: boolean;
  businessId: string;
  state: "ACTIVE" | "LOCKED";
  planKey: string;
  lockReason: string | null;
};

export const getSubscriptionAccess = async (
  businessId: string
): Promise<SubscriptionAccessResult> => {
  const normalizedBusinessId = String(businessId || "").trim();

  if (!normalizedBusinessId) {
    return {
      allowed: false,
      businessId: "",
      state: "LOCKED",
      planKey: "LOCKED",
      lockReason: "subscription_locked",
    };
  }

  const context = await resolvePlanContext(normalizedBusinessId);

  return {
    allowed: context.state === "ACTIVE",
    businessId: normalizedBusinessId,
    state: context.state,
    planKey: context.planKey,
    lockReason: context.lockReason,
  };
};

export const logSubscriptionLockedAction = (
  input: {
    businessId?: string | null;
    requestId?: string;
    path?: string;
    method?: string;
    queueName?: string;
    jobId?: string | number | null;
    leadId?: string | null;
    feature?: string;
    action: string;
    lockReason?: string | null;
  },
  message: string
) => {
  logger.warn(
    {
      businessId: input.businessId || null,
      requestId: input.requestId,
      path: input.path,
      method: input.method,
      queueName: input.queueName,
      jobId: input.jobId || null,
      leadId: input.leadId || null,
      feature: input.feature,
      action: input.action,
      reason: "subscription_locked",
      lockReason: input.lockReason || "subscription_locked",
    },
    message
  );
};

export const subscriptionGuard: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Subscription required",
        requestId: req.requestId,
      });
    }

    const access = await getSubscriptionAccess(businessId);

    if (!access.allowed) {
      logSubscriptionLockedAction(
        {
          businessId,
          requestId: req.requestId,
          path: req.originalUrl,
          method: req.method,
          action: "http_request",
          lockReason: access.lockReason,
        },
        "Subscription locked request blocked"
      );

      return res.status(403).json({
        success: false,
        message: "Subscription required",
        requestId: req.requestId,
      });
    }

    return next();
  } catch {
    return res.status(500).json({
      success: false,
      message: "Server error",
      requestId: req.requestId,
    });
  }
};

