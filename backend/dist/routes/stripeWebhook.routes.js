"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripeWebhook_controller_1 = require("../controllers/stripeWebhook.controller");
const router = (0, express_1.Router)();
/* STRIPE WEBHOOK */
router.post("/", stripeWebhook_controller_1.stripeWebhook);
exports.default = router;
