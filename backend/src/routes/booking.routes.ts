import { Router } from "express";
import {
  getAvailableSlots,
  createAppointment,
  cancelAppointment,
  rescheduleAppointmentController,
} from "../controllers/booking.controller";
import { protect } from "../middleware/auth.middleware";
import prisma from "../config/prisma";

const router = Router();

/*
=====================================================
GET AVAILABLE SLOTS
=====================================================
*/
router.get("/slots/:businessId", getAvailableSlots);

/*
=====================================================
CREATE APPOINTMENT
=====================================================
*/
router.post("/appointment", protect, createAppointment);

/*
=====================================================
RESCHEDULE APPOINTMENT
=====================================================
*/
router.put(
  "/appointment/:appointmentId/reschedule",
  protect,
  rescheduleAppointmentController
);

/*
=====================================================
CANCEL APPOINTMENT
=====================================================
*/
router.delete("/appointment/:appointmentId", protect, cancelAppointment);

/*
=====================================================
🔥 GET ALL BOOKINGS (FIXED)
=====================================================
*/
router.get("/list", protect, async (req: any, res) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: "Business ID missing",
      });
    }

    const bookings = await prisma.appointment.findMany({
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

  } catch (error: any) {
    console.error("GET BOOKINGS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch bookings",
    });
  }
});

export default router;