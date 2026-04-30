"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.__appointmentSlotHoldTestInternals = exports.releaseAppointmentSlotHold = exports.readAppointmentSlotHold = exports.acquireAppointmentSlotHold = exports.__slotLockTestInternals = exports.readSlotLock = exports.releaseSlotLock = exports.acquireSlotLock = void 0;
const redis_1 = require("../config/redis");
const distributedLock_service_1 = require("./distributedLock.service");
const LOCK_TTL_MS = 5 * 60 * 1000;
const buildKey = (slot) => `slot_lock:${slot}`;
const buildMetadataKey = (slot) => `${buildKey(slot)}:meta`;
const SLOT_LOCK_METADATA_SEPARATOR = "|";
const DELETE_SLOT_LOCK_METADATA_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;
const encodeSlotLockMetadata = ({ token, leadId, }) => `${token}${SLOT_LOCK_METADATA_SEPARATOR}${leadId}`;
const parseSlotLockMetadata = (value) => {
    if (!value) {
        return null;
    }
    const [token, ...leadParts] = value.split(SLOT_LOCK_METADATA_SEPARATOR);
    const leadId = leadParts.join(SLOT_LOCK_METADATA_SEPARATOR).trim();
    if (!token?.trim()) {
        return null;
    }
    return {
        slot: "",
        token: token.trim(),
        leadId: leadId || null,
    };
};
const cleanupSlotLockMetadata = async (slot, metadataValue) => {
    await (0, redis_1.getSharedRedisConnection)().eval(DELETE_SLOT_LOCK_METADATA_SCRIPT, 1, buildMetadataKey(slot), metadataValue);
};
/* -----------------------------------------
ACQUIRE LOCK
----------------------------------------- */
const acquireSlotLock = async (slot, leadId) => {
    const lock = await (0, distributedLock_service_1.acquireDistributedLock)({
        key: buildKey(slot),
        ttlMs: LOCK_TTL_MS,
    });
    if (!lock) {
        return null;
    }
    const metadataValue = encodeSlotLockMetadata({
        token: lock.token,
        leadId,
    });
    try {
        await (0, redis_1.getSharedRedisConnection)().set(buildMetadataKey(slot), metadataValue, "PX", LOCK_TTL_MS);
    }
    catch (error) {
        await lock.release().catch(() => undefined);
        throw error;
    }
    return {
        slot,
        token: lock.token,
        leadId,
        release: async () => {
            await (0, exports.releaseSlotLock)(slot, lock.token);
        },
    };
};
exports.acquireSlotLock = acquireSlotLock;
/* -----------------------------------------
RELEASE LOCK
----------------------------------------- */
const releaseSlotLock = async (slot, token) => {
    const metadataValue = await (0, redis_1.getSharedRedisConnection)().get(buildMetadataKey(slot));
    await (0, distributedLock_service_1.releaseDistributedLock)({
        key: buildKey(slot),
        token,
    }).catch(() => undefined);
    if (metadataValue) {
        const metadata = parseSlotLockMetadata(metadataValue);
        if (metadata?.token === token) {
            await cleanupSlotLockMetadata(slot, metadataValue).catch(() => undefined);
        }
    }
};
exports.releaseSlotLock = releaseSlotLock;
/* -----------------------------------------
CHECK LOCK
----------------------------------------- */
const readSlotLock = async (slot) => {
    const [tokenValue, metadataValue] = await (0, redis_1.getSharedRedisConnection)().mget(buildKey(slot), buildMetadataKey(slot));
    if (!tokenValue) {
        if (metadataValue) {
            await cleanupSlotLockMetadata(slot, metadataValue).catch(() => undefined);
        }
        return null;
    }
    const metadata = parseSlotLockMetadata(metadataValue);
    if (metadata?.token === tokenValue) {
        return {
            slot,
            token: tokenValue,
            leadId: metadata.leadId,
        };
    }
    if (metadataValue) {
        await cleanupSlotLockMetadata(slot, metadataValue).catch(() => undefined);
    }
    return {
        slot,
        token: tokenValue,
        leadId: null,
    };
};
exports.readSlotLock = readSlotLock;
exports.__slotLockTestInternals = {
    encodeSlotLockMetadata,
    parseSlotLockMetadata,
};
const APPOINTMENT_HOLD_LOCK_SEPARATOR = "|";
const buildAppointmentHoldKey = ({ businessId, slotKey, }) => `appointment_hold:${businessId}:${slotKey}`;
const buildAppointmentHoldMetadataKey = ({ businessId, slotKey, }) => `${buildAppointmentHoldKey({ businessId, slotKey })}:meta`;
const encodeAppointmentHoldMetadata = ({ token, appointmentKey, heldBy, }) => [token, appointmentKey, heldBy].join(APPOINTMENT_HOLD_LOCK_SEPARATOR);
const parseAppointmentHoldMetadata = (value) => {
    if (!value) {
        return null;
    }
    const [token, appointmentKey, heldBy] = value.split(APPOINTMENT_HOLD_LOCK_SEPARATOR);
    if (!token || !appointmentKey) {
        return null;
    }
    return {
        token: token.trim(),
        appointmentKey: appointmentKey.trim(),
        heldBy: String(heldBy || "").trim() || "SYSTEM",
    };
};
const cleanupAppointmentHoldMetadata = async ({ businessId, slotKey, metadataValue, }) => {
    await (0, redis_1.getSharedRedisConnection)().eval(DELETE_SLOT_LOCK_METADATA_SCRIPT, 1, buildAppointmentHoldMetadataKey({
        businessId,
        slotKey,
    }), metadataValue);
};
const acquireAppointmentSlotHold = async ({ businessId, slotKey, appointmentKey, heldBy = "SYSTEM", ttlMs = 5 * 60 * 1000, }) => {
    const lock = await (0, distributedLock_service_1.acquireDistributedLock)({
        key: buildAppointmentHoldKey({
            businessId,
            slotKey,
        }),
        ttlMs: Math.max(30000, ttlMs),
    });
    if (!lock) {
        return null;
    }
    const metadataValue = encodeAppointmentHoldMetadata({
        token: lock.token,
        appointmentKey,
        heldBy,
    });
    const metadataKey = buildAppointmentHoldMetadataKey({
        businessId,
        slotKey,
    });
    try {
        await (0, redis_1.getSharedRedisConnection)().set(metadataKey, metadataValue, "PX", Math.max(30000, ttlMs));
    }
    catch (error) {
        await lock.release().catch(() => undefined);
        throw error;
    }
    return {
        businessId,
        slotKey,
        token: lock.token,
        appointmentKey,
        heldBy,
        expiresAt: new Date(Date.now() + Math.max(30000, ttlMs)),
        release: async () => {
            await (0, exports.releaseAppointmentSlotHold)({
                businessId,
                slotKey,
                token: lock.token,
            });
        },
    };
};
exports.acquireAppointmentSlotHold = acquireAppointmentSlotHold;
const readAppointmentSlotHold = async ({ businessId, slotKey, }) => {
    const [tokenValue, metadataValue] = await (0, redis_1.getSharedRedisConnection)().mget(buildAppointmentHoldKey({
        businessId,
        slotKey,
    }), buildAppointmentHoldMetadataKey({
        businessId,
        slotKey,
    }));
    if (!tokenValue) {
        if (metadataValue) {
            await cleanupAppointmentHoldMetadata({
                businessId,
                slotKey,
                metadataValue,
            }).catch(() => undefined);
        }
        return null;
    }
    const metadata = parseAppointmentHoldMetadata(metadataValue);
    if (metadata?.token === tokenValue) {
        return {
            businessId,
            slotKey,
            token: tokenValue,
            appointmentKey: metadata.appointmentKey,
            heldBy: metadata.heldBy,
        };
    }
    if (metadataValue) {
        await cleanupAppointmentHoldMetadata({
            businessId,
            slotKey,
            metadataValue,
        }).catch(() => undefined);
    }
    return {
        businessId,
        slotKey,
        token: tokenValue,
        appointmentKey: "",
        heldBy: "SYSTEM",
    };
};
exports.readAppointmentSlotHold = readAppointmentSlotHold;
const releaseAppointmentSlotHold = async ({ businessId, slotKey, token, }) => {
    const metadataKey = buildAppointmentHoldMetadataKey({
        businessId,
        slotKey,
    });
    const metadataValue = await (0, redis_1.getSharedRedisConnection)().get(metadataKey);
    await (0, distributedLock_service_1.releaseDistributedLock)({
        key: buildAppointmentHoldKey({
            businessId,
            slotKey,
        }),
        token,
    }).catch(() => undefined);
    if (!metadataValue) {
        return;
    }
    const metadata = parseAppointmentHoldMetadata(metadataValue);
    if (metadata?.token === token) {
        await cleanupAppointmentHoldMetadata({
            businessId,
            slotKey,
            metadataValue,
        }).catch(() => undefined);
    }
};
exports.releaseAppointmentSlotHold = releaseAppointmentSlotHold;
exports.__appointmentSlotHoldTestInternals = {
    encodeAppointmentHoldMetadata,
    parseAppointmentHoldMetadata,
};
