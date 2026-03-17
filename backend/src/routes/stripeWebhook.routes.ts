import { Router } from "express";
import { stripeWebhook } from "../controllers/stripeWebhook.controller";

const router = Router();

/* STRIPE WEBHOOK */
router.post("/", stripeWebhook);

export default router;