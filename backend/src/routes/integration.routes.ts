import express from "express";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import {
  connectInstagramHub,
  connectWhatsAppHub,
  getConnectHubDashboard,
  getIntegrationDiagnostics,
  getIntegrations,
  getInstagramAccounts,
  getOnboarding,
  meterConnectHubFeatureGate,
  provisionConnectHubTenant,
  retryConnectDiagnostic,
  runConnectHubSelfAudit,
  saveConnectHubWizardProgress,
  upgradeConnectHubPlan,
} from "../controllers/integration.controller";

const router = express.Router();

router.get("/onboarding", protect, getOnboarding);
router.get("/instagram/accounts", protect, getInstagramAccounts);
router.get(
  "/connect-hub",
  protect,
  requirePermission("settings:view"),
  getConnectHubDashboard
);
router.post(
  "/connect-hub/provision",
  protect,
  requirePermission("settings:manage"),
  provisionConnectHubTenant
);
router.post(
  "/connect-hub/connect/instagram",
  protect,
  requirePermission("settings:manage"),
  connectInstagramHub
);
router.post(
  "/connect-hub/connect/whatsapp",
  protect,
  requirePermission("settings:manage"),
  connectWhatsAppHub
);
router.get(
  "/connect-hub/diagnostics/:provider",
  protect,
  requirePermission("settings:view"),
  getIntegrationDiagnostics
);
router.post(
  "/connect-hub/diagnostics/retry",
  protect,
  requirePermission("settings:manage"),
  retryConnectDiagnostic
);
router.post(
  "/connect-hub/wizard/progress",
  protect,
  requirePermission("settings:manage"),
  saveConnectHubWizardProgress
);
router.post(
  "/connect-hub/feature-gate/meter",
  protect,
  requirePermission("settings:manage"),
  meterConnectHubFeatureGate
);
router.post(
  "/connect-hub/upgrade",
  protect,
  requirePermission("settings:manage"),
  upgradeConnectHubPlan
);
router.get(
  "/connect-hub/self-audit",
  protect,
  requirePermission("settings:view"),
  runConnectHubSelfAudit
);
router.get("/", protect, requirePermission("settings:view"), getIntegrations);

export default router;
