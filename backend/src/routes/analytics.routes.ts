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
import { requireBusinessContext } from "../middleware/tenant.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { auditRequest } from "../middleware/audit.middleware";

const router = Router();

router.use(requireBusinessContext);
router.use(requirePermission("analytics:view"));
router.use(attachBillingContext);

router.get("/dashboard", getDeepAnalyticsDashboard);
router.get("/revenue", getRevenueAnalytics);
router.get("/overview", getAnalyticsOverview);
router.get("/charts", getAnalyticsCharts);
router.get("/funnel", getConversionFunnel);
router.get("/sources", getTopSources);
router.post(
  "/conversions",
  auditRequest("analytics.conversion_recorded"),
  recordConversionOutcome
);

export default router;
