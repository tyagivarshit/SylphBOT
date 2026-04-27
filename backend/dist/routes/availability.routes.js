"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const availabilty_controller_1 = require("../controllers/availabilty.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
const router = (0, express_1.Router)();
router.post("/", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, availabilty_controller_1.createAvailabilityController);
router.get("/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Availability service running",
    });
});
router.get("/:businessId", availabilty_controller_1.getAvailabilityController);
router.put("/:id", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, availabilty_controller_1.updateAvailabilityController);
router.delete("/:id", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, availabilty_controller_1.deleteAvailabilityController);
router.patch("/:id/toggle", auth_middleware_1.protect, subscriptionGuard_middleware_1.subscriptionGuard, availabilty_controller_1.updateAvailabilityController);
exports.default = router;
