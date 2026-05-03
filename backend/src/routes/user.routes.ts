import express from "express";
import bcrypt from "bcryptjs";
import prisma from "../config/prisma";
import upload from "../middleware/upload";
import cloudinary from "../config/cloudinary";
import { protect } from "../middleware/auth.middleware";
import { clearAuthCookies } from "../utils/authCookies";
import { ensureWorkspaceApiKey } from "../services/apiKey.service";
import { resolveUserWorkspaceIdentity } from "../services/tenant.service";
import { requirePermission } from "../middleware/rbac.middleware";
import { userActionLimiter } from "../middleware/rateLimit.middleware";
import { withTimeoutFallback } from "../utils/boundedTimeout";
import { emitPerformanceMetric } from "../observability/performanceMetrics";

const router = express.Router();

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  avatar: true,
  businessId: true,
} as const;

const USER_ME_CACHE_TTL_MS = 10_000;

const currentUserCache = new Map<
  string,
  {
    value: Record<string, unknown>;
    expiresAt: number;
  }
>();

const buildCurrentUserCacheKey = (
  userId: string,
  preferredBusinessId?: string | null
) =>
  `${String(userId || "").trim()}:${String(preferredBusinessId || "").trim()}`;

const invalidateCurrentUserCache = (userId?: string | null) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    currentUserCache.clear();
    return;
  }

  for (const key of currentUserCache.keys()) {
    if (key.startsWith(`${normalizedUserId}:`)) {
      currentUserCache.delete(key);
    }
  }
};

const buildDeletedEmail = (email: string) => {
  const [local, domain = "deleted.local"] = email.split("@");
  return `${local}+deleted_${Date.now()}@${domain}`;
};

const getUserRecord = async (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: safeUserSelect,
  });

const getCurrentUser = async (
  userId: string,
  preferredBusinessId?: string | null
) => {
  const user = await getUserRecord(userId);

  if (!user) {
    return null;
  }

  const preferredBusiness = String(preferredBusinessId || "").trim() || null;
  const linkedBusiness = String(user.businessId || "").trim() || null;
  let businessId = preferredBusiness || linkedBusiness || null;
  let workspace:
    | {
        id: string;
        name: string;
        website: string | null;
        industry: string | null;
        teamSize: string | null;
        type: string | null;
        timezone: string | null;
        deletedAt?: Date | null;
      }
    | null = null;

  if (businessId) {
    workspace = await prisma.business.findUnique({
      where: {
        id: businessId,
      },
      select: {
        id: true,
        name: true,
        website: true,
        industry: true,
        teamSize: true,
        type: true,
        timezone: true,
        deletedAt: true,
      },
    });

    if (!workspace || workspace.deletedAt) {
      workspace = null;
      businessId = null;
    }
  }

  if (!businessId || !workspace) {
    const identity = await resolveUserWorkspaceIdentity({
      userId,
      preferredBusinessId: preferredBusinessId || null,
      bootstrapWorkspaceIfMissing: false,
      persistResolvedBusinessId: false,
    });
    businessId = identity.businessId;
    workspace = identity.workspace
      ? {
          id: identity.workspace.id,
          name: identity.workspace.name,
          website: identity.workspace.website,
          industry: identity.workspace.industry,
          teamSize: identity.workspace.teamSize,
          type: identity.workspace.type,
          timezone: identity.workspace.timezone,
          deletedAt: identity.workspace.deletedAt,
        }
      : null;
  }

  const clientsResult = businessId
    ? await withTimeoutFallback({
        label: "user_me_clients_projection",
        timeoutMs: 2500,
        task: prisma.client.findMany({
          where: {
            businessId,
            deletedAt: null,
            platform: {
              in: ["INSTAGRAM", "WHATSAPP"],
            },
          },
          select: {
            platform: true,
            pageId: true,
            phoneNumberId: true,
            isActive: true,
          },
        }),
        fallback: [],
      })
    : {
        value: [],
        timedOut: false,
        failed: false,
      };
  const clients = clientsResult.value;

  const instagramClient = clients.find((client) => client.platform === "INSTAGRAM");
  const whatsappClient = clients.find((client) => client.platform === "WHATSAPP");

  return {
    ...user,
    businessId,
    business: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
          website: workspace.website,
          industry: workspace.industry,
          teamSize: workspace.teamSize,
          type: workspace.type,
          timezone: workspace.timezone,
        }
      : null,
    workspace: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
        }
      : null,
    connectedAccounts: {
      instagram: {
        connected: Boolean(instagramClient?.pageId),
        pageId: instagramClient?.pageId || null,
        healthy: Boolean(instagramClient?.isActive),
      },
      whatsapp: {
        connected: Boolean(whatsappClient?.phoneNumberId),
        phoneNumberId: whatsappClient?.phoneNumberId || null,
        healthy: Boolean(whatsappClient?.isActive),
      },
      totalConnected: clients.filter((client) => client.isActive).length,
    },
  };
};

