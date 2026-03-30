import { handleSlotSelection } from "./slotSectionHandler.service";
import { handleAIBookingIntent } from "./aiBookingEngine.service";
import { fetchNext30DaysSlots } from "./fetchNext30DaysSlots.service";
import {
  getConversationState,
} from "./conversationState.service";

/*
=====================================================
BOOKING PRIORITY ROUTER (FINAL CLEAN VERSION)
=====================================================
*/

export const bookingPriorityRouter = async ({
  businessId,
  leadId,
  message,
}: {
  businessId: string;
  leadId: string;
  message: string;
}): Promise<string | null> => {
  try {
    const clean = message.trim().toLowerCase();

    /* =====================================================
    0️⃣ STATE CHECK (IMPORTANT)
    ===================================================== */
    const state = await getConversationState(leadId);

    // 👉 Agar booking flow me hai → AI ko bypass karo
    if (state?.state === "BOOKING_SELECTION") {
      return await handleSlotSelection({
        businessId,
        leadId,
        message: clean,
      });
    }

    if (state?.state === "BOOKING_CONFIRMATION") {
      // 👉 Confirmation AI Router handle karega
      return null;
    }

    /* =====================================================
    1️⃣ DIRECT SLOT SELECTION (SMART PARSE)
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
    2️⃣ NEXT AVAILABLE (SMART TRIGGER)
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
    3️⃣ STRICT YES/NO HANDLING (SAFE)
    ===================================================== */
    if (clean === "yes" || clean === "confirm") {
      // ❌ DO NOT auto-book here
      // ✅ let state / AI handle
      return null;
    }

    if (clean === "no") {
      return "No problem 👍 Tell me your preferred date & time.";
    }

    /* =====================================================
    4️⃣ AI BOOKING INTENT (SMART ENTRY)
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