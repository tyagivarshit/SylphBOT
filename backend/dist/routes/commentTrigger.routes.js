"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const commentTrigger_controller_1 = require("../controllers/commentTrigger.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const planFeature_middleware_1 = require("../middleware/planFeature.middleware");
const audit_middleware_1 = require("../middleware/audit.middleware");
const router = (0, express_1.Router)();
/* ---------------- AUTH ---------------- */
router.use(auth_middleware_1.protect);
/* ---------------- ROUTES ---------------- */
router.post("/", (0, planFeature_middleware_1.requireFeature)("INSTAGRAM_COMMENT_AUTOMATION"), (0, audit_middleware_1.auditRequest)("automation.comment_trigger_created"), commentTrigger_controller_1.createCommentTrigger);
router.get("/", (0, planFeature_middleware_1.requireFeature)("INSTAGRAM_COMMENT_AUTOMATION"), commentTrigger_controller_1.getCommentTriggers);
router.delete("/:id", (0, planFeature_middleware_1.requireFeature)("INSTAGRAM_COMMENT_AUTOMATION"), (0, audit_middleware_1.auditRequest)("automation.comment_trigger_deleted"), commentTrigger_controller_1.deleteCommentTrigger);
/* 🔥 TOGGLE ROUTE (NEW) */
router.patch("/:id/toggle", (0, planFeature_middleware_1.requireFeature)("INSTAGRAM_COMMENT_AUTOMATION"), (0, audit_middleware_1.auditRequest)("automation.comment_trigger_toggled"), commentTrigger_controller_1.toggleCommentTrigger);
exports.default = router;
