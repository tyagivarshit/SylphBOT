import { Router } from "express";
import { BillingController } from "../controllers/billing.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

/* ============================= */
/* CHECKOUT (BUY PLAN) */
/* ============================= */

router.post("/checkout", protect, BillingController.checkout);

/* ============================= */
/* BILLING PORTAL (UPGRADE / DOWNGRADE / CARD UPDATE) */
/* ============================= */

router.post("/portal", protect, BillingController.createPortal);

/* ============================= */
/* CANCEL SUBSCRIPTION */
/* ============================= */

router.post("/cancel", protect, BillingController.cancelSubscription);

export default router;