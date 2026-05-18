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
const authBootstrap_service_1 = require("../services/authBootstrap.service");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const boundedTimeout_1 = require("../utils/boundedTimeout");
const performanceMetrics_1 = require("../observability/performanceMetrics");
const router = express_1.default.Router();
const safeUserSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    phone: true,
    avatar: true,
    businessId: true,
};
const USER_ME_CACHE_TTL_MS = 10000;
const USER_ME_AUTH_SURFACE_CACHE_TTL_MS = 3000;
const USER_ME_AUTH_SURFACE_RETRY_AFTER_MS = 220;
const currentUserCache = new Map();
const buildCurrentUserCacheKey = (userId, preferredBusinessId) => `${String(userId || "").trim()}:${String(preferredBusinessId || "").trim()}`;
const isAuthSurfaceRequest = (req) => {
    const surface = String(req.query.surface || "").trim().toLowerCase();
    return surface === "auth";
};
const invalidateCurrentUserCache = (userId) => {
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
const buildDeletedEmail = (email) => {
    const [local, domain = "deleted.local"] = email.split("@");
    return `${local}+deleted_${Date.now()}@${domain}`;
};
const getUserRecord = async (userId) => prisma_1.default.user.findUnique({
    where: { id: userId },
    select: safeUserSelect,
});
const buildFallbackCurrentUser = (user, preferredBusinessId) => {
    const businessId = String(preferredBusinessId || "").trim() ||
        String(user.businessId || "").trim() ||
        null;
    return {
        ...user,
        businessId,
        business: null,
        workspace: businessId
            ? {
                id: businessId,
                name: null,
            }
            : null,
        connectedAccounts: {
            instagram: {
                connected: false,
                pageId: null,
                healthy: false,
            },
            whatsapp: {
                connected: false,
                phoneNumberId: null,
                healthy: false,
            },
            totalConnected: 0,
        },
    };
};
const buildAuthSurfaceCurrentUser = (user, preferredBusinessId) => {
    const businessId = String(preferredBusinessId || "").trim() ||
        String(user.businessId || "").trim() ||
        null;
    return {
        ...user,
        businessId,
        business: businessId
            ? {
                id: businessId,
                name: null,
                website: null,
                industry: null,
                teamSize: null,
                type: null,
                timezone: null,
            }
            : null,
        workspace: businessId
            ? {
                id: businessId,
                name: null,
            }
            : null,
        connectedAccounts: null,
    };
};
const currentUserAuthSurfaceInFlight = new Map();
const resolveAuthSurfaceCurrentUser = async (input) => {
    const existing = currentUserAuthSurfaceInFlight.get(input.inflightKey);
    if (existing) {
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "auth_inflight_reused",
            businessId: input.businessId,
            route: "user_me",
            metadata: {
                surface: "auth",
                source: "shared_me_inflight",
            },
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "auth_parallel_me_collapsed",
            businessId: input.businessId,
            route: "user_me",
            metadata: {
                surface: "auth",
            },
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "auth_singleflight_hits",
            businessId: input.businessId,
            route: "user_me",
            metadata: {
                surface: "auth",
                source: "shared_me_inflight",
            },
        });
        return existing;
    }
    let run;
    run = input.task().finally(() => {
        if (currentUserAuthSurfaceInFlight.get(input.inflightKey) === run) {
            currentUserAuthSurfaceInFlight.delete(input.inflightKey);
        }
    });
    currentUserAuthSurfaceInFlight.set(input.inflightKey, run);
    return run;
};
const getCurrentUser = async (input) => {
    const user = input.baseUser || (await getUserRecord(input.userId));
    if (!user) {
        return null;
    }
    const preferredBusiness = String(input.preferredBusinessId || "").trim() || null;
    const linkedBusiness = String(user.businessId || "").trim() || null;
    let businessId = preferredBusiness || linkedBusiness || null;
    let workspace = null;
    if (businessId) {
        workspace = await prisma_1.default.business.findUnique({
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
        const identity = await (0, tenant_service_1.resolveUserWorkspaceIdentity)({
            userId: input.userId,
            preferredBusinessId: input.preferredBusinessId || null,
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
        ? await (0, boundedTimeout_1.withTimeoutFallback)({
            label: "user_me_clients_projection",
            timeoutMs: 900,
            task: prisma_1.default.client.findMany({
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
router.get("/me", auth_middleware_1.protect, async (req, res) => {
    const startedAt = Date.now();
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const authSurface = isAuthSurfaceRequest(req);
        const upstreamAuthProcessingState = String(res.getHeader("X-Auth-Processing-State") || "")
            .trim()
            .toUpperCase();
        const forceProcessingFastLane = authSurface && upstreamAuthProcessingState === "PROCESSING";
        const scopedCacheKey = authSurface
            ? "auth_surface"
            : `${String(req.user?.businessId || "").trim()}:full`;
        const cacheKey = buildCurrentUserCacheKey(userId, scopedCacheKey);
        const cached = currentUserCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now() && !forceProcessingFastLane) {
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "CACHE_HIT",
                businessId: req.user?.businessId || null,
                route: "user_me",
                metadata: {
                    cache: "memory_user_me",
                },
            });
            res.setHeader("Cache-Control", "no-store");
            if (authSurface) {
                const cachedAuthSurface = cached.value;
                if (cachedAuthSurface?.authLifecycle?.processingState) {
                    res.setHeader("X-Auth-Processing-State", cachedAuthSurface.authLifecycle.processingState);
                    res.setHeader("X-Auth-Session-Ready", cachedAuthSurface.authLifecycle.sessionReady ? "1" : "0");
                    res.setHeader("X-Auth-Retry-After-Ms", String(Math.max(0, Math.floor(cachedAuthSurface.authLifecycle.retryAfterMs || 0))));
                }
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "auth_stabilization_ms",
                    value: Date.now() - startedAt,
                    businessId: cachedAuthSurface?.businessId || req.user?.businessId || null,
                    route: "user_me",
                    metadata: {
                        surface: "auth",
                        cache: "hit",
                        state: cachedAuthSurface?.authLifecycle?.processingState || "READY",
                    },
                });
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "auth_stabilization_duration_ms",
                    value: Date.now() - startedAt,
                    businessId: cachedAuthSurface?.businessId || req.user?.businessId || null,
                    route: "user_me",
                    metadata: {
                        surface: "auth",
                        cache: "hit",
                        state: cachedAuthSurface?.authLifecycle?.processingState || "READY",
                    },
                });
                if (cachedAuthSurface?.authLifecycle?.processingState === "READY" ||
                    cachedAuthSurface?.authLifecycle?.processingState === "READY_MINIMAL") {
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "auth_session_ready",
                        value: Date.now() - startedAt,
                        businessId: cachedAuthSurface.businessId || req.user?.businessId || null,
                        route: "user_me",
                        metadata: {
                            surface: "auth",
                            cache: "hit",
                        },
                    });
                }
            }
            return res.json(cached.value);
        }
        const baseUser = await getUserRecord(userId);
        if (!baseUser) {
            return res.status(404).json({ error: "User not found" });
        }
        const preferredBusinessId = req.user?.businessId || baseUser.businessId || null;
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "CACHE_MISS",
            businessId: req.user?.businessId || null,
            route: "user_me",
            metadata: {
                cache: "memory_user_me",
            },
        });
        if (authSurface) {
            const inflightKey = `${cacheKey}:auth_surface`;
            const user = await resolveAuthSurfaceCurrentUser({
                inflightKey,
                businessId: preferredBusinessId || null,
                task: async () => {
                    const fastLaneStartedAt = Date.now();
                    const response = buildAuthSurfaceCurrentUser(baseUser, preferredBusinessId);
                    const bootstrapSnapshot = (0, authBootstrap_service_1.getAuthBootstrapFastLaneSnapshot)({
                        userId,
                        preferredBusinessId: response.businessId,
                        profileSeed: {
                            email: response.email,
                            name: response.name,
                            avatar: response.avatar || null,
                        },
                    });
                    let stabilizedUser = response;
                    if (bootstrapSnapshot.context?.user) {
                        const mergedBaseUser = {
                            ...baseUser,
                            name: bootstrapSnapshot.context.user.name || baseUser.name,
                            email: bootstrapSnapshot.context.user.email || baseUser.email,
                            avatar: bootstrapSnapshot.context.user.avatar || baseUser.avatar,
                            businessId: bootstrapSnapshot.context.user.businessId || baseUser.businessId,
                        };
                        stabilizedUser = buildAuthSurfaceCurrentUser(mergedBaseUser, bootstrapSnapshot.context.user.businessId);
                        const workspaceName = bootstrapSnapshot.context.identity.workspace?.name || null;
                        stabilizedUser = {
                            ...stabilizedUser,
                            workspace: stabilizedUser.workspace
                                ? {
                                    ...stabilizedUser.workspace,
                                    name: workspaceName,
                                }
                                : stabilizedUser.workspace,
                            business: stabilizedUser.business
                                ? {
                                    ...stabilizedUser.business,
                                    name: workspaceName,
                                }
                                : stabilizedUser.business,
                        };
                    }
                    const lifecycle = forceProcessingFastLane
                        ? {
                            processingState: "PROCESSING",
                            lifecycleState: "PROCESSING",
                            sessionReady: false,
                            retryable: true,
                            retryAfterMs: USER_ME_AUTH_SURFACE_RETRY_AFTER_MS,
                            terminal: false,
                            reason: "auth_context_processing",
                            reusedInFlight: bootstrapSnapshot.inFlight,
                            stabilizationMs: Date.now() - fastLaneStartedAt,
                            timeoutRecovered: false,
                        }
                        : {
                            processingState: "READY_MINIMAL",
                            lifecycleState: "READY_MINIMAL",
                            sessionReady: true,
                            retryable: false,
                            retryAfterMs: 0,
                            terminal: false,
                            reason: "ready_minimal",
                            reusedInFlight: bootstrapSnapshot.inFlight,
                            stabilizationMs: Date.now() - fastLaneStartedAt,
                            timeoutRecovered: bootstrapSnapshot.inFlight,
                        };
                    (0, authBootstrap_service_1.primeAuthBootstrapContext)({
                        userId,
                        preferredBusinessId: stabilizedUser.businessId,
                        profileSeed: {
                            email: stabilizedUser.email,
                            name: stabilizedUser.name,
                            avatar: stabilizedUser.avatar || null,
                        },
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "auth_processing_state",
                        value: lifecycle.stabilizationMs,
                        businessId: stabilizedUser.businessId || null,
                        route: "user_me",
                        metadata: {
                            surface: "auth",
                            state: lifecycle.processingState,
                            reason: forceProcessingFastLane
                                ? "auth_fast_lane_processing"
                                : "auth_fast_lane_ready_minimal",
                            reusedInFlight: lifecycle.reusedInFlight,
                            cacheHit: bootstrapSnapshot.cacheHit,
                            cacheAgeMs: bootstrapSnapshot.cacheAgeMs,
                            bootstrapInFlight: bootstrapSnapshot.inFlight,
                            bootstrapCacheKey: bootstrapSnapshot.cacheKey,
                        },
                    });
                    if (lifecycle.sessionReady) {
                        (0, performanceMetrics_1.emitPerformanceMetric)({
                            name: "auth_fast_lane_ms",
                            value: lifecycle.stabilizationMs,
                            businessId: stabilizedUser.businessId || null,
                            route: "user_me",
                            metadata: {
                                surface: "auth",
                                source: "ready_minimal",
                                cacheHit: bootstrapSnapshot.cacheHit,
                                bootstrapInFlight: bootstrapSnapshot.inFlight,
                            },
                        });
                        (0, performanceMetrics_1.emitPerformanceMetric)({
                            name: "ready_minimal_ms",
                            value: lifecycle.stabilizationMs,
                            businessId: stabilizedUser.businessId || null,
                            route: "user_me",
                            metadata: {
                                surface: "auth",
                                source: "user_me_fast_lane",
                            },
                        });
                        (0, performanceMetrics_1.emitPerformanceMetric)({
                            name: "auth_fastlane_success_rate",
                            value: 1,
                            businessId: stabilizedUser.businessId || null,
                            route: "user_me",
                            metadata: {
                                surface: "auth",
                                source: "ready_minimal",
                            },
                        });
                        (0, performanceMetrics_1.emitPerformanceMetric)({
                            name: "auth_session_ready",
                            value: lifecycle.stabilizationMs,
                            businessId: stabilizedUser.businessId || null,
                            route: "user_me",
                            metadata: {
                                surface: "auth",
                                source: "auth_fast_lane",
                                cacheHit: bootstrapSnapshot.cacheHit,
                                bootstrapInFlight: bootstrapSnapshot.inFlight,
                            },
                        });
                    }
                    else {
                        (0, performanceMetrics_1.emitPerformanceMetric)({
                            name: "auth_fastlane_success_rate",
                            value: 0,
                            businessId: stabilizedUser.businessId || null,
                            route: "user_me",
                            metadata: {
                                surface: "auth",
                                source: "processing",
                            },
                        });
                    }
                    console.info("AUTH_FAST_LANE_RESULT", {
                        userId,
                        businessId: stabilizedUser.businessId || null,
                        forceProcessingFastLane,
                        cacheHit: bootstrapSnapshot.cacheHit,
                        cacheAgeMs: bootstrapSnapshot.cacheAgeMs,
                        bootstrapInFlight: bootstrapSnapshot.inFlight,
                        stabilizationMs: lifecycle.stabilizationMs,
                    });
                    return {
                        ...stabilizedUser,
                        authLifecycle: lifecycle,
                    };
                },
            });
            const authSurfaceTtlMs = user.authLifecycle.sessionReady
                ? USER_ME_AUTH_SURFACE_CACHE_TTL_MS
                : 500;
            currentUserCache.set(cacheKey, {
                value: user,
                expiresAt: Date.now() + authSurfaceTtlMs,
            });
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "auth_stabilization_ms",
                value: Date.now() - startedAt,
                businessId: user.businessId || null,
                route: "user_me",
                metadata: {
                    surface: "auth",
                    cache: "miss",
                    state: user.authLifecycle.processingState,
                },
            });
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "auth_stabilization_duration_ms",
                value: Date.now() - startedAt,
                businessId: user.businessId || null,
                route: "user_me",
                metadata: {
                    surface: "auth",
                    cache: "miss",
                    state: user.authLifecycle.processingState,
                },
            });
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("X-Auth-Processing-State", user.authLifecycle.processingState);
            res.setHeader("X-Auth-Session-Ready", user.authLifecycle.sessionReady ? "1" : "0");
            res.setHeader("X-Auth-Retry-After-Ms", String(Math.max(0, Math.floor(user.authLifecycle.retryAfterMs || 0))));
            return res.json(user);
        }
        const userHydration = await (0, boundedTimeout_1.withTimeoutFallback)({
            label: "user_me_hydration",
            timeoutMs: 1800,
            task: getCurrentUser({
                userId,
                preferredBusinessId,
                baseUser,
            }),
            fallback: buildFallbackCurrentUser(baseUser, preferredBusinessId),
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
    }
    catch (err) {
        console.error("GET USER ERROR:", err);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});
