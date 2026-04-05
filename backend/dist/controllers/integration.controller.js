"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIntegrations = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
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
