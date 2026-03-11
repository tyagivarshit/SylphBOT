import { Router } from "express";
import {
  createCommentTrigger,
  getCommentTriggers,
  deleteCommentTrigger,
} from "../controllers/commentTrigger.controller";
import { protect } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/planFeature.middleware";

const router = Router();

/* ------------------------------
AUTH
------------------------------ */

router.use(protect);

/* ------------------------------
COMMENT AUTOMATION (BASIC PLAN)
------------------------------ */

router.post(
  "/",
  requireFeature("COMMENT_AUTOMATION"),
  createCommentTrigger
);

router.get(
  "/",
  requireFeature("COMMENT_AUTOMATION"),
  getCommentTriggers
);

router.delete(
  "/:id",
  requireFeature("COMMENT_AUTOMATION"),
  deleteCommentTrigger
);

export default router;