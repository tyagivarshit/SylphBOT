"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const planFeature_middleware_1 = require("../middleware/planFeature.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.protect);
/* ------------------------------
CRM FEATURES (SOFT CHECK)
------------------------------ */
router.get("/stats", (0, planFeature_middleware_1.requireFeature)("CRM"), // ✅ now soft (no 403)
dashboard_controller_1.DashboardController.getStats);
router.get("/leads", (0, planFeature_middleware_1.requireFeature)("CRM"), dashboard_controller_1.DashboardController.getLeadsList);
router.get("/leads/:id", (0, planFeature_middleware_1.requireFeature)("CRM"), dashboard_controller_1.DashboardController.getLeadDetail);
router.patch("/leads/:id/stage", (0, planFeature_middleware_1.requireFeature)("CRM"), dashboard_controller_1.DashboardController.updateLeadStage);
/* ------------------------------
ACTIVE CONVERSATIONS
------------------------------ */
router.get("/active-conversations", (0, planFeature_middleware_1.requireFeature)("CRM"), dashboard_controller_1.DashboardController.getActiveConversations);
exports.default = router;
