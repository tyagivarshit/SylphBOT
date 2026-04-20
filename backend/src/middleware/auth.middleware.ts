import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { unauthorized } from "../utils/AppError";
import crypto from "crypto";
import {
  generateAccessToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/generateToken";
import {
  clearAuthCookies,
  getAuthCookieOptions,
} from "../utils/authCookies";
import { updateRequestContext } from "../observability/requestContext";

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const getUserWithBusiness = async (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      deletedAt: true,
      tokenVersion: true,
      businessId: true,
      email: true,
      business: {
        select: {
          id: true,
          deletedAt: true,
        },
      },
    },
  });

const resolveActiveBusinessId = (user: {
  businessId: string | null;
  business?: {
    id: string;
    deletedAt: Date | null;
  } | null;
}) => {
  if (!user.businessId) {
    return null;
  }

  if (!user.business) {
    return null;
  }

  if (user.business?.deletedAt) {
    return null;
  }

  return user.businessId;
};

const bindAuthenticatedContext = (
  req: Request,
  user: {
    id: string;
    role: string;
    businessId: string | null;
    email?: string;
  }
) => {
  req.user = user;
  req.tenant = {
    businessId: user.businessId,
  };

  updateRequestContext({
    userId: user.id,
    businessId: user.businessId,
  });
};

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    if (!accessToken && !refreshToken) {
      throw unauthorized("Not authorized");
    }

    if (accessToken) {
      const decoded = verifyAccessToken(accessToken);

      if (decoded?.id && typeof decoded.tokenVersion === "number") {
        const user = await getUserWithBusiness(decoded.id);

        if (
          user &&
          user.isActive &&
          !user.deletedAt &&
          user.tokenVersion === decoded.tokenVersion
        ) {
          bindAuthenticatedContext(req, {
            id: user.id,
            role: user.role,
            email: user.email,
            businessId: resolveActiveBusinessId(user),
          });

          return next();
        }
      }
    }

    if (!refreshToken) {
      throw unauthorized("Session expired");
    }

    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded?.id || typeof decoded.tokenVersion !== "number") {
      clearAuthCookies(res, req);
      throw unauthorized("Invalid refresh token");
    }

    const hashed = hashToken(refreshToken);
    const dbToken = await prisma.refreshToken.findFirst({
      where: {
        token: hashed,
        userId: decoded.id,
        expiresAt: { gt: new Date() },
      },
    });

    if (!dbToken) {
      clearAuthCookies(res, req);
      throw unauthorized("Session expired");
    }

    const user = await getUserWithBusiness(decoded.id);

    if (
      !user ||
      !user.isActive ||
      user.deletedAt ||
      user.tokenVersion !== decoded.tokenVersion
    ) {
      clearAuthCookies(res, req);
      throw unauthorized("Invalid session");
    }

    const newAccessToken = generateAccessToken(
      user.id,
      user.role,
      resolveActiveBusinessId(user),
      user.tokenVersion
    );

    res.cookie("accessToken", newAccessToken, {
      ...getAuthCookieOptions(req),
      maxAge: 15 * 60 * 1000,
    });

    bindAuthenticatedContext(req, {
      id: user.id,
      role: user.role,
      email: user.email,
      businessId: resolveActiveBusinessId(user),
    });

    return next();
  } catch (err) {
    return next(err);
  }
};
