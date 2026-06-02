import { Router, type NextFunction, type Request, type Response } from "express";
import { BillingController } from "../controllers/billing.controller";
import { protect } from "../middleware/auth.middleware";
import { attachBillingContext } from "../middleware/subscription.middleware";
import { requireBusinessContext } from "../middleware/tenant.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { auditRequest } from "../middleware/audit.middleware";
import { forbidden, unauthorized } from "../utils/AppError";
import { hasPermission } from "../services/rbac.service";
import { getRequestBusinessId } from "../services/tenant.service";
import { evaluateReadOnlyAccessFastPath } from "../services/security/securityGovernanceOS.service";

const router = Router();

const requireInstantCheckoutAccess = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
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
    return next(unauthorized("Unauthorized"));
  }

  if (!hasPermission(principal, "billing:manage")) {
    return next(forbidden("Insufficient permissions"));
  }

  const businessId = getRequestBusinessId(req);
  const fastPathVerdict = evaluateReadOnlyAccessFastPath({
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
    return next(forbidden(`Access denied (${fastPathVerdict.reason})`));
  }

  return next();
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
  attachBillingContext,
  auditRequest("billing.checkout_requested"),
  BillingController.createCheckoutSession
);
router.get(
  "/checkout/start",
  protect,
  requireBusinessContext,
  requirePermission("billing:manage"),
  attachBillingContext,
  auditRequest("billing.checkout_requested"),
  BillingController.startCheckoutRedirect
);
router.get(
  "/checkout/instant",
  protect,
  requireBusinessContext,
  requireInstantCheckoutAccess,
  BillingController.instantCheckout
);
router.post(
  "/checkout/instant",
  protect,
  requireBusinessContext,
  requireInstantCheckoutAccess,
  BillingController.instantCheckout
);
router.post(
  "/checkout",
  protect,
  requireBusinessContext,
  requirePermission("billing:manage"),
  attachBillingContext,
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
