import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller";
import { protect } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/planFeature.middleware";

const router = Router();

router.use(protect);

/* ------------------------------
CRM FEATURES (SOFT CHECK)
------------------------------ */

router.get(
  "/stats",
  requireFeature("CRM"), // ✅ now soft (no 403)
  DashboardController.getStats
);

router.get(
  "/leads",
  requireFeature("CRM"),
  DashboardController.getLeadsList
);

router.get(
  "/leads/:id",
  requireFeature("CRM"),
  DashboardController.getLeadDetail
);

router.patch(
  "/leads/:id/stage",
  requireFeature("CRM"),
  DashboardController.updateLeadStage
);

/* ------------------------------
ACTIVE CONVERSATIONS
------------------------------ */

router.get(
  "/active-conversations",
  requireFeature("CRM"),
  DashboardController.getActiveConversations
);

export default router;