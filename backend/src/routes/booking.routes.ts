import { Router } from "express";
import {
  getAvailableSlots,
  createAppointment,
  cancelAppointment,
  rescheduleAppointmentController,
  listAppointments,
} from "../controllers/booking.controller";
import { protect } from "../middleware/auth.middleware";
import { subscriptionGuard } from "../middleware/subscriptionGuard.middleware";

const router = Router();

router.use(protect);
router.use(subscriptionGuard);

router.get("/slots/:businessId", getAvailableSlots);
router.post("/appointment", createAppointment);
router.put("/appointment/:appointmentId/reschedule", rescheduleAppointmentController);
router.delete("/appointment/:appointmentId", cancelAppointment);
router.get("/list", listAppointments);

export default router;
