import { Router } from "express";
import {
  getAutonomousDashboardController,
  runAutonomousSchedulerController,
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

export default router;
