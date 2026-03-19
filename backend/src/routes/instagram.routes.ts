import { Router } from "express";
import { getInstagramMedia } from "../controllers/instagram.controller";
import { protect } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/planFeature.middleware";

const router = Router();

/* AUTH */

router.use(protect);

/* ROUTES */

router.get(
  "/media",
  requireFeature("INSTAGRAM_COMMENT_AUTOMATION"), // 🔥 restrict access if needed
  getInstagramMedia
);

export default router;