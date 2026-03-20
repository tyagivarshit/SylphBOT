import { Router } from "express";
import { BillingController } from "../controllers/billing.controller";
import { protect } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimit.middleware";
import { requireActiveSubscription } from "../middleware/subscription.middleware";

const router = Router();

/* ======================================
GET CURRENT BILLING
====================================== */

router.get("/", protect, BillingController.getBilling);

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
  requireActiveSubscription,
  BillingController.createPortal
);

/* ======================================
CANCEL SUBSCRIPTION
====================================== */

router.post(
  "/cancel",
  protect,
  requireActiveSubscription,
  BillingController.cancelSubscription
);

export default router;