"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const integration_controller_1 = require("../controllers/integration.controller");
const router = express_1.default.Router();
router.get("/onboarding", auth_middleware_1.protect, integration_controller_1.getOnboarding);
router.get("/", auth_middleware_1.protect, (0, rbac_middleware_1.requirePermission)("settings:view"), integration_controller_1.getIntegrations);
exports.default = router;
