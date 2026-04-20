"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSmartFallback = void 0;
const aiRuntime_service_1 = require("./aiRuntime.service");
const generateSmartFallback = (message) => (0, aiRuntime_service_1.generateUnifiedFallback)(message);
exports.generateSmartFallback = generateSmartFallback;
