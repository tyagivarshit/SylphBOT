import { Router } from "express";
import {
  toggleHumanControl,
  getLeadControlState,
} from "../controllers/lead.controller";

/* ✅ CORRECT AUTH MIDDLEWARE */
import { protect } from "../middleware/auth.middleware";

const router = Router();

/* ======================================================
AI ↔ HUMAN CONTROL ROUTES
====================================================== */

/* 🔥 TOGGLE / FORCE MODE */
router.post(
  "/toggle-control",
  protect,
  toggleHumanControl
);

/* 🔥 GET CURRENT MODE */
router.get(
  "/:leadId/control",
  protect,
  getLeadControlState
);

export default router;