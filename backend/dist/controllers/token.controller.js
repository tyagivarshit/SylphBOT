"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../config/prisma"));
const crypto_1 = __importDefault(require("crypto"));
const generateToken_1 = require("../utils/generateToken");
const env_1 = require("../config/env");
/* 🔐 Hash helper */
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const refreshAccessToken = async (req, res) => {
    const refreshToken = req.body.refreshToken?.trim();
    if (!refreshToken) {
        return res.status(401).json({
            message: "Refresh token required",
        });
    }
    try {
        const hashedToken = hashToken(refreshToken);
        // 🔎 Check token in DB
        const storedToken = await prisma_1.default.refreshToken.findUnique({
            where: { token: hashedToken },
        });
        if (!storedToken) {
            return res.status(403).json({
                message: "Invalid refresh token",
            });
        }
        // ⏳ Expiry check
        if (new Date() > storedToken.expiresAt) {
            await prisma_1.default.refreshToken.delete({
                where: { token: hashedToken },
            });
            return res.status(403).json({
                message: "Refresh token expired",
            });
        }
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(refreshToken, env_1.env.JWT_REFRESH_SECRET);
        }
        catch {
            await prisma_1.default.refreshToken.delete({
                where: { token: hashedToken },
            });
            return res.status(403).json({
                message: "Invalid refresh token",
            });
        }
        // 👤 Get user
        const user = await prisma_1.default.user.findUnique({
            where: { id: decoded.id },
        });
        if (!user) {
            return res.status(403).json({
                message: "User not found",
            });
        }
        // 🏢 Get business (important for access token payload)
        const business = await prisma_1.default.business.findFirst({
            where: { ownerId: user.id },
        });
        if (!business) {
            return res.status(403).json({
                message: "Business not found",
            });
        }
        /* 🔥 Rotation: delete old token */
        await prisma_1.default.refreshToken.delete({
            where: { token: hashedToken },
        });
        // 🔄 Generate new tokens
        const newRefreshToken = (0, generateToken_1.generateRefreshToken)(user.id);
        const newAccessToken = (0, generateToken_1.generateAccessToken)(user.id, user.role, business.id);
        const newHashedToken = hashToken(newRefreshToken);
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 7);
        await prisma_1.default.refreshToken.create({
            data: {
                token: newHashedToken,
                userId: user.id,
                expiresAt: expiry,
            },
        });
        return res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        });
    }
    catch (error) {
        console.error("Refresh Token Error:", error);
        return res.status(500).json({
            message: "Token refresh failed",
        });
    }
};
exports.refreshAccessToken = refreshAccessToken;
