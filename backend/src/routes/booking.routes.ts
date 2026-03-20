import { Router } from "express";
import {
  getAvailableSlots,
  createAppointment,
  cancelAppointment,
  rescheduleAppointmentController,
} from "../controllers/booking.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

/*
=====================================================
GET AVAILABLE SLOTS
=====================================================
*/
router.get("/slots/:businessId", protect, getAvailableSlots);

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
GET ALL BOOKINGS (IMPORTANT FOR DASHBOARD)
=====================================================
*/
router.get("/list/:businessId", protect, async (req, res) => {
  try {
    const businessId = req.params.businessId;

    const bookings = await req.app.locals.prisma.appointment.findMany({
      where: { businessId },
      orderBy: { startTime: "asc" },
    });

    res.status(200).json({
      success: true,
      bookings,
    });
  } catch (error: any) {
    console.error("GET BOOKINGS ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch bookings",
    });
  }
});

/*
=====================================================
HEALTH CHECK
=====================================================
*/
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Booking service running",
  });
});

export default router;