import { Router } from "express";
import {
  createAutomationFlow,
  getFlows,
} from "../controllers/automation.controller";
import { protect } from "../middleware/auth.middleware";
import { subscriptionGuard } from "../middleware/subscriptionGuard.middleware";
import { auditRequest } from "../middleware/audit.middleware";

const router = Router();

/* ---------------- AUTH ---------------- */

router.use(protect);
router.use(subscriptionGuard);

/* ---------------- ROUTES ---------------- */

router.post("/flows", auditRequest("automation.flow_created"), createAutomationFlow);

router.get("/flows", getFlows);

/* 🔥 FUTURE READY (EDIT FLOW SUPPORT) */
router.patch("/flows/:id", auditRequest("automation.flow_update_requested"), async (req, res) => {
  return res.status(501).json({
    message: "Update flow not implemented yet",
  });
});

export default router;
