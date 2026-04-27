import { getSharedRedisConnection } from "../config/redis";
import {
  acquireDistributedLock,
  releaseDistributedLock,
} from "./distributedLock.service";

const LOCK_TTL_MS = 5 * 60 * 1000;

const buildKey = (slot: string) => `slot_lock:${slot}`;
const buildMetadataKey = (slot: string) => `${buildKey(slot)}:meta`;

const SLOT_LOCK_METADATA_SEPARATOR = "|";

const DELETE_SLOT_LOCK_METADATA_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export type SlotLockState = {
  slot: string;
  token: string;
  leadId: string | null;
};

export type SlotLockHandle = SlotLockState & {
  release: () => Promise<void>;
};

const encodeSlotLockMetadata = ({
  token,
  leadId,
}: {
  token: string;
  leadId: string;
}) => `${token}${SLOT_LOCK_METADATA_SEPARATOR}${leadId}`;

const parseSlotLockMetadata = (value: string | null): SlotLockState | null => {
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

const cleanupSlotLockMetadata = async (slot: string, metadataValue: string) => {
  await getSharedRedisConnection().eval(
    DELETE_SLOT_LOCK_METADATA_SCRIPT,
    1,
    buildMetadataKey(slot),
    metadataValue
  );
};

/* -----------------------------------------
ACQUIRE LOCK
----------------------------------------- */
export const acquireSlotLock = async (
  slot: string,
  leadId: string
): Promise<SlotLockHandle | null> => {
  const lock = await acquireDistributedLock({
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
    await getSharedRedisConnection().set(
      buildMetadataKey(slot),
      metadataValue,
      "PX",
      LOCK_TTL_MS
    );
  } catch (error) {
    await lock.release().catch(() => undefined);
    throw error;
  }

  return {
    slot,
    token: lock.token,
    leadId,
    release: async () => {
      await releaseSlotLock(slot, lock.token);
    },
  };
};

/* -----------------------------------------
RELEASE LOCK
----------------------------------------- */
export const releaseSlotLock = async (slot: string, token: string) => {
  const metadataValue = await getSharedRedisConnection().get(buildMetadataKey(slot));

  await releaseDistributedLock({
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

/* -----------------------------------------
CHECK LOCK
----------------------------------------- */
export const readSlotLock = async (slot: string): Promise<SlotLockState | null> => {
  const [tokenValue, metadataValue] = await getSharedRedisConnection().mget(
    buildKey(slot),
    buildMetadataKey(slot)
  );

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

export const __slotLockTestInternals = {
  encodeSlotLockMetadata,
  parseSlotLockMetadata,
};
