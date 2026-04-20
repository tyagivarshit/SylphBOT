"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../config/prisma"));
const upload_1 = __importDefault(require("../middleware/upload"));
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const authCookies_1 = require("../utils/authCookies");
const stripe_service_1 = require("../services/stripe.service");
const apiKey_service_1 = require("../services/apiKey.service");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const router = express_1.default.Router();
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
};
const getCurrentUser = async (userId) => prisma_1.default.user.findUnique({
    where: { id: userId },
    select: safeUserSelect,
});
const buildDeletedEmail = (email) => {
    const [local, domain = "deleted.local"] = email.split("@");
    return `${local}+deleted_${Date.now()}@${domain}`;
};
/* =========================
   🔥 GET CURRENT USER (PROTECTED)
========================= */
router.get("/me", auth_middleware_1.protect, async (req, res) => {
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
    }
    catch (err) {
        console.error("GET USER ERROR:", err);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});
/* =========================
   🔥 UPDATE USER + BUSINESS (PROTECTED)
========================= */
router.patch("/update", auth_middleware_1.protect, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { name, phone, business, website, industry, teamSize, type, timezone, } = req.body;
        /* 🔹 UPDATE USER */
        await prisma_1.default.user.update({
            where: { id: userId },
            data: {
                ...(name && { name }),
                ...(phone !== undefined && { phone }),
            },
        });
        /* 🔹 GET BUSINESS ID */
        const userData = await prisma_1.default.user.findUnique({
            where: { id: userId },
            select: { businessId: true },
        });
        /* 🔹 UPDATE BUSINESS */
        if (userData?.businessId) {
            await prisma_1.default.business.update({
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
    }
    catch (err) {
        console.error("UPDATE USER ERROR:", err);
        res.status(500).json({ error: "Update failed" });
    }
});
/* =========================
   🔥 UPLOAD AVATAR (PROTECTED)
========================= */
router.post("/upload-avatar", auth_middleware_1.protect, upload_1.default.single("file"), async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        /* 🔥 CHECK USER */
        const user = await prisma_1.default.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        /* 🔥 CLOUDINARY UPLOAD */
        const result = await new Promise((resolve, reject) => {
            cloudinary_1.default.uploader
                .upload_stream({
                folder: "avatars",
                transformation: [{ width: 300, height: 300, crop: "fill" }],
            }, (error, result) => {
                if (error)
                    reject(error);
                else
                    resolve(result);
            })
                .end(req.file.buffer);
        });
        const imageUrl = result.secure_url;
        /* 🔥 SAVE IN DB */
        await prisma_1.default.user.update({
            where: { id: userId },
            data: {
                avatar: imageUrl,
            },
        });
        /* 🔥 RETURN UPDATED USER */
        const updatedUser = await getCurrentUser(userId);
        return res.json(updatedUser);
    }
    catch (err) {
        console.error("UPLOAD AVATAR ERROR:", err);
        res.status(500).json({ error: "Upload failed" });
    }
});
router.post("/change-password", auth_middleware_1.protect, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { currentPassword, newPassword, confirmPassword, } = req.body || {};
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        if (!currentPassword ||
            !newPassword ||
            newPassword.length < 8 ||
            newPassword !== confirmPassword) {
            return res.status(400).json({
                error: "Invalid password payload",
            });
        }
        const user = await prisma_1.default.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                password: true,
            },
        });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        const matches = await bcryptjs_1.default.compare(currentPassword, user.password);
        if (!matches) {
            return res.status(400).json({
                error: "Current password is incorrect",
            });
        }
        const nextPassword = await bcryptjs_1.default.hash(newPassword, 12);
        await prisma_1.default.$transaction([
            prisma_1.default.user.update({
                where: { id: userId },
                data: {
                    password: nextPassword,
                    resetToken: null,
                    resetTokenExpiry: null,
                    tokenVersion: { increment: 1 },
                },
            }),
            prisma_1.default.refreshToken.deleteMany({
                where: { userId },
            }),
        ]);
        (0, authCookies_1.clearAuthCookies)(res, req);
        return res.json({
            success: true,
            message: "Password updated. Please log in again.",
        });
    }
    catch (err) {
        console.error("CHANGE PASSWORD ERROR:", err);
        return res
            .status(500)
            .json({ error: "Failed to update password" });
    }
});
router.get("/api-key", auth_middleware_1.protect, (0, rbac_middleware_1.requirePermission)("api_keys:manage"), rateLimit_middleware_1.userActionLimiter, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const user = await prisma_1.default.user.findUnique({
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
        const apiKey = await (0, apiKey_service_1.ensureWorkspaceApiKey)({
            businessId: user.businessId,
            createdByUserId: user.id,
        });
        return res.json({
            apiKey: apiKey.rawKey,
        });
    }
    catch (err) {
        console.error("API KEY FETCH ERROR:", err);
        return res.status(500).json({ error: "Failed to load API key" });
    }
});
router.delete("/delete-account", auth_middleware_1.protect, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const user = await prisma_1.default.user.findUnique({
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
            const subscription = await prisma_1.default.subscription.findUnique({
                where: { businessId: user.businessId },
                select: {
                    stripeSubscriptionId: true,
                },
            });
            if (subscription?.stripeSubscriptionId) {
                try {
                    await stripe_service_1.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
                }
                catch (stripeError) {
                    console.error("DELETE ACCOUNT STRIPE CANCEL ERROR:", stripeError);
                }
            }
        }
        await prisma_1.default.$transaction(async (tx) => {
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
        (0, authCookies_1.clearAuthCookies)(res, req);
        return res.json({
            success: true,
            message: "Account deleted successfully",
        });
    }
    catch (err) {
        console.error("DELETE ACCOUNT ERROR:", err);
        return res.status(500).json({ error: "Delete failed" });
    }
});
exports.default = router;
