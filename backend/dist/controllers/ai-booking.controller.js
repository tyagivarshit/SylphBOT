"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmAIBookingController = exports.handleAIBooking = void 0;
const aiBookingEngine_service_1 = require("../services/aiBookingEngine.service");
/*
=====================================================
HANDLE AI BOOKING INTENT
=====================================================
*/
const handleAIBooking = async (req, res) => {
    try {
        const { businessId, leadId, message } = req.body;
        /* VALIDATION */
        if (!businessId || !leadId || !message) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }
        if (typeof message !== "string" || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid message input",
            });
        }
        const result = await (0, aiBookingEngine_service_1.handleAIBookingIntent)(businessId, leadId, message.trim());
        return res.status(200).json({
            success: true,
            handled: result.handled,
            message: result.message,
            slots: result.slots || [],
        });
    }
    catch (error) {
        console.error("AI BOOKING INTENT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to process AI booking",
        });
    }
};
exports.handleAIBooking = handleAIBooking;
/*
=====================================================
CONFIRM AI BOOKING (FROM SLOT SELECTION)
=====================================================
*/
const confirmAIBookingController = async (req, res) => {
    try {
        const { businessId, leadId, slot } = req.body;
        /* VALIDATION */
        if (!businessId || !leadId || !slot) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }
        const parsedSlot = new Date(slot);
        if (isNaN(parsedSlot.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid slot format",
            });
        }
        if (parsedSlot < new Date()) {
            return res.status(400).json({
                success: false,
                message: "Cannot book past time slot",
            });
        }
        const result = await (0, aiBookingEngine_service_1.confirmAIBooking)(businessId, leadId, parsedSlot);
        return res.status(200).json({
            success: result.success,
            message: result.message,
            appointment: result.appointment || null,
        });
    }
    catch (error) {
        console.error("AI BOOKING CONFIRM ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to confirm AI booking",
        });
    }
};
exports.confirmAIBookingController = confirmAIBookingController;
