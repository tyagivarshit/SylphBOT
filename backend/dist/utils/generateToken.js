"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRefreshToken = exports.verifyAccessToken = exports.generateRefreshToken = exports.generateAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
/* ======================================
JWT BASE OPTIONS
====================================== */
const baseOptions = {
    issuer: "sylph-ai",
    audience: "user",
};
/* ======================================
🔑 ACCESS TOKEN
====================================== */
const generateAccessToken = (userId, role, businessId, // ✅ FIXED
tokenVersion) => {
    const payload = {
        id: userId,
        role,
        businessId,
        tokenVersion,
        type: "access",
    };
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, {
        ...baseOptions,
        expiresIn: "15m",
        jwtid: crypto_1.default.randomUUID(),
    });
};
exports.generateAccessToken = generateAccessToken;
/* ======================================
🔄 REFRESH TOKEN
====================================== */
const generateRefreshToken = (userId, tokenVersion) => {
    const payload = {
        id: userId,
        tokenVersion,
        type: "refresh",
    };
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_REFRESH_SECRET, {
        ...baseOptions,
        expiresIn: "7d",
        jwtid: crypto_1.default.randomUUID(),
    });
};
exports.generateRefreshToken = generateRefreshToken;
/* ======================================
🔍 VERIFY HELPERS (TYPE SAFE)
====================================== */
const verifyAccessToken = (token) => {
    try {
        return jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET, baseOptions);
    }
    catch {
        return null;
    }
};
exports.verifyAccessToken = verifyAccessToken;
const verifyRefreshToken = (token) => {
    try {
        return jsonwebtoken_1.default.verify(token, env_1.env.JWT_REFRESH_SECRET, baseOptions);
    }
    catch {
        return null;
    }
};
exports.verifyRefreshToken = verifyRefreshToken;
