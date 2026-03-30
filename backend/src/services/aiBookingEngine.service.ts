import prisma from "../config/prisma";
import {
  fetchAvailableSlots,
  createNewAppointment,
  getUpcomingAppointment,
  cancelAppointmentByLead,
  rescheduleByLead,
} from "./booking.service";

import {
  setConversationState,
  clearConversationState,
  getConversationState,
} from "./conversationState.service";

import {
  parseDateFromText,
  parseTimeFromText,
  findClosestSlot,
} from "../utils/booking-ai.utils";

import {
  acquireSlotLock,
  releaseSlotLock,
} from "./slotLock.service";

import { sendOwnerWhatsAppNotification } from "./ownerNotification.service";
import { getLeadBehavior } from "./leadBehaviourEngine.service";

/* =================================================
TYPES
================================================= */
interface BookingResult {
  handled: boolean;
  message: string;
}

/* =================================================
INTENT HELPERS
================================================= */

const isCancelIntent = (msg: string) =>
  ["cancel", "delete booking", "remove appointment"].some((k) =>
    msg.includes(k)
  );

const isRescheduleIntent = (msg: string) =>
  ["reschedule", "change time", "change slot"].some((k) =>
    msg.includes(k)
  );

/* =================================================
SMART DECISION
================================================= */

const shouldStartBooking = async (
  leadId: string,
  message: string
) => {
  const msg = message.toLowerCase();

  const strongIntent = [
    "book",
    "schedule",
    "appointment",
    "call",
  ].some((k) => msg.includes(k));

  const behavior = await getLeadBehavior({ leadId });

  if (behavior?.urgency && strongIntent) return "DIRECT";
  if (strongIntent) return "SOFT";

  return "NO";
};

/* =================================================
MAIN ENGINE
================================================= */

export const handleAIBookingIntent = async (
  businessId: string,
  leadId: string,
  message: string
): Promise<BookingResult> => {
  try {
    const clean = message.toLowerCase().trim();

    const state: any = await getConversationState(leadId);

    /* =================================================
    🔥 1. CANCEL FLOW
    ================================================= */
    if (isCancelIntent(clean)) {
      try {
        await cancelAppointmentByLead(leadId);
        return {
          handled: true,
          message: "Your booking has been cancelled 👍",
        };
      } catch {
        return {
          handled: true,
          message: "No active booking found.",
        };
      }
    }

    /* =================================================
    🔥 2. RESCHEDULE FLOW
    ================================================= */
    if (isRescheduleIntent(clean)) {
      await clearConversationState(leadId);

      return {
        handled: true,
        message:
          "Sure 👍 Tell me your preferred date & time and I'll reschedule it.",
      };
    }

    /* =================================================
    🔥 3. DECISION LAYER
    ================================================= */
    const decision = await shouldStartBooking(leadId, message);

    if (decision === "NO") {
      return { handled: false, message: "" };
    }

    if (decision === "SOFT" && !clean.includes("yes")) {
      return {
        handled: true,
        message:
          "I can check available slots for you 👍\n\nWant me to show them?",
      };
    }

    /* =================================================
    🔵 4. CONFIRMATION
    ================================================= */
    if (state?.state === "BOOKING_CONFIRMATION") {
      const selectedSlot = new Date(state.context?.slot);
      const slotKey = selectedSlot.toISOString();

      if (clean.includes("yes") || clean.includes("confirm")) {
        const lockValid = await acquireSlotLock(slotKey, leadId);

        if (!lockValid) {
          await clearConversationState(leadId);
          return {
            handled: true,
            message: "⚠️ Slot no longer available.",
          };
        }

        try {
          const endTime = new Date(
            selectedSlot.getTime() + 30 * 60000
          );

          const lead = await prisma.lead.findUnique({
            where: { id: leadId },
          });

          await createNewAppointment({
            businessId,
            leadId,
            name: lead?.name || "Customer",
            email: lead?.email || null,
            phone: lead?.phone || null,
            startTime: selectedSlot,
            endTime,
          });

          await releaseSlotLock(slotKey);

          await sendOwnerWhatsAppNotification({
            businessId,
            leadId,
            slot: selectedSlot,
          });

          await clearConversationState(leadId);

          return {
            handled: true,
            message: `✅ Booked for ${selectedSlot.toLocaleString()}`,
          };
        } catch {
          await releaseSlotLock(slotKey);
          return {
            handled: true,
            message: "⚠️ Booking failed. Try again.",
          };
        }
      }

      return {
        handled: true,
        message: "Reply YES to confirm or CHANGE.",
      };
    }

    /* =================================================
    🧠 5. SMART DATE INPUT
    ================================================= */
    const parsedDate = parseDateFromText(message);
    const parsedTime = parseTimeFromText(message);

    if (parsedDate && parsedTime) {
      const requested = new Date(parsedDate);
      requested.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

      const available = await fetchAvailableSlots(
        businessId,
        parsedDate
      );

      if (!available.length) {
        return {
          handled: true,
          message: "No slots available that day.",
        };
      }

      const closest = findClosestSlot(requested, available);

      if (!closest) {
        return {
          handled: true,
          message: "No suitable slot found.",
        };
      }

      await setConversationState(leadId, "BOOKING_CONFIRMATION", {
        context: { slot: closest.toISOString() },
      });

      return {
        handled: true,
        message: `Closest slot:

📅 ${closest.toLocaleString()}

Reply YES to confirm.`,
      };
    }

    /* =================================================
    🔵 6. FETCH SLOTS
    ================================================= */
    const today = new Date();
    const slotResults: Date[] = [];

    for (let i = 0; i < 3; i++) {
      const checkDate = new Date();
      checkDate.setDate(today.getDate() + i);

      const slots = await fetchAvailableSlots(
        businessId,
        checkDate
      );

      for (const s of slots) {
        slotResults.push(s);
        if (slotResults.length >= 5) break;
      }

      if (slotResults.length >= 5) break;
    }

    if (!slotResults.length) {
      return {
        handled: true,
        message: "No slots available right now.",
      };
    }

    await setConversationState(leadId, "BOOKING_SELECTION", {
      context: { slots: slotResults },
    });

    const formatted = slotResults.map(
      (slot, i) =>
        `${i + 1}. ${slot.toLocaleDateString()} at ${slot.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`
    );

    return {
      handled: true,
      message:
        "Here are available slots:\n\n" +
        formatted.join("\n") +
        "\n\nReply with slot number 👍",
    };

  } catch (error) {
    console.error("BOOKING ENGINE ERROR:", error);
    return { handled: false, message: "" };
  }
};