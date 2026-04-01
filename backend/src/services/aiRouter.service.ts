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

import { hasFeature } from "../config/plan.config";

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

/* 🔥 FEATURE CHECK */
const canUseBooking = (plan: any) => {
  return hasFeature(plan, "bookingEnabled");
};

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

/* 🔥 SAFE WRAPPER */
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
    📦 STATE ENGINE
    ================================================= */
    const state = await safe(() => getConversationState(leadId), null);
    const context = getContext(state);

    if (state) {
      /* -------- SLOT SELECTION -------- */
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
            else if (lowerMessage.includes("second"))
              selectedSlot = slots[1];
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

      /* -------- CONFIRMATION -------- */
      if (state.state === "BOOKING_CONFIRMATION") {
        if (!canUseBooking(plan)) {
          await clearConversationState(leadId);
          return "Currently, booking is not available. Please contact us directly for scheduling.";
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
    🔥 BOOKING ENTRY
    ================================================= */
    let bookingResult = { handled: false, message: "" };

    const isBookingIntent =
      intent?.intent === "BOOKING" ||
      lowerMessage.includes("book") ||
      lowerMessage.includes("schedule") ||
      lowerMessage.includes("appointment");

    if (isBookingIntent) {
      if (!canUseBooking(plan)) {
        return "Currently, booking is not available. Please contact us directly for scheduling.";
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
    💬 FALLBACK
    ================================================= */
    const fallback = await safe(
      () =>
        generateAIReply({
          businessId,
          leadId,
          message,
        }),
      "" as any
    );

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