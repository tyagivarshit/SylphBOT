import express from "express";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import {
  getIntegrations,
  getOnboarding,
} from "../controllers/integration.controller";

const router = express.Router();

router.get("/onboarding", protect, getOnboarding);
router.get("/", protect, requirePermission("settings:view"), getIntegrations);

export default router;
