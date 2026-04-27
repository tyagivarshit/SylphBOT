import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import {
  buildReceptionEventDedupeKey,
  publishReceptionEvent,
  type ReceptionEventWriter,
} from "./receptionEvent.service";
import {
  buildReferenceMetadata,
  coerceDate,
  coerceOptionalString,
  hashDeterministicValue,
  mergeJsonRecords,
  normalizeToken,
  toRecord,
  type CanonicalInboundAttachment,
  type CanonicalInboundChannel,
  type CanonicalInboundEnvelope,
  type CanonicalInteractionType,
  type InboundLifecycleState,
  type InboundInteractionAuthorityRecord,
  type JsonRecord,
  type PriorityLevel,
  type ReceptionContextReferences,
} from "./reception.shared";

export const NORMALIZER_ADAPTER_KEYS = [
  "WHATSAPP",
  "INSTAGRAM",
  "EMAIL",
  "FORM",
  "VOICE",
] as const;

export type NormalizerAdapterKey = (typeof NORMALIZER_ADAPTER_KEYS)[number];

export type NormalizeInboundInteractionCommand = {
  businessId: string;
  leadId: string;
  clientId?: string | null;
  adapter: NormalizerAdapterKey;
  payload: unknown;
  correlationId?: string | null;
  traceId?: string | null;
  metadata?: JsonRecord | null;
  references?: ReceptionContextReferences | null;
};

export type NormalizedInboundInteractionDraft = {
  businessId: string;
  leadId: string;
  clientId: string | null;
  channel: CanonicalInboundChannel;
  providerMessageId: string | null;
  externalInteractionKey: string;
  interactionType: CanonicalInteractionType;
  direction: "INBOUND";
  payload: Record<string, unknown>;
  normalizedPayload: CanonicalInboundEnvelope;
  fingerprint: string;
  correlationId: string | null;
  traceId: string | null;
  metadata: JsonRecord | null;
};

export type NormalizedInboundInteractionResult = {
  interaction: InboundInteractionAuthorityRecord;
  draft: NormalizedInboundInteractionDraft;
  envelope: CanonicalInboundEnvelope;
};

export type InboundInteractionWriteRepository = {
  upsertCanonicalInteraction: (
    draft: NormalizedInboundInteractionDraft
  ) => Promise<InboundInteractionAuthorityRecord>;
};

type NormalizeContext = {
  now?: Date;
};

type NormalizerAdapter = {
  key: NormalizerAdapterKey;
  channel: CanonicalInboundChannel;
  normalize: (
    payload: unknown,
    context?: NormalizeContext
  ) => {
    interactionType: CanonicalInteractionType;
    envelope: CanonicalInboundEnvelope;
  };
};

export const INBOUND_INTERACTION_SELECT = {
  id: true,
  businessId: true,
  leadId: true,
  clientId: true,
  channel: true,
  providerMessageId: true,
  externalInteractionKey: true,
  interactionType: true,
  direction: true,
  payload: true,
  normalizedPayload: true,
  fingerprint: true,
  lifecycleState: true,
  intentClass: true,
  urgencyClass: true,
  sentimentClass: true,
  spamScore: true,
  priorityScore: true,
  priorityLevel: true,
  routeDecision: true,
  assignedQueueId: true,
  assignedHumanId: true,
  slaDeadline: true,
  correlationId: true,
  traceId: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} as const;

const normalizeLanguage = (value: unknown) =>
  coerceOptionalString(value)?.toLowerCase() || null;

const buildAttachment = (
  kind: string,
  input?: Record<string, unknown> | null
): CanonicalInboundAttachment | null => {
  if (!input) {
    return null;
  }

  return {
    kind,
    url:
      coerceOptionalString(input.url) ||
      coerceOptionalString(input.link) ||
      coerceOptionalString(input.href),
    mimeType:
      coerceOptionalString(input.mimeType) ||
      coerceOptionalString(input.mime_type),
    name:
      coerceOptionalString(input.filename) ||
      coerceOptionalString(input.name) ||
      null,
    sizeBytes: Number.isFinite(Number(input.size))
      ? Number(input.size)
      : Number.isFinite(Number(input.file_size))
      ? Number(input.file_size)
      : null,
    metadata: Object.keys(input).length ? input : null,
  };
};

