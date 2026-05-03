import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { getApiBaseUrl } from "@/lib/url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiResponse<T = any> = {
  success: boolean;
  data: T | null;
  limited: boolean;
  upgradeRequired: boolean;
  unauthorized: boolean;
  message?: string;
  code?: string;
  networkError?: boolean;
};

export type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
};

const REQUEST_TIMEOUT_MS = 7000;
const SERVER_ERROR_TOAST_MESSAGE = "Something went wrong. Please try again.";
let lastServerErrorToastAt = 0;
const inflightRequests = new Map<string, Promise<ApiResponse<unknown>>>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeApiPath = (path: string) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const cleanPath = path.startsWith("/api") ? path.replace(/^\/api/, "") : path;
  return cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
};

const getPayloadMessage = (payload: unknown) =>
  isRecord(payload) && typeof payload.message === "string"
    ? payload.message
    : undefined;

const getPayloadCode = (payload: unknown) =>
  isRecord(payload) && typeof payload.code === "string" ? payload.code : undefined;

const getPayloadBoolean = (payload: unknown, key: string, fallback = false) =>
  isRecord(payload) && typeof payload[key] === "boolean"
    ? (payload[key] as boolean)
    : fallback;

const unwrapPayloadData = <T>(payload: unknown): T | null => {
  if (isRecord(payload) && "data" in payload) {
    return (payload.data as T | null | undefined) ?? null;
  }

  return (payload as T | null | undefined) ?? null;
};

const maybeToastServerError = () => {
  if (typeof window === "undefined") {
    return;
  }

  const now = Date.now();

  if (now - lastServerErrorToastAt < 2000) {
    return;
  }

  lastServerErrorToastAt = now;

  void import("@/lib/toast")
    .then(({ showErrorToast }) => {
      showErrorToast(SERVER_ERROR_TOAST_MESSAGE);
    })
    .catch(() => undefined);
};

const logServerError = (status: number, url: string | undefined, data: unknown) => {
  console.error("API SERVER ERROR:", {
    url,
    status,
    data,
  });
};

const handleServerErrorResponse = (
  response: Pick<AxiosResponse, "status" | "config" | "data">
) => {
  if (response.status < 500) {
    return;
  }

  logServerError(response.status, response.config?.url, response.data);
  maybeToastServerError();
};

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  if (typeof config.url === "string" && config.url.trim()) {
    config.url = normalizeApiPath(config.url);
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    handleServerErrorResponse(response);

    if (
      response.status >= 200 &&
      response.status < 300 &&
      isRecord(response.data) &&
      typeof response.data.success === "boolean" &&
      "data" in response.data
    ) {
      const { data, ...meta } = response.data;

      if (isRecord(data)) {
        response.data = {
          ...data,
          ...meta,
        };
      } else {
        response.data = data;
      }
    }

    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      handleServerErrorResponse(error.response);
    }

    return Promise.reject(error);
  }
);

const headersToObject = (headers?: HeadersInit) => {
  if (!headers) {
    return {} as Record<string, string>;
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return Object.entries(headers).reduce<Record<string, string>>(
    (accumulator, [key, value]) => {
      accumulator[key] = String(value);
      return accumulator;
    },
    {}
  );
};

const getHeader = (headers: Record<string, string>, target: string) => {
  const normalizedTarget = target.toLowerCase();

  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === normalizedTarget
  )?.[1];
};

const removeHeader = (headers: Record<string, string>, target: string) => {
  Object.keys(headers).forEach((key) => {
    if (key.toLowerCase() === target.toLowerCase()) {
      delete headers[key];
    }
  });
};

const resolveRequestBody = (
  body: BodyInit | null | undefined,
  headers: Record<string, string>
) => {
  if (body == null) {
    return undefined;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    removeHeader(headers, "Content-Type");
    return body;
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return body;
  }

  if (typeof body === "string") {
    const contentType = getHeader(headers, "Content-Type");

    if (contentType?.includes("application/json")) {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }

    return body;
  }

  return body;
};

