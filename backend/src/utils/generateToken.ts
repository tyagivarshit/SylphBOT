import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";

/* ======================================
JWT BASE OPTIONS
====================================== */

const baseOptions = {
  issuer: "sylph-ai",
  audience: "user",
};

/* ======================================
TYPES (🔥 IMPORTANT)
====================================== */

export type AccessTokenPayload = {
  id: string;
  role: string;
  businessId: string | null; // ✅ FIXED
  tokenVersion: number;
  type: "access";
};

export type RefreshTokenPayload = {
  id: string;
  tokenVersion: number;
  type: "refresh";
};

/* ======================================
🔑 ACCESS TOKEN
====================================== */

export const generateAccessToken = (
  userId: string,
  role: string,
  businessId: string | null, // ✅ FIXED
  tokenVersion: number
) => {
  const payload: AccessTokenPayload = {
    id: userId,
    role,
    businessId,
    tokenVersion,
    type: "access",
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    ...baseOptions,
    expiresIn: "15m",
    jwtid: crypto.randomUUID(),
  });
};

/* ======================================
🔄 REFRESH TOKEN
====================================== */

export const generateRefreshToken = (
  userId: string,
  tokenVersion: number
) => {
  const payload: RefreshTokenPayload = {
    id: userId,
    tokenVersion,
    type: "refresh",
  };

  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    ...baseOptions,
    expiresIn: "7d",
    jwtid: crypto.randomUUID(),
  });
};

/* ======================================
🔍 VERIFY HELPERS (TYPE SAFE)
====================================== */

export const verifyAccessToken = (
  token: string
): AccessTokenPayload | null => {
  try {
    return jwt.verify(token, env.JWT_SECRET, baseOptions) as AccessTokenPayload;
  } catch {
    return null;
  }
};

export const verifyRefreshToken = (
  token: string
): RefreshTokenPayload | null => {
  try {
    return jwt.verify(
      token,
      env.JWT_REFRESH_SECRET,
      baseOptions
    ) as RefreshTokenPayload;
  } catch {
    return null;
  }
};