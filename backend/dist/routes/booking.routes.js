"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const booking_controller_1 = require("../controllers/booking.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
const prisma_1 = __importDefault(require("../config/prisma"));
const router = (0, express_1.Router)();
/*
=====================================================
GET AVAILABLE SLOTS
=====================================================
*/
router.get("/slots/:businessId", booking_controller_1.getAvailableSlots);
/*
=====================================================
CREATE APPOINTMENT
=====================================================
*/
router.post("/appointment", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, booking_controller_1.createAppointment);
/*
=====================================================
RESCHEDULE APPOINTMENT
=====================================================
*/
router.put("/appointment/:appointmentId/reschedule", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, booking_controller_1.rescheduleAppointmentController);
/*
=====================================================
CANCEL APPOINTMENT
=====================================================
*/
router.delete("/appointment/:appointmentId", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, booking_controller_1.cancelAppointment);
/*
=====================================================
🔥 GET ALL BOOKINGS (FIXED)
=====================================================
*/
router.get("/list", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "Business ID missing",
            });
        }
        const bookings = await prisma_1.default.appointment.findMany({
            where: { businessId },
            orderBy: { startTime: "asc" },
            select: {
                id: true,
                name: true,
                startTime: true,
                status: true,
            },
        });
        // 🔥 FIX: convert Date → string for frontend stability
        const formattedBookings = bookings.map((b) => ({
            id: b.id,
            name: b.name,
            startTime: b.startTime.toISOString(),
            status: b.status,
        }));
        return res.status(200).json({
            success: true,
            bookings: formattedBookings,
        });
    }
    catch (error) {
        console.error("GET BOOKINGS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch bookings",
        });
    }
});
exports.default = router;
