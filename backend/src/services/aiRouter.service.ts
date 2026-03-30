import { generateIntentReply } from "./aiIntentEngine.service";
import { handleAIBookingIntent } from "./aiBookingEngine.service";
import {
  getConversationState,
  clearConversationState,
  setConversationState,
} from "./conversationState.service";
import { generateAIFunnelReply } from "./aiFunnel.service";
import { generateAIReply } from "./ai.service";
import { isHumanActive } from "./humanTakeoverManager.service";

/*
=========================================================
AI ROUTER (FINAL - SMART + SAFE)
=========================================================
*/

interface RouterInput {
  businessId: string;
  leadId: string;
  message: string;
}

export const routeAIMessage = async ({
  businessId,
  leadId,
  message,
}: RouterInput): Promise<string | null> => {
  try {
    const lowerMessage = message.toLowerCase().trim();

    /* =================================================
    0️⃣ HUMAN TAKEOVER
    ================================================= */

    if (await isHumanActive(leadId)) {
      return null;
    }

    /* =================================================
    1️⃣ STATE ENGINE
    ================================================= */

    const state = await getConversationState(leadId);

    /* =========================
    🔵 BOOKING CONFIRMATION STATE
    ========================= */

    if (state?.state === "BOOKING_CONFIRMATION") {
      const selectedSlot = new Date(state.context || "");

      if (lowerMessage.includes("confirm") || lowerMessage === "yes") {
        const bookingResult = await handleAIBookingIntent(
          businessId,
          leadId,
          selectedSlot.toISOString()
        );

        await clearConversationState(leadId);

        return bookingResult.message || "✅ Appointment confirmed";
      }

      if (lowerMessage.includes("change")) {
        await clearConversationState(leadId);
        return "No problem, please select another slot.";
      }

      return 'Please reply "confirm" or "change".';
    }

    /* =========================
    🟢 BOOKING SELECTION STATE
    ========================= */

    if (state?.state === "BOOKING_SELECTION") {
      try {
        const slots: string[] = JSON.parse(state.context || "[]");

        let selectedSlot: string | null = null;

        // ✅ 1. Number input
        const slotIndex = parseInt(message);
        if (!isNaN(slotIndex)) {
          selectedSlot = slots[slotIndex - 1];
        }

        // ✅ 2. Basic NLP (first, second, last)
        if (!selectedSlot) {
          if (lowerMessage.includes("first")) selectedSlot = slots[0];
          else if (lowerMessage.includes("second")) selectedSlot = slots[1];
          else if (lowerMessage.includes("third")) selectedSlot = slots[2];
          else if (lowerMessage.includes("last"))
            selectedSlot = slots[slots.length - 1];
          else if (lowerMessage.includes("earliest"))
            selectedSlot = slots[0];
          else if (lowerMessage.includes("latest"))
            selectedSlot = slots[slots.length - 1];
        }

        // ✅ अगर slot mil gaya
        if (selectedSlot) {
          await setConversationState(
            leadId,
            "BOOKING_CONFIRMATION",
            selectedSlot,
            15
          );

          const date = new Date(selectedSlot);

          return `You selected:
📅 ${date.toLocaleString()}

Reply "confirm" to book or "change" to pick another slot.`;
        }

        // ❌ confirm bola but slot nahi select
        if (
          lowerMessage.includes("confirm") ||
          lowerMessage.includes("yes")
        ) {
          return "Please select a slot first from the list above.";
        }

        return "Please choose a slot (e.g., 1, first, second, last).";
      } catch (err) {
        console.error("BOOKING STATE ERROR", err);
        await clearConversationState(leadId);
        return "Something went wrong. Please try booking again.";
      }
    }

    /* =================================================
    2️⃣ INTENT ENGINE
    ================================================= */

    let intentResponse: any = null;

    try {
      intentResponse = await generateIntentReply({
        businessId,
        leadId,
        message,
      });

      if (intentResponse?.intent === "BOOKING") {
        const bookingResult = await handleAIBookingIntent(
          businessId,
          leadId,
          message
        );

        if (bookingResult?.handled) {
          return bookingResult.message;
        }
      }

      if (intentResponse?.reply) {
        return intentResponse.reply;
      }
    } catch (err) {
      console.log("Intent engine failed");
    }

    /* =================================================
    3️⃣ STRONG BOOKING FALLBACK
    ================================================= */

    const strongBookingTriggers = [
      "book appointment",
      "schedule call",
      "book call",
      "book meeting",
      "schedule meeting",
      "book now",
      "i want to book",
      "schedule demo",
    ];

    const isStrongBooking = strongBookingTriggers.some((word) =>
      lowerMessage.includes(word)
    );

    if (isStrongBooking) {
      try {
        const bookingResult = await handleAIBookingIntent(
          businessId,
          leadId,
          message
        );

        if (bookingResult?.handled) {
          return bookingResult.message;
        }
      } catch (err) {
        console.log("Booking engine fallback failed");
      }
    }

    /* =================================================
    4️⃣ FUNNEL AI
    ================================================= */

    try {
      const funnelReply = await generateAIFunnelReply({
        businessId,
        leadId,
        message,
      });

      if (funnelReply) return funnelReply;
    } catch (err) {
      console.log("Funnel AI failed");
    }

    /* =================================================
    5️⃣ BASIC AI
    ================================================= */

    return await generateAIReply({
      businessId,
      leadId,
      message,
    });

  } catch (error) {
    console.error("AI ROUTER ERROR:", error);
    return "Sorry, something went wrong while processing your message.";
  }
};