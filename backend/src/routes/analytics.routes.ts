import { Router } from "express";
import {
  getDeepAnalyticsDashboard,
  getAnalyticsOverview,
  getAnalyticsCharts,
  getConversionFunnel,
  getTopSources
} from "../controllers/analytics.controller";
import { attachBillingContext } from "../middleware/subscription.middleware";

const router = Router();

router.use(attachBillingContext);

router.get("/dashboard", getDeepAnalyticsDashboard);
router.get("/overview", getAnalyticsOverview);
router.get("/charts", getAnalyticsCharts);
router.get("/funnel", getConversionFunnel);
router.get("/sources", getTopSources);

export default router;
