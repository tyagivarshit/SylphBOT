import { Request, Response } from "express";
import prisma from "../config/prisma";
import { DashboardService } from "../services/dashboard.service";

/* ======================================
   HELPER: GET BUSINESS ID FROM USER
====================================== */
async function getBusinessId(req: Request): Promise<string | null> {

  const userId = req.user?.id;

  if (!userId) return null;

  const business = await prisma.business.findFirst({
    where: {
      ownerId: userId,
    },
    select: {
      id: true,
    },
  });

  return business?.id || null;
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

}