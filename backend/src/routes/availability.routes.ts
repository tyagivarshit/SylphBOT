import { Router } from "express";
import {
  createAvailabilityController,
  getAvailabilityController,
  updateAvailabilityController,
  deleteAvailabilityController,
} from "../controllers/availabilty.controller"
import { protect } from "../middleware/auth.middleware";

const router = Router();

/*
=====================================================
CREATE AVAILABILITY
=====================================================
*/
router.post("/", protect, createAvailabilityController);

/*
=====================================================
GET AVAILABILITY (BY BUSINESS)
=====================================================
*/
router.get("/:businessId", protect, getAvailabilityController);

/*
=====================================================
UPDATE AVAILABILITY
=====================================================
*/
router.put("/:id", protect, updateAvailabilityController);

/*
=====================================================
DELETE AVAILABILITY
=====================================================
*/
router.delete("/:id", protect, deleteAvailabilityController);

/*
=====================================================
TOGGLE ACTIVE / INACTIVE (IMPORTANT)
=====================================================
*/
router.patch("/:id/toggle", protect, updateAvailabilityController);

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