const collectExplicitAttachments = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => {
          const attachment = toRecord(item);

          return buildAttachment(
            coerceOptionalString(attachment.kind) ||
              coerceOptionalString(attachment.type) ||
              "FILE",
            attachment
          );
        })
        .filter((item): item is CanonicalInboundAttachment => Boolean(item))
    : [];

const normalizeMessageValue = (value: unknown) => {
  const message = coerceOptionalString(value);
  return message ? message.replace(/\s+/g, " ").trim() : null;
};

const buildEnvelope = ({
  channel,
  sender,
  message,
  attachments,
  language,
  rawIntentHint,
  receivedAt,
  providerMessageId,
  threadId,
  metadata,
}: {
  channel: CanonicalInboundChannel;
  sender: {
    externalId?: unknown;
    displayName?: unknown;
    phone?: unknown;
    email?: unknown;
    handle?: unknown;
  };
  message?: unknown;
  attachments: CanonicalInboundAttachment[];
  language?: unknown;
  rawIntentHint?: unknown;
  receivedAt?: unknown;
  providerMessageId?: unknown;
  threadId?: unknown;
  metadata: JsonRecord;
}): CanonicalInboundEnvelope => ({
  channel,
  sender: {
    externalId: coerceOptionalString(sender.externalId),
    displayName: coerceOptionalString(sender.displayName),
    phone: coerceOptionalString(sender.phone),
    email: coerceOptionalString(sender.email),
    handle: coerceOptionalString(sender.handle),
  },
  message: normalizeMessageValue(message),
  attachments,
  language: normalizeLanguage(language),
  rawIntentHint: coerceOptionalString(rawIntentHint),
  receivedAt: coerceDate(receivedAt).toISOString(),
  providerMessageId: coerceOptionalString(providerMessageId),
  threadId: coerceOptionalString(threadId),
  metadata,
});

const whatsappAdapter: NormalizerAdapter = {
  key: "WHATSAPP",
  channel: "WHATSAPP",
  normalize(payload, context) {
    const root = toRecord(payload);
    const message = toRecord(Array.isArray(root.messages) ? root.messages[0] : null);
    const contact = toRecord(Array.isArray(root.contacts) ? root.contacts[0] : null);
    const text = toRecord(message.text);
    const interactive = toRecord(message.interactive);
    const button = toRecord(message.button);
    const attachments = [
      buildAttachment("IMAGE", toRecord(message.image)),
      buildAttachment("VIDEO", toRecord(message.video)),
      buildAttachment("DOCUMENT", toRecord(message.document)),
      buildAttachment("AUDIO", toRecord(message.audio)),
      ...collectExplicitAttachments(root.attachments),
    ].filter((item): item is CanonicalInboundAttachment => Boolean(item));

    return {
      interactionType: "MESSAGE",
      envelope: buildEnvelope({
        channel: "WHATSAPP",
        sender: {
          externalId:
            coerceOptionalString(contact.wa_id) ||
            coerceOptionalString(message.from),
          displayName: coerceOptionalString(toRecord(contact.profile).name),
          phone:
            coerceOptionalString(contact.wa_id) ||
            coerceOptionalString(message.from),
          email: null,
          handle: null,
        },
        message:
          text.body ||
          button.text ||
          toRecord(interactive.button_reply).title ||
          toRecord(interactive.list_reply).title ||
          null,
        attachments,
        language:
          toRecord(message.language).code ||
          toRecord(root.metadata).display_phone_number ||
          null,
        rawIntentHint:
          coerceOptionalString(root.intentHint) ||
          coerceOptionalString(root.rawIntentHint),
        receivedAt: message.timestamp || root.receivedAt || context?.now || new Date(),
        providerMessageId: message.id || root.providerMessageId || null,
        threadId:
          coerceOptionalString(toRecord(message.context).id) ||
          coerceOptionalString(root.threadId) ||
          coerceOptionalString(contact.wa_id),
        metadata: mergeJsonRecords(toRecord(root.metadata), {
          transport: "WHATSAPP_WEBHOOK",
        }) || {},
      }),
    };
  },
};

