import { Router } from "express";
import {
  createAvailabilityController,
  getAvailabilityController,
  updateAvailabilityController,
  deleteAvailabilityController,
} from "../controllers/availabilty.controller";
import { protect } from "../middleware/auth.middleware";
import { subscriptionGuard } from "../middleware/subscriptionGuard.middleware";

const router = Router();

router.post("/", protect, subscriptionGuard, createAvailabilityController);

router.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Availability service running",
  });
});

router.get("/:businessId", getAvailabilityController);
router.put("/:id", protect, subscriptionGuard, updateAvailabilityController);
router.delete("/:id", protect, subscriptionGuard, deleteAvailabilityController);
router.patch("/:id/toggle", protect, subscriptionGuard, updateAvailabilityController);

export default router;
