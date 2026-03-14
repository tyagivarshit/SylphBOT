import { generateIntentReply } from "./aiIntentEngine.service";
import {
  handleAIBookingIntent,
  confirmAIBooking,
} from "./aiBookingEngine.service";
import {
  getConversationState,
  clearConversationState,
} from "./conversationState.service";
import { generateAIFunnelReply } from "./aiFunnel.service";
import { generateAIReply } from "./ai.service";

/*
=========================================================
AI ROUTER
Central decision layer for all AI systems
Priority order:

1. Conversation state engine
2. Booking engine
3. Intent engine
4. Funnel AI
5. Basic AI fallback
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
}: RouterInput): Promise<string> => {

  try {

    const lowerMessage = message.toLowerCase().trim();

    /* =================================================
    1️⃣ CONVERSATION STATE ENGINE
    ================================================= */

    const state = await getConversationState(leadId);

    if (state?.state === "BOOKING_SELECTION") {

      const slotIndex = parseInt(message);

      if (!isNaN(slotIndex)) {

        try {

          const slots: string[] = JSON.parse(state.context || "[]");

          const selectedSlot = slots[slotIndex - 1];

          if (selectedSlot) {

            const result = await confirmAIBooking(
              businessId,
              leadId,
              new Date(selectedSlot)
            );

            await clearConversationState(leadId);

            return result.message;

          }

          return "Please select a valid slot number.";

        } catch (err) {

          console.error("BOOKING STATE PARSE ERROR", err);

          await clearConversationState(leadId);

        }

      }

    }

    /* =================================================
    2️⃣ BOOKING ENGINE
    ================================================= */

    const bookingKeywords = [
      "book",
      "appointment",
      "call",
      "meeting",
      "schedule",
      "demo",
    ];

    const isBookingIntent = bookingKeywords.some((word) =>
      lowerMessage.includes(word)
    );

    if (isBookingIntent) {

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

        console.log("Booking engine failed");

      }

    }

    /* =================================================
    3️⃣ INTENT ENGINE
    ================================================= */

    try {

      const intentReply = await generateIntentReply({
        businessId,
        leadId,
        message,
      });

      if (intentReply) {
        return intentReply;
      }

    } catch (err) {

      console.log("Intent engine failed");

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

      if (funnelReply) {
        return funnelReply;
      }

    } catch (err) {

      console.log("Funnel AI failed");

    }

    /* =================================================
    5️⃣ BASIC AI FALLBACK
    ================================================= */

    const basicReply = await generateAIReply({
      businessId,
      leadId,
      message,
    });

    return basicReply;

  } catch (error) {

    console.error("AI ROUTER ERROR:", error);

    return "Sorry, something went wrong while processing your message.";

  }

};