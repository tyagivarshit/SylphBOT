"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const availabilty_controller_1 = require("../controllers/availabilty.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
const router = (0, express_1.Router)();
/*
=====================================================
CREATE AVAILABILITY
=====================================================
*/
router.post("/", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, availabilty_controller_1.createAvailabilityController);
/*
=====================================================
🔥 GET AVAILABILITY BY BUSINESS ID (FIXED)
=====================================================
*/
router.get("/:businessId", availabilty_controller_1.getAvailabilityController);
/*
=====================================================
UPDATE AVAILABILITY
=====================================================
*/
router.put("/:id", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, availabilty_controller_1.updateAvailabilityController);
/*
=====================================================
DELETE AVAILABILITY
=====================================================
*/
router.delete("/:id", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, availabilty_controller_1.deleteAvailabilityController);
/*
=====================================================
TOGGLE ACTIVE / INACTIVE
=====================================================
*/
router.patch("/:id/toggle", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, availabilty_controller_1.updateAvailabilityController);
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
exports.default = router;
