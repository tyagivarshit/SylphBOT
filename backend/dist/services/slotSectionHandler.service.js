"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSlotSelection = void 0;
const conversationState_service_1 = require("./conversationState.service");
const slotLock_service_1 = require("./slotLock.service");
/*
=====================================================
SLOT SELECTION HANDLER (FINAL FIXED 🔥)
=====================================================
*/
const handleSlotSelection = async ({ leadId, businessId, message, }) => {
    try {
        /* ---------------- GET STATE ---------------- */
        const state = await (0, conversationState_service_1.getConversationState)(leadId);
        if (!state || state.state !== "BOOKING_SELECTION") {
            return null;
        }
        /* ---------------- FIX: CORRECT CONTEXT ---------------- */
        const context = state.context || {};
        const slots = context.slots || [];
        if (!slots.length) {
            await (0, conversationState_service_1.clearConversationState)(leadId);
            return "No slots available anymore.";
        }
        const clean = message.toLowerCase();
        /* ---------------- CHANGE HANDLING ---------------- */
        if (clean.includes("change")) {
            await (0, conversationState_service_1.clearConversationState)(leadId);
            return "No problem 👍 Please choose another slot.";
        }
        /* ---------------- SMART PARSING ---------------- */
        let index = null;
        const numeric = parseInt(clean.replace(/\D/g, ""));
        if (!isNaN(numeric))
            index = numeric - 1;
        if (clean.includes("first"))
            index = 0;
        if (clean.includes("second"))
            index = 1;
        if (clean.includes("third"))
            index = 2;
        if (clean.includes("last"))
            index = slots.length - 1;
        if (index === null || index < 0 || index >= slots.length) {
            return `Please select a valid option (1-${slots.length}).`;
        }
        const selectedSlotISO = slots[index];
        const selectedSlot = new Date(selectedSlotISO);
        /* ---------------- VALIDATION ---------------- */
        if (isNaN(selectedSlot.getTime())) {
            await (0, conversationState_service_1.clearConversationState)(leadId);
            return "Invalid slot selected. Please try again.";
        }
        if (selectedSlot.getTime() <= Date.now()) {
            return "That slot is no longer available.";
        }
        /* =====================================================
        🔒 SLOT LOCK
        ===================================================== */
        const slotLock = await (0, slotLock_service_1.acquireSlotLock)(selectedSlotISO, leadId);
        if (!slotLock) {
            return "⚠️ This slot was just booked by someone else. Please choose another one.";
        }
        /* =====================================================
        🔥 MOVE TO CONFIRMATION STATE (FIXED)
        ===================================================== */
        await (0, conversationState_service_1.setConversationState)(leadId, "BOOKING_CONFIRMATION", {
            context: {
                slot: selectedSlotISO,
                slotLockToken: slotLock.token,
            },
        });
        /* ---------------- RESPONSE ---------------- */
        return `Great choice 👍

📅 ${selectedSlot.toLocaleString()}

Just reply "YES" to confirm your booking  
or "CHANGE" to pick another slot.`;
    }
    catch (error) {
        console.error("SLOT SELECTION ERROR:", error);
        return "Failed to process your selection. Please try again.";
    }
};
exports.handleSlotSelection = handleSlotSelection;
