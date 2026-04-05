"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const billing_controller_1 = require("../controllers/billing.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const subscription_middleware_1 = require("../middleware/subscription.middleware");
const router = (0, express_1.Router)();
/* ======================================
GET ALL PLANS
====================================== */
router.get("/plans", billing_controller_1.BillingController.getPlans);
/* ======================================
GET CURRENT BILLING
====================================== */
router.get("/", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, billing_controller_1.BillingController.getBilling);
/* ======================================
CHECKOUT
====================================== */
router.post("/checkout", auth_middleware_1.protect, rateLimit_middleware_1.authLimiter, billing_controller_1.BillingController.checkout);
/* ======================================
UPGRADE PLAN
====================================== */
router.post("/upgrade", auth_middleware_1.protect, rateLimit_middleware_1.authLimiter, billing_controller_1.BillingController.upgradePlan);
/* ======================================
BILLING PORTAL
====================================== */
router.post("/portal", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, billing_controller_1.BillingController.createPortal);
/* ======================================
CANCEL SUBSCRIPTION
====================================== */
router.post("/cancel", auth_middleware_1.protect, subscription_middleware_1.attachBillingContext, billing_controller_1.BillingController.cancelSubscription);
exports.default = router;
