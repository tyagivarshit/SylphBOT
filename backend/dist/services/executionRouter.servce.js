"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleIncomingMessage = void 0;
const humanTakeoverManager_service_1 = require("./humanTakeoverManager.service");
const automationEngine_service_1 = require("./automationEngine.service");
const aiRouter_service_1 = require("./aiRouter.service");
const bookingPriorityRouter_service_1 = require("./bookingPriorityRouter.service");
const conversationState_service_1 = require("./conversationState.service");
/* ================================================= */
const handleIncomingMessage = async (data) => {
    const { businessId, leadId, message, plan } = data;
    try {
        /* ================= HUMAN ================= */
        const human = await (0, humanTakeoverManager_service_1.isHumanActive)(leadId);
        if (human)
            return null;
        const clean = message.toLowerCase();
        /* =================================================
        🧠 INTENT DETECTION
        ================================================= */
        const bookingIntent = clean.includes("book") ||
            clean.includes("appointment") ||
            clean.includes("schedule") ||
            clean.includes("call") ||
            clean.includes("slot") ||
            clean.includes("time") ||
            clean.includes("aaj") ||
            clean.includes("kal") ||
            clean.includes("baje");
        const curiosityIntent = clean.includes("price") ||
            clean.includes("cost") ||
            clean.includes("details") ||
            clean.includes("info") ||
            clean.includes("service");
        /* =================================================
        📌 STATE CHECK
        ================================================= */
        const state = await (0, conversationState_service_1.getConversationState)(leadId);
        const bookingActive = state?.state === "BOOKING_SELECTION" ||
            state?.state === "BOOKING_CONFIRMATION" ||
            state?.state === "RESCHEDULE_FLOW";
        /* =================================================
        🔥 STEP 1: TRY BOOKING (ONLY IF NEEDED)
        ================================================= */
        if (bookingIntent || bookingActive) {
            const bookingReply = await (0, bookingPriorityRouter_service_1.bookingPriorityRouter)({
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
        const automationReply = await (0, automationEngine_service_1.runAutomationEngine)({
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
        const aiReply = await (0, aiRouter_service_1.routeAIMessage)({
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
            return (aiReply +
                "\n\n👉 If you'd like, I can also check available slots for you 👍");
        }
        return aiReply;
    }
    catch (error) {
        console.error("EXECUTION ROUTER ERROR:", error);
        return "Something went wrong.";
    }
};
exports.handleIncomingMessage = handleIncomingMessage;
