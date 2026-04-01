import { isHumanActive } from "./humanTakeoverManager.service";
import { runAutomationEngine } from "./automationEngine.service";
import { handleAIBookingIntent } from "./aiBookingEngine.service";
import { routeAIMessage } from "./aiRouter.service";

import prisma from "../config/prisma";

/* 🔥 FIX */
import { hasFeature } from "../config/plan.config";

/* ================================================= */
export enum ExecutionType {
  HUMAN = "HUMAN",
  BOOKING = "BOOKING",
  AUTOMATION = "AUTOMATION",
  AI = "AI",
}

/* ================================================= */
export const handleIncomingMessage = async (data: any) => {

  const { businessId, leadId, message, plan } = data;

  try {

    const lower = message.toLowerCase();

    /* ================= HUMAN ================= */
    const human = await isHumanActive(leadId);
    if (human) {
      return null;
    }

    /* =================================================
    🔥 BOOKING (PRIORITY ENGINE - FIXED)
    ================================================= */

    const isBookingIntent =
      lower.includes("book") ||
      lower.includes("schedule") ||
      lower.includes("appointment");

    if (isBookingIntent) {

      /* ✅ FIX: proper feature check */
      if (!hasFeature(plan, "bookingEnabled")) {
        return "Booking not available in your plan.";
      }

      const booking = await handleAIBookingIntent(
        businessId,
        leadId,
        message
      );

      /* ✅ IMPORTANT: only return if handled */
      if (booking?.handled) {
        return booking.message;
      }
    }

    /* =================================================
    🤖 AUTOMATION (SAFE - NO CONFLICT)
    ================================================= */

    const automationReply = await runAutomationEngine({
      businessId,
      leadId,
      message,
    });

    if (automationReply) {
      return automationReply;
    }

    /* =================================================
    🧠 AI ROUTER (FINAL FALLBACK)
    ================================================= */

    return await routeAIMessage({
      businessId,
      leadId,
      message,
      plan,
    });

  } catch (error) {
    console.error("EXECUTION ROUTER ERROR:", error);
    return "Something went wrong.";
  }
};