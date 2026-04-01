import {
  handleAIBookingIntent,
} from "../services/aiBookingEngine.service";

import {
  getConversationState,
  clearConversationState,
} from "../services/conversationState.service";

import {
  parseDateFromText,
  parseTimeFromText,
} from "../utils/booking-ai.utils";

/*
=====================================================
MAIN AI BOOKING HANDLER (FIXED - SINGLE SOURCE LOGIC)
- no duplicate booking logic
- uses aiBookingEngine as single source
- safe + production ready
=====================================================
*/

export const bookingAIHandler = async ({
  businessId,
  leadId,
  message,
}: {
  businessId: string;
  leadId: string;
  message: string;
}) => {
  try {
    /* -------------------------------------------- */
    /* SAFETY CHECK */
    /* -------------------------------------------- */
    if (!businessId || !leadId || !message) {
      throw new Error("Missing required fields in bookingAIHandler");
    }

    const cleanMessage = message.trim();
    const lower = cleanMessage.toLowerCase();

    /* -------------------------------------------- */
    /* STATE */
    /* -------------------------------------------- */
    const state = await getConversationState(leadId);

    /* -------------------------------------------- */
    /* 🔥 ACTIVE BOOKING FLOW (MOST IMPORTANT)
    -------------------------------------------- */
    if (
      state?.state === "BOOKING_SELECTION" ||
      state?.state === "BOOKING_CONFIRMATION"
    ) {
      const result = await handleAIBookingIntent(
        businessId,
        leadId,
        cleanMessage
      );

      return result.message;
    }

    /* -------------------------------------------- */
    /* SMART DATE + TIME UNDERSTANDING
    -------------------------------------------- */
    const parsedDate = parseDateFromText(cleanMessage);
    const parsedTime = parseTimeFromText(cleanMessage);

    if (parsedDate && parsedTime) {
      const result = await handleAIBookingIntent(
        businessId,
        leadId,
        cleanMessage
      );

      return result.message;
    }

    /* -------------------------------------------- */
    /* INTENT DETECTION
    -------------------------------------------- */
    const bookingKeywords = [
      "book",
      "appointment",
      "schedule",
      "call",
      "meeting",
      "slot",
      "available",
      "free time",
    ];

    const rescheduleKeywords = [
      "reschedule",
      "change time",
      "move",
    ];

    const cancelKeywords = [
      "cancel",
      "delete booking",
    ];

    /* BOOKING */
    if (bookingKeywords.some((k) => lower.includes(k))) {
      const result = await handleAIBookingIntent(
        businessId,
        leadId,
        cleanMessage
      );

      return result.message;
    }

    /* RESCHEDULE */
    if (rescheduleKeywords.some((k) => lower.includes(k))) {
      await clearConversationState(leadId);

      return "Sure 👍 Tell me your preferred new date & time.";
    }

    /* CANCEL */
    if (cancelKeywords.some((k) => lower.includes(k))) {
      const result = await handleAIBookingIntent(
        businessId,
        leadId,
        cleanMessage
      );

      return result.message;
    }

    /* -------------------------------------------- */
    /* FALLBACK
    -------------------------------------------- */
    return null;

  } catch (error) {
    console.error("BOOKING AI HANDLER ERROR:", error);
    return "Something went wrong while booking.";
  }
};