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
const getCheckoutStartContext = (req) => ({
    requestId: String(req?.requestId || "").trim() || null,
    method: req.method,
    path: req.originalUrl,
    userId: String(req.user?.id || "").trim() || null,
    businessId: String(req?.tenant?.businessId || req.user?.businessId || "").trim() || null,
});
const logStartRouteEntered = (req, _res, next) => {
    console.info("[START 1] route entered", getCheckoutStartContext(req));
    next();
};
const logStartAuthResolved = (req, _res, next) => {
    console.info("[START 2] auth resolved", getCheckoutStartContext(req));
    next();
};
const logStartLockAcquired = (req, _res, next) => {
    console.info("[START 3] lock acquired", {
        ...getCheckoutStartContext(req),
        lockType: "auth_limiter_redis_gate",
        note: "authLimiter middleware completed",
    });
    next();
};
/* ======================================
GET ALL PLANS
====================================== */
router.get("/plans", billing_controller_1.BillingController.getPlans);
/* ======================================
GET CURRENT BILLING
====================================== */
router.get("/", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:view"), billing_controller_1.BillingController.getBilling);
router.get("/current", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:view"), billing_controller_1.BillingController.getBilling);
/* ======================================
CHECKOUT
====================================== */
router.post("/create-checkout-session", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), rateLimit_middleware_1.authLimiter, (0, audit_middleware_1.auditRequest)("billing.checkout_requested"), billing_controller_1.BillingController.createCheckoutSession);
router.get("/checkout/start", logStartRouteEntered, auth_middleware_1.protect, logStartAuthResolved, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), rateLimit_middleware_1.authLimiter, logStartLockAcquired, (0, audit_middleware_1.auditRequest)("billing.checkout_requested"), billing_controller_1.BillingController.startCheckoutRedirect);
router.post("/checkout", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), rateLimit_middleware_1.authLimiter, (0, audit_middleware_1.auditRequest)("billing.checkout_requested"), billing_controller_1.BillingController.checkout);
router.get("/checkout/confirm", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), billing_controller_1.BillingController.confirmCheckout);
/* ======================================
UPGRADE PLAN
====================================== */
router.post("/upgrade", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), rateLimit_middleware_1.authLimiter, (0, audit_middleware_1.auditRequest)("billing.upgrade_requested"), billing_controller_1.BillingController.upgradePlan);
router.post("/portal", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), billing_controller_1.BillingController.createPortal);
/* ======================================
CANCEL SUBSCRIPTION
====================================== */
router.post("/cancel", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), subscription_middleware_1.attachBillingContext, (0, audit_middleware_1.auditRequest)("billing.cancel_requested"), billing_controller_1.BillingController.cancelSubscription);
exports.default = router;
