import prisma from "../config/prisma";
import {
  fetchAvailableSlots,
  createNewAppointment,
  cancelAppointmentByLead,
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
  isSlotLocked,
} from "./slotLock.service";

import { sendOwnerWhatsAppNotification } from "./ownerNotification.service";
import { getLeadBehavior } from "./leadBehaviourEngine.service";

/* ================================================= */
interface BookingResult {
  handled: boolean;
  message: string;
}

/* ================================================= */
const isCancelIntent = (msg: string) =>
  ["cancel", "delete booking", "remove appointment"].some((k) =>
    msg.includes(k)
  );

const isRescheduleIntent = (msg: string) =>
  ["reschedule", "change time", "change slot"].some((k) =>
    msg.includes(k)
  );

/* ================================================= */
const shouldStartBooking = async (leadId: string, message: string) => {
  const msg = message.toLowerCase();

  const strongIntent = ["book", "schedule", "appointment", "call"].some((k) =>
    msg.includes(k)
  );

  const behavior = await getLeadBehavior({ leadId });

  if (behavior?.urgency && strongIntent) return "DIRECT";
  if (strongIntent) return "SOFT";

  return "NO";
};

/* ================================================= */
const getContext = (state: any) => {
  try {
    return state?.context || {};
  } catch {
    return {};
  }
};

/* ================================================= */
export const handleAIBookingIntent = async (
  businessId: string,
  leadId: string,
  message: string
): Promise<BookingResult> => {
  try {
    const clean = message.toLowerCase().trim();
    const state: any = await getConversationState(leadId);
    const context = getContext(state);

    /* ================= CANCEL ================= */
    if (isCancelIntent(clean)) {
      try {
        await cancelAppointmentByLead(leadId);
        return { handled: true, message: "Your booking has been cancelled 👍" };
      } catch {
        return { handled: true, message: "No active booking found." };
      }
    }

    /* ================= RESCHEDULE ================= */
    if (isRescheduleIntent(clean)) {
      await clearConversationState(leadId);
      return {
        handled: true,
        message:
          "Sure 👍 Tell me your preferred date & time and I'll reschedule it.",
      };
    }

    /* =================================================
    🔥 CONFIRMATION (PRO LEVEL)
    ================================================= */
    if (state?.state === "BOOKING_CONFIRMATION") {
      const slotISO = context?.slot;

      if (!slotISO) {
        await clearConversationState(leadId);
        return { handled: true, message: "Session expired. Try again." };
      }

      const selectedSlot = new Date(slotISO);

      if (clean.includes("yes") || clean.includes("confirm")) {

        /* 🔒 CHECK LOCK OWNER */
        const lockedBy = await isSlotLocked(slotISO);

        if (lockedBy && lockedBy !== leadId) {
          await clearConversationState(leadId);
          return {
            handled: true,
            message: "⚠️ Slot already booked by someone else.",
          };
        }

        /* 🔍 FINAL AVAILABILITY CHECK */
        const normalizedDate = new Date(Date.UTC(
          selectedSlot.getUTCFullYear(),
          selectedSlot.getUTCMonth(),
          selectedSlot.getUTCDate()
        ));

        const freshSlots = await fetchAvailableSlots(
          businessId,
          normalizedDate
        );

        const exists = freshSlots.some(
          (s) => s.getTime() === selectedSlot.getTime()
        );

        if (!exists) {
          await clearConversationState(leadId);
          return {
            handled: true,
            message: "⚠️ Slot no longer available.",
          };
        }

        try {
          const endTime = new Date(selectedSlot.getTime() + 30 * 60000);

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

          await releaseSlotLock(slotISO);
          await clearConversationState(leadId);

          await sendOwnerWhatsAppNotification({
            businessId,
            leadId,
            slot: selectedSlot,
          });

          return {
            handled: true,
            message: `✅ Booked for ${selectedSlot.toLocaleString()}`,
          };
        } catch (err: any) {
          await releaseSlotLock(slotISO);

          if (err.message?.includes("Slot already booked")) {
            return {
              handled: true,
              message: "⚠️ Slot just got booked. Try another.",
            };
          }

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

    /* ================= DECISION ================= */
    const decision = await shouldStartBooking(leadId, message);

    if (decision === "NO") return { handled: false, message: "" };

    if (decision === "SOFT" && !clean.includes("yes")) {
      return {
        handled: true,
        message:
          "I can check available slots 👍\n\nWant me to show them?",
      };
    }

    /* =================================================
    🧠 SMART INPUT
    ================================================= */
    const parsedDate = parseDateFromText(message);
    const parsedTime = parseTimeFromText(message);

    if (parsedDate && parsedTime) {
      const requested = new Date(parsedDate);
      requested.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

      const normalizedDate = new Date(Date.UTC(
        parsedDate.getFullYear(),
        parsedDate.getMonth(),
        parsedDate.getDate()
      ));

      const available = await fetchAvailableSlots(
        businessId,
        normalizedDate
      );

      if (!available.length) {
        return { handled: true, message: "No slots available." };
      }

      const closest = findClosestSlot(requested, available);

      if (!closest) {
        return { handled: true, message: "No suitable slot found." };
      }

      await setConversationState(leadId, "BOOKING_CONFIRMATION", {
        context: { slot: closest.toISOString() },
      });

      return {
        handled: true,
        message: `Closest slot:\n\n📅 ${closest.toLocaleString()}\n\nReply YES to confirm.`,
      };
    }

    /* =================================================
    🔵 FETCH SLOTS
    ================================================= */
    const today = new Date();
    const slotResults: Date[] = [];

    for (let i = 0; i < 3; i++) {
      const checkDate = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() + i
      ));

      const slots = await fetchAvailableSlots(businessId, checkDate);

      for (const s of slots) {
        slotResults.push(s);
        if (slotResults.length >= 5) break;
      }

      if (slotResults.length >= 5) break;
    }

    if (!slotResults.length) {
      return { handled: true, message: "No slots available." };
    }

    const slotISOs = slotResults.map((s) => s.toISOString());

    await setConversationState(leadId, "BOOKING_SELECTION", {
      context: { slots: slotISOs },
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
        "Available slots:\n\n" +
        formatted.join("\n") +
        "\n\nReply with slot number 👍",
    };

  } catch (error) {
    console.error("BOOKING ENGINE ERROR:", error);
    return { handled: false, message: "" };
  }
};