export type CalendarProvider = "GOOGLE" | "OUTLOOK" | "INTERNAL";

export type CalendarConnectionRecord = {
  id: string;
  businessId: string;
  credentialId?: string | null;
  provider: CalendarProvider;
  accessToken: string;
  refreshToken: string;
  expiryDate: Date | null;
  externalCalendarId: string | null;
  providerAccountId: string | null;
  status: string;
  scopes: string | null;
  watchChannelId: string | null;
  watchResourceId: string | null;
  watchExpiresAt: Date | null;
  lastWatchRenewedAt: Date | null;
  authFailedAt: Date | null;
  permissionRevokedAt: Date | null;
  lastSyncedAt: Date | null;
  metadata: Record<string, unknown> | null;
};

export type CalendarEventMutationInput = {
  businessId: string;
  appointmentId: string;
  appointmentKey: string;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timezone?: string | null;
  attendees?: Array<{
    email: string;
    name?: string | null;
    optional?: boolean;
  }>;
  location?: string | null;
  meetingJoinUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  externalEventId?: string | null;
};

export type CalendarSlotMutationInput = {
  businessId: string;
  slotId?: string | null;
  slotKey?: string | null;
  startAt: Date;
  endAt: Date;
  reason?: string | null;
  appointmentId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CalendarAvailabilityRequest = {
  businessId: string;
  windowStart: Date;
  windowEnd: Date;
  timezone?: string | null;
  humanId?: string | null;
};

export type CalendarBusyWindow = {
  startAt: Date;
  endAt: Date;
  provider: CalendarProvider;
  priority: number;
  externalEventId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CalendarSyncMetadataInput = {
  businessId: string;
  metadata: Record<string, unknown>;
};

export type CalendarWatchInput = {
  businessId: string;
  callbackUrl: string;
  channelId?: string | null;
  expiresAt?: Date | null;
};

export type CalendarProviderOperationResult = {
  ok: boolean;
  provider: CalendarProvider;
  externalEventId?: string | null;
  externalEventVersion?: string | null;
  watchChannelId?: string | null;
  watchResourceId?: string | null;
  watchExpiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
};

export class CalendarProviderError extends Error {
  code: string;
  retryable: boolean;
  provider: CalendarProvider;
  statusCode: number | null;

  constructor(input: {
    message: string;
    code: string;
    provider: CalendarProvider;
    retryable?: boolean;
    statusCode?: number | null;
  }) {
    super(input.message);
    this.name = "CalendarProviderError";
    this.code = input.code;
    this.provider = input.provider;
    this.retryable = Boolean(input.retryable);
    this.statusCode = Number.isFinite(Number(input.statusCode))
      ? Number(input.statusCode)
      : null;
  }
}

export type CalendarProviderAdapter = {
  provider: CalendarProvider;
  createEvent: (input: {
    connection: CalendarConnectionRecord;
    event: CalendarEventMutationInput;
  }) => Promise<CalendarProviderOperationResult>;
  updateEvent: (input: {
    connection: CalendarConnectionRecord;
    event: CalendarEventMutationInput;
  }) => Promise<CalendarProviderOperationResult>;
  cancelEvent: (input: {
    connection: CalendarConnectionRecord;
    event: CalendarEventMutationInput;
  }) => Promise<CalendarProviderOperationResult>;
  blockSlot: (input: {
    connection: CalendarConnectionRecord;
    slot: CalendarSlotMutationInput;
  }) => Promise<CalendarProviderOperationResult>;
  freeSlot: (input: {
    connection: CalendarConnectionRecord;
    slot: CalendarSlotMutationInput;
  }) => Promise<CalendarProviderOperationResult>;
  fetchAvailability: (input: {
    connection: CalendarConnectionRecord;
    request: CalendarAvailabilityRequest;
  }) => Promise<CalendarBusyWindow[]>;
  syncMetadata: (input: {
    connection: CalendarConnectionRecord;
    metadata: CalendarSyncMetadataInput;
  }) => Promise<CalendarProviderOperationResult>;
  watchSubscription: (input: {
    connection: CalendarConnectionRecord;
    watch: CalendarWatchInput;
  }) => Promise<CalendarProviderOperationResult>;
  refreshWatchSubscription: (input: {
    connection: CalendarConnectionRecord;
    watch: CalendarWatchInput;
  }) => Promise<CalendarProviderOperationResult>;
};

export const normalizeCalendarProvider = (provider: unknown): CalendarProvider => {
  const normalized = String(provider || "INTERNAL").trim().toUpperCase();

  if (normalized === "GOOGLE") {
    return "GOOGLE";
  }

  if (normalized === "OUTLOOK" || normalized === "MICROSOFT") {
    return "OUTLOOK";
  }

  return "INTERNAL";
};

export const classifyProviderError = ({
  provider,
  error,
}: {
  provider: CalendarProvider;
  error: unknown;
}) => {
  const rawStatus = Number(
    (error as any)?.response?.status ||
      (error as any)?.statusCode ||
      (error as any)?.status ||
      0
  );
  const statusCode = Number.isFinite(rawStatus) && rawStatus > 0 ? rawStatus : null;
  const message = String(
    (error as any)?.response?.data?.error?.message ||
      (error as any)?.response?.data?.error_description ||
      (error as any)?.message ||
      error ||
      "calendar_provider_error"
  );
  const lower = message.toLowerCase();

  if (statusCode === 401 || statusCode === 403 || lower.includes("token")) {
    return new CalendarProviderError({
      provider,
      code: "AUTH_FAILED",
      retryable: false,
      statusCode,
      message,
    });
  }

  if (statusCode === 404) {
    return new CalendarProviderError({
      provider,
      code: "NOT_FOUND",
      retryable: false,
      statusCode,
      message,
    });
  }

  if (statusCode === 409 || lower.includes("conflict")) {
    return new CalendarProviderError({
      provider,
      code: "CONFLICT",
      retryable: false,
      statusCode,
      message,
    });
  }

  if (statusCode === 429 || lower.includes("rate")) {
    return new CalendarProviderError({
      provider,
      code: "RATE_LIMITED",
      retryable: true,
      statusCode,
      message,
    });
  }

  if (
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("network")
  ) {
    return new CalendarProviderError({
      provider,
      code: "TIMEOUT",
      retryable: true,
      statusCode,
      message,
    });
  }

  return new CalendarProviderError({
    provider,
    code: "UNKNOWN",
    retryable: true,
    statusCode,
    message,
  });
};
