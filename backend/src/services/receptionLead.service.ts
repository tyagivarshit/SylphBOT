import prisma from "../config/prisma";
import { runWithContactUsageLimit } from "./usage.service";
import { upsertSystemClient } from "./clientUpsert.service";
import {
  createInteractionNormalizerService,
  type NormalizerAdapterKey,
} from "./interactionNormalizer.service";
import { coerceOptionalString } from "./reception.shared";

const normalizer = createInteractionNormalizerService();

const resolveLeadWhere = ({
  businessId,
  adapter,
  payload,
}: {
  businessId: string;
  adapter: NormalizerAdapterKey;
  payload: unknown;
}) => {
  try {
    const normalized = normalizer.normalizePayload(adapter, payload);
    const sender = normalized.envelope.sender;

    if (adapter === "WHATSAPP" || adapter === "VOICE") {
      const phone = coerceOptionalString(sender.phone);
      return phone
        ? {
            businessId,
            phone,
          }
        : null;
    }

    if (adapter === "INSTAGRAM") {
      const instagramId = coerceOptionalString(sender.externalId);
      return instagramId
        ? {
            businessId,
            instagramId,
          }
        : null;
    }

    if (adapter === "EMAIL") {
      const email = coerceOptionalString(sender.email);
      return email
        ? {
            businessId,
            email,
          }
        : null;
    }

    const email = coerceOptionalString(sender.email);
    const phone = coerceOptionalString(sender.phone);

    if (email) {
      return {
        businessId,
        email,
      };
    }

    if (phone) {
      return {
        businessId,
        phone,
      };
    }

    return null;
  } catch {
    return null;
  }
};

const buildLeadCreateData = async ({
  businessId,
  clientId,
  adapter,
  payload,
}: {
  businessId: string;
  clientId?: string | null;
  adapter: NormalizerAdapterKey;
  payload: unknown;
}) => {
  const normalized = normalizer.normalizePayload(adapter, payload);
  const sender = normalized.envelope.sender;
  const systemClient = clientId ? null : await upsertSystemClient(businessId);

  return {
    businessId,
    clientId: clientId || systemClient?.id || null,
    name: coerceOptionalString(sender.displayName),
    phone: coerceOptionalString(sender.phone),
    instagramId:
      adapter === "INSTAGRAM"
        ? coerceOptionalString(sender.externalId)
        : null,
    email: coerceOptionalString(sender.email),
    platform: adapter,
    stage: "NEW",
    followupCount: 0,
  };
};

export const resolveOrCreateReceptionLead = async ({
  businessId,
  clientId,
  adapter,
  payload,
}: {
  businessId: string;
  clientId?: string | null;
  adapter: NormalizerAdapterKey;
  payload: unknown;
}) => {
  const leadWhere = resolveLeadWhere({
    businessId,
    adapter,
    payload,
  });

  if (leadWhere) {
    const existing = await prisma.lead.findFirst({
      where: leadWhere,
    });

    if (existing) {
      return existing;
    }
  }

  const data = await buildLeadCreateData({
    businessId,
    clientId,
    adapter,
    payload,
  });
  const created = await runWithContactUsageLimit(businessId, (tx) =>
    tx.lead.create({
      data,
    })
  );

  return created.result;
};
