"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const instagram_controller_1 = require("../controllers/instagram.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const planFeature_middleware_1 = require("../middleware/planFeature.middleware");
const router = (0, express_1.Router)();
/* AUTH */
router.use(auth_middleware_1.protect);
/* ROUTES */
router.get("/media", (0, planFeature_middleware_1.requireFeature)("INSTAGRAM_COMMENT_AUTOMATION"), // 🔥 restrict access if needed
instagram_controller_1.getInstagramMedia);
exports.default = router;
