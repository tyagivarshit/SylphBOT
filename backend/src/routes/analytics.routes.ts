import { Router } from "express";
import {
  getAnalyticsOverview,
  getAnalyticsCharts,
  getConversionFunnel,
  getTopSources
} from "../controllers/analytics.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.get("/overview", protect, getAnalyticsOverview);
router.get("/charts", protect, getAnalyticsCharts);
router.get("/funnel", protect, getConversionFunnel);
router.get("/sources", protect, getTopSources);

export default router;