router.get("/profile", auth_middleware_1.protect, async (req, res) => {
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
    }
    catch (err) {
        console.error("GET PROFILE ERROR:", err);
        return res.status(500).json({ error: "Failed to fetch profile" });
    }
});
router.get("/workspace", auth_middleware_1.protect, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const workspaceIdentity = await (0, boundedTimeout_1.withTimeoutFallback)({
            label: "user_workspace_hydration",
            timeoutMs: 1800,
            task: (0, tenant_service_1.resolveUserWorkspaceIdentity)({
                userId,
                preferredBusinessId: req.user?.businessId || null,
            }),
            fallback: {
                businessId: null,
                workspace: null,
                source: "none",
            },
        });
        res.setHeader("Cache-Control", "no-store");
        return res.json({
            businessId: workspaceIdentity.value.businessId,
            workspace: workspaceIdentity.value.workspace,
            source: workspaceIdentity.value.source,
        });
    }
    catch (err) {
        console.error("GET WORKSPACE ERROR:", err);
        return res.status(500).json({ error: "Failed to fetch workspace" });
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
        const updatedUser = await getCurrentUser({
            userId,
            preferredBusinessId: identity.businessId,
        });
        invalidateCurrentUserCache(userId);
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
        const updatedUser = await getCurrentUser({
            userId,
            preferredBusinessId: req.user?.businessId || null,
        });
        invalidateCurrentUserCache(userId);
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
        invalidateCurrentUserCache(userId);
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
        invalidateCurrentUserCache(userId);
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
