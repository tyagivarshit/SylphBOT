"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSlotLocked = exports.releaseSlotLock = exports.acquireSlotLock = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default(process.env.REDIS_URL);
const LOCK_TTL = 300; // 5 min
const buildKey = (slot) => `slot_lock:${slot}`;
/* -----------------------------------------
ACQUIRE LOCK
----------------------------------------- */
const acquireSlotLock = async (slot, leadId) => {
    try {
        const result = await redis.set(buildKey(slot), leadId, "EX", LOCK_TTL, "NX");
        return result === "OK";
    }
    catch (err) {
        console.error("REDIS LOCK ERROR", err);
        return true; // fail-open
    }
};
exports.acquireSlotLock = acquireSlotLock;
/* -----------------------------------------
RELEASE LOCK
----------------------------------------- */
const releaseSlotLock = async (slot) => {
    try {
        await redis.del(buildKey(slot));
    }
    catch { }
};
exports.releaseSlotLock = releaseSlotLock;
/* -----------------------------------------
CHECK LOCK
----------------------------------------- */
const isSlotLocked = async (slot) => {
    return await redis.get(buildKey(slot));
};
exports.isSlotLocked = isSlotLocked;
