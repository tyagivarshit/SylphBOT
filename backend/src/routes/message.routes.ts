import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { sendManualMessage, markConversationRead } from "../controllers/message.controller";

const router = Router();

router.use(protect);

/* ======================================
SEND MANUAL MESSAGE FROM DASHBOARD
====================================== */

router.post("/send", sendManualMessage);

/* ======================================
MARK CONVERSATION AS READ
====================================== */

router.post("/read", markConversationRead);

export default router;