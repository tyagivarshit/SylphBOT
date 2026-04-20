import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { 
  sendManualMessage, 
  markConversationRead,
  getMessages,
  deleteMessage
} from "../controllers/message.controller";
import { subscriptionGuard } from "../middleware/subscriptionGuard.middleware";

const router = Router();

router.use(protect);
router.use(subscriptionGuard);

/* ======================================
GET MESSAGES (LOAD CHAT)
====================================== */

router.get("/:leadId", getMessages);

/* ======================================
SEND MANUAL MESSAGE
====================================== */

router.post("/send", sendManualMessage);

/* ======================================
DELETE / UNSEND MESSAGE 🔥
====================================== */

router.delete("/:messageId", deleteMessage);

/* ======================================
MARK CONVERSATION AS READ
====================================== */

router.post("/read", markConversationRead);

export default router;
