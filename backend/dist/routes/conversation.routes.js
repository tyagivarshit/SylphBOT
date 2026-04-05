"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const conversation_controller_1 = require("../controllers/conversation.controller");
/* ✅ CORRECT AUTH MIDDLEWARE */
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
/* ======================================================
CONVERSATION ROUTES (WHATSAPP STYLE)
====================================================== */
/* 🔥 GET ALL CHATS */
router.get("/", auth_middleware_1.protect, conversation_controller_1.getConversations);
/* 🔥 GET MESSAGES OF A CHAT */
router.get("/:leadId/messages", auth_middleware_1.protect, conversation_controller_1.getMessagesByLead);
/* 🔥 SEND MESSAGE (🔥 FIXED ROUTE) */
router.post("/:leadId/messages", auth_middleware_1.protect, conversation_controller_1.sendMessage);
/* 🔥 MARK CHAT AS READ (🔥 FIXED ROUTE) */
router.post("/:leadId/read", auth_middleware_1.protect, conversation_controller_1.markAsRead);
exports.default = router;