const instagramAdapter: NormalizerAdapter = {
  key: "INSTAGRAM",
  channel: "INSTAGRAM",
  normalize(payload, context) {
    const root = toRecord(payload);
    const sender = toRecord(root.from);
    const attachments = collectExplicitAttachments(root.attachments);
    const message = normalizeMessageValue(
      root.text ||
        root.message ||
        toRecord(root.comment).text ||
        toRecord(root.review).text
    );
    const interactionType: CanonicalInteractionType = toRecord(root.review).text
      ? "REVIEW"
      : toRecord(root.comment).text
      ? "COMMENT"
      : "DM";

    return {
      interactionType,
      envelope: buildEnvelope({
        channel: "INSTAGRAM",
        sender: {
          externalId: coerceOptionalString(sender.id) || coerceOptionalString(root.senderId),
          displayName:
            coerceOptionalString(sender.name) ||
            coerceOptionalString(sender.username),
          phone: null,
          email: null,
          handle:
            coerceOptionalString(sender.username) ||
            coerceOptionalString(root.handle),
        },
        message,
        attachments,
        language: root.language || null,
        rawIntentHint:
          coerceOptionalString(root.intentHint) ||
          coerceOptionalString(root.rawIntentHint),
        receivedAt: root.createdAt || root.receivedAt || context?.now || new Date(),
        providerMessageId: root.mid || root.messageId || root.providerMessageId || null,
        threadId: root.threadId || root.conversationId || root.mediaId || null,
        metadata: mergeJsonRecords(toRecord(root.metadata), {
          transport: "INSTAGRAM_WEBHOOK",
        }) || {},
      }),
    };
  },
};

const emailAdapter: NormalizerAdapter = {
  key: "EMAIL",
  channel: "EMAIL",
  normalize(payload, context) {
    const root = toRecord(payload);
    const from = toRecord(root.from);
    const attachments = collectExplicitAttachments(root.attachments);
    const subject = normalizeMessageValue(root.subject);
    const body =
      normalizeMessageValue(root.text) ||
      normalizeMessageValue(root.bodyText) ||
      normalizeMessageValue(root.body);

    return {
      interactionType: "EMAIL",
      envelope: buildEnvelope({
        channel: "EMAIL",
        sender: {
          externalId:
            coerceOptionalString(from.email) ||
            coerceOptionalString(root.sender),
          displayName: coerceOptionalString(from.name),
          phone: null,
          email:
            coerceOptionalString(from.email) ||
            coerceOptionalString(root.sender),
          handle: null,
        },
        message: body || subject,
        attachments,
        language: root.language || null,
        rawIntentHint: subject,
        receivedAt: root.receivedAt || root.date || context?.now || new Date(),
        providerMessageId:
          root.messageId || root.providerMessageId || root.internetMessageId || null,
        threadId: root.threadId || root.references || root.inReplyTo || null,
        metadata:
          mergeJsonRecords(toRecord(root.metadata), {
            transport: "EMAIL_INGEST",
            subject: subject,
          }) || {},
      }),
    };
  },
};

