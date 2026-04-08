const ABSOLUTE_API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://api.automexiaai.in"
    : "http://localhost:5000")
).replace(/\/$/, "");

const normalizePath = (path: string) =>
  path.startsWith("/") ? path : `/${path}`;

const getApiOrigin = () => {
  if (typeof window !== "undefined") {
    return "";
  }

  return ABSOLUTE_API_ORIGIN;
};

export const getAbsoluteApiOrigin = () => ABSOLUTE_API_ORIGIN;

export const getApiBaseUrl = () => `${getApiOrigin()}/api`;

export const buildApiUrl = (path: string) => {
  const normalized = normalizePath(path);

  if (normalized.startsWith("/api")) {
    return `${getApiOrigin()}${normalized}`;
  }

  return `${getApiBaseUrl()}${normalized}`;
};

export const buildAbsoluteApiUrl = (path: string) => {
  const normalized = normalizePath(path);

  if (normalized.startsWith("/api")) {
    return `${ABSOLUTE_API_ORIGIN}${normalized}`;
  }

  return `${ABSOLUTE_API_ORIGIN}/api${normalized}`;
};

export const buildAppUrl = (path: string) => {
  const normalized = normalizePath(path);
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (configured) {
    return `${configured}${normalized}`;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/$/, "")}${normalized}`;
  }

  return `https://app.automexiaai.in${normalized}`;
};
