import { Router } from "express";
import {
  getAvailableSlots,
  createAppointment,
  cancelAppointment,
  rescheduleAppointmentController,
  listAppointments,
  requestAppointmentController,
  holdAppointmentSlotController,
  confirmAppointmentSlotController,
  cancelCanonicalAppointmentController,
  rescheduleCanonicalAppointmentController,
  checkInAppointmentController,
  runningLateController,
  addWaitlistRequestController,
  getAppointmentOpsProjectionController,
  recordAppointmentOutcomeController,
  upsertMeetingArtifactsController,
  replayCalendarSyncWebhookController,
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
router.post("/canonical/request", requestAppointmentController);
router.post("/canonical/:appointmentKey/hold", holdAppointmentSlotController);
router.post("/canonical/:appointmentKey/confirm", confirmAppointmentSlotController);
router.post("/canonical/:appointmentKey/reschedule", rescheduleCanonicalAppointmentController);
router.post("/canonical/:appointmentKey/cancel", cancelCanonicalAppointmentController);
router.post("/canonical/:appointmentKey/check-in", checkInAppointmentController);
router.post("/canonical/:appointmentKey/running-late", runningLateController);
router.post("/canonical/waitlist", addWaitlistRequestController);
router.get("/canonical/ops-projection", getAppointmentOpsProjectionController);
router.post("/canonical/:appointmentKey/outcome", recordAppointmentOutcomeController);
router.post("/canonical/:appointmentKey/artifacts", upsertMeetingArtifactsController);
router.post("/canonical/calendar/replay", replayCalendarSyncWebhookController);

export default router;