const formAdapter: NormalizerAdapter = {
  key: "FORM",
  channel: "FORM",
  normalize(payload, context) {
    const root = toRecord(payload);
    const fields = toRecord(root.fields);
    const message =
      normalizeMessageValue(root.message) ||
      normalizeMessageValue(fields.message) ||
      normalizeMessageValue(fields.notes) ||
      normalizeMessageValue(fields.description);

    return {
      interactionType: "FORM",
      envelope: buildEnvelope({
        channel: "FORM",
        sender: {
          externalId:
            coerceOptionalString(root.email) ||
            coerceOptionalString(root.phone) ||
            coerceOptionalString(root.submissionId),
          displayName: coerceOptionalString(root.name) || coerceOptionalString(fields.name),
          phone: coerceOptionalString(root.phone) || coerceOptionalString(fields.phone),
          email: coerceOptionalString(root.email) || coerceOptionalString(fields.email),
          handle: null,
        },
        message,
        attachments: collectExplicitAttachments(root.attachments),
        language: root.language || null,
        rawIntentHint:
          coerceOptionalString(root.intentHint) ||
          coerceOptionalString(fields.intent),
        receivedAt: root.receivedAt || root.submittedAt || context?.now || new Date(),
        providerMessageId: root.submissionId || root.providerMessageId || null,
        threadId: root.formId || root.threadId || null,
        metadata:
          mergeJsonRecords(toRecord(root.metadata), {
            transport: "FORM_INGEST",
            fields,
          }) || {},
      }),
    };
  },
};

const voiceAdapter: NormalizerAdapter = {
  key: "VOICE",
  channel: "VOICE",
  normalize(payload, context) {
    const root = toRecord(payload);
    const transcript =
      normalizeMessageValue(root.transcript) ||
      normalizeMessageValue(root.text) ||
      normalizeMessageValue(root.summary);
    const audio = buildAttachment("AUDIO", {
      url:
        coerceOptionalString(root.audioUrl) ||
        coerceOptionalString(root.recordingUrl),
      mimeType:
        coerceOptionalString(root.mimeType) ||
        "audio/mpeg",
    });

    return {
      interactionType: "CALL",
      envelope: buildEnvelope({
        channel: "VOICE",
        sender: {
          externalId:
            coerceOptionalString(root.from) ||
            coerceOptionalString(root.callerId) ||
            coerceOptionalString(root.callId),
          displayName: coerceOptionalString(root.name),
          phone:
            coerceOptionalString(root.from) ||
            coerceOptionalString(root.callerId),
          email: null,
          handle: null,
        },
        message: transcript,
        attachments: audio ? [audio] : [],
        language: root.language || null,
        rawIntentHint:
          coerceOptionalString(root.intentHint) ||
          coerceOptionalString(root.callReason),
        receivedAt: root.receivedAt || root.completedAt || context?.now || new Date(),
        providerMessageId: root.transcriptId || root.callId || root.providerMessageId || null,
        threadId: root.threadId || root.callId || null,
        metadata:
          mergeJsonRecords(toRecord(root.metadata), {
            transport: "VOICE_TRANSCRIPT",
          }) || {},
      }),
    };
  },
};

const DEFAULT_NORMALIZER_ADAPTERS: Record<NormalizerAdapterKey, NormalizerAdapter> = {
  WHATSAPP: whatsappAdapter,
  INSTAGRAM: instagramAdapter,
  EMAIL: emailAdapter,
  FORM: formAdapter,
  VOICE: voiceAdapter,
};

