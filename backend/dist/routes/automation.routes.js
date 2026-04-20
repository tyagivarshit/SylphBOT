"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const automation_controller_1 = require("../controllers/automation.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
const audit_middleware_1 = require("../middleware/audit.middleware");
const router = (0, express_1.Router)();
/* ---------------- AUTH ---------------- */
router.use(auth_middleware_1.protect);
router.use(subscriptionGuard_middleware_1.subscriptionGuard);
/* ---------------- ROUTES ---------------- */
router.post("/flows", (0, audit_middleware_1.auditRequest)("automation.flow_created"), automation_controller_1.createAutomationFlow);
router.get("/flows", automation_controller_1.getFlows);
/* 🔥 FUTURE READY (EDIT FLOW SUPPORT) */
router.patch("/flows/:id", (0, audit_middleware_1.auditRequest)("automation.flow_update_requested"), async (req, res) => {
    return res.status(501).json({
        message: "Update flow not implemented yet",
    });
});
exports.default = router;
