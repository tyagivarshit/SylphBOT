import express from "express";
import { protect } from "../middleware/auth.middleware";
import { securityLimiter } from "../middleware/rateLimit.middleware";
import { requireBusinessContext } from "../middleware/tenant.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import {
  createWorkspaceApiKey,
  deleteTenantWorkspace,
  exportTenantData,
  getApiKeys,
  getBackupConfiguration,
  getLegacyWorkspaceApiKey,
  getSessions,
  logoutAllSessions,
  restoreTenantWorkspace,
  rotateWorkspaceApiKey,
  revokeWorkspaceApiKey,
  triggerBackupRun,
} from "../controllers/security.controller";

const router = express.Router();

router.use(protect);
router.use(securityLimiter);

router.post(
  "/data-restore",
  requirePermission("security:manage"),
  asyncHandler(restoreTenantWorkspace)
);

router.use(requireBusinessContext);

router.get("/sessions", asyncHandler(getSessions));
router.delete("/sessions", asyncHandler(logoutAllSessions));

router.get(
  "/api-keys",
  requirePermission("api_keys:manage"),
  asyncHandler(getApiKeys)
);
router.post(
  "/api-keys",
  requirePermission("api_keys:manage"),
  asyncHandler(createWorkspaceApiKey)
);
router.post(
  "/api-keys/:id/rotate",
  requirePermission("api_keys:manage"),
  asyncHandler(rotateWorkspaceApiKey)
);
router.post(
  "/api-keys/:id/revoke",
  requirePermission("api_keys:manage"),
  asyncHandler(revokeWorkspaceApiKey)
);
router.delete(
  "/api-keys/:id",
  requirePermission("api_keys:manage"),
  asyncHandler(revokeWorkspaceApiKey)
);

router.get(
  "/legacy-api-key",
  requirePermission("api_keys:manage"),
  asyncHandler(getLegacyWorkspaceApiKey)
);

router.get(
  "/data-export",
  requirePermission("compliance:export"),
  asyncHandler(exportTenantData)
);
router.post(
  "/data-delete",
  requirePermission("compliance:delete"),
  asyncHandler(deleteTenantWorkspace)
);

router.get(
  "/backup",
  requirePermission("security:manage"),
  asyncHandler(getBackupConfiguration)
);
router.post(
  "/backup/trigger",
  requirePermission("security:manage"),
  asyncHandler(triggerBackupRun)
);

export default router;
