import { NextFunction, Request, Response, Router } from "express";
import { BillingController } from "../controllers/billing.controller";
import { protect } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimit.middleware";
import { attachBillingContext } from "../middleware/subscription.middleware";
import { requireBusinessContext } from "../middleware/tenant.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { auditRequest } from "../middleware/audit.middleware";

const router = Router();

const getCheckoutStartContext = (req: Request) => ({
  requestId: String((req as any)?.requestId || "").trim() || null,
  method: req.method,
  path: req.originalUrl,
  userId: String(req.user?.id || "").trim() || null,
  businessId:
    String((req as any)?.tenant?.businessId || req.user?.businessId || "").trim() || null,
});

const logStartRouteEntered = (req: Request, _res: Response, next: NextFunction) => {
  console.info("[START 1] route entered", getCheckoutStartContext(req));
  next();
};

const logStartAuthResolved = (req: Request, _res: Response, next: NextFunction) => {
  console.info("[START 2] auth resolved", getCheckoutStartContext(req));
  next();
};

const logStartLockAcquired = (req: Request, _res: Response, next: NextFunction) => {
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
router.get(
  "/checkout/start",
  logStartRouteEntered,
  protect,
  logStartAuthResolved,
  requireBusinessContext,
  requirePermission("billing:manage"),
  authLimiter,
  logStartLockAcquired,
  auditRequest("billing.checkout_requested"),
  BillingController.startCheckoutRedirect
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
