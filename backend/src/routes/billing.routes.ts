import { Router } from "express";
import { BillingController } from "../controllers/billing.controller";
import { protect } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimit.middleware";
import { attachBillingContext } from "../middleware/subscription.middleware";

const router = Router();

/* ======================================
GET ALL PLANS
====================================== */

router.get("/plans", BillingController.getPlans);

/* ======================================
GET CURRENT BILLING
====================================== */

router.get("/", protect, attachBillingContext, BillingController.getBilling);

/* ======================================
CHECKOUT
====================================== */

router.post(
  "/checkout",
  protect,
  authLimiter,
  BillingController.checkout
);

/* ======================================
UPGRADE PLAN
====================================== */

router.post(
  "/upgrade",
  protect,
  authLimiter,
  BillingController.upgradePlan
);

/* ======================================
BILLING PORTAL
====================================== */

router.post(
  "/portal",
  protect,
  attachBillingContext,
  BillingController.createPortal
);

/* ======================================
CANCEL SUBSCRIPTION
====================================== */

router.post(
  "/cancel",
  protect,
  attachBillingContext,
  BillingController.cancelSubscription
);

export default router;