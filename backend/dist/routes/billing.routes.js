"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const billing_controller_1 = require("../controllers/billing.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const subscription_middleware_1 = require("../middleware/subscription.middleware");
const tenant_middleware_1 = require("../middleware/tenant.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const audit_middleware_1 = require("../middleware/audit.middleware");
const router = (0, express_1.Router)();
/* ======================================
GET ALL PLANS
====================================== */
router.get("/plans", billing_controller_1.BillingController.getPlans);
/* ======================================
GET CURRENT BILLING
====================================== */
router.get("/", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:view"), subscription_middleware_1.attachBillingContext, billing_controller_1.BillingController.getBilling);
router.get("/current", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:view"), subscription_middleware_1.attachBillingContext, billing_controller_1.BillingController.getBilling);
/* ======================================
CHECKOUT
====================================== */
router.post("/create-checkout-session", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), rateLimit_middleware_1.authLimiter, (0, audit_middleware_1.auditRequest)("billing.checkout_requested"), billing_controller_1.BillingController.createCheckoutSession);
router.post("/checkout", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), rateLimit_middleware_1.authLimiter, (0, audit_middleware_1.auditRequest)("billing.checkout_requested"), billing_controller_1.BillingController.checkout);
router.get("/checkout/confirm", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), billing_controller_1.BillingController.confirmCheckout);
/* ======================================
UPGRADE PLAN
====================================== */
router.post("/upgrade", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), rateLimit_middleware_1.authLimiter, (0, audit_middleware_1.auditRequest)("billing.upgrade_requested"), billing_controller_1.BillingController.upgradePlan);
/* ======================================
BILLING PORTAL
====================================== */
router.post("/portal", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), subscription_middleware_1.attachBillingContext, (0, audit_middleware_1.auditRequest)("billing.portal_requested"), billing_controller_1.BillingController.createPortal);
/* ======================================
CANCEL SUBSCRIPTION
====================================== */
router.post("/cancel", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), subscription_middleware_1.attachBillingContext, (0, audit_middleware_1.auditRequest)("billing.cancel_requested"), billing_controller_1.BillingController.cancelSubscription);
exports.default = router;
