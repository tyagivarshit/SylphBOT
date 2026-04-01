import { isHumanActive } from "./humanTakeoverManager.service";
import { runAutomationEngine } from "./automationEngine.service";
import { routeAIMessage } from "./aiRouter.service";

import { bookingPriorityRouter } from "./bookingPriorityRouter.service";
import { getConversationState } from "./conversationState.service";

/* ================================================= */
export const handleIncomingMessage = async (data: any) => {
  const { businessId, leadId, message, plan } = data;

  try {
    /* ================= HUMAN ================= */
    const human = await isHumanActive(leadId);
    if (human) return null;

    const clean = message.toLowerCase();

    /* =================================================
    🧠 INTENT DETECTION
    ================================================= */
    const bookingIntent =
      clean.includes("book") ||
      clean.includes("appointment") ||
      clean.includes("schedule") ||
      clean.includes("call") ||
      clean.includes("slot") ||
      clean.includes("time") ||
      clean.includes("aaj") ||
      clean.includes("kal") ||
      clean.includes("baje");

    const curiosityIntent =
      clean.includes("price") ||
      clean.includes("cost") ||
      clean.includes("details") ||
      clean.includes("info") ||
      clean.includes("service");

    /* =================================================
    📌 STATE CHECK
    ================================================= */
    const state = await getConversationState(leadId);

    const bookingActive =
      state?.state === "BOOKING_SELECTION" ||
      state?.state === "BOOKING_CONFIRMATION" ||
      state?.state === "RESCHEDULE_FLOW";

    /* =================================================
    🔥 STEP 1: TRY BOOKING (ONLY IF NEEDED)
    ================================================= */
    if (bookingIntent || bookingActive) {
      const bookingReply = await bookingPriorityRouter({
        businessId,
        leadId,
        message,
        plan,
      });

      if (bookingReply) {
        return bookingReply;
      }
      // ❗ NO return null here → fallback continue
    }

    /* =================================================
    🤖 STEP 2: AUTOMATION
    ================================================= */
    const automationReply = await runAutomationEngine({
      businessId,
      leadId,
      message,
    });

    if (automationReply) {
      return automationReply;
    }

    /* =================================================
    🧠 STEP 3: AI RESPONSE (ALWAYS RESPOND)
    ================================================= */
    const aiReply = await routeAIMessage({
      businessId,
      leadId,
      message,
      plan,
    });

    if (!aiReply) {
      return "Got it 👍 How can I help you?";
    }

    /* =================================================
    💰 STEP 4: SOFT BOOKING PUSH (ONLY IF RELEVANT)
    ================================================= */
    if (curiosityIntent && !bookingActive) {
      return (
        aiReply +
        "\n\n👉 If you'd like, I can also check available slots for you 👍"
      );
    }

    return aiReply;

  } catch (error) {
    console.error("EXECUTION ROUTER ERROR:", error);
    return "Something went wrong.";
  }
};