"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const training_controller_1 = require("../controllers/training.controller");
const router = (0, express_1.Router)();
/* ================= AI TRAINING ================= */
// 🔥 POST (SAVE)
router.post("/business", auth_middleware_1.protect, training_controller_1.saveBusinessInfo);
router.post("/faq", auth_middleware_1.protect, training_controller_1.saveFAQ);
router.post("/settings", auth_middleware_1.protect, training_controller_1.saveAISettings);
// 🔥 GET (LOAD) ✅ ADD THIS
router.get("/business", auth_middleware_1.protect, training_controller_1.getBusinessInfo);
router.get("/faq", auth_middleware_1.protect, training_controller_1.getFAQs);
router.get("/settings", auth_middleware_1.protect, training_controller_1.getAISettings);
exports.default = router;
