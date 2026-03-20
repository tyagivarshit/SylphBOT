import prisma from "../config/prisma";
import {
  fetchAvailableSlots,
  createNewAppointment,
} from "./booking.service";
import {
  setConversationState,
  clearConversationState,
} from "./conversationState.service";
import {
  parseDateFromText,
  parseTimeFromText,
  findClosestSlot,
} from "../utils/booking-ai.utils";

/*
=========================================================
AI BOOKING ENGINE (ADVANCED)
=========================================================
*/

interface BookingResult {
  handled: boolean;
  message: string;
  slots?: Date[];
}

/*
=========================================================
HANDLE AI BOOKING INTENT
=========================================================
*/
export const handleAIBookingIntent = async (
  businessId: string,
  leadId: string,
  message: string
): Promise<BookingResult> => {
  try {
    /* --------------------------------------------
    GET LEAD
    -------------------------------------------- */
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

    /* --------------------------------------------
    SMART DATE + TIME DETECTION
    -------------------------------------------- */
    const parsedDate = parseDateFromText(message);
    const parsedTime = parseTimeFromText(message);

    if (parsedDate && parsedTime) {
      const requested = new Date(parsedDate);
      requested.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

      const availableSlots = await fetchAvailableSlots(
        businessId,
        parsedDate
      );

      if (!availableSlots.length) {
        return {
          handled: true,
          message: "No slots available for that date.",
        };
      }

      const closest = findClosestSlot(requested, availableSlots);

      if (!closest) {
        return {
          handled: true,
          message: "No suitable slot found.",
        };
      }

      const endTime = new Date(closest.getTime() + 30 * 60000);

      const appointment = await createNewAppointment({
        businessId,
        leadId,
        name: lead.name || "Customer",
        email: lead.email || null,
        phone: lead.phone || null,
        startTime: closest,
        endTime,
      });

      await clearConversationState(leadId);

      return {
        handled: true,
        message: `✅ Booked for ${closest.toLocaleString()}`,
        slots: [closest],
      };
    }

    /* --------------------------------------------
    FETCH NEXT AVAILABLE SLOTS
    -------------------------------------------- */
    const today = new Date();
    const slotResults: Date[] = [];

    for (let i = 0; i < 5; i++) {
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
        message: "Sorry, no available booking slots right now.",
      };
    }

    /* --------------------------------------------
    STORE STATE
    -------------------------------------------- */
    await setConversationState(
      leadId,
      "BOOKING_SELECTION",
      JSON.stringify(slotResults),
      15
    );

    /* --------------------------------------------
    FORMAT SLOTS
    -------------------------------------------- */
    const formattedSlots = slotResults.map((slot, index) => {
      const date = slot.toLocaleDateString();
      const time = slot.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      return `${index + 1}. ${date} at ${time}`;
    });

    return {
      handled: true,
      slots: slotResults,
      message:
        "Here are available slots:\n\n" +
        formattedSlots.join("\n") +
        "\n\nReply with slot number.",
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
CONFIRM BOOKING
=========================================================
*/
export const confirmAIBooking = async (
  businessId: string,
  leadId: string,
  slot: Date
) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        name: true,
        email: true,
        phone: true,
      },
    });

    if (!lead) {
      throw new Error("Lead not found");
    }

    const startTime = new Date(slot);
    const endTime = new Date(startTime.getTime() + 30 * 60000);

    if (startTime < new Date()) {
      return {
        success: false,
        message: "That slot is no longer available.",
      };
    }

    const appointment = await createNewAppointment({
      businessId,
      leadId,
      name: lead.name || "Customer",
      email: lead.email || null,
      phone: lead.phone || null,
      startTime,
      endTime,
    });

    await clearConversationState(leadId);

    return {
      success: true,
      appointment,
      message: `✅ Appointment confirmed for ${startTime.toLocaleString()}`,
    };
  } catch (error) {
    console.error("AI BOOKING CONFIRM ERROR:", error);

    return {
      success: false,
      message: "Failed to confirm appointment",
    };
  }
};