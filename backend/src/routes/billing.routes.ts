import { Router } from "express";
import { BillingController } from "../controllers/billing.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

/* ======================================
GET CURRENT BILLING
====================================== */

router.get("/", protect, BillingController.getBilling);

/* ======================================
CHECKOUT
====================================== */

router.post("/checkout", protect, BillingController.checkout);

/* ======================================
UPGRADE PLAN
====================================== */

router.post("/upgrade", protect, BillingController.upgradePlan);

/* ======================================
BILLING PORTAL
====================================== */

router.post("/portal", protect, BillingController.createPortal);

/* ======================================
CANCEL SUBSCRIPTION
====================================== */

router.post("/cancel", protect, BillingController.cancelSubscription);

export default router;