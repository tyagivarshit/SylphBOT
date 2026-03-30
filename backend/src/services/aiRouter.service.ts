import { generateIntentReply, IntentResponse } from "./aiIntentEngine.service";
import { handleAIBookingIntent } from "./aiBookingEngine.service";
import {
  getConversationState,
  clearConversationState,
  setConversationState,
} from "./conversationState.service";
import { generateAIFunnelReply } from "./aiFunnel.service";
import { generateAIReply } from "./ai.service";
import { isHumanActive } from "./humanTakeoverManager.service";

import { applyConversionBooster } from "./aiConversionBooster.service";
import { processLeadIntelligence } from "./leadIntelligence.service";
import { getLeadBehavior } from "./leadBehaviourEngine.service";

/* =================================================
TYPES
================================================= */
interface RouterInput {
  businessId: string;
  leadId: string;
  message: string;
}

/* =================================================
HELPERS
================================================= */

const isGreeting = (msg: string) =>
  ["hi", "hello", "hey", "hii", "yo"].includes(msg);

const isAffirmative = (msg: string) =>
  ["yes", "yeah", "yep", "sure", "ok", "okay"].some((k) =>
    msg.includes(k)
  );

const isContextSwitch = (msg: string) =>
  ["wait", "stop", "leave it", "not now", "later"].some((k) =>
    msg.includes(k)
  );

/* =================================================
🔥 MAIN ROUTER
================================================= */

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
    if (await isHumanActive(leadId)) return null;

    /* =================================================
    🧠 1️⃣ LEAD INTELLIGENCE
    ================================================= */
    await processLeadIntelligence({ leadId, message });
    const behavior = await getLeadBehavior({ leadId });

    /* =================================================
    👋 2️⃣ GREETING
    ================================================= */
    if (isGreeting(lowerMessage)) {
      await clearConversationState(leadId);
      return "Hey 👋 How can I help you today?";
    }

    /* =================================================
    🧠 3️⃣ INTENT DETECTION
    ================================================= */
    let intent: IntentResponse | null = null;

    try {
      intent = await generateIntentReply({
        businessId,
        leadId,
        message,
      });
    } catch {}

    /* =================================================
    🔄 4️⃣ CONTEXT SWITCH
    ================================================= */
    if (isContextSwitch(lowerMessage)) {
      await clearConversationState(leadId);
    }

    /* =================================================
    📦 5️⃣ STATE ENGINE
    ================================================= */
    const state = await getConversationState(leadId);

    const allowStateFlow =
      state &&
      (intent?.intent === "BOOKING" ||
        isAffirmative(lowerMessage) ||
        lowerMessage.includes("confirm"));

    if (state && allowStateFlow) {
      /* -------- CONFIRMATION -------- */
      if (state.state === "BOOKING_CONFIRMATION") {
        const selectedSlot = new Date(state.context?.slot);

        if (isAffirmative(lowerMessage) || lowerMessage.includes("confirm")) {
          const bookingResult = await handleAIBookingIntent(
            businessId,
            leadId,
            selectedSlot.toISOString()
          );

          await clearConversationState(leadId);
          return bookingResult.message || "✅ Booking confirmed!";
        }

        if (lowerMessage.includes("change")) {
          await clearConversationState(leadId);
          return "No worries 👍 Let's pick another slot.";
        }

        return `Just confirm once 👍

Reply YES to confirm  
or CHANGE to pick another slot.`;
      }

      /* -------- SLOT SELECTION -------- */
      if (state.state === "BOOKING_SELECTION") {
        try {
          const slots: string[] = state.context?.slots || [];

          let selectedSlot: string | null = null;

          const index = parseInt(message);
          if (!isNaN(index)) selectedSlot = slots[index - 1];

          if (!selectedSlot) {
            if (lowerMessage.includes("first")) selectedSlot = slots[0];
            else if (lowerMessage.includes("second"))
              selectedSlot = slots[1];
            else if (lowerMessage.includes("last"))
              selectedSlot = slots[slots.length - 1];
          }

          if (selectedSlot) {
            await setConversationState(leadId, "BOOKING_CONFIRMATION", {
              context: { slot: selectedSlot },
            });

            const date = new Date(selectedSlot);

            return `Great choice 👍

📅 ${date.toLocaleString()}

Reply YES to confirm  
or CHANGE to pick another time.`;
          }

          return "Please select a valid slot number (1, 2, 3...).";
        } catch {
          await clearConversationState(leadId);
          return "Something went wrong. Please try again.";
        }
      }
    }

    /* 🔥 STATE EXIT */
    if (state && !allowStateFlow) {
      await clearConversationState(leadId);
    }

    /* =================================================
    🔥 6️⃣ BOOKING (CONTROLLED)
    ================================================= */
    let bookingResult = { handled: false, message: "" };

    if (
      intent?.intent === "BOOKING" ||
      lowerMessage.includes("book") ||
      lowerMessage.includes("schedule")
    ) {
      bookingResult = await handleAIBookingIntent(
        businessId,
        leadId,
        message
      );
    }

    if (bookingResult?.handled) {
      return bookingResult.message;
    }

    /* =================================================
    🧲 7️⃣ FUNNEL
    ================================================= */
    try {
      const funnelReply = await generateAIFunnelReply({
        businessId,
        leadId,
        message,
      });

      if (funnelReply) {
        const boosted = behavior.urgency
          ? await applyConversionBooster({
              leadId,
              message: funnelReply,
              behavior,
            })
          : { boostedMessage: funnelReply };

        return boosted.boostedMessage;
      }
    } catch {}

    /* =================================================
    💬 8️⃣ FALLBACK
    ================================================= */
    const fallback = await generateAIReply({
      businessId,
      leadId,
      message,
    });

    const boosted = behavior.urgency
      ? await applyConversionBooster({
          leadId,
          message: fallback || "",
          behavior,
        })
      : { boostedMessage: fallback || "" };

    return boosted.boostedMessage;

  } catch (error) {
    console.error("AI ROUTER ERROR:", error);
    return "Sorry, something went wrong.";
  }
};