import { Router } from "express";
import {
getAvailableSlots,
createAppointment,
cancelAppointment,
} from "../controllers/booking.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

/*
GET AVAILABLE SLOTS
*/
router.get("/slots/:businessId", protect, getAvailableSlots);

/*
CREATE APPOINTMENT
*/
router.post("/appointment", protect, createAppointment);

/*
CANCEL APPOINTMENT
*/
router.delete("/appointment/:appointmentId", protect, cancelAppointment);

export default router;
