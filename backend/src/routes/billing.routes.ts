import { Router } from "express";
import { BillingController } from "../controllers/billing.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/checkout", protect, BillingController.checkout);

export default router;