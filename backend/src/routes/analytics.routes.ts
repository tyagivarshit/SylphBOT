import { Router } from "express";
import {
  getDeepAnalyticsDashboard,
  getAnalyticsOverview,
  getAnalyticsCharts,
  getConversionFunnel,
  getTopSources,
  getRevenueAnalytics,
  recordConversionOutcome
} from "../controllers/analytics.controller";
import { attachBillingContext } from "../middleware/subscription.middleware";

const router = Router();

router.use(attachBillingContext);

router.get("/dashboard", getDeepAnalyticsDashboard);
router.get("/revenue", getRevenueAnalytics);
router.get("/overview", getAnalyticsOverview);
router.get("/charts", getAnalyticsCharts);
router.get("/funnel", getConversionFunnel);
router.get("/sources", getTopSources);
router.post("/conversions", recordConversionOutcome);

export default router;