const buildAxiosConfig = (
  path: string,
  options: ApiRequestInit
): AxiosRequestConfig => {
  const headers = headersToObject(options.headers);
  const rawBody = options.body as BodyInit | null | undefined;

  return {
    url: normalizeApiPath(path),
    method: options.method || "GET",
    headers,
    data: resolveRequestBody(rawBody, headers),
    signal: options.signal ?? undefined,
    timeout: typeof options.timeoutMs === "number" ? options.timeoutMs : REQUEST_TIMEOUT_MS,
    validateStatus: () => true,
  };
};

export const getApiErrorStatus = (error: unknown) =>
  axios.isAxiosError(error) ? error.response?.status ?? null : null;

export const getApiErrorData = <T = unknown>(error: unknown): T | null => {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  return (error.response?.data as T | null | undefined) ?? null;
};

export const getApiErrorMessage = (
  error: unknown,
  fallback = "Request failed"
) => {
  const payload = getApiErrorData(error);

  if (getPayloadMessage(payload)) {
    return getPayloadMessage(payload) as string;
  }

  if (axios.isAxiosError(error) && error.message) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

async function coreRequest<T>(
  path: string,
  options: ApiRequestInit,
  retry = false
): Promise<ApiResponse<T>> {
  try {
    const response = await apiClient.request(buildAxiosConfig(path, options));
    const payload = response.data;

    if (response.status === 401) {
      if (!retry) {
        return coreRequest<T>(path, options, true);
      }

      return {
        success: false,
        data: null,
        unauthorized: true,
        limited: false,
        upgradeRequired: false,
        message: getPayloadMessage(payload) || "Unauthorized",
        code: getPayloadCode(payload),
      };
    }

    if (response.status === 403) {
      return {
        success: true,
        data: unwrapPayloadData<T>(payload),
        limited: true,
        upgradeRequired: getPayloadBoolean(payload, "upgradeRequired", true),
        unauthorized: false,
        message: getPayloadMessage(payload),
        code: getPayloadCode(payload),
      };
    }

    if (response.status < 200 || response.status >= 300) {
      return {
        success: false,
        data: null,
        limited: false,
        upgradeRequired: false,
        unauthorized: false,
        message: getPayloadMessage(payload) || "Request failed",
        code: getPayloadCode(payload),
      };
    }

    return {
      success: true,
      data: unwrapPayloadData<T>(payload),
      limited: getPayloadBoolean(payload, "limited", false),
      upgradeRequired: getPayloadBoolean(payload, "upgradeRequired", false),
      unauthorized: false,
      message: getPayloadMessage(payload),
      code: getPayloadCode(payload),
    };
  } catch (error: unknown) {
    const isTimeout =
      axios.isAxiosError(error) && error.code === "ECONNABORTED";

    console.error("FETCH FAILED:", error);

    return {
      success: false,
      data: null,
      limited: false,
      upgradeRequired: false,
      unauthorized: false,
      networkError: true,
      message: isTimeout
        ? "Request timeout"
        : getApiErrorMessage(error, "Network error"),
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetch<T = any>(
  path: string,
  options: ApiRequestInit = {}
): Promise<ApiResponse<T>> {
  const method = String(options.method || "GET").trim().toUpperCase() || "GET";
  const canDedupe = method === "GET" && options.body == null;

  if (!canDedupe) {
    return coreRequest<T>(path, options);
  }

  const dedupeKey = `${method}:${normalizeApiPath(path)}`;
  const existing = inflightRequests.get(dedupeKey) as Promise<ApiResponse<T>> | undefined;

  if (existing) {
    return existing;
  }

  const requestPromise = coreRequest<T>(path, options).finally(() => {
    inflightRequests.delete(dedupeKey);
  });

  inflightRequests.set(dedupeKey, requestPromise as Promise<ApiResponse<unknown>>);
  return requestPromise;
}
