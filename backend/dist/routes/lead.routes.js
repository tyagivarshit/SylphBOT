"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const lead_controller_1 = require("../controllers/lead.controller");
/* ✅ CORRECT AUTH MIDDLEWARE */
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
/* ======================================================
AI ↔ HUMAN CONTROL ROUTES
====================================================== */
/* 🔥 TOGGLE / FORCE MODE */
router.post("/toggle-control", auth_middleware_1.protect, lead_controller_1.toggleHumanControl);
/* 🔥 GET CURRENT MODE */
router.get("/:leadId/control", auth_middleware_1.protect, lead_controller_1.getLeadControlState);
exports.default = router;
