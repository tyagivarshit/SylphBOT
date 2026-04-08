"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSlotLocked = exports.releaseSlotLock = exports.acquireSlotLock = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const LOCK_TTL = 300; // 5 min
const buildKey = (slot) => `slot_lock:${slot}`;
/* -----------------------------------------
ACQUIRE LOCK
----------------------------------------- */
const acquireSlotLock = async (slot, leadId) => {
    try {
        const result = await redis_1.default.set(buildKey(slot), leadId, "EX", LOCK_TTL, "NX");
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
        await redis_1.default.del(buildKey(slot));
    }
    catch { }
};
exports.releaseSlotLock = releaseSlotLock;
/* -----------------------------------------
CHECK LOCK
----------------------------------------- */
const isSlotLocked = async (slot) => {
    return await redis_1.default.get(buildKey(slot));
};
exports.isSlotLocked = isSlotLocked;
