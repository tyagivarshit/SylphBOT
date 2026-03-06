import jwt from "jsonwebtoken";
import { env } from "../config/env";

/* 🔑 Access Token (Short Life) */
export const generateAccessToken = (
  userId: string,
  role: string,
  businessId: string
) => {
  return jwt.sign(
    {
      id: userId,
      role,
      businessId, // ✅ added
    },
    env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};

/* 🔄 Refresh Token (Long Life) */
export const generateRefreshToken = (userId: string) => {
  return jwt.sign(
    { id: userId },
    env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
};