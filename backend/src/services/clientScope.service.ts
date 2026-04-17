import prisma from "../config/prisma";
import { upsertSystemClient } from "./clientUpsert.service";

export const normalizeClientId = (value?: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

export const getSystemClient = async (businessId: string) => {
  return upsertSystemClient(businessId);
};

export const getScopedTrainingClient = async (
  businessId: string,
  requestedClientId?: string | null
) => {
  const clientId = normalizeClientId(requestedClientId);

  if (!clientId) {
    return getSystemClient(businessId);
  }

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      businessId,
      isActive: true,
    },
  });

  if (!client) {
    throw new Error("Client not found");
  }

  return client;
};

export const buildKnowledgeScopeFilter = ({
  businessId,
  clientId,
  includeShared = true,
}: {
  businessId: string;
  clientId?: string | null;
  includeShared?: boolean;
}) => {
  const normalizedClientId = normalizeClientId(clientId);

  if (!normalizedClientId) {
    return {
      businessId,
      clientId: null,
    };
  }

  if (includeShared) {
    return {
      businessId,
      OR: [{ clientId: normalizedClientId }, { clientId: null }],
    };
  }

  return {
    businessId,
    clientId: normalizedClientId,
  };
};

export const formatClientScopeLabel = (client?: {
  platform?: string | null;
  pageId?: string | null;
  phoneNumberId?: string | null;
}) => {
  if (!client) {
    return "Shared";
  }

  const suffix = client.pageId || client.phoneNumberId || "";
  return suffix
    ? `${client.platform || "CLIENT"} • ${suffix.slice(-6)}`
    : client.platform || "CLIENT";
};
