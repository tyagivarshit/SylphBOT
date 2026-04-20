import express from "express";
import bcrypt from "bcryptjs";
import prisma from "../config/prisma";
import upload from "../middleware/upload";
import cloudinary from "../config/cloudinary";
import { protect } from "../middleware/auth.middleware";
import { clearAuthCookies } from "../utils/authCookies";
import { stripe } from "../services/stripe.service";
import { ensureWorkspaceApiKey } from "../services/apiKey.service";
import { requirePermission } from "../middleware/rbac.middleware";
import { userActionLimiter } from "../middleware/rateLimit.middleware";

const router = express.Router();

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatar: true,
  businessId: true,
  business: {
    select: {
      id: true,
      name: true,
      website: true,
      industry: true,
      teamSize: true,
      type: true,
      timezone: true,
    },
  },
} as const;

const getCurrentUser = async (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: safeUserSelect,
  });

const buildDeletedEmail = (email: string) => {
  const [local, domain = "deleted.local"] = email.split("@");
  return `${local}+deleted_${Date.now()}@${domain}`;
};

/* =========================
   🔥 GET CURRENT USER (PROTECTED)
========================= */
router.get("/me", protect, async (req: any, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await getCurrentUser(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.setHeader("Cache-Control", "no-store");

    return res.json(user);
  } catch (err) {
    console.error("GET USER ERROR:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

/* =========================
   🔥 UPDATE USER + BUSINESS (PROTECTED)
========================= */
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

    /* 🔹 UPDATE USER */
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
      },
    });

    /* 🔹 GET BUSINESS ID */
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });

    /* 🔹 UPDATE BUSINESS */
    if (userData?.businessId) {
      await prisma.business.update({
        where: { id: userData.businessId },
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

    /* 🔥 RETURN UPDATED USER */
    const updatedUser = await getCurrentUser(userId);

    return res.json(updatedUser);

  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

/* =========================
   🔥 UPLOAD AVATAR (PROTECTED)
========================= */
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

      /* 🔥 CHECK USER */
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      /* 🔥 CLOUDINARY UPLOAD */
      const result: any = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "avatars",
              transformation: [{ width: 300, height: 300, crop: "fill" }],
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          )
          .end(req.file.buffer);
      });

      const imageUrl = result.secure_url;

      /* 🔥 SAVE IN DB */
      await prisma.user.update({
        where: { id: userId },
        data: {
          avatar: imageUrl,
        },
      });

      /* 🔥 RETURN UPDATED USER */
      const updatedUser = await getCurrentUser(userId);

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

    const matches = await bcrypt.compare(
      currentPassword,
      user.password
    );

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

    return res.json({
      success: true,
      message: "Password updated. Please log in again.",
    });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    return res
      .status(500)
      .json({ error: "Failed to update password" });
  }
});

router.get("/api-key", protect, requirePermission("api_keys:manage"), userActionLimiter, async (req: any, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        businessId: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const apiKey = await ensureWorkspaceApiKey({
      businessId: user.businessId,
      createdByUserId: user.id,
    });

    return res.json({
      apiKey: apiKey.rawKey,
    });
  } catch (err) {
    console.error("API KEY FETCH ERROR:", err);
    return res.status(500).json({ error: "Failed to load API key" });
  }
});

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

    const now = new Date();

    if (user.businessId) {
      const subscription = await prisma.subscription.findUnique({
        where: { businessId: user.businessId },
        select: {
          stripeSubscriptionId: true,
        },
      });

      if (subscription?.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(
            subscription.stripeSubscriptionId
          );
        } catch (stripeError) {
          console.error(
            "DELETE ACCOUNT STRIPE CANCEL ERROR:",
            stripeError
          );
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      if (user.businessId) {
        await tx.business.update({
          where: { id: user.businessId },
          data: {
            deletedAt: now,
          },
        });

        await Promise.all([
          tx.client.updateMany({
            where: { businessId: user.businessId },
            data: {
              isActive: false,
              deletedAt: now,
            },
          }),
          tx.lead.updateMany({
            where: { businessId: user.businessId },
            data: {
              deletedAt: now,
            },
          }),
          tx.commentTrigger.updateMany({
            where: { businessId: user.businessId },
            data: {
              isActive: false,
            },
          }),
          tx.automationFlow.updateMany({
            where: { businessId: user.businessId },
            data: {
              status: "INACTIVE",
            },
          }),
          tx.knowledgeBase.updateMany({
            where: { businessId: user.businessId },
            data: {
              isActive: false,
            },
          }),
          tx.bookingSlot.updateMany({
            where: { businessId: user.businessId },
            data: {
              isActive: false,
            },
          }),
          tx.subscription.updateMany({
            where: { businessId: user.businessId },
            data: {
              status: "CANCELLED",
              graceUntil: null,
              isTrial: false,
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
