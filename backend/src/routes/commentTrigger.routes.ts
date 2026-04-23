import { Router } from "express";
import {
  createCommentTrigger,
  deleteCommentTrigger,
  getCommentTriggers,
  toggleCommentTrigger,
  updateCommentTrigger,
} from "../controllers/commentTrigger.controller";
import { protect } from "../middleware/auth.middleware";
import { auditRequest } from "../middleware/audit.middleware";
import { requireFeature } from "../middleware/planFeature.middleware";

const router = Router();

router.use(protect);

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

router.patch(
  "/:id",
  requireFeature("INSTAGRAM_COMMENT_AUTOMATION"),
  auditRequest("automation.comment_trigger_updated"),
  updateCommentTrigger
);

router.patch(
  "/:id/toggle",
  requireFeature("INSTAGRAM_COMMENT_AUTOMATION"),
  auditRequest("automation.comment_trigger_toggled"),
  toggleCommentTrigger
);

export default router;
