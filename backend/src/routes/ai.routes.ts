import { Router } from "express";
import { testAI } from "../controllers/ai.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/test", protect, testAI);

export default router;