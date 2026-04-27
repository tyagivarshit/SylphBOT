import {
  getReplyDeliveryState,
  markReplyConfirmed,
  markReplySent,
} from "./aiPipelineState.service";

export type ReplyDeliveryMode = "platform" | "local_preview" | "local_only";

type ReplyDeliveryStateSnapshot = Awaited<
  ReturnType<typeof getReplyDeliveryState>
>;

export type ConfirmedReplyPayload = NonNullable<
  ReplyDeliveryStateSnapshot["confirmedReply"]
>;

export type ReplyConfirmationPayloadInput = {
  text: string;
  cta?: string | null;
  angle?: string | null;
  variantId?: string | null;
  variantKey?: string | null;
  leadState?: string | null;
  messageType?: string | null;
  meta?: Record<string, unknown>;
  source?: string | null;
  latencyMs?: number | null;
  traceId?: string | null;
};

type FinalizeConfirmedReplyContext<TMessage> = {
  jobKey: string;
  confirmedAt: string;
  mode: ReplyDeliveryMode;
  platform: string | null;
  reply: ConfirmedReplyPayload;
  message: TMessage;
  created: boolean;
};

const isReplyDeliveryMode = (value: unknown): value is ReplyDeliveryMode =>
  value === "platform" || value === "local_preview" || value === "local_only";

export const toConfirmedReplyPayload = (
  reply: ReplyConfirmationPayloadInput
): ConfirmedReplyPayload => ({
  text: reply.text,
  cta: reply.cta || null,
  angle: reply.angle || null,
  variantId: reply.variantId || null,
  variantKey: reply.variantKey || null,
  leadState: reply.leadState || null,
  messageType: reply.messageType || null,
  meta: reply.meta || {},
  source: reply.source || null,
  latencyMs:
    typeof reply.latencyMs === "number" ? reply.latencyMs : null,
  traceId: reply.traceId || null,
});

export const checkpointReplyConfirmation = async (
  jobKey: string,
  input: {
    confirmedAt: string;
    deliveryMode: ReplyDeliveryMode;
    platform?: string | null;
    confirmedReply: ReplyConfirmationPayloadInput;
  }
) =>
  markReplyConfirmed(jobKey, {
    confirmedAt: input.confirmedAt,
    deliveryMode: input.deliveryMode,
    platform: input.platform || null,
    confirmedReply: toConfirmedReplyPayload(input.confirmedReply),
  });

export const finalizeCheckpointedReplyDelivery = async <TMessage>({
  jobKey,
  fallbackDeliveryMode,
  fallbackPlatform = null,
  fallbackConfirmedAt,
  persistConfirmedReply,
  afterPersist,
  beforeSent,
  afterSent,
}: {
  jobKey: string;
  fallbackDeliveryMode: ReplyDeliveryMode;
  fallbackPlatform?: string | null;
  fallbackConfirmedAt?: string;
  persistConfirmedReply: (
    context: Omit<
      FinalizeConfirmedReplyContext<TMessage>,
      "message" | "created"
    >
  ) => Promise<{
    message: TMessage;
    created: boolean;
  }>;
  afterPersist?: (
    context: FinalizeConfirmedReplyContext<TMessage>
  ) => Promise<void>;
  beforeSent?: (
    context: FinalizeConfirmedReplyContext<TMessage>
  ) => Promise<void>;
  afterSent?: (
    context: FinalizeConfirmedReplyContext<TMessage>
  ) => Promise<void>;
}) => {
  const currentState = await getReplyDeliveryState(jobKey);

  if (!currentState.confirmed || !currentState.confirmedReply) {
    throw new Error("reply_confirmation_checkpoint_missing");
  }

  const context = {
    jobKey,
    confirmedAt:
      currentState.confirmedAt || fallbackConfirmedAt || new Date().toISOString(),
    mode: isReplyDeliveryMode(currentState.deliveryMode)
      ? currentState.deliveryMode
      : fallbackDeliveryMode,
    platform: currentState.platform || fallbackPlatform || null,
    reply: toConfirmedReplyPayload(currentState.confirmedReply),
  };

  const persisted = await persistConfirmedReply(context);
  const finalizeContext = {
    ...context,
    ...persisted,
  };

  await afterPersist?.(finalizeContext);
  await beforeSent?.(finalizeContext);
  await markReplySent(jobKey);
  await afterSent?.(finalizeContext);

  return finalizeContext;
};
