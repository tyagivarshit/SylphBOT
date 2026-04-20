"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const queueHealth_service_1 = require("../services/queueHealth.service");
const systemHealth_service_1 = require("../services/systemHealth.service");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
const isValidInternalKey = (providedKey, expectedKey) => {
    if (!providedKey || !expectedKey) {
        return false;
    }
    const providedBuffer = Buffer.from(providedKey);
    const expectedBuffer = Buffer.from(expectedKey);
    return (providedBuffer.length === expectedBuffer.length &&
        crypto_1.default.timingSafeEqual(providedBuffer, expectedBuffer));
};
const requireInternalHealthKey = (req, res, next) => {
    if (process.env.NODE_ENV !== "production") {
        return next();
    }
    const internalKey = req.get("x-internal-key")?.trim();
    const expectedKey = process.env.INTERNAL_API_KEY?.trim();
    if (!isValidInternalKey(internalKey, expectedKey)) {
        return res.status(403).json({
            success: false,
            requestId: req.requestId,
            message: "Forbidden",
        });
    }
    return next();
};
router.use(requireInternalHealthKey);
router.get("/queue", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const queues = await (0, queueHealth_service_1.getQueueHealth)();
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        queues,
    });
}));
router.get("/system", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const health = await (0, systemHealth_service_1.getSystemHealth)();
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        ...health,
    });
}));
exports.default = router;
