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
  readSlotLock,
} from "./slotLock.service";

import { sendOwnerWhatsAppNotification } from "./ownerNotification.service";

/* ================================================= */
interface BookingResult {
  handled: boolean;
  message: string;
  slots?: Date[];
}

/* ================================================= */
const isCancelIntent = (msg: string) =>
  ["cancel", "delete", "remove"].some((k) => msg.includes(k));

const isRescheduleIntent = (msg: string) =>
  ["reschedule", "change time", "change slot"].some((k) =>
    msg.includes(k)
  );

/* ================================================= */
const getContext = (state: any) => state?.context || {};

const getSlotLockContext = (context: Record<string, any>) => {
  const slot =
    typeof context?.slot === "string" && context.slot.trim()
      ? context.slot.trim()
      : null;
  const token =
    typeof context?.slotLockToken === "string" && context.slotLockToken.trim()
      ? context.slotLockToken.trim()
      : null;

  return {
    slot,
    token,
  };
};

const releaseContextSlotLock = async (context: Record<string, any>) => {
  const { slot, token } = getSlotLockContext(context);

  if (!slot || !token) {
    return;
  }

  await releaseSlotLock(slot, token).catch(() => undefined);
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
        await cancelAppointmentByLead(businessId, leadId);
        await releaseContextSlotLock(context);
        await clearConversationState(leadId);

        await sendOwnerWhatsAppNotification({
          businessId,
          leadId,
          type: "CANCELLED",
        });

        return {
          handled: true,
          message: "❌ Your booking has been cancelled.",
        };
      } catch {
        if (state?.state === "BOOKING_CONFIRMATION") {
          await releaseContextSlotLock(context);
          await clearConversationState(leadId);

          return {
            handled: true,
            message: "Booking request cancelled.",
          };
        }

        return { handled: true, message: "No active booking found." };
      }
    }

    /* ================= RESCHEDULE ================= */
    if (isRescheduleIntent(clean)) {
      try {
        /* 🔥 CANCEL OLD BOOKING FIRST */
        await cancelAppointmentByLead(businessId, leadId);
        await releaseContextSlotLock(context);
        await clearConversationState(leadId);
        await setConversationState(leadId, "RESCHEDULE_FLOW", {});

        await sendOwnerWhatsAppNotification({
          businessId,
          leadId,
          type: "RESCHEDULED",
        });

        return {
          handled: true,
          message: "Sure 👍 Tell me new date & time.",
        };
      } catch {
        return {
          handled: true,
          message: "Tell me new date & time 👍",
        };
      }
    }

    /* =================================================
    🔥 CONFIRMATION
    ================================================= */
    if (state?.state === "BOOKING_CONFIRMATION") {
      const slotISO = context?.slot;

      if (!slotISO) {
        await releaseContextSlotLock(context);
        await clearConversationState(leadId);
        return { handled: true, message: "Session expired." };
      }

      const selectedSlot = new Date(slotISO);
      const slotLockToken =
        typeof context?.slotLockToken === "string"
          ? context.slotLockToken
          : null;

      if (clean.includes("yes") || clean.includes("confirm")) {
        const activeSlotLock = await readSlotLock(slotISO);

        if (activeSlotLock && activeSlotLock.token !== slotLockToken) {
          await releaseContextSlotLock(context);
          await clearConversationState(leadId);
          return {
            handled: true,
            message: "⚠️ Slot already booked.",
          };
        }

        /* 🔥 PREVENT DOUBLE BOOKING */
        const existing = await prisma.appointment.findFirst({
          where: {
            leadId,
            status: "CONFIRMED",
          },
        });

        if (existing) {
          await releaseContextSlotLock(context);
          await clearConversationState(leadId);
          return {
            handled: true,
            message: "⚠️ You already have a booking.",
          };
        }

        try {
          const endTime = new Date(selectedSlot.getTime() + 30 * 60000);

          const lead = await prisma.lead.findFirst({
            where: {
              id: leadId,
              businessId,
            },
          });

          const appointment = await createNewAppointment({
            businessId,
            leadId,
            name: lead?.name || "Customer",
            email: lead?.email || null,
            phone: lead?.phone || null,
            startTime: selectedSlot,
            endTime,
          });

          if (slotLockToken) {
            await releaseSlotLock(slotISO, slotLockToken);
          }
          await clearConversationState(leadId);

          return {
            handled: true,
            message: `✅ Booked for ${selectedSlot.toLocaleString()}`,
          };
        } catch {
          if (slotLockToken) {
            await releaseSlotLock(slotISO, slotLockToken);
          }

          return {
            handled: true,
            message: "⚠️ Booking failed. Try another slot.",
          };
        }
      }

      if (clean.includes("change")) {
        await releaseContextSlotLock(context);
        await setConversationState(leadId, "BOOKING_SELECTION", {});
        return { handled: true, message: "Okay 👍 Select another slot." };
      }

      return {
        handled: true,
        message: "Reply YES to confirm or CHANGE.",
      };
    }

    /* ================= SMART PARSING ================= */
    let parsedDate = parseDateFromText(message);
    let parsedTime = parseTimeFromText(message);

    const lower = message.toLowerCase();

    if (!parsedDate && lower.includes("aaj")) parsedDate = new Date();

    if (!parsedDate && lower.includes("kal")) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      parsedDate = d;
    }

    if (!parsedDate && parsedTime) parsedDate = new Date();

    if (parsedTime && lower.includes("evening") && parsedTime.hours < 12)
      parsedTime.hours += 12;

    if (parsedTime && lower.includes("night") && parsedTime.hours < 12)
      parsedTime.hours += 12;

    if (parsedTime && lower.includes("morning") && parsedTime.hours >= 12)
      parsedTime.hours -= 12;

    /* =================================================
    🎯 DIRECT SLOT MATCH
    ================================================= */
    if (parsedDate && parsedTime) {
      const requested = new Date(parsedDate);
      requested.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

      const normalizedDate = new Date(
        Date.UTC(
          parsedDate.getFullYear(),
          parsedDate.getMonth(),
          parsedDate.getDate()
        )
      );

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

      const slotLock = await acquireSlotLock(closest.toISOString(), leadId);

      if (!slotLock) {
        return {
          handled: true,
          message: "That slot was just booked. Please choose another one.",
        };
      }

      await setConversationState(leadId, "BOOKING_CONFIRMATION", {
        context: {
          slot: closest.toISOString(),
          slotLockToken: slotLock.token,
        },
      });

      return {
        handled: true,
        message: `Closest slot:\n\n📅 ${closest.toLocaleString()}\n\nReply YES to confirm.`,
      };
    }

    /* =================================================
    📅 SHOW SLOTS
    ================================================= */
    const today = new Date();
    const slotResults: Date[] = [];

    for (let i = 0; i < 3; i++) {
      const checkDate = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate() + i
        )
      );

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

    await setConversationState(leadId, "BOOKING_SELECTION", {
      context: { slots: slotResults.map((s) => s.toISOString()) },
    });

    return {
      handled: true,
      message:
        "Available slots:\n\n" +
        slotResults
          .map(
            (slot, i) =>
              `${i + 1}. ${slot.toLocaleDateString()} at ${slot.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
          )
          .join("\n") +
        "\n\nReply with slot number 👍",
    };
  } catch (error) {
    console.error("BOOKING ENGINE ERROR:", error);
    return { handled: false, message: "" };
  }
};

export const confirmAIBooking = async (
  businessId: string,
  leadId: string,
  slot: Date
) => {
  try {
    const state: any = await getConversationState(leadId);
    const context = getContext(state);
    const { token: slotLockToken } = getSlotLockContext(context);
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        businessId,
      },
    });

    if (!lead) {
      return {
        success: false,
        message: "Lead not found.",
        appointment: null,
      };
    }

    const appointment = await createNewAppointment({
      businessId,
      leadId,
      name: lead.name || "Customer",
      email: lead.email || null,
      phone: lead.phone || null,
      startTime: slot,
      endTime: new Date(slot.getTime() + 30 * 60000),
    });

    if (slotLockToken) {
      await releaseSlotLock(slot.toISOString(), slotLockToken).catch(() => undefined);
    }
    await clearConversationState(leadId);

    return {
      success: true,
      message: `Booked for ${slot.toLocaleString()}`,
      appointment,
    };
  } catch (error: any) {
    console.error("AI BOOKING CONFIRM ERROR:", error);

    return {
      success: false,
      message: error?.message || "Failed to confirm booking",
      appointment: null,
    };
  }
};
