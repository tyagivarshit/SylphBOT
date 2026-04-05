"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ai_booking_controller_1 = require("../controllers/ai-booking.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
/*
=====================================================
AI BOOKING INTENT
=====================================================
*/
router.post("/intent", auth_middleware_1.protect, ai_booking_controller_1.handleAIBooking);
/*
=====================================================
AI BOOKING CONFIRM
=====================================================
*/
router.post("/confirm", auth_middleware_1.protect, ai_booking_controller_1.confirmAIBookingController);
/*
=====================================================
HEALTH CHECK (IMPORTANT FOR DEBUG)
=====================================================
*/
router.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "AI Booking service running",
    });
});
exports.default = router;
