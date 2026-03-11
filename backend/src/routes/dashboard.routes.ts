import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller";
import { protect } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/planFeature.middleware";

const router = Router();

router.use(protect);

/* ------------------------------
CRM FEATURES (PRO PLAN+)
------------------------------ */

router.get(
  "/stats",
  requireFeature("CRM"),
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
ACTIVE CONVERSATIONS (NEW)
------------------------------ */

router.get(
  "/active-conversations",
  requireFeature("CRM"),
  DashboardController.getActiveConversations
);

export default router;