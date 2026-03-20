import { Router } from "express";
import {
  handleAIBooking,
  confirmAIBookingController,
} from "../controllers/ai-booking.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

/*
=====================================================
AI BOOKING INTENT
=====================================================
*/
router.post("/intent", protect, handleAIBooking);

/*
=====================================================
AI BOOKING CONFIRM
=====================================================
*/
router.post("/confirm", protect, confirmAIBookingController);

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

export default router;