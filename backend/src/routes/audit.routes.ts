import express from "express";
import { requireBusinessContext } from "../middleware/tenant.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { securityLimiter } from "../middleware/rateLimit.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { getAuditLogEntries } from "../controllers/security.controller";

const router = express.Router();

router.use(requireBusinessContext);
router.use(securityLimiter);

router.get(
  "/logs",
  requirePermission("security:manage"),
  asyncHandler(getAuditLogEntries)
);

export default router;
