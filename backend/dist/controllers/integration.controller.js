"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOnboarding = exports.getIntegrations = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const onboarding_service_1 = require("../services/onboarding.service");
/* GET CONNECTIONS */
const getIntegrations = async (req, res) => {
    try {
        const businessId = req.user.businessId;
        const clients = await prisma_1.default.client.findMany({
            where: { businessId },
            select: {
                id: true,
                platform: true,
                isActive: true,
            },
        });
        res.json(clients);
    }
    catch (err) {
        res.status(500).json({ error: "Failed" });
    }
};
exports.getIntegrations = getIntegrations;
const getOnboarding = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const onboarding = await (0, onboarding_service_1.getOnboardingSnapshot)(businessId);
        return res.json({
            success: true,
            data: onboarding,
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch onboarding",
        });
    }
};
exports.getOnboarding = getOnboarding;
