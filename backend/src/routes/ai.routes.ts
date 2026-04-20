import { Router } from "express";
import { getSalesBlueprint, testAI } from "../controllers/ai.controller";
import { protect } from "../middleware/auth.middleware";
import { subscriptionGuard } from "../middleware/subscriptionGuard.middleware";

const router = Router();

router.get(
  "/sales-agent/blueprint",
  protect,
  subscriptionGuard,
  getSalesBlueprint
);

router.post(
  "/sales-agent/preview",
  protect,
  subscriptionGuard,
  testAI
);

router.post(
  "/test",
  protect,
  subscriptionGuard,
  testAI
);

export default router;
