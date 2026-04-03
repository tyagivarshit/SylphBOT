import { Request, Response } from "express";
import prisma from "../config/prisma";

/* ======================================================
TOGGLE HUMAN CONTROL (AI ↔ HUMAN SWITCH)
====================================================== */

export const toggleHumanControl = async (req: Request, res: Response) => {
  try {
    const { leadId, forceState } = req.body;
    const businessId = req.user?.businessId;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: "leadId required",
      });
    }

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    /* 🔥 FIND LEAD (SECURE BUSINESS CHECK) */
    const lead = await prisma.lead.findFirst({
      where: {
        id: String(leadId),
        businessId: String(businessId),
      },
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    /* ======================================================
    DETERMINE NEXT STATE
    ====================================================== */

    let nextState: boolean;

    if (typeof forceState === "boolean") {
      nextState = forceState; // direct control (UI toggle)
    } else {
      nextState = !lead.isHumanActive; // toggle fallback
    }

    /* ======================================================
    UPDATE LEAD
    ====================================================== */

    const updated = await prisma.lead.update({
      where: { id: String(leadId) },
      data: {
        isHumanActive: nextState,
      },
    });

    /* ======================================================
    SOCKET BROADCAST (REAL-TIME UI UPDATE)
    ====================================================== */

    req.app.get("io")?.to(leadId).emit("control_update", {
      leadId,
      isHumanActive: updated.isHumanActive,
    });

    /* ======================================================
    RESPONSE
    ====================================================== */

    return res.json({
      success: true,
      mode: updated.isHumanActive ? "HUMAN" : "AI",
      isHumanActive: updated.isHumanActive,
    });

  } catch (error) {
    console.error("Toggle human error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to toggle mode",
    });
  }
};

/* ======================================================
GET LEAD CONTROL STATE
====================================================== */

export const getLeadControlState = async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const businessId = req.user?.businessId;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: "leadId required",
      });
    }

    const lead = await prisma.lead.findFirst({
      where: {
        id: String(leadId),
        businessId: String(businessId),
      },
      select: {
        id: true,
        isHumanActive: true,
      },
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    return res.json({
      success: true,
      isHumanActive: lead.isHumanActive,
      mode: lead.isHumanActive ? "HUMAN" : "AI",
    });

  } catch (error) {
    console.error("Get control state error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch control state",
    });
  }
};