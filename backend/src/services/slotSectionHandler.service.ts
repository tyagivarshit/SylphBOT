import prisma from "../config/prisma";
import { confirmAIBooking } from "./aiBookingEngine.service";
import {
  getConversationState,
  clearConversationState,
} from "./conversationState.service";

export const handleSlotSelection = async ({
  leadId,
  businessId,
  message,
}: {
  leadId: string;
  businessId: string;
  message: string;
}) => {
  try {
    /* ---------------- GET STATE ---------------- */

    const state = await getConversationState(leadId);

    if (!state || state.state !== "BOOKING_SELECTION") {
      return null;
    }

    /* ---------------- PARSE SLOTS ---------------- */

    let slots: string[] = [];

    try {
      slots =
        typeof (state as any).data === "string"
          ? JSON.parse((state as any).data)
          : [];
    } catch {
      await clearConversationState(leadId); // 🔥 reset broken state
      return "Something went wrong. Please try again.";
    }

    if (!slots.length) {
      await clearConversationState(leadId); // 🔥 clean invalid state
      return "No slots available anymore.";
    }

    /* ---------------- EXTRACT NUMBER ---------------- */

    const index = parseInt(message.replace(/\D/g, ""));

    if (
      isNaN(index) ||
      index <= 0 ||
      index > slots.length
    ) {
      return `Please select a valid option (1-${slots.length}).`;
    }

    const selectedSlot = new Date(slots[index - 1]);

    /* ---------------- VALIDATE SLOT ---------------- */

    if (isNaN(selectedSlot.getTime())) {
      await clearConversationState(leadId);
      return "Invalid slot selected. Please try again.";
    }

    if (selectedSlot.getTime() <= Date.now()) {
      return "That slot is no longer available.";
    }

    /* ---------------- CONFIRM BOOKING ---------------- */

    const result = await confirmAIBooking(
      businessId,
      leadId,
      selectedSlot
    );

    await clearConversationState(leadId);

    if (!result.success) {
      return result.message || "Failed to confirm booking.";
    }

    return result.message;

  } catch (error) {
    console.error("SLOT SELECTION ERROR:", error);
    return "Failed to process your selection. Please try again.";
  }
};