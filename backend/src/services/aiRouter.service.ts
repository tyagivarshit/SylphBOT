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

/* ================================================= */
interface RouterInput {
  businessId: string;
  leadId: string;
  message: string;
}

/* ================================================= */
const isGreeting = (msg: string) =>
  ["hi", "hello", "hey", "hii", "yo"].includes(msg);

const isContextSwitch = (msg: string) =>
  ["wait", "stop", "leave it", "not now", "later"].some((k) =>
    msg.includes(k)
  );

/* 🔥 SAFE CONTEXT PARSER */
const getContext = (state: any) => {
  try {
    if (!state?.context) return {};
    return typeof state.context === "string"
      ? JSON.parse(state.context)
      : state.context;
  } catch {
    return {};
  }
};

/* ================================================= */
export const routeAIMessage = async ({
  businessId,
  leadId,
  message,
}: RouterInput): Promise<string | null> => {
  try {
    const lowerMessage = message.toLowerCase().trim();

    /* ================= HUMAN ================= */
    if (await isHumanActive(leadId)) return null;

    /* ================= LEAD ================= */
    await processLeadIntelligence({ leadId, message });
    const behavior = await getLeadBehavior({ leadId });

    /* ================= GREETING ================= */
    if (isGreeting(lowerMessage)) {
      await clearConversationState(leadId);
      return "Hey 👋 How can I help you today?";
    }

    /* ================= INTENT ================= */
    let intent: IntentResponse | null = null;

    try {
      intent = await generateIntentReply({
        businessId,
        leadId,
        message,
      });
    } catch {}

    /* ================= CONTEXT SWITCH ================= */
    if (isContextSwitch(lowerMessage)) {
      await clearConversationState(leadId);
    }

    /* =================================================
    📦 STATE ENGINE (CLEAN + DETERMINISTIC)
    ================================================= */
    const state = await getConversationState(leadId);
    const context = getContext(state);

    if (state) {
      /* -------- SLOT SELECTION -------- */
      if (state.state === "BOOKING_SELECTION") {
        try {
          const slots: string[] = context?.slots || [];

          if (!slots.length) {
            await clearConversationState(leadId);
            return "Session expired. Please try again.";
          }

          let selectedSlot: string | null = null;

          const index = parseInt(lowerMessage);
          if (!isNaN(index) && index > 0 && index <= slots.length) {
            selectedSlot = slots[index - 1];
          }

          if (!selectedSlot) {
            if (lowerMessage.includes("first")) selectedSlot = slots[0];
            else if (lowerMessage.includes("second"))
              selectedSlot = slots[1];
            else if (lowerMessage.includes("last"))
              selectedSlot = slots[slots.length - 1];
          }

          if (!selectedSlot) {
            return "Please select a valid slot number (1, 2, 3...).";
          }

          /* 🔥 STORE ISO ONLY */
          await setConversationState(leadId, "BOOKING_CONFIRMATION", {
            context: { slot: selectedSlot },
          });

          const date = new Date(selectedSlot);

          return `Great choice 👍

📅 ${date.toLocaleString()}

Reply YES to confirm  
or CHANGE to pick another time.`;
        } catch {
          await clearConversationState(leadId);
          return "Something went wrong. Please try again.";
        }
      }

      /* -------- CONFIRMATION -------- */
      if (state.state === "BOOKING_CONFIRMATION") {
        if (lowerMessage.includes("change")) {
          await clearConversationState(leadId);
          return "No worries 👍 Let's pick another slot.";
        }

        /* 🔥 ALL CONFIRMATION HANDLED BY ENGINE */
        const result = await handleAIBookingIntent(
          businessId,
          leadId,
          message
        );

        if (result.handled) return result.message;

        return "Reply YES to confirm or CHANGE.";
      }
    }

    /* =================================================
    🔥 BOOKING ENTRY
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
    🧲 FUNNEL
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
    💬 FALLBACK
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