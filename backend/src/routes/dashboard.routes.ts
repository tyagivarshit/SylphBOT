import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.use(protect);

router.get("/stats", DashboardController.getStats);
router.get("/leads", DashboardController.getLeadsList);
router.get("/leads/:id", DashboardController.getLeadDetail);

export default router;