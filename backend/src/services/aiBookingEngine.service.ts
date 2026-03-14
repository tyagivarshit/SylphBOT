import prisma from "../config/prisma";
import { fetchAvailableSlots, createNewAppointment } from "./booking.service";
import {
  setConversationState,
  clearConversationState
} from "./conversationState.service";

/*
=========================================================
AI BOOKING ENGINE
Handles booking intent + slot suggestion + confirmation
=========================================================
*/

interface BookingResult {
  handled: boolean;
  message: string;
  slots?: Date[];
}

export const handleAIBookingIntent = async (
  businessId: string,
  leadId: string,
  message: string
): Promise<BookingResult> => {

  try {

    /* ------------------------------------------------
    GET LEAD
    ------------------------------------------------ */

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    if (!lead) {

      return {
        handled: false,
        message: "Lead not found",
      };

    }

    /* ------------------------------------------------
    FETCH NEXT AVAILABLE SLOTS
    ------------------------------------------------ */

    const today = new Date();
    const slotResults: Date[] = [];

    for (let i = 0; i < 5; i++) {

      const checkDate = new Date();
      checkDate.setDate(today.getDate() + i);

      const slots = await fetchAvailableSlots(
        businessId,
        checkDate
      );

      if (slots.length) {

        for (const s of slots) {

          slotResults.push(s);

          if (slotResults.length >= 5) break;

        }

      }

      if (slotResults.length >= 5) break;

    }

    if (!slotResults.length) {

      return {
        handled: true,
        message: "Sorry, no available booking slots right now.",
      };

    }

    /* ------------------------------------------------
    STORE STATE
    ------------------------------------------------ */

    await setConversationState(
      leadId,
      "BOOKING_SELECTION",
      JSON.stringify(slotResults),
      15
    );

    /* ------------------------------------------------
    FORMAT SLOTS
    ------------------------------------------------ */

    const formattedSlots = slotResults
      .slice(0, 5)
      .map((slot, index) => {

        const date = slot.toLocaleDateString();
        const time = slot.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        return `${index + 1}. ${date} at ${time}`;

      });

    const replyMessage =
      "Great! Here are some available slots:\n\n" +
      formattedSlots.join("\n") +
      "\n\nReply with the slot number you prefer.";

    return {
      handled: true,
      slots: slotResults,
      message: replyMessage,
    };

  } catch (error) {

    console.error("AI BOOKING ENGINE ERROR:", error);

    return {
      handled: false,
      message: "Failed to process booking request",
    };

  }

};

/*
=========================================================
CONFIRM BOOKING FROM SLOT SELECTION
=========================================================
*/

export const confirmAIBooking = async (
  businessId: string,
  leadId: string,
  slot: Date
) => {

  try {

    /* ------------------------------------------------
    GET LEAD
    ------------------------------------------------ */

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    if (!lead) {

      throw new Error("Lead not found");

    }

    /* ------------------------------------------------
    SLOT VALIDATION
    ------------------------------------------------ */

    const startTime = new Date(slot);
    const endTime = new Date(
      startTime.getTime() + 30 * 60000
    );

    if (startTime < new Date()) {

      return {
        success: false,
        message: "That slot is no longer available.",
      };

    }

    /* ------------------------------------------------
    CREATE APPOINTMENT
    ------------------------------------------------ */

    const appointment = await createNewAppointment({
      businessId,
      leadId,
      name: lead.name || "Customer",
      email: lead.email || null,
      phone: lead.phone || null,
      startTime,
      endTime,
    });

    /* ------------------------------------------------
    CLEAR STATE
    ------------------------------------------------ */

    await clearConversationState(leadId);

    /* ------------------------------------------------
    FORMAT RESPONSE
    ------------------------------------------------ */

    const date = startTime.toLocaleDateString();
    const time = startTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const confirmationMessage =
      "✅ Your appointment is confirmed for " +
      date +
      " at " +
      time +
      ".";

    return {
      success: true,
      appointment,
      message: confirmationMessage,
    };

  } catch (error) {

    console.error("AI BOOKING CONFIRM ERROR:", error);

    return {
      success: false,
      message: "Failed to confirm appointment",
    };

  }

};