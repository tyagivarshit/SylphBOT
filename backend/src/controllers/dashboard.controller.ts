import { Request, Response } from "express";
import { DashboardService } from "../services/dashboard.service";
import { prewarmState } from "../services/prewarmState";
import {
  getRequestRemainingMs,
  isRequestLifecycleAborted,
  throwIfRequestLifecycleAborted,
  markRequestLifecycleAborted,
} from "../utils/requestLifecycle";

type AuthRequest = Request & {
  user?: {
    id: string;
    role: string;
    businessId: string | null;
  };
  featureDenied?: boolean;
  isLimited?: boolean;
};

type BaseHandlerOptions = {
  timeoutLabel: string;
  timeoutMs?: number;
  fallback: unknown;
  projectionLog?: string;
};

function isValidString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sendSuccess(
  res: Response,
  data: unknown,
  extra: {
    limited?: boolean;
    upgradeRequired?: boolean;
  } = {}
) {
  return res.status(200).json({
    success: true,
    data,
    limited: extra.limited ?? false,
    upgradeRequired: extra.upgradeRequired ?? false,
  });
}

function sendError(res: Response, status: number, message: string) {
  return res.status(status).json({
    success: false,
    message,
  });
}

function logError(req: AuthRequest, error: unknown) {
  const message = error instanceof Error ? error.message : "unknown_dashboard_error";
  console.error("DASHBOARD_ERROR", {
    userId: req.user?.id,
    businessId: req.user?.businessId,
    path: req.originalUrl,
    error: message,
  });
}

async function baseHandler(
  req: AuthRequest,
  res: Response,
  handler: (businessId: string, req: AuthRequest) => Promise<unknown>,
  options: BaseHandlerOptions
) {
  try {
    throwIfRequestLifecycleAborted({
      req,
      res,
      stage: `${options.timeoutLabel}.start`,
    });
    const businessId = req.user?.businessId;

    if (!businessId) {
      return sendError(res, 403, "No business found. Please complete onboarding.");
    }

    if (req.featureDenied || req.isLimited) {
      return sendSuccess(res, null, {
        limited: true,
        upgradeRequired: true,
      });
    }

    const fallbackValue = options.fallback;
    const baseTimeout = options.timeoutMs || 1800;
    const adjustedTimeoutMs = prewarmState.isCold
      ? Math.max(3500, baseTimeout + 1500)
      : baseTimeout;
    const remainingMs = getRequestRemainingMs({ req, res }, adjustedTimeoutMs);
    const timeoutMs = Math.max(
      120,
      Math.min(adjustedTimeoutMs, Math.max(120, remainingMs - 120))
    );
    const projectionTask = handler(businessId, req)
      .then(
        (value) =>
          ({
            timedOut: false,
            failed: false,
            value,
          }) as const
      )
      .catch(() => ({
        timedOut: false,
        failed: true,
        value: fallbackValue,
      }));
    const timeoutTask = new Promise<{
      timedOut: true;
      failed: false;
      value: unknown;
    }>((resolve) => {
      setTimeout(() => {
        resolve({
          timedOut: true,
          failed: false,
          value: fallbackValue,
        });
      }, timeoutMs);
    });
    const projection = await Promise.race([projectionTask, timeoutTask]);
    if (projection.timedOut) {
      markRequestLifecycleAborted({
        req,
        res,
        reason: "request_timeout",
      });
      console.warn("REQUEST_ABORTED", {
        requestId: req.requestId || null,
        route: req.originalUrl,
        method: req.method,
        reason: `${options.timeoutLabel}_budget_exceeded`,
        timeoutMs,
      });
    }

    if (options.projectionLog) {
      console.info(options.projectionLog, {
        businessId,
        timedOut: projection.timedOut,
        fallback: projection.timedOut || projection.failed,
      });
    }

    if (isRequestLifecycleAborted({ req, res }) || res.headersSent || res.writableEnded) {
      return;
    }

    return sendSuccess(res, projection.value);
  } catch (error) {
    if (isRequestLifecycleAborted({ req, res }) || res.headersSent || res.writableEnded) {
      return;
    }
    logError(req, error);
    return sendError(res, 500, error instanceof Error ? error.message : "Dashboard error");
  }
}

export class DashboardController {
  static async getStats(req: AuthRequest, res: Response) {
    return baseHandler(
      req,
      res,
      async (businessId, r) => DashboardService.getStats(businessId, r),
      {
        timeoutLabel: "dashboard_stats_projection",
        timeoutMs: 1800,
        fallback: {
          totalLeads: 0,
          leadsToday: 0,
          leadsThisMonth: 0,
          messagesToday: 0,
          qualifiedLeads: 0,
          aiCallsUsed: 0,
          aiCallsLimit: 0,
          aiCallsRemaining: 0,
          usagePercent: 0,
          nearLimit: false,
          warning: false,
          warningMessage: null,
          isUnlimited: false,
          plan: "LOCKED",
          planKey: "LOCKED",
          premiumLocked: true,
          chartData: [],
          messagesChart: [],
          recentActivity: [],
        },
        projectionLog: "DASHBOARD_PROJECTION_READY",
      }
    );
  }

  static async getLeadsList(req: AuthRequest, res: Response) {
    return baseHandler(
      req,
      res,
      async (businessId) => {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
        const stage = isValidString(req.query.stage)
          ? String(req.query.stage)
          : undefined;
        const search = isValidString(req.query.search)
          ? String(req.query.search)
          : undefined;

        const result = await DashboardService.getLeadsList(
          businessId,
          page,
          limit,
          stage,
          search,
          req
        );

        return {
          leads: result.leads,
          pagination: result.pagination,
        };
      },
      {
        timeoutLabel: "dashboard_leads_projection",
        timeoutMs: 1700,
        fallback: {
          leads: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0,
          },
        },
      }
    );
  }

  static async getLeadDetail(req: AuthRequest, res: Response) {
    return baseHandler(
      req,
      res,
      async (businessId) => {
        const id = req.params.id;
        if (!isValidString(id)) {
          throw new Error("Valid Lead ID is required");
        }

        return DashboardService.getLeadDetail(businessId, id, req);
      },
      {
        timeoutLabel: "dashboard_lead_detail_projection",
        timeoutMs: 1700,
        fallback: null,
      }
    );
  }

  static async updateLeadStage(req: AuthRequest, res: Response) {
    return baseHandler(
      req,
      res,
      async (businessId) => {
        const id = req.params.id;
        const { stage } = req.body;

        if (!isValidString(id) || !isValidString(stage)) {
          throw new Error("Valid Lead ID and stage are required");
        }

        return DashboardService.updateLeadStage(businessId, id, stage, req);
      },
      {
        timeoutLabel: "dashboard_lead_stage_projection",
        timeoutMs: 1700,
        fallback: null,
      }
    );
  }

  static async getActiveConversations(req: AuthRequest, res: Response) {
    return baseHandler(
      req,
      res,
      async (businessId) => DashboardService.getActiveConversations(businessId, req),
      {
        timeoutLabel: "dashboard_conversation_projection",
        timeoutMs: 1600,
        fallback: {
          active: 0,
          waitingReplies: 0,
          resolved: 0,
        },
      }
    );
  }
}
