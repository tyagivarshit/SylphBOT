"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = exports.initSocket = void 0;
const crypto_1 = __importDefault(require("crypto"));
const socket_io_1 = require("socket.io");
const prisma_1 = __importDefault(require("../config/prisma"));
const env_1 = require("../config/env");
const generateToken_1 = require("../utils/generateToken");
let io;
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const parseCookies = (cookieHeader) => String(cookieHeader || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex === -1) {
        return accumulator;
    }
    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!key) {
        return accumulator;
    }
    accumulator[key] = decodeURIComponent(value);
    return accumulator;
}, {});
const loadSocketUser = async (socket) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const accessToken = cookies.accessToken;
    const refreshToken = cookies.refreshToken;
    let accessPayload = null;
    let refreshPayload = null;
    try {
        accessPayload = accessToken ? (0, generateToken_1.verifyAccessToken)(accessToken) : null;
    }
    catch {
        accessPayload = null;
    }
    try {
        refreshPayload = refreshToken ? (0, generateToken_1.verifyRefreshToken)(refreshToken) : null;
    }
    catch {
        refreshPayload = null;
    }
    const decoded = accessPayload || refreshPayload;
    if (!decoded?.id || typeof decoded.tokenVersion !== "number") {
        throw new Error("Socket authentication required");
    }
    if (!accessPayload) {
        if (!refreshToken || !refreshPayload) {
            throw new Error("Socket authentication required");
        }
        const storedToken = await prisma_1.default.refreshToken.findFirst({
            where: {
                token: hashToken(refreshToken),
                userId: decoded.id,
                expiresAt: {
                    gt: new Date(),
                },
            },
            select: {
                id: true,
            },
        });
        if (!storedToken) {
            throw new Error("Socket session is no longer valid");
        }
    }
    const user = await prisma_1.default.user.findUnique({
        where: {
            id: decoded.id,
        },
        select: {
            id: true,
            tokenVersion: true,
            isActive: true,
            deletedAt: true,
            businessId: true,
            business: {
                select: {
                    deletedAt: true,
                },
            },
        },
    });
    if (!user ||
        !user.businessId ||
        !user.isActive ||
        user.deletedAt ||
        user.business?.deletedAt ||
        user.tokenVersion !== decoded.tokenVersion) {
        throw new Error("Socket session is no longer valid");
    }
    return {
        id: user.id,
        businessId: user.businessId,
    };
};
const getLeadRoom = (leadId) => `lead_${leadId}`;
const getUserRoom = (userId) => `user_${userId}`;
const resolveSocketIdentity = (socket) => socket.data.user;
const ensureLeadRoomMembership = (socket, leadId) => {
    const room = getLeadRoom(leadId);
    return socket.rooms.has(room) ? room : null;
};
const ensureConversationAccess = async (socket, leadId) => {
    const identity = resolveSocketIdentity(socket);
    if (!identity?.businessId) {
        return null;
    }
    return prisma_1.default.lead.findFirst({
        where: {
            id: leadId,
            businessId: identity.businessId,
        },
        select: {
            id: true,
        },
    });
};
const initSocket = (server) => {
    io = new socket_io_1.Server(server, {
        cors: {
            origin: env_1.env.ALLOWED_FRONTEND_ORIGINS,
            credentials: true,
        },
    });
    io.use(async (socket, next) => {
        try {
            const user = await loadSocketUser(socket);
            socket.data = {
                ...(socket.data || {}),
                user,
            };
            next();
        }
        catch (error) {
            next(error instanceof Error ? error : new Error("Unauthorized"));
        }
    });
    io.on("connection", (socket) => {
        const identity = resolveSocketIdentity(socket);
        socket.join(getUserRoom(identity.id));
        socket.on("join_conversation", async (leadId, acknowledge) => {
            try {
                const normalizedLeadId = String(leadId || "").trim();
                if (!normalizedLeadId) {
                    acknowledge?.({
                        success: false,
                        data: null,
                        message: "Lead id is required",
                    });
                    return;
                }
                const lead = await ensureConversationAccess(socket, normalizedLeadId);
                if (!lead) {
                    acknowledge?.({
                        success: false,
                        data: null,
                        message: "Forbidden room join",
                    });
                    return;
                }
                socket.join(getLeadRoom(lead.id));
                acknowledge?.({
                    success: true,
                    data: {
                        room: getLeadRoom(lead.id),
                    },
                });
            }
            catch {
                acknowledge?.({
                    success: false,
                    data: null,
                    message: "Unable to join conversation",
                });
            }
        });
        socket.on("join_user_room", (_userId, acknowledge) => {
            acknowledge?.({
                success: true,
                data: {
                    room: getUserRoom(identity.id),
                },
            });
        });
        socket.on("typing", (leadId) => {
            const normalizedLeadId = String(leadId || "").trim();
            const room = ensureLeadRoomMembership(socket, normalizedLeadId);
            if (!room) {
                return;
            }
            socket.to(room).emit("typing", normalizedLeadId);
        });
        socket.on("stop_typing", (leadId) => {
            const normalizedLeadId = String(leadId || "").trim();
            const room = ensureLeadRoomMembership(socket, normalizedLeadId);
            if (!room) {
                return;
            }
            socket.to(room).emit("stop_typing", normalizedLeadId);
        });
    });
};
exports.initSocket = initSocket;
const getIO = () => {
    if (!io) {
        throw new Error("Socket not initialized");
    }
    return io;
};
exports.getIO = getIO;
