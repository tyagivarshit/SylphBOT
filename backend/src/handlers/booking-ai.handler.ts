import {
  handleAIBookingIntent,
  confirmAIBooking,
} from "../services/aiBookingEngine.service";
import {
  getConversationState,
  clearConversationState,
} from "../services/conversationState.service";
import {
  parseDateFromText,
  parseTimeFromText,
  findClosestSlot,
} from "../utils/booking-ai.utils";
import { fetchAvailableSlots } from "../services/booking.service";

/*
=====================================================
MAIN AI BOOKING HANDLER (ADVANCED - FIXED)
- safe parsing
- strong validation
- better slot selection
- production ready
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
    /* --------------------------------------------
    SAFETY CHECK
    -------------------------------------------- */
    if (!businessId || !leadId || !message) {
      throw new Error("Missing required fields in bookingAIHandler");
    }

    const cleanMessage = message.trim();

    /* --------------------------------------------
    GET STATE
    -------------------------------------------- */
    const state = await getConversationState(leadId);

    /* --------------------------------------------
    SAFE SLOT PARSER
    -------------------------------------------- */
    const safeParseSlots = (data: any): string[] => {
      try {
        return typeof data === "string" ? JSON.parse(data) : [];
      } catch (err) {
        console.error("SLOT PARSE ERROR:", err);
        return [];
      }
    };

    /* --------------------------------------------
    SLOT SELECTION FLOW
    -------------------------------------------- */
    if (state?.state === "BOOKING_SELECTION") {
      const slots = safeParseSlots(state && "data" in state ? state.data : null);

      // allow "1", "1.", "option 1", etc.
      const selectedIndex = parseInt(cleanMessage.replace(/\D/g, ""));

      if (
        !isNaN(selectedIndex) &&
        selectedIndex > 0 &&
        selectedIndex <= slots.length
      ) {
        const selectedSlot = new Date(slots[selectedIndex - 1]);

        const result = await confirmAIBooking(
          businessId,
          leadId,
          selectedSlot
        );

        await clearConversationState(leadId);

        return result.message;
      }

      return "Please reply with a valid slot number (e.g. 1, 2, 3).";
    }

    /* --------------------------------------------
    SMART DATE + TIME UNDERSTANDING
    -------------------------------------------- */
    const parsedDate = parseDateFromText(cleanMessage);
    const parsedTime = parseTimeFromText(cleanMessage);

    if (parsedDate && parsedTime) {
      const requestedDate = new Date(parsedDate);
      requestedDate.setHours(
        parsedTime.hours,
        parsedTime.minutes,
        0,
        0
      );

      const availableSlots = await fetchAvailableSlots(
        businessId,
        parsedDate
      );

      if (!availableSlots.length) {
        return "No slots available for that date.";
      }

      const closest = findClosestSlot(
        requestedDate,
        availableSlots
      );

      if (!closest) {
        return "No suitable slot found.";
      }

      const result = await confirmAIBooking(
        businessId,
        leadId,
        closest
      );

      return result.message;
    }

    /* --------------------------------------------
    INTENT DETECTION
    -------------------------------------------- */
    const lower = cleanMessage.toLowerCase();

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
      return "Please tell me your preferred new date and time.";
    }

    /* CANCEL */
    if (cancelKeywords.some((k) => lower.includes(k))) {
      return "Please confirm you want to cancel your booking.";
    }

    /* --------------------------------------------
    FALLBACK
    -------------------------------------------- */
    return null;

  } catch (error) {
    console.error("BOOKING AI HANDLER ERROR:", error);
    return "Something went wrong while booking.";
  }
};