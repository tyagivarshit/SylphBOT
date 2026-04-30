import { Router } from "express";
import {
  applyIntelligenceOverrideController,
  getAutonomousDashboardController,
  rollbackIntelligenceDecisionController,
  runAutonomousSchedulerController,
  runIntelligenceLoopController,
  runIntelligenceSimulationController,
} from "../controllers/autonomous.controller";
import { auditRequest } from "../middleware/audit.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { attachBillingContext } from "../middleware/subscription.middleware";
import { requireBusinessContext } from "../middleware/tenant.middleware";

const router = Router();

router.use(requireBusinessContext);
router.use(requirePermission("analytics:view"));
router.use(attachBillingContext);

router.get("/dashboard", getAutonomousDashboardController);
router.post(
  "/run",
  auditRequest("autonomous.scheduler_run"),
  runAutonomousSchedulerController
);
router.post(
  "/intelligence/run",
  auditRequest("intelligence.loop_run"),
  runIntelligenceLoopController
);
router.post(
  "/intelligence/simulate",
  auditRequest("intelligence.simulation_run"),
  runIntelligenceSimulationController
);
router.post(
  "/intelligence/override",
  auditRequest("intelligence.override_apply"),
  applyIntelligenceOverrideController
);
router.post(
  "/intelligence/rollback",
  auditRequest("intelligence.rollback_apply"),
  rollbackIntelligenceDecisionController
);

export default router;
