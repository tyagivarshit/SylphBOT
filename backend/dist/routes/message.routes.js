"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const message_controller_1 = require("../controllers/message.controller");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.protect);
router.use(subscriptionGuard_middleware_1.subscriptionGuard);
/* ======================================
GET MESSAGES (LOAD CHAT)
====================================== */
router.get("/:leadId", message_controller_1.getMessages);
/* ======================================
SEND MANUAL MESSAGE
====================================== */
router.post("/send", message_controller_1.sendManualMessage);
/* ======================================
DELETE / UNSEND MESSAGE 🔥
====================================== */
router.delete("/:messageId", message_controller_1.deleteMessage);
/* ======================================
MARK CONVERSATION AS READ
====================================== */
router.post("/read", message_controller_1.markConversationRead);
exports.default = router;
