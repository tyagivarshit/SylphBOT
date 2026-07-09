import { Router } from "express";
import {
  executeExecutiveRuntimeController,
  getExecutiveRuntimeAuditController,
} from "../controllers/executive.controller";
import { auditRequest } from "../middleware/audit.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { attachBillingContext } from "../middleware/subscription.middleware";
import { requireBusinessContext } from "../middleware/tenant.middleware";

const router = Router();

router.use(requireBusinessContext);
router.use(requirePermission("analytics:view"));
router.use(attachBillingContext);

router.post(
  "/runtime/execute",
  auditRequest("executive.runtime_execute"),
  executeExecutiveRuntimeController
);

router.get("/runtime/audit", getExecutiveRuntimeAuditController);

export default router;
