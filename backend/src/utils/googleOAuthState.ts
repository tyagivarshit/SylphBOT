import crypto from "crypto";
import { env } from "../config/env";

const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const GOOGLE_OAUTH_STATE_TTL_SECONDS =
  GOOGLE_OAUTH_STATE_TTL_MS / 1000;

export type GoogleOAuthStatePayload = {
  nonce: string;
  issuedAt: number;
  redirectOrigin: string;
};

const defaultFrontendOrigin = new URL(env.FRONTEND_URL).origin;

const buildAlternateFrontendOrigin = (origin: string) => {
  try {
    const url = new URL(origin);

    if (url.hostname === "automexiaai.in") {
      url.hostname = "www.automexiaai.in";
      return url.origin;
    }

    if (url.hostname === "www.automexiaai.in") {
      url.hostname = "automexiaai.in";
      return url.origin;
    }

    return null;
  } catch {
    return null;
  }
};

const allowedFrontendOrigins = Array.from(
  new Set(
    [
      defaultFrontendOrigin,
      buildAlternateFrontendOrigin(defaultFrontendOrigin),
    ].filter((value): value is string => Boolean(value))
  )
);

const getStateSecret = () =>
  process.env.GOOGLE_OAUTH_STATE_SECRET || env.JWT_SECRET;

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

const encodePayload = (payload: GoogleOAuthStatePayload) =>
  Buffer.from(JSON.stringify(payload)).toString("base64url");

const decodePayload = (value: string): GoogleOAuthStatePayload | null => {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<GoogleOAuthStatePayload>;

    if (
      typeof parsed?.nonce !== "string" ||
      typeof parsed?.issuedAt !== "number" ||
      typeof parsed?.redirectOrigin !== "string"
    ) {
      return null;
    }

    return {
      nonce: parsed.nonce,
      issuedAt: parsed.issuedAt,
      redirectOrigin: resolveGoogleOAuthRedirectOrigin(
        parsed.redirectOrigin
      ),
    };
  } catch {
    return null;
  }
};

export const getDefaultFrontendOrigin = () => defaultFrontendOrigin;

export const resolveGoogleOAuthRedirectOrigin = (
  candidate?: string | null
) => {
  if (!candidate) return defaultFrontendOrigin;

  try {
    const origin = new URL(candidate).origin;
    return allowedFrontendOrigins.includes(origin)
      ? origin
      : defaultFrontendOrigin;
  } catch {
    return defaultFrontendOrigin;
  }
};

export const createGoogleOAuthState = (redirectOrigin: string) => {
  const payload: GoogleOAuthStatePayload = {
    nonce: crypto.randomBytes(24).toString("hex"),
    issuedAt: Date.now(),
    redirectOrigin: resolveGoogleOAuthRedirectOrigin(redirectOrigin),
  };

  const encoded = encodePayload(payload);
  const signature = signValue(encoded);

  return `${encoded}.${signature}`;
};

export const verifyGoogleOAuthState = (state: unknown) => {
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

  const stateAge = Date.now() - payload.issuedAt;

  if (stateAge < 0 || stateAge > GOOGLE_OAUTH_STATE_TTL_MS) {
    return null;
  }

  return payload;
};

export const getGoogleOAuthStateKey = (nonce: string) =>
  `google:state:${nonce}`;
