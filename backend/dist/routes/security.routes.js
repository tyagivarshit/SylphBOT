"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const security_controller_1 = require("../controllers/security.controller");
const router = express_1.default.Router();
router.get("/sessions", auth_middleware_1.protect, security_controller_1.getSessions);
router.delete("/sessions", auth_middleware_1.protect, security_controller_1.logoutAllSessions);
exports.default = router;
