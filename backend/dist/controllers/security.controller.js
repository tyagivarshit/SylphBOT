"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutAllSessions = exports.getSessions = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
/* GET ACTIVE SESSIONS */
const getSessions = async (req, res) => {
    try {
        const userId = req.user.id;
        const sessions = await prisma_1.default.refreshToken.findMany({
            where: { userId },
            select: {
                id: true,
                userAgent: true,
                ip: true,
                createdAt: true,
            },
        });
        res.json(sessions);
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch sessions" });
    }
};
exports.getSessions = getSessions;
/* LOGOUT OTHER DEVICES */
const logoutAllSessions = async (req, res) => {
    try {
        const userId = req.user.id;
        await prisma_1.default.refreshToken.deleteMany({
            where: { userId },
        });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: "Failed" });
    }
};
exports.logoutAllSessions = logoutAllSessions;
