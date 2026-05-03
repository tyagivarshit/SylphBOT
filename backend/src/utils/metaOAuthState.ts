import crypto from "crypto";
import { env } from "../config/env";

export const META_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type MetaOAuthPlatform = "INSTAGRAM" | "WHATSAPP";
export type MetaOAuthMode = "connect" | "reconnect";

export type MetaOAuthStatePayload = {
  nonce: string;
  issuedAt: number;
  userId: string;
  businessId: string;
  workspaceId: string;
  platform: MetaOAuthPlatform;
  mode: MetaOAuthMode;
  preferredFacebookPageId?: string | null;
  preferredInstagramProfessionalAccountId?: string | null;
};

const getStateSecret = () =>
  process.env.META_OAUTH_STATE_SECRET || env.JWT_SECRET;

const normalizePlatform = (value?: string | null): MetaOAuthPlatform | null => {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "INSTAGRAM" || normalized === "WHATSAPP") {
    return normalized;
  }

  return null;
};

const normalizeMode = (value?: string | null): MetaOAuthMode =>
  String(value || "").trim().toLowerCase() === "reconnect"
    ? "reconnect"
    : "connect";

const encodePayload = (payload: MetaOAuthStatePayload) =>
  Buffer.from(JSON.stringify(payload)).toString("base64url");

const decodePayload = (value: string): MetaOAuthStatePayload | null => {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<MetaOAuthStatePayload>;

    const platform = normalizePlatform(parsed.platform);

    if (
      typeof parsed?.nonce !== "string" ||
      typeof parsed?.issuedAt !== "number" ||
      typeof parsed?.userId !== "string" ||
      typeof parsed?.businessId !== "string" ||
      typeof parsed?.workspaceId !== "string" ||
      !platform
    ) {
      return null;
    }

    return {
      nonce: parsed.nonce,
      issuedAt: parsed.issuedAt,
      userId: parsed.userId,
      businessId: parsed.businessId,
      workspaceId: parsed.workspaceId,
      platform,
      mode: normalizeMode(parsed.mode),
      preferredFacebookPageId:
        typeof parsed?.preferredFacebookPageId === "string"
          ? parsed.preferredFacebookPageId
          : null,
      preferredInstagramProfessionalAccountId:
        typeof parsed?.preferredInstagramProfessionalAccountId === "string"
          ? parsed.preferredInstagramProfessionalAccountId
          : null,
    };
  } catch {
    return null;
  }
};

const signValue = (value: string) =>
  crypto
    .createHmac("sha256", getStateSecret())
    .update(value)
    .digest("base64url");

const safeCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const createMetaOAuthState = (input: {
  userId: string;
  businessId: string;
  workspaceId?: string;
  platform: MetaOAuthPlatform;
  mode?: MetaOAuthMode;
  preferredFacebookPageId?: string | null;
  preferredInstagramProfessionalAccountId?: string | null;
}) => {
  const normalizeOptionalString = (value?: string | null) => {
    const normalized = String(value || "").trim();
    return normalized || null;
  };

  const payload: MetaOAuthStatePayload = {
    nonce: crypto.randomBytes(24).toString("hex"),
    issuedAt: Date.now(),
    userId: String(input.userId || "").trim(),
    businessId: String(input.businessId || "").trim(),
    workspaceId: String(input.workspaceId || input.businessId || "").trim(),
    platform: input.platform,
    mode: normalizeMode(input.mode),
    preferredFacebookPageId: normalizeOptionalString(
      input.preferredFacebookPageId
    ),
    preferredInstagramProfessionalAccountId: normalizeOptionalString(
      input.preferredInstagramProfessionalAccountId
    ),
  };

  const encoded = encodePayload(payload);
  const signature = signValue(encoded);

  return `${encoded}.${signature}`;
};

export const verifyMetaOAuthState = (state: unknown) => {
  if (typeof state !== "string") {
    return null;
  }

  const [encoded, signature] = state.split(".");

  if (!encoded || !signature) {
    return null;
  }

  const expectedSignature = signValue(encoded);

  if (!safeCompare(signature, expectedSignature)) {
    return null;
  }

  const payload = decodePayload(encoded);

  if (!payload) {
    return null;
  }

  const ageMs = Date.now() - payload.issuedAt;

  if (ageMs < 0 || ageMs > META_OAUTH_STATE_TTL_MS) {
    return null;
  }

  return payload;
};

export const parseMetaOAuthPlatform = (value?: string | null) =>
  normalizePlatform(value);

export const parseMetaOAuthMode = (value?: string | null) =>
  normalizeMode(value);
