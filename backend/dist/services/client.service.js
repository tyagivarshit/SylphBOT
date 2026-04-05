"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateClient = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const getOrCreateClient = async (businessId) => {
    let client = await prisma_1.default.client.findFirst({
        where: { businessId, isActive: true }
    });
    if (!client) {
        client = await prisma_1.default.client.create({
            data: {
                businessId,
                platform: "SYSTEM",
                accessToken: "AUTO_GENERATED",
                isActive: true
            }
        });
        console.log("✅ Auto-created client for business:", businessId);
    }
    return client;
};
exports.getOrCreateClient = getOrCreateClient;
