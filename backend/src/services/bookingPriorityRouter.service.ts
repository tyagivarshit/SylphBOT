import { handleSlotSelection } from "./slotSectionHandler.service"; // 🔥 FIX NAME
import { handleAIBookingIntent } from "./aiBookingEngine.service";
import { fetchNext30DaysSlots } from "./fetchNext30DaysSlots.service";
import { confirmAIBooking } from "./aiBookingEngine.service";

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
       1. SLOT SELECTION (HIGHEST PRIORITY)
    ===================================================== */
    const selectionReply = await handleSlotSelection({
      businessId,
      leadId,
      message: clean,
    });

    if (selectionReply) {
      return selectionReply;
    }

    /* =====================================================
       2. NEXT AVAILABLE (30 DAYS)
    ===================================================== */
    if (
      clean.includes("next available") ||
      clean.includes("earliest") ||
      clean.includes("any slot")
    ) {
      const data = await fetchNext30DaysSlots(businessId);

      if (!data.length) {
        return "No slots available in next 30 days.";
      }

      const firstSlot = data?.[0]?.slots?.[0];

      if (!firstSlot) {
        return "No slots available.";
      }

      const date = firstSlot.toLocaleDateString();
      const time = firstSlot.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      return `Next available slot is ${date} at ${time}. Reply YES to confirm or NO to choose another time.`;
    }

    /* =====================================================
       3. CONFIRMATION FLOW (YES/NO)
    ===================================================== */
    if (clean === "yes") {
      const data = await fetchNext30DaysSlots(businessId);

      if (!data.length) {
        return "Sorry, slot is no longer available.";
      }

      const slot = data?.[0]?.slots?.[0];

      if (!slot) {
        return "No slot found.";
      }

      const result = await confirmAIBooking(
        businessId,
        leadId,
        slot
      );

      return result.message;
    }

    if (clean === "no") {
      return "Okay 👍 Please tell me your preferred date & time.";
    }

    /* =====================================================
       4. DIRECT BOOKING INTENT (AI)
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
    console.error("BOOKING PRIORITY ROUTER ERROR:", error);
    return "Something went wrong while processing booking.";
  }
};