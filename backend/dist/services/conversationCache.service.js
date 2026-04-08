"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteConversationCache = exports.setConversationCache = exports.getConversationCache = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const CACHE_TTL = 60 * 60; // 1 hour
/* ----------------------------------
GET CACHE
---------------------------------- */
const getConversationCache = async (leadId) => {
    try {
        const key = `sylph:conversation:${leadId}`;
        const data = await redis_1.default.get(key);
        if (!data)
            return null;
        return JSON.parse(data);
    }
    catch (error) {
        console.error("Redis get cache error:", error);
        return null;
    }
};
exports.getConversationCache = getConversationCache;
/* ----------------------------------
SET CACHE
---------------------------------- */
const setConversationCache = async (leadId, payload) => {
    try {
        const key = `sylph:conversation:${leadId}`;
        await redis_1.default.set(key, JSON.stringify(payload), "EX", CACHE_TTL);
    }
    catch (error) {
        console.error("Redis set cache error:", error);
    }
};
exports.setConversationCache = setConversationCache;
/* ----------------------------------
DELETE CACHE
---------------------------------- */
const deleteConversationCache = async (leadId) => {
    try {
        const key = `sylph:conversation:${leadId}`;
        await redis_1.default.del(key);
    }
    catch (error) {
        console.error("Redis delete cache error:", error);
    }
};
exports.deleteConversationCache = deleteConversationCache;
