import { Request, Response } from "express";
import { DashboardService } from "../services/dashboard.service";

/* ======================================
TYPES
====================================== */

type AuthRequest = Request & {
  user?: {
    id: string;
    role: string;
    businessId: string | null;
  };
  featureDenied?: boolean;
  isLimited?: boolean; // 🔥 ADD THIS
};

/* ======================================
UTILS
====================================== */

function isValidString(val: any): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

function sendSuccess(
  res: Response,
  data: any,
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

function logError(req: AuthRequest, error: any) {
  console.error("❌ DASHBOARD ERROR", {
    userId: req.user?.id,
    businessId: req.user?.businessId,
    path: req.originalUrl,
    error: error?.message,
  });
}

/* ======================================
BASE HANDLER (SaaS UPGRADED)
====================================== */

async function baseHandler(
  req: AuthRequest,
  res: Response,
  handler: (businessId: string) => Promise<any>
) {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return sendError(
        res,
        403,
        "No business found. Please complete onboarding."
      );
    }

    /* ======================================
    🔥 SOFT LIMIT MODE (IMPORTANT FIX)
    ====================================== */

    if (req.featureDenied || req.isLimited) {
      return sendSuccess(res, null, {
        limited: true,
        upgradeRequired: true,
      });
    }

    const data = await handler(businessId);

    /* ======================================
    ✅ NORMAL FLOW
    ====================================== */

    return sendSuccess(res, data);

  } catch (error: any) {
    logError(req, error);
    return sendError(res, 500, error?.message || "Dashboard error");
  }
}

/* ======================================
CONTROLLER
====================================== */

export class DashboardController {

  /* ================================
     📊 STATS
  ================================ */
  static async getStats(req: AuthRequest, res: Response) {
    return baseHandler(req, res, async (businessId) => {
      return DashboardService.getStats(businessId);
    });
  }

  /* ================================
     👥 LEADS LIST
  ================================ */
  static async getLeadsList(req: AuthRequest, res: Response) {
    return baseHandler(req, res, async (businessId) => {

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
        search
      );

      return {
        leads: result.leads,
        pagination: result.pagination,
      };
    });
  }

  /* ================================
     🔍 LEAD DETAIL
  ================================ */
  static async getLeadDetail(req: AuthRequest, res: Response) {
    return baseHandler(req, res, async (businessId) => {

      const id = req.params.id;

      if (!isValidString(id)) {
        throw new Error("Valid Lead ID is required");
      }

      return DashboardService.getLeadDetail(businessId, id);
    });
  }

  /* ================================
     ✏️ UPDATE LEAD STAGE
  ================================ */
  static async updateLeadStage(req: AuthRequest, res: Response) {
    return baseHandler(req, res, async (businessId) => {

      const id = req.params.id;
      const { stage } = req.body;

      if (!isValidString(id) || !isValidString(stage)) {
        throw new Error("Valid Lead ID and stage are required");
      }

      return DashboardService.updateLeadStage(
        businessId,
        id,
        stage
      );
    });
  }

  /* ================================
     💬 ACTIVE CONVERSATIONS
  ================================ */
  static async getActiveConversations(req: AuthRequest, res: Response) {
    return baseHandler(req, res, async (businessId) => {
      return DashboardService.getActiveConversations(businessId);
    });
  }

}