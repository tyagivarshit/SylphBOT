import express from "express";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import {
  getIntegrations,
  getInstagramAccounts,
  getOnboarding,
} from "../controllers/integration.controller";

const router = express.Router();

router.get("/onboarding", protect, getOnboarding);
router.get("/instagram/accounts", protect, getInstagramAccounts);
router.get("/", protect, requirePermission("settings:view"), getIntegrations);

export default router;