router.get("/me", protect, async (req: any, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const cacheKey = buildCurrentUserCacheKey(
      userId,
      req.user?.businessId || null
    );
    const cached = currentUserCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      emitPerformanceMetric({
        name: "CACHE_HIT",
        businessId: req.user?.businessId || null,
        route: "user_me",
        metadata: {
          cache: "memory_user_me",
        },
      });
      res.setHeader("Cache-Control", "no-store");
      return res.json(cached.value);
    }

    emitPerformanceMetric({
      name: "CACHE_MISS",
      businessId: req.user?.businessId || null,
      route: "user_me",
      metadata: {
        cache: "memory_user_me",
      },
    });

    const userHydration = await withTimeoutFallback({
      label: "user_me_hydration",
      timeoutMs: 2500,
      task: getCurrentUser(userId, req.user?.businessId || null),
      fallback: null,
    });
    const user = userHydration.value;

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.setHeader("Cache-Control", "no-store");
    if (userHydration.timedOut || userHydration.failed) {
      console.warn("AUTH_PROFILE_HYDRATION_FALLBACK", {
        userId,
        businessId: user.businessId || null,
        timedOut: userHydration.timedOut,
      });
    }

    currentUserCache.set(cacheKey, {
      value: user,
      expiresAt: Date.now() + USER_ME_CACHE_TTL_MS,
    });

    return res.json(user);
  } catch (err) {
    console.error("GET USER ERROR:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.get("/profile", protect, async (req: any, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const profile = await getUserRecord(userId);

    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      id: profile.id,
      name: profile.name,
      email: profile.email,
      phone: profile.phone || null,
      avatar: profile.avatar || null,
    });
  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

router.get("/workspace", protect, async (req: any, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const workspaceIdentity = await withTimeoutFallback({
      label: "user_workspace_hydration",
      timeoutMs: 3000,
      task: resolveUserWorkspaceIdentity({
        userId,
        preferredBusinessId: req.user?.businessId || null,
      }),
      fallback: {
        businessId: null,
        workspace: null,
        source: "none" as const,
      },
    });

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      businessId: workspaceIdentity.value.businessId,
      workspace: workspaceIdentity.value.workspace,
      source: workspaceIdentity.value.source,
    });
  } catch (err) {
    console.error("GET WORKSPACE ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch workspace" });
  }
});

router.patch("/update", protect, async (req: any, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      name,
      phone,
      business,
      website,
      industry,
      teamSize,
      type,
      timezone,
    } = req.body;

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
      },
    });

    const identity = await resolveUserWorkspaceIdentity({
      userId,
      preferredBusinessId: req.user?.businessId || null,
    });

    if (identity.businessId) {
      await prisma.business.update({
        where: { id: identity.businessId },
        data: {
          ...(business && { name: business }),
          ...(website !== undefined && { website }),
          ...(industry !== undefined && { industry }),
          ...(teamSize !== undefined && { teamSize }),
          ...(type !== undefined && { type }),
          ...(timezone !== undefined && { timezone }),
        },
      });
    }

    const updatedUser = await getCurrentUser(userId, identity.businessId);
    invalidateCurrentUserCache(userId);
    return res.json(updatedUser);
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

