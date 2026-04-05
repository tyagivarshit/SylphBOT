"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingAIHandler = void 0;
const aiBookingEngine_service_1 = require("../services/aiBookingEngine.service");
const conversationState_service_1 = require("../services/conversationState.service");
const booking_ai_utils_1 = require("../utils/booking-ai.utils");
/*
=====================================================
MAIN AI BOOKING HANDLER (FIXED - SINGLE SOURCE LOGIC)
- no duplicate booking logic
- uses aiBookingEngine as single source
- safe + production ready
=====================================================
*/
const bookingAIHandler = async ({ businessId, leadId, message, }) => {
    try {
        /* -------------------------------------------- */
        /* SAFETY CHECK */
        /* -------------------------------------------- */
        if (!businessId || !leadId || !message) {
            throw new Error("Missing required fields in bookingAIHandler");
        }
        const cleanMessage = message.trim();
        const lower = cleanMessage.toLowerCase();
        /* -------------------------------------------- */
        /* STATE */
        /* -------------------------------------------- */
        const state = await (0, conversationState_service_1.getConversationState)(leadId);
        /* -------------------------------------------- */
        /* 🔥 ACTIVE BOOKING FLOW (MOST IMPORTANT)
        -------------------------------------------- */
        if (state?.state === "BOOKING_SELECTION" ||
            state?.state === "BOOKING_CONFIRMATION") {
            const result = await (0, aiBookingEngine_service_1.handleAIBookingIntent)(businessId, leadId, cleanMessage);
            return result.message;
        }
        /* -------------------------------------------- */
        /* SMART DATE + TIME UNDERSTANDING
        -------------------------------------------- */
        const parsedDate = (0, booking_ai_utils_1.parseDateFromText)(cleanMessage);
        const parsedTime = (0, booking_ai_utils_1.parseTimeFromText)(cleanMessage);
        if (parsedDate && parsedTime) {
            const result = await (0, aiBookingEngine_service_1.handleAIBookingIntent)(businessId, leadId, cleanMessage);
            return result.message;
        }
        /* -------------------------------------------- */
        /* INTENT DETECTION
        -------------------------------------------- */
        const bookingKeywords = [
            "book",
            "appointment",
            "schedule",
            "call",
            "meeting",
            "slot",
            "available",
            "free time",
        ];
        const rescheduleKeywords = [
            "reschedule",
            "change time",
            "move",
        ];
        const cancelKeywords = [
            "cancel",
            "delete booking",
        ];
        /* BOOKING */
        if (bookingKeywords.some((k) => lower.includes(k))) {
            const result = await (0, aiBookingEngine_service_1.handleAIBookingIntent)(businessId, leadId, cleanMessage);
            return result.message;
        }
        /* RESCHEDULE */
        if (rescheduleKeywords.some((k) => lower.includes(k))) {
            await (0, conversationState_service_1.clearConversationState)(leadId);
            return "Sure 👍 Tell me your preferred new date & time.";
        }
        /* CANCEL */
        if (cancelKeywords.some((k) => lower.includes(k))) {
            const result = await (0, aiBookingEngine_service_1.handleAIBookingIntent)(businessId, leadId, cleanMessage);
            return result.message;
        }
        /* -------------------------------------------- */
        /* FALLBACK
        -------------------------------------------- */
        return null;
    }
    catch (error) {
        console.error("BOOKING AI HANDLER ERROR:", error);
        return "Something went wrong while booking.";
    }
};
exports.bookingAIHandler = bookingAIHandler;
