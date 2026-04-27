import type { Request, Response } from "express";
import { getAutonomousDashboard } from "../services/autonomous/dashboard.service";
import { runAutonomousScheduler } from "../services/autonomous/scheduler.service";

type AutonomousRequest = Request & {
  user?: {
    businessId?: string | null;
  };
  tenant?: {
    businessId?: string | null;
  };
};

const getBusinessId = (req: AutonomousRequest) =>
  req.tenant?.businessId || req.user?.businessId || null;

export const getAutonomousDashboardController = async (
  req: AutonomousRequest,
  res: Response
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Business context is required",
      });
    }

    const data = await getAutonomousDashboard(businessId);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Autonomous dashboard error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const runAutonomousSchedulerController = async (
  req: AutonomousRequest,
  res: Response
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Business context is required",
      });
    }

    const autoDispatch = req.body?.autoDispatch !== false;
    const data = await runAutonomousScheduler({
      businessId,
      autoDispatch,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Autonomous scheduler error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
