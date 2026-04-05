import redis from "../config/redis";

const LOCK_TTL = 300; // 5 min

const buildKey = (slot: string) => `slot_lock:${slot}`;

/* -----------------------------------------
ACQUIRE LOCK
----------------------------------------- */
export const acquireSlotLock = async (
  slot: string,
  leadId: string
): Promise<boolean> => {
  try {
    const result = await redis.set(
      buildKey(slot),
      leadId,
      "EX",
      LOCK_TTL,
      "NX"
    );

    return result === "OK";
  } catch (err) {
    console.error("REDIS LOCK ERROR", err);
    return true; // fail-open
  }
};

/* -----------------------------------------
RELEASE LOCK
----------------------------------------- */
export const releaseSlotLock = async (slot: string) => {
  try {
    await redis.del(buildKey(slot));
  } catch {}
};

/* -----------------------------------------
CHECK LOCK
----------------------------------------- */
export const isSlotLocked = async (slot: string) => {
  return await redis.get(buildKey(slot));
};