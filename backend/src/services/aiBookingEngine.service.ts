import prisma from "../config/prisma";
import {
  fetchAvailableSlots,
  createNewAppointment,
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

/*
=========================================================
AI BOOKING ENGINE (FINAL FIXED)
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
    🔥 STEP 1: CHECK CONVERSATION STATE
    -------------------------------------------- */
    const state: any = await getConversationState(leadId);

    if (state?.state === "BOOKING_SELECTION") {
      const slots: Date[] = JSON.parse(state.context || "[]");

      const selectedIndex = Number(message.trim()) - 1;

      if (isNaN(selectedIndex) || !slots[selectedIndex]) {
        return {
          handled: true,
          message: "❌ Invalid selection. Please choose a valid slot number.",
        };
      }

      const selectedSlot = new Date(slots[selectedIndex]);

      const endTime = new Date(selectedSlot.getTime() + 30 * 60000);

      await createNewAppointment({
        businessId,
        leadId,
        name: lead.name || "Customer",
        email: lead.email || null,
        phone: lead.phone || null,
        startTime: selectedSlot,
        endTime,
      });

      await clearConversationState(leadId);

      return {
        handled: true,
        message: `✅ Appointment confirmed for ${selectedSlot.toLocaleString()}`,
        slots: [selectedSlot],
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

      await createNewAppointment({
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
    🔥 STEP 2: IGNORE RANDOM TEXT
    -------------------------------------------- */
    if (!parsedDate && !parsedTime) {
      return {
        handled: false,
        message: "",
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