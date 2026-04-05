"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInstagramMedia = void 0;
const instagram_service_1 = require("../services/instagram.service");
const prisma_1 = __importDefault(require("../config/prisma"));
const getInstagramMedia = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { clientId } = req.query;
        if (!userId) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }
        if (!clientId) {
            return res.status(400).json({
                message: "clientId required",
            });
        }
        /* BUSINESS VALIDATION */
        const business = await prisma_1.default.business.findFirst({
            where: { ownerId: userId },
            select: { id: true },
        });
        if (!business) {
            return res.status(404).json({
                message: "Business not found",
            });
        }
        /* CLIENT VALIDATION */
        const client = await prisma_1.default.client.findFirst({
            where: {
                id: String(clientId),
                businessId: business.id,
                platform: "INSTAGRAM",
                isActive: true,
            },
        });
        if (!client) {
            return res.status(404).json({
                message: "Instagram client not found",
            });
        }
        const media = await (0, instagram_service_1.fetchInstagramMedia)(client.id);
        return res.json({
            success: true,
            data: media,
        });
    }
    catch (error) {
        console.error("Get Instagram media error:", error.message);
        return res.status(500).json({
            message: error.message || "Failed to fetch media",
        });
    }
};
exports.getInstagramMedia = getInstagramMedia;
