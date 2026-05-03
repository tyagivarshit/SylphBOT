import { Router } from "express";
import { BillingController } from "../controllers/billing.controller";
import { protect } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimit.middleware";
import { attachBillingContext } from "../middleware/subscription.middleware";
import { requireBusinessContext } from "../middleware/tenant.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { auditRequest } from "../middleware/audit.middleware";

const router = Router();

/* ======================================
GET ALL PLANS
====================================== */

router.get("/plans", BillingController.getPlans);

/* ======================================
GET CURRENT BILLING
====================================== */

router.get(
  "/",
  protect,
  requireBusinessContext,
  requirePermission("billing:view"),
  BillingController.getBilling
);
router.get(
  "/current",
  protect,
  requireBusinessContext,
  requirePermission("billing:view"),
  BillingController.getBilling
);

/* ======================================
CHECKOUT
====================================== */

router.post(
  "/create-checkout-session",
  protect,
  requireBusinessContext,
  requirePermission("billing:manage"),
  authLimiter,
  auditRequest("billing.checkout_requested"),
  BillingController.createCheckoutSession
);
router.post(
  "/checkout",
  protect,
  requireBusinessContext,
  requirePermission("billing:manage"),
  authLimiter,
  auditRequest("billing.checkout_requested"),
  BillingController.checkout
);
router.get(
  "/checkout/confirm",
  protect,
  requireBusinessContext,
  requirePermission("billing:manage"),
  BillingController.confirmCheckout
);

/* ======================================
UPGRADE PLAN
====================================== */

router.post(
  "/upgrade",
  protect,
  requireBusinessContext,
  requirePermission("billing:manage"),
  authLimiter,
  auditRequest("billing.upgrade_requested"),
  BillingController.upgradePlan
);

router.post(
  "/portal",
  protect,
  requireBusinessContext,
  requirePermission("billing:manage"),
  BillingController.createPortal
);

/* ======================================
CANCEL SUBSCRIPTION
====================================== */

router.post(
  "/cancel",
  protect,
  requireBusinessContext,
  requirePermission("billing:manage"),
  attachBillingContext,
  auditRequest("billing.cancel_requested"),
  BillingController.cancelSubscription
);

export default router;
