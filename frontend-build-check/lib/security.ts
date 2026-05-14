import {
  apiClient,
  getApiErrorData,
  getApiErrorMessage,
  getApiErrorStatus,
} from "@/lib/apiClient";

export type ApiKeyScope = "READ_ONLY" | "WRITE" | "ADMIN";

export type ApiKeySummary = {
  id: string;
  prefix?: string;
  name: string | null;
  permissions: string[];
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  createdAt: string;
  maskedKey: string;
  role?: string | null;
  createdByUser?: {
    id: string;
    email?: string | null;
    role?: string | null;
  } | null;
};

export type ApiKeySecret = {
  id: string;
  businessId: string;
  permissions: string[];
  scopes: ApiKeyScope[];
  name: string | null;
  rawKey: string;
  maskedKey: string;
  createdAt: string;
  revokedApiKeyId?: string | null;
};

export type CreateApiKeyInput = {
  name: string;
  scopes: ApiKeyScope[];
};

export type AuditLogEntry = {
  id: string;
  action: string;
  userId: string | null;
  businessId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
  user?: {
    id: string;
    email?: string | null;
    name?: string | null;
    role?: string | null;
  } | null;
};

export type AuditPagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type AuditLogQuery = {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  userId?: string;
  action?: string;
};

export type AuditLogResponse = {
  logs: AuditLogEntry[];
  pagination: AuditPagination;
};

export type SecurityAlertRecord = {
  id: string;
  type: string;
  metadata: unknown;
  createdAt: string;
};

export type SecurityAlertsResponse = {
  alerts: SecurityAlertRecord[];
  unsupported: boolean;
};

export class SecurityRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "SecurityRequestError";
    this.status = status;
    this.payload = payload ?? null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const readJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const getNestedRecord = (value: unknown, key: string) =>
  isRecord(value) && isRecord(value[key]) ? (value[key] as Record<string, unknown>) : null;

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (isRecord(payload)) {
    if (hasString(payload.message)) {
      return payload.message;
    }

    if (hasString(payload.error)) {
      return payload.error;
    }
  }

  const nestedData = getNestedRecord(payload, "data");

  if (nestedData) {
    if (hasString(nestedData.message)) {
      return nestedData.message;
    }

    if (hasString(nestedData.error)) {
      return nestedData.error;
    }
  }

  return fallback;
};

const getDataNode = (payload: unknown) =>
  getNestedRecord(payload, "data") ?? payload;

const readRecordValue = (record: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

const extractArray = <T>(payload: unknown, key: string): T[] => {
  const dataNode = getDataNode(payload);

  if (Array.isArray(dataNode)) {
    return dataNode as T[];
  }

  if (isRecord(dataNode) && Array.isArray(dataNode[key])) {
    return dataNode[key] as T[];
  }

  if (isRecord(payload) && Array.isArray(payload[key])) {
    return payload[key] as T[];
  }

  return [];
};

const extractRecord = (payload: unknown, key: string) => {
  const dataNode = getDataNode(payload);

  if (isRecord(dataNode) && isRecord(dataNode[key])) {
    return dataNode[key];
  }

  if (isRecord(payload) && isRecord(payload[key])) {
    return payload[key];
  }

  return null;
};

const normalizeJsonHeaders = (headers?: HeadersInit) => {
  const nextHeaders = new Headers(headers);

  if (!nextHeaders.has("Content-Type")) {
    nextHeaders.set("Content-Type", "application/json");
  }

  return nextHeaders;
};

const headersToObject = (headers?: HeadersInit) => {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
};

const toBoundaryIso = (value: string, boundary: "start" | "end") => {
  if (!value.trim()) {
    return "";
  }

  const suffix = boundary === "start" ? "T00:00:00.000" : "T23:59:59.999";
  const parsed = new Date(`${value}${suffix}`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
};

const requestJson = async (
  path: string,
  options: RequestInit = {},
  fallbackMessage = "Request failed"
) => {
  try {
    const response = await apiClient.request({
      url: path,
      method: options.method || "GET",
      data: options.body,
      headers: headersToObject(options.headers),
    });

    return response.data;
  } catch (error) {
    const payload = getApiErrorData(error);

    throw new SecurityRequestError(
      getApiErrorMessage(error, fallbackMessage),
      getApiErrorStatus(error) ?? 500,
      payload
    );
  }
};

export const isSecurityRequestError = (
  error: unknown
): error is SecurityRequestError => error instanceof SecurityRequestError;

export async function fetchSecurityApiKeys(): Promise<ApiKeySummary[]> {
  const payload = await requestJson(
    "/security/api-keys",
    undefined,
    "Failed to load API keys"
  );

  return extractArray<ApiKeySummary>(payload, "apiKeys");
}

export async function createSecurityApiKey(
  input: CreateApiKeyInput
): Promise<ApiKeySecret> {
  const payload = await requestJson(
    "/security/api-keys",
    {
      method: "POST",
      headers: normalizeJsonHeaders(),
      body: JSON.stringify({
        name: input.name.trim(),
        scopes: input.scopes,
      }),
    },
    "Failed to create API key"
  );

  const apiKey = extractRecord(payload, "apiKey");

  if (!apiKey) {
    throw new SecurityRequestError("Invalid API key response", 500, payload);
  }

  return apiKey as ApiKeySecret;
}

export async function rotateSecurityApiKey(id: string): Promise<ApiKeySecret> {
  const payload = await requestJson(
    `/security/api-keys/${id}/rotate`,
    {
      method: "POST",
    },
    "Failed to rotate API key"
  );

  const apiKey = extractRecord(payload, "apiKey");

  if (!apiKey) {
    throw new SecurityRequestError("Invalid API key response", 500, payload);
  }

  return apiKey as ApiKeySecret;
}

export async function revokeSecurityApiKey(id: string) {
  await requestJson(
    `/security/api-keys/${id}/revoke`,
    {
      method: "POST",
    },
    "Failed to revoke API key"
  );
}

export async function fetchAuditLogs(
  query: AuditLogQuery
): Promise<AuditLogResponse> {
  const params = new URLSearchParams();

  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? 25));

  if (hasString(query.userId)) {
    params.set("userId", query.userId.trim());
  }

  if (hasString(query.action)) {
    params.set("action", query.action.trim());
  }

  if (hasString(query.from)) {
    params.set("from", toBoundaryIso(query.from, "start"));
  }

  if (hasString(query.to)) {
    params.set("to", toBoundaryIso(query.to, "end"));
  }

  const payload = await requestJson(
    `/audit/logs?${params.toString()}`,
    undefined,
    "Failed to load audit logs"
  );

  const logs = extractArray<AuditLogEntry>(payload, "logs");
  const paginationNode = extractRecord(payload, "pagination");
  const fallbackPagination = {
    total: logs.length,
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    totalPages: 1,
  };
  const paginationRecord = paginationNode ?? fallbackPagination;

  return {
    logs,
    pagination: {
      total: Number(readRecordValue(paginationRecord, "total") ?? logs.length),
      page: Number(
        readRecordValue(paginationRecord, "page") ?? query.page ?? 1
      ),
      limit: Number(
        readRecordValue(paginationRecord, "limit") ?? query.limit ?? 25
      ),
      totalPages: Number(
        readRecordValue(paginationRecord, "totalPages") ?? 1
      ),
    },
  };
}

export async function fetchSecurityAlerts(): Promise<SecurityAlertsResponse> {
  return {
    alerts: [],
    unsupported: true,
  };
}
