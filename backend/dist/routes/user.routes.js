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
const apiKey_service_1 = require("../services/apiKey.service");
const tenant_service_1 = require("../services/tenant.service");
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
};
const buildDeletedEmail = (email) => {
    const [local, domain = "deleted.local"] = email.split("@");
    return `${local}+deleted_${Date.now()}@${domain}`;
};
const getUserRecord = async (userId) => prisma_1.default.user.findUnique({
    where: { id: userId },
    select: safeUserSelect,
});
const getCurrentUser = async (userId, preferredBusinessId) => {
    const [user, identity] = await Promise.all([
        getUserRecord(userId),
        (0, tenant_service_1.resolveUserWorkspaceIdentity)({
            userId,
            preferredBusinessId: preferredBusinessId || null,
        }),
    ]);
    if (!user) {
        return null;
    }
    const businessId = identity.businessId;
    const clients = businessId
        ? await prisma_1.default.client.findMany({
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
        })
        : [];
    const instagramClient = clients.find((client) => client.platform === "INSTAGRAM");
    const whatsappClient = clients.find((client) => client.platform === "WHATSAPP");
    return {
        ...user,
        businessId,
        business: identity.workspace
            ? {
                id: identity.workspace.id,
                name: identity.workspace.name,
                website: identity.workspace.website,
                industry: identity.workspace.industry,
                teamSize: identity.workspace.teamSize,
                type: identity.workspace.type,
                timezone: identity.workspace.timezone,
            }
            : null,
        workspace: identity.workspace
            ? {
                id: identity.workspace.id,
                name: identity.workspace.name,
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
router.get("/me", auth_middleware_1.protect, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const user = await getCurrentUser(userId, req.user?.businessId || null);
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
router.patch("/update", auth_middleware_1.protect, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const { name, phone, business, website, industry, teamSize, type, timezone, } = req.body;
        await prisma_1.default.user.update({
            where: { id: userId },
            data: {
                ...(name && { name }),
                ...(phone !== undefined && { phone }),
            },
        });
        const identity = await (0, tenant_service_1.resolveUserWorkspaceIdentity)({
            userId,
            preferredBusinessId: req.user?.businessId || null,
        });
        if (identity.businessId) {
            await prisma_1.default.business.update({
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
        return res.json(updatedUser);
    }
    catch (err) {
        console.error("UPDATE USER ERROR:", err);
        res.status(500).json({ error: "Update failed" });
    }
});
router.post("/upload-avatar", auth_middleware_1.protect, upload_1.default.single("file"), async (req, res) => {
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
        const result = await new Promise((resolve, reject) => {
            cloudinary_1.default.uploader
                .upload_stream({
                folder: "avatars",
                transformation: [{ width: 300, height: 300, crop: "fill" }],
            }, (error, uploadResult) => {
                if (error)
                    reject(error);
                else
                    resolve(uploadResult);
            })
                .end(req.file.buffer);
        });
        await prisma_1.default.user.update({
            where: { id: userId },
            data: {
                avatar: result.secure_url,
            },
        });
        const updatedUser = await getCurrentUser(userId, req.user?.businessId || null);
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
        return res.status(500).json({ error: "Failed to update password" });
    }
});
router.get("/api-key", auth_middleware_1.protect, (0, rbac_middleware_1.requirePermission)("api_keys:manage"), rateLimit_middleware_1.userActionLimiter, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const user = await getUserRecord(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        const identity = await (0, tenant_service_1.resolveUserWorkspaceIdentity)({
            userId,
            preferredBusinessId: req.user?.businessId || null,
        });
        if (!identity.businessId) {
            return res.status(403).json({ error: "Business context is required" });
        }
        const apiKey = await (0, apiKey_service_1.ensureWorkspaceApiKey)({
            businessId: identity.businessId,
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
        const identity = await (0, tenant_service_1.resolveUserWorkspaceIdentity)({
            userId,
            preferredBusinessId: req.user?.businessId || user.businessId || null,
        });
        const businessId = identity.businessId || user.businessId || null;
        const now = new Date();
        await prisma_1.default.$transaction(async (tx) => {
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
