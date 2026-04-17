import { Router } from "express";
import { getSalesBlueprint, testAI } from "../controllers/ai.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/sales-agent/blueprint",
  protect,
  getSalesBlueprint
);

router.post(
  "/sales-agent/preview",
  protect,
  testAI
);

router.post(
  "/test",
  protect,
  testAI
);

export default router;
