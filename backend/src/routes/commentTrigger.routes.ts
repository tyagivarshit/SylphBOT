import { Router } from "express";
import {
  createCommentTrigger,
  getCommentTriggers,
  deleteCommentTrigger,
  toggleCommentTrigger, // ✅ ADD
} from "../controllers/commentTrigger.controller";

import { protect } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/planFeature.middleware";
import { auditRequest } from "../middleware/audit.middleware";

const router = Router();

/* ---------------- AUTH ---------------- */

router.use(protect);

/* ---------------- ROUTES ---------------- */

router.post(
  "/",
  requireFeature("INSTAGRAM_COMMENT_AUTOMATION"),
  auditRequest("automation.comment_trigger_created"),
  createCommentTrigger
);

router.get(
  "/",
  requireFeature("INSTAGRAM_COMMENT_AUTOMATION"),
  getCommentTriggers
);

router.delete(
  "/:id",
  requireFeature("INSTAGRAM_COMMENT_AUTOMATION"),
  auditRequest("automation.comment_trigger_deleted"),
  deleteCommentTrigger
);

/* 🔥 TOGGLE ROUTE (NEW) */

router.patch(
  "/:id/toggle",
  requireFeature("INSTAGRAM_COMMENT_AUTOMATION"),
  auditRequest("automation.comment_trigger_toggled"),
  toggleCommentTrigger
);

export default router;
