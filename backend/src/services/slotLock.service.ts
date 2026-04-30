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

const APPOINTMENT_HOLD_LOCK_SEPARATOR = "|";

const buildAppointmentHoldKey = ({
  businessId,
  slotKey,
}: {
  businessId: string;
  slotKey: string;
}) => `appointment_hold:${businessId}:${slotKey}`;

const buildAppointmentHoldMetadataKey = ({
  businessId,
  slotKey,
}: {
  businessId: string;
  slotKey: string;
}) => `${buildAppointmentHoldKey({ businessId, slotKey })}:meta`;

const encodeAppointmentHoldMetadata = ({
  token,
  appointmentKey,
  heldBy,
}: {
  token: string;
  appointmentKey: string;
  heldBy: string;
}) => [token, appointmentKey, heldBy].join(APPOINTMENT_HOLD_LOCK_SEPARATOR);

const parseAppointmentHoldMetadata = (
  value: string | null
): {
  token: string;
  appointmentKey: string;
  heldBy: string;
} | null => {
  if (!value) {
    return null;
  }

  const [token, appointmentKey, heldBy] = value.split(
    APPOINTMENT_HOLD_LOCK_SEPARATOR
  );

  if (!token || !appointmentKey) {
    return null;
  }

  return {
    token: token.trim(),
    appointmentKey: appointmentKey.trim(),
    heldBy: String(heldBy || "").trim() || "SYSTEM",
  };
};

export type AppointmentSlotHoldState = {
  businessId: string;
  slotKey: string;
  token: string;
  appointmentKey: string;
  heldBy: string;
};

export type AppointmentSlotHoldHandle = AppointmentSlotHoldState & {
  expiresAt: Date;
  release: () => Promise<void>;
};

const cleanupAppointmentHoldMetadata = async ({
  businessId,
  slotKey,
  metadataValue,
}: {
  businessId: string;
  slotKey: string;
  metadataValue: string;
}) => {
  await getSharedRedisConnection().eval(
    DELETE_SLOT_LOCK_METADATA_SCRIPT,
    1,
    buildAppointmentHoldMetadataKey({
      businessId,
      slotKey,
    }),
    metadataValue
  );
};

export const acquireAppointmentSlotHold = async ({
  businessId,
  slotKey,
  appointmentKey,
  heldBy = "SYSTEM",
  ttlMs = 5 * 60 * 1000,
}: {
  businessId: string;
  slotKey: string;
  appointmentKey: string;
  heldBy?: string;
  ttlMs?: number;
}): Promise<AppointmentSlotHoldHandle | null> => {
  const lock = await acquireDistributedLock({
    key: buildAppointmentHoldKey({
      businessId,
      slotKey,
    }),
    ttlMs: Math.max(30_000, ttlMs),
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
    await getSharedRedisConnection().set(
      metadataKey,
      metadataValue,
      "PX",
      Math.max(30_000, ttlMs)
    );
  } catch (error) {
    await lock.release().catch(() => undefined);
    throw error;
  }

  return {
    businessId,
    slotKey,
    token: lock.token,
    appointmentKey,
    heldBy,
    expiresAt: new Date(Date.now() + Math.max(30_000, ttlMs)),
    release: async () => {
      await releaseAppointmentSlotHold({
        businessId,
        slotKey,
        token: lock.token,
      });
    },
  };
};

export const readAppointmentSlotHold = async ({
  businessId,
  slotKey,
}: {
  businessId: string;
  slotKey: string;
}): Promise<AppointmentSlotHoldState | null> => {
  const [tokenValue, metadataValue] = await getSharedRedisConnection().mget(
    buildAppointmentHoldKey({
      businessId,
      slotKey,
    }),
    buildAppointmentHoldMetadataKey({
      businessId,
      slotKey,
    })
  );

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

export const releaseAppointmentSlotHold = async ({
  businessId,
  slotKey,
  token,
}: {
  businessId: string;
  slotKey: string;
  token: string;
}) => {
  const metadataKey = buildAppointmentHoldMetadataKey({
    businessId,
    slotKey,
  });
  const metadataValue = await getSharedRedisConnection().get(metadataKey);

  await releaseDistributedLock({
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

export const __appointmentSlotHoldTestInternals = {
  encodeAppointmentHoldMetadata,
  parseAppointmentHoldMetadata,
};
