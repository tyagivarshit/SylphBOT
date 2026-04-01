import { handleSlotSelection } from "./slotSectionHandler.service";
import { handleAIBookingIntent } from "./aiBookingEngine.service";
import { fetchNext30DaysSlots } from "./fetchNext30DaysSlots.service";
import { getConversationState } from "./conversationState.service";

import { hasFeature } from "../config/plan.config";

/*
=====================================================
BOOKING PRIORITY ROUTER (LEVEL 4 FINAL SAFE VERSION)
=====================================================
*/

export const bookingPriorityRouter = async ({
  businessId,
  leadId,
  message,
  plan,
}: {
  businessId: string;
  leadId: string;
  message: string;
  plan: any;
}): Promise<string | null> => {
  try {
    const clean = message.trim().toLowerCase();

    /* =====================================================
    🔥 PLAN CHECK (NON-BLOCKING)
    ===================================================== */
    if (!hasFeature(plan, "bookingEnabled")) {
      return null; // AI handle karega
    }

    /* =====================================================
    0️⃣ STATE CHECK
    ===================================================== */
    const state = await getConversationState(leadId);

    /* =====================================================
    🔁 RESCHEDULE FLOW (SMART FIX)
    ===================================================== */
    if (state?.state === "RESCHEDULE_FLOW") {
      const cleanMsg = clean;

      const isPositive =
        cleanMsg.includes("yes") ||
        cleanMsg.includes("ok") ||
        cleanMsg.includes("sure");

      const isBookingIntent =
        cleanMsg.includes("book") ||
        cleanMsg.includes("schedule") ||
        cleanMsg.includes("appointment");

      if (isPositive || isBookingIntent) {
        console.log("🔁 RESCHEDULE FLOW TRIGGERED");

        const booking = await handleAIBookingIntent(
          businessId,
          leadId,
          message
        );

        return booking?.handled ? booking.message : null;
      }
    }

    /* =====================================================
    📌 BOOKING STATES
    ===================================================== */

    if (state?.state === "BOOKING_SELECTION") {
      return await handleSlotSelection({
        businessId,
        leadId,
        message: clean,
      });
    }

    if (state?.state === "BOOKING_CONFIRMATION") {
      return null;
    }

    /* =====================================================
    1️⃣ DIRECT SLOT SELECTION
    ===================================================== */
    const isSlotSelection =
      /^\d+$/.test(clean) ||
      clean.includes("first") ||
      clean.includes("second") ||
      clean.includes("third") ||
      clean.includes("last");

    if (isSlotSelection) {
      return await handleSlotSelection({
        businessId,
        leadId,
        message: clean,
      });
    }

    /* =====================================================
    2️⃣ NEXT AVAILABLE
    ===================================================== */
    if (
      clean.includes("next available") ||
      clean.includes("earliest") ||
      clean.includes("any slot")
    ) {
      const data = await fetchNext30DaysSlots(businessId);

      if (!data.length) {
        return "No slots available in the next few days.";
      }

      const firstSlot = data?.[0]?.slots?.[0];

      if (!firstSlot) {
        return "No available slots found.";
      }

      const date = firstSlot.toLocaleDateString();
      const time = firstSlot.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      return `The next available slot is:

📅 ${date}  
⏰ ${time}

Reply "YES" to confirm  
or tell me another time 👍`;
    }

    /* =====================================================
    3️⃣ YES / NO SAFE HANDLING
    ===================================================== */
    if (clean === "yes" || clean === "confirm") {
      return null; // confirmation AI engine handle karega
    }

    if (clean === "no") {
      return "No problem 👍 Tell me your preferred date & time.";
    }

    /* =====================================================
    4️⃣ AI BOOKING INTENT (SAFE RETURN FIX)
    ===================================================== */
    const booking = await handleAIBookingIntent(
      businessId,
      leadId,
      clean
    );

    if (booking?.handled) {
      return booking.message;
    }

    /* =====================================================
    FALLBACK
    ===================================================== */
    return null;

  } catch (error) {
    console.error("BOOKING ROUTER ERROR:", error);
    return "Something went wrong while processing booking.";
  }
};