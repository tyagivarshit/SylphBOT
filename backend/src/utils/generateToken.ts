import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";

/* 🔐 COMMON OPTIONS */
const baseOptions = {
  issuer: "sylph-ai",
  audience: "user",
};

/* 🔑 ACCESS TOKEN */
export const generateAccessToken = (
  userId: string,
  role: string,
  businessId: string,
  tokenVersion: number
) => {
  return jwt.sign(
    {
      id: userId,
      role,
      businessId,
      tokenVersion,
      type: "access",
    },
    env.JWT_SECRET,
    {
      ...baseOptions,
      expiresIn: "15m",
      jwtid: crypto.randomUUID(), // 🔥 unique per token
    }
  );
};

/* 🔄 REFRESH TOKEN */
export const generateRefreshToken = (
  userId: string,
  tokenVersion: number
) => {
  return jwt.sign(
    {
      id: userId,
      tokenVersion,
      type: "refresh",
    },
    env.JWT_REFRESH_SECRET,
    {
      ...baseOptions,
      expiresIn: "7d",
      jwtid: crypto.randomUUID(), // 🔥 reuse detection support
    }
  );
};

/* 🔍 VERIFY HELPERS (SAFE VERIFY) */
export const verifyAccessToken = (token: string) => {
  try {
    return jwt.verify(token, env.JWT_SECRET, baseOptions) as any;
  } catch {
    return null;
  }
};

export const verifyRefreshToken = (token: string) => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, baseOptions) as any;
  } catch {
    return null;
  }
};