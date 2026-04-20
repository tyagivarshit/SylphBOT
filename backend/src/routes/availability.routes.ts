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

/*
=====================================================
CREATE AVAILABILITY
=====================================================
*/
router.post("/", protect, subscriptionGuard, createAvailabilityController);

/*
=====================================================
🔥 GET AVAILABILITY BY BUSINESS ID (FIXED)
=====================================================
*/
router.get("/:businessId", getAvailabilityController);

/*
=====================================================
UPDATE AVAILABILITY
=====================================================
*/
router.put("/:id", protect, subscriptionGuard, updateAvailabilityController);

/*
=====================================================
DELETE AVAILABILITY
=====================================================
*/
router.delete("/:id", protect, subscriptionGuard, deleteAvailabilityController);

/*
=====================================================
TOGGLE ACTIVE / INACTIVE
=====================================================
*/
router.patch("/:id/toggle", protect, subscriptionGuard, updateAvailabilityController);

/*
=====================================================
HEALTH CHECK
=====================================================
*/
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Availability service running",
  });
});

export default router;