export const toInboundInteractionRecord = (
  row: any
): InboundInteractionAuthorityRecord => ({
  id: row.id,
  businessId: row.businessId,
  leadId: row.leadId,
  clientId: row.clientId || null,
  channel: normalizeToken(row.channel, "WHATSAPP") as CanonicalInboundChannel,
  providerMessageId: row.providerMessageId || null,
  externalInteractionKey: row.externalInteractionKey,
  interactionType: normalizeToken(
    row.interactionType,
    "MESSAGE"
  ) as CanonicalInteractionType,
  direction: "INBOUND",
  payload: row.payload,
  normalizedPayload: row.normalizedPayload || null,
  fingerprint: row.fingerprint || null,
  lifecycleState: normalizeToken(
    row.lifecycleState,
    "RECEIVED"
  ) as InboundLifecycleState,
  intentClass: row.intentClass || null,
  urgencyClass: row.urgencyClass || null,
  sentimentClass: row.sentimentClass || null,
  spamScore: Number(row.spamScore || 0),
  priorityScore: Number(row.priorityScore || 0),
  priorityLevel: row.priorityLevel
    ? (normalizeToken(row.priorityLevel, "MEDIUM") as PriorityLevel)
    : null,
  routeDecision: row.routeDecision || null,
  assignedQueueId: row.assignedQueueId || null,
  assignedHumanId: row.assignedHumanId || null,
  slaDeadline: row.slaDeadline || null,
  correlationId: row.correlationId || null,
  traceId: row.traceId || null,
  metadata: toRecord(row.metadata),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const buildInboundInteractionFingerprint = (
  envelope: CanonicalInboundEnvelope
) =>
  hashDeterministicValue({
    channel: envelope.channel,
    sender: envelope.sender,
    message: envelope.message,
    attachments: envelope.attachments,
    language: envelope.language,
    rawIntentHint: envelope.rawIntentHint,
    providerMessageId: envelope.providerMessageId,
    threadId: envelope.threadId,
  });

export const buildExternalInteractionKey = ({
  businessId,
  channel,
  interactionType,
  envelope,
  fingerprint,
}: {
  businessId: string;
  channel: CanonicalInboundChannel;
  interactionType: CanonicalInteractionType;
  envelope: CanonicalInboundEnvelope;
  fingerprint: string;
}) => {
  const providerMessageId = coerceOptionalString(envelope.providerMessageId);

  if (providerMessageId) {
    return [
      "inbound",
      businessId,
      channel,
      interactionType,
      providerMessageId,
    ].join(":");
  }

  return [
    "inbound",
    businessId,
    channel,
    interactionType,
    hashDeterministicValue({
      fingerprint,
      threadId: envelope.threadId,
      sender: envelope.sender,
      receivedAt: envelope.receivedAt,
    }),
  ].join(":");
};

export const buildNormalizedInboundInteractionDraft = ({
  businessId,
  leadId,
  clientId,
  interactionType,
  envelope,
  payload,
  correlationId,
  traceId,
  metadata,
  references,
}: NormalizeInboundInteractionCommand & {
  interactionType: CanonicalInteractionType;
  envelope: CanonicalInboundEnvelope;
}) => {
  const fingerprint = buildInboundInteractionFingerprint(envelope);
  const externalInteractionKey = buildExternalInteractionKey({
    businessId,
    channel: envelope.channel,
    interactionType,
    envelope,
    fingerprint,
  });

  return {
    businessId,
    leadId,
    clientId: clientId || null,
    channel: envelope.channel,
    providerMessageId: envelope.providerMessageId,
    externalInteractionKey,
    interactionType,
    direction: "INBOUND" as const,
    payload: toRecord(payload),
    normalizedPayload: envelope,
    fingerprint,
    correlationId: correlationId || externalInteractionKey,
    traceId: traceId || null,
    metadata:
      mergeJsonRecords(
        metadata,
        {
          intakeAdapter: envelope.channel,
        },
        buildReferenceMetadata(references)
      ) || null,
  };
};

export const createPrismaInboundInteractionWriteRepository =
  (): InboundInteractionWriteRepository => ({
    upsertCanonicalInteraction: async (draft) => {
      const row = await prisma.inboundInteraction.upsert({
        where: {
          externalInteractionKey: draft.externalInteractionKey,
        },
        update: {
          providerMessageId: draft.providerMessageId,
          payload: draft.payload as Prisma.InputJsonValue,
          normalizedPayload: draft.normalizedPayload as unknown as Prisma.InputJsonValue,
          fingerprint: draft.fingerprint,
          lifecycleState: "NORMALIZED",
          correlationId: draft.correlationId,
          traceId: draft.traceId,
          metadata: draft.metadata as Prisma.InputJsonValue,
        },
        create: {
          businessId: draft.businessId,
          leadId: draft.leadId,
          clientId: draft.clientId,
          channel: draft.channel,
          providerMessageId: draft.providerMessageId,
          externalInteractionKey: draft.externalInteractionKey,
          interactionType: draft.interactionType,
          direction: draft.direction,
          payload: draft.payload as Prisma.InputJsonValue,
          normalizedPayload: draft.normalizedPayload as unknown as Prisma.InputJsonValue,
          fingerprint: draft.fingerprint,
          lifecycleState: "NORMALIZED",
          correlationId: draft.correlationId,
          traceId: draft.traceId,
          metadata: draft.metadata as Prisma.InputJsonValue,
        },
        select: INBOUND_INTERACTION_SELECT,
      });

      return toInboundInteractionRecord(row);
    },
  });

export const createInteractionNormalizerService = ({
  repository = createPrismaInboundInteractionWriteRepository(),
  eventWriter = publishReceptionEvent,
  adapters = DEFAULT_NORMALIZER_ADAPTERS,
}: {
  repository?: InboundInteractionWriteRepository;
  eventWriter?: ReceptionEventWriter;
  adapters?: Record<NormalizerAdapterKey, NormalizerAdapter>;
} = {}) => ({
  normalizePayload: (
    adapterKey: NormalizerAdapterKey,
    payload: unknown,
    context?: NormalizeContext
  ) => {
    const adapter = adapters[adapterKey];

    if (!adapter) {
      throw new Error(`unsupported_inbound_adapter:${adapterKey}`);
    }

    return adapter.normalize(payload, context);
  },
  ingest: async (
    command: NormalizeInboundInteractionCommand
  ): Promise<NormalizedInboundInteractionResult> => {
    const adapter = adapters[command.adapter];

    if (!adapter) {
      throw new Error(`unsupported_inbound_adapter:${command.adapter}`);
    }

    const normalized = adapter.normalize(command.payload);
    const draft = buildNormalizedInboundInteractionDraft({
      ...command,
      interactionType: normalized.interactionType,
      envelope: normalized.envelope,
    });
    const interaction = await repository.upsertCanonicalInteraction(draft);
    const receivedAt = draft.normalizedPayload.receivedAt;

    await eventWriter({
      event: "inbound.received",
      businessId: interaction.businessId,
      aggregateType: "inbound_interaction",
      aggregateId: interaction.id,
      eventKey: draft.externalInteractionKey,
      dedupeKey: buildReceptionEventDedupeKey({
        event: "inbound.received",
        aggregateId: interaction.id,
        eventKey: draft.externalInteractionKey,
      }),
      payload: {
        interactionId: interaction.id,
        businessId: interaction.businessId,
        leadId: interaction.leadId,
        clientId: interaction.clientId,
        channel: interaction.channel,
        interactionType: interaction.interactionType,
        externalInteractionKey: interaction.externalInteractionKey,
        providerMessageId: interaction.providerMessageId,
        correlationId: interaction.correlationId,
        traceId: interaction.traceId,
        fingerprint: interaction.fingerprint,
        receivedAt,
      },
    });

    await eventWriter({
      event: "inbound.normalized",
      businessId: interaction.businessId,
      aggregateType: "inbound_interaction",
      aggregateId: interaction.id,
      eventKey: draft.externalInteractionKey,
      payload: {
        interactionId: interaction.id,
        businessId: interaction.businessId,
        leadId: interaction.leadId,
        channel: interaction.channel,
        interactionType: interaction.interactionType,
        normalizedPayload: draft.normalizedPayload,
        traceId: interaction.traceId,
        receivedAt,
      },
    });

    return {
      interaction,
      draft,
      envelope: draft.normalizedPayload,
    };
  },
});