router.post(
  "/upload-avatar",
  protect,
  upload.single("file"),
  async (req: any, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const user = await getUserRecord(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const result: any = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "avatars",
              transformation: [{ width: 300, height: 300, crop: "fill" }],
            },
            (error, uploadResult) => {
              if (error) reject(error);
              else resolve(uploadResult);
            }
          )
          .end(req.file.buffer);
      });

      await prisma.user.update({
        where: { id: userId },
        data: {
          avatar: result.secure_url,
        },
      });

      const updatedUser = await getCurrentUser(userId, req.user?.businessId || null);
      invalidateCurrentUserCache(userId);
      return res.json(updatedUser);
    } catch (err) {
      console.error("UPLOAD AVATAR ERROR:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

router.post("/change-password", protect, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const {
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body || {};

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (
      !currentPassword ||
      !newPassword ||
      newPassword.length < 8 ||
      newPassword !== confirmPassword
    ) {
      return res.status(400).json({
        error: "Invalid password payload",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const matches = await bcrypt.compare(currentPassword, user.password);

    if (!matches) {
      return res.status(400).json({
        error: "Current password is incorrect",
      });
    }

    const nextPassword = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          password: nextPassword,
          resetToken: null,
          resetTokenExpiry: null,
          tokenVersion: { increment: 1 },
        },
      }),
      prisma.refreshToken.deleteMany({
        where: { userId },
      }),
    ]);

    clearAuthCookies(res, req);
    invalidateCurrentUserCache(userId);

    return res.json({
      success: true,
      message: "Password updated. Please log in again.",
    });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    return res.status(500).json({ error: "Failed to update password" });
  }
});

router.get(
  "/api-key",
  protect,
  requirePermission("api_keys:manage"),
  userActionLimiter,
  async (req: any, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await getUserRecord(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const identity = await resolveUserWorkspaceIdentity({
        userId,
        preferredBusinessId: req.user?.businessId || null,
      });

      if (!identity.businessId) {
        return res.status(403).json({ error: "Business context is required" });
      }

      const apiKey = await ensureWorkspaceApiKey({
        businessId: identity.businessId,
        createdByUserId: user.id,
      });

      return res.json({
        apiKey: apiKey.rawKey,
      });
    } catch (err) {
      console.error("API KEY FETCH ERROR:", err);
      return res.status(500).json({ error: "Failed to load API key" });
    }
  }
);

router.delete("/delete-account", protect, async (req: any, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        businessId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const identity = await resolveUserWorkspaceIdentity({
      userId,
      preferredBusinessId: req.user?.businessId || user.businessId || null,
    });
    const businessId = identity.businessId || user.businessId || null;

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      if (businessId) {
        await tx.business.update({
          where: { id: businessId },
          data: {
            deletedAt: now,
          },
        });

        await Promise.all([
          tx.client.updateMany({
            where: { businessId },
            data: {
              isActive: false,
              deletedAt: now,
            },
          }),
          tx.lead.updateMany({
            where: { businessId },
            data: {
              deletedAt: now,
            },
          }),
          tx.commentTrigger.updateMany({
            where: { businessId },
            data: {
              isActive: false,
            },
          }),
          tx.automationFlow.updateMany({
            where: { businessId },
            data: {
              status: "INACTIVE",
            },
          }),
          tx.knowledgeBase.updateMany({
            where: { businessId },
            data: {
              isActive: false,
            },
          }),
          tx.bookingSlot.updateMany({
            where: { businessId },
            data: {
              isActive: false,
            },
          }),
          tx.subscriptionLedger.updateMany({
            where: { businessId },
            data: {
              status: "CANCELLED",
              cancelAt: now,
              cancelledAt: now,
              renewAt: null,
            },
          }),
        ]);
      }

      await tx.refreshToken.deleteMany({
        where: { userId },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          email: buildDeletedEmail(user.email),
          archivedEmail: user.email,
          isActive: false,
          deletedAt: now,
          businessId: null,
          tokenVersion: { increment: 1 },
          avatar: null,
          phone: null,
          resetToken: null,
          resetTokenExpiry: null,
          verifyToken: null,
          verifyTokenExpiry: null,
        },
      });
    });

    clearAuthCookies(res, req);
    invalidateCurrentUserCache(userId);

    return res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    console.error("DELETE ACCOUNT ERROR:", err);
    return res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
