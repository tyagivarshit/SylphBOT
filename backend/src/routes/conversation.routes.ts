import { Router } from "express";
import {
  getConversations,
  getMessagesByLead,
  sendMessage,
  markAsRead,
} from "../controllers/conversation.controller";

/* ✅ CORRECT AUTH MIDDLEWARE */
import { protect } from "../middleware/auth.middleware";

const router = Router();

/* ======================================================
CONVERSATION ROUTES (WHATSAPP STYLE)
====================================================== */

/* 🔥 GET ALL CHATS */
router.get("/", protect, getConversations);

/* 🔥 GET MESSAGES OF A CHAT */
router.get("/:leadId/messages", protect, getMessagesByLead);

/* 🔥 SEND MESSAGE (🔥 FIXED ROUTE) */
router.post("/:leadId/messages", protect, sendMessage);

/* 🔥 MARK CHAT AS READ (🔥 FIXED ROUTE) */
router.post("/:leadId/read", protect, markAsRead);

export default router;