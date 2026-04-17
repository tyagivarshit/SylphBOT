"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateClient = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const getOrCreateClient = async (businessId, phoneNumberId) => {
    const client = await prisma_1.default.client.upsert({
        where: { phoneNumberId }, // 🔥 FIX
        update: {
            isActive: true
        },
        create: {
            businessId,
            phoneNumberId, // 🔥 MUST
            platform: "SYSTEM",
            accessToken: "AUTO_GENERATED",
            isActive: true
        }
    });
    return client;
};
exports.getOrCreateClient = getOrCreateClient;
