import { Router } from "express";
import { testAI } from "../controllers/ai.controller";
import { protect } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/planFeature.middleware";

const router = Router();

router.post(
  "/test",
  protect,
  requireFeature("AI_CHAT"),
  testAI
);

export default router;