"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const billing_controller_1 = require("../controllers/billing.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const subscription_middleware_1 = require("../middleware/subscription.middleware");
const tenant_middleware_1 = require("../middleware/tenant.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const audit_middleware_1 = require("../middleware/audit.middleware");
const AppError_1 = require("../utils/AppError");
const rbac_service_1 = require("../services/rbac.service");
const tenant_service_1 = require("../services/tenant.service");
const securityGovernanceOS_service_1 = require("../services/security/securityGovernanceOS.service");
const router = (0, express_1.Router)();
const requireInstantCheckoutAccess = (req, _res, next) => {
    const principal = req.apiKey
        ? {
            permissions: req.apiKey.permissions,
        }
        : req.user
            ? {
                role: req.user.role,
            }
            : null;
    if (!principal) {
        return next((0, AppError_1.unauthorized)("Unauthorized"));
    }
    if (!(0, rbac_service_1.hasPermission)(principal, "billing:manage")) {
        return next((0, AppError_1.forbidden)("Insufficient permissions"));
    }
    const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
    const fastPathVerdict = (0, securityGovernanceOS_service_1.evaluateReadOnlyAccessFastPath)({
        action: "billing:manage",
        businessId,
        tenantId: businessId,
        actorId: req.user?.id || req.apiKey?.id || null,
        actorType: req.apiKey ? "API_KEY" : "USER",
        role: req.user?.role || null,
        permissions: req.apiKey?.permissions || null,
        scopes: req.apiKey?.scopes || null,
        resourceTenantId: businessId,
        metadata: {
            route: req.originalUrl,
            method: req.method,
            requestId: req.requestId || null,
            hotPath: "billing.checkout.instant",
        },
    });
    if (!fastPathVerdict.allowed) {
        return next((0, AppError_1.forbidden)(`Access denied (${fastPathVerdict.reason})`));
    }
    return next();
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
router.post("/create-checkout-session", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), subscription_middleware_1.attachBillingContext, (0, audit_middleware_1.auditRequest)("billing.checkout_requested"), billing_controller_1.BillingController.createCheckoutSession);
router.get("/checkout/start", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), subscription_middleware_1.attachBillingContext, (0, audit_middleware_1.auditRequest)("billing.checkout_requested"), billing_controller_1.BillingController.startCheckoutRedirect);
router.get("/checkout/instant", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, requireInstantCheckoutAccess, billing_controller_1.BillingController.instantCheckout);
router.post("/checkout/instant", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, requireInstantCheckoutAccess, billing_controller_1.BillingController.instantCheckout);
router.post("/checkout", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), subscription_middleware_1.attachBillingContext, (0, audit_middleware_1.auditRequest)("billing.checkout_requested"), billing_controller_1.BillingController.checkout);
router.get("/checkout/confirm", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), billing_controller_1.BillingController.confirmCheckout);
/* ======================================
UPGRADE PLAN
====================================== */
router.post("/upgrade", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), (0, audit_middleware_1.auditRequest)("billing.upgrade_requested"), billing_controller_1.BillingController.upgradePlan);
router.post("/portal", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), billing_controller_1.BillingController.createPortal);
/* ======================================
CANCEL SUBSCRIPTION
====================================== */
router.post("/cancel", auth_middleware_1.protect, tenant_middleware_1.requireBusinessContext, (0, rbac_middleware_1.requirePermission)("billing:manage"), subscription_middleware_1.attachBillingContext, (0, audit_middleware_1.auditRequest)("billing.cancel_requested"), billing_controller_1.BillingController.cancelSubscription);
exports.default = router;
