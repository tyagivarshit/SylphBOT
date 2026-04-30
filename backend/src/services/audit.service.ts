import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import logger from "../utils/logger";
import { recordDataAccessAudit } from "./security/securityGovernanceOS.service";

export type AuditLogInput = {
  action: string;
  userId?: string | null;
  businessId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

export type AuditLogSearchInput = {
  businessId: string;
  userId?: string | null;
  action?: string | null;
  from?: Date | null;
  to?: Date | null;
  page?: number;
  limit?: number;
};

const DEFAULT_AUDIT_PAGE = 1;
const DEFAULT_AUDIT_LIMIT = 25;
const MAX_AUDIT_LIMIT = 100;

const clampAuditNumber = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(Math.trunc(value as number), 1);
};

export const sanitizeMetadata = (
  metadata?: Record<string, unknown> | null
): Prisma.InputJsonValue | undefined => {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  ) as Prisma.InputJsonValue;
};

export const createAuditLog = async (input: AuditLogInput) => {
  try {
    const row = await prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId || null,
        businessId: input.businessId || null,
        metadata: sanitizeMetadata(input.metadata) || undefined,
        ip: input.ip || null,
        userAgent: input.userAgent || null,
        requestId: input.requestId || null,
      },
    });

    await recordDataAccessAudit({
      businessId: input.businessId || null,
      tenantId: input.businessId || null,
      actorId: input.userId || null,
      actorType: input.userId ? "USER" : "SYSTEM",
      action: `audit:${input.action}`,
      resourceType: "AUDIT_LOG",
      resourceId: row.id,
      purpose: "AUDIT_TRAIL",
      result: "ALLOWED",
      metadata: {
        ip: input.ip || null,
        userAgent: input.userAgent || null,
        requestId: input.requestId || null,
      },
    }).catch(() => undefined);

    return row;
  } catch (error) {
    logger.warn(
      {
        action: input.action,
        userId: input.userId || null,
        businessId: input.businessId || null,
        error,
      },
      "Audit log write failed"
    );

    return null;
  }
};

export const getAuditLogs = async (input: AuditLogSearchInput) => {
  const page = clampAuditNumber(input.page, DEFAULT_AUDIT_PAGE);
  const requestedLimit = clampAuditNumber(input.limit, DEFAULT_AUDIT_LIMIT);
  const limit = Math.min(requestedLimit, MAX_AUDIT_LIMIT);
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {
    businessId: input.businessId,
  };

  if (input.userId) {
    where.userId = input.userId;
  }

  if (input.action) {
    where.action = input.action;
  }

  if (input.from || input.to) {
    where.createdAt = {
      ...(input.from ? { gte: input.from } : {}),
      ...(input.to ? { lte: input.to } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
      select: {
        id: true,
        action: true,
        userId: true,
        businessId: true,
        metadata: true,
        ip: true,
        userAgent: true,
        requestId: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};
