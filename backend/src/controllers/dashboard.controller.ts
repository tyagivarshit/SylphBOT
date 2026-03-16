import { Request, Response } from "express";
import prisma from "../config/prisma";
import { DashboardService } from "../services/dashboard.service";

/* ======================================
   HELPER: GET BUSINESS ID
====================================== */
async function getBusinessId(req: Request): Promise<string | null> {

  // 1️⃣ Try from token first
  let businessId = req.user?.businessId || null;

  // 2️⃣ Fallback: fetch from DB if token missing businessId
  if (!businessId && req.user?.id) {

    const business = await prisma.business.findFirst({
      where: { ownerId: req.user.id },
      select: { id: true }
    });

    businessId = business?.id || null;
  }

  console.log("Dashboard businessId:", businessId);

  return businessId;
}

export class DashboardController {

  /* ======================================
     DASHBOARD STATS
  ====================================== */
  static async getStats(req: Request, res: Response) {

    try {

      const businessId = await getBusinessId(req);

      if (!businessId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const stats = await DashboardService.getStats(businessId);

      return res.status(200).json({
        success: true,
        data: stats,
      });

    } catch (error) {

      console.error("Dashboard Stats Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard stats",
      });

    }
  }

  /* ======================================
     LEADS GROWTH
  ====================================== */
  static async getLeadsGrowth(req: Request, res: Response) {

    try {

      const businessId = await getBusinessId(req);

      if (!businessId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const growth = await DashboardService.getLeadsGrowth(businessId);

      return res.status(200).json({
        success: true,
        data: growth,
      });

    } catch (error) {

      console.error("Leads Growth Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch leads growth",
      });

    }
  }

  /* ======================================
     LEADS LIST
  ====================================== */
  static async getLeadsList(req: Request, res: Response) {

    try {

      const businessId = await getBusinessId(req);

      if (!businessId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const page = Math.max(Number(req.query.page) || 1, 1);

      const limit = Math.min(
        Math.max(Number(req.query.limit) || 10, 1),
        100
      );

      const stage = req.query.stage as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await DashboardService.getLeadsList(
        businessId,
        page,
        limit,
        stage,
        search
      );

      return res.status(200).json({
        success: true,
        data: result.leads,
        pagination: result.pagination,
      });

    } catch (error) {

      console.error("Dashboard Leads List Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch leads",
      });

    }
  }

  /* ======================================
     LEAD DETAIL
  ====================================== */
  static async getLeadDetail(req: Request, res: Response) {

    try {

      const businessId = await getBusinessId(req);

      if (!businessId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const id = req.params.id as string;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Lead ID is required",
        });
      }

      const lead = await DashboardService.getLeadDetail(
        businessId,
        id
      );

      return res.status(200).json({
        success: true,
        data: lead,
      });

    } catch (error: any) {

      console.error("Dashboard Lead Detail Error:", error);

      if (error?.message === "Lead not found") {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to fetch lead detail",
      });

    }
  }

  /* ======================================
     UPDATE LEAD STAGE
  ====================================== */
  static async updateLeadStage(req: Request, res: Response) {

    try {

      const businessId = await getBusinessId(req);

      if (!businessId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const id = req.params.id as string;
      const { stage } = req.body;

      if (!id || !stage) {
        return res.status(400).json({
          success: false,
          message: "Lead ID and stage are required",
        });
      }

      const lead = await DashboardService.updateLeadStage(
        businessId,
        id,
        stage
      );

      return res.status(200).json({
        success: true,
        data: lead,
      });

    } catch (error) {

      console.error("Lead Stage Update Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update lead stage",
      });

    }
  }

  /* ======================================
     ACTIVE CONVERSATIONS
  ====================================== */
  static async getActiveConversations(req: Request, res: Response) {

    try {

      const businessId = await getBusinessId(req);

      if (!businessId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const data =
        await DashboardService.getActiveConversations(businessId);

      return res.status(200).json({
        success: true,
        data
      });

    } catch (error) {

      console.error("Active Conversations Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch active conversations",
      });

    }

  }

}