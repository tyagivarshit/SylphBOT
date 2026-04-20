import { Router } from "express";
import {
  getConversations,
  getMessagesByLead,
  sendMessage,
  markAsRead,
} from "../controllers/conversation.controller";
import { protect } from "../middleware/auth.middleware";
import { subscriptionGuard } from "../middleware/subscriptionGuard.middleware";

const router = Router();

router.get("/", protect, subscriptionGuard, getConversations);
router.get("/:leadId/messages", protect, subscriptionGuard, getMessagesByLead);
router.post("/:leadId/messages", protect, subscriptionGuard, sendMessage);
router.post("/:leadId/read", protect, subscriptionGuard, markAsRead);

export default router;

