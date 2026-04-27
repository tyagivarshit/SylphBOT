import { Router } from "express";
import {
  createAutomationFlow,
  deleteAutomationFlow,
  getFlows,
  updateAutomationFlow,
} from "../controllers/automation.controller";
import { protect } from "../middleware/auth.middleware";
import { subscriptionGuard } from "../middleware/subscriptionGuard.middleware";
import { auditRequest } from "../middleware/audit.middleware";

const router = Router();

router.use(protect);
router.use(subscriptionGuard);

router.post("/flows", auditRequest("automation.flow_created"), createAutomationFlow);
router.get("/flows", getFlows);
router.patch(
  "/flows/:id",
  auditRequest("automation.flow_update_requested"),
  updateAutomationFlow
);
router.delete(
  "/flows/:id",
  auditRequest("automation.flow_deleted"),
  deleteAutomationFlow
);

export default router;
