import { generateIntentReply, IntentResponse } from "./aiIntentEngine.service";
import { handleAIBookingIntent } from "./aiBookingEngine.service";
import {
  getConversationState,
  clearConversationState,
  setConversationState,
} from "./conversationState.service";
import { generateAIFunnelReply } from "./aiFunnel.service";
import { isHumanActive } from "./humanTakeoverManager.service";

import { applyConversionBooster } from "./aiConversionBooster.service";
import { processLeadIntelligence } from "./leadIntelligence.service";
import { getLeadBehavior } from "./leadBehaviourEngine.service";

import { hasFeature } from "../config/plan.config";

/* 🔥 NEW IMPORTS */
import { generateRAGReply } from "./rag.service";
import { generateSmartFallback } from "./smartFallback.service";

/* ================================================= */
interface RouterInput {
  businessId: string;
  leadId: string;
  message: string;
  plan: any;
}

/* ================================================= */
const isGreeting = (msg: string) =>
  ["hi", "hello", "hey", "hii", "yo"].includes(msg);

const isContextSwitch = (msg: string) =>
  ["wait", "stop", "leave it", "not now", "later"].some((k) =>
    msg.includes(k)
  );

const canUseBooking = (plan: any) => {
  return hasFeature(plan, "bookingEnabled");
};

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

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

/* ================================================= */
export const routeAIMessage = async ({
  businessId,
  leadId,
  message,
  plan,
}: RouterInput): Promise<string | null> => {
  try {
    const lowerMessage = message.toLowerCase().trim();

    /* ================= HUMAN ================= */
    if (await isHumanActive(leadId)) return null;

    /* ================= PARALLEL ================= */
    const [_, behavior] = await Promise.all([
      safe(() => processLeadIntelligence({ leadId, message }), null),
      safe(() => getLeadBehavior({ leadId }), {} as any),
    ]);

    /* ================= GREETING ================= */
    if (isGreeting(lowerMessage)) {
      await clearConversationState(leadId);
      return "Hey 👋 How can I help you today?";
    }

    /* ================= INTENT ================= */
    const intent = await safe<IntentResponse | null>(
      () =>
        generateIntentReply({
          businessId,
          leadId,
          message,
        }),
      null
    );

    /* ================= CONTEXT SWITCH ================= */
    if (isContextSwitch(lowerMessage)) {
      await clearConversationState(leadId);
    }

    /* =================================================
    📦 STATE ENGINE (BOOKING SAFE 🔒)
    ================================================= */
    const state = await safe(() => getConversationState(leadId), null);
    const context = getContext(state);

    if (state) {
      if (state.state === "BOOKING_SELECTION") {
        if (!canUseBooking(plan)) {
          await clearConversationState(leadId);
          return "Currently, booking is not available. Please contact us directly for scheduling.";
        }

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
            else if (lowerMessage.includes("second")) selectedSlot = slots[1];
            else if (lowerMessage.includes("last"))
              selectedSlot = slots[slots.length - 1];
          }

          if (!selectedSlot) {
            return "Please select a valid slot number (1, 2, 3...).";
          }

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

      if (state.state === "BOOKING_CONFIRMATION") {
        if (!canUseBooking(plan)) {
          await clearConversationState(leadId);
          return "Currently, booking is not available.";
        }

        if (lowerMessage.includes("change")) {
          await clearConversationState(leadId);
          return "No worries 👍 Let's pick another slot.";
        }

        const result = await safe(
          () => handleAIBookingIntent(businessId, leadId, message),
          { handled: false, message: "" }
        );

        if (result.handled) return result.message;

        return "Reply YES to confirm or CHANGE.";
      }
    }

    /* =================================================
    🔥 BOOKING ENTRY (SAFE 🔒)
    ================================================= */
    let bookingResult = { handled: false, message: "" };

    const isBookingIntent =
      intent?.intent === "BOOKING" ||
      lowerMessage.includes("book") ||
      lowerMessage.includes("schedule") ||
      lowerMessage.includes("appointment");

    if (isBookingIntent) {
      if (!canUseBooking(plan)) {
        return "Currently, booking is not available.";
      }

      bookingResult = await safe(
        () => handleAIBookingIntent(businessId, leadId, message),
        { handled: false, message: "" }
      );
    }

    if (bookingResult?.handled) {
      return bookingResult.message;
    }

    /* =================================================
    🧠 KNOWLEDGE FIRST (RAG 🔥🔥🔥)
    ================================================= */
    const ragResult = await safe(
      () => generateRAGReply(businessId, message, leadId),
      { found: false, reply: null, context: "" }
    );

    if (ragResult?.found && ragResult?.reply) {
      const boosted = behavior?.urgency
        ? await safe(
            () =>
              applyConversionBooster({
                leadId,
                message: ragResult.reply,
                behavior,
              }),
            { boostedMessage: ragResult.reply } as any
          )
        : { boostedMessage: ragResult.reply };

      return boosted.boostedMessage;
    }

    /* =================================================
    🧲 FUNNEL
    ================================================= */
    const funnelReply = await safe(
      () =>
        generateAIFunnelReply({
          businessId,
          leadId,
          message,
        }),
      null
    );

    if (funnelReply) {
      const boosted = behavior?.urgency
        ? await safe(
            () =>
              applyConversionBooster({
                leadId,
                message: funnelReply,
                behavior,
              }),
            { boostedMessage: funnelReply } as any
          )
        : { boostedMessage: funnelReply };

      return boosted.boostedMessage;
    }

    /* =================================================
    💬 SMART FALLBACK (NO AI HALLUCINATION ❌)
    ================================================= */
    const fallback = generateSmartFallback(message);

    const boosted = behavior?.urgency
      ? await safe(
          () =>
            applyConversionBooster({
              leadId,
              message: fallback,
              behavior,
            }),
          { boostedMessage: fallback } as any
        )
      : { boostedMessage: fallback };

    return boosted.boostedMessage;

  } catch (error) {
    console.error("AI ROUTER ERROR:", error);
    return "Sorry, something went wrong.";
  }
};