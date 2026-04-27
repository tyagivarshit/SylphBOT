import http from "http";
import crypto from "crypto";
import { Server, type Socket } from "socket.io";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { verifyAccessToken, verifyRefreshToken } from "../utils/generateToken";

type AuthenticatedSocketData = {
  user: {
    id: string;
    businessId: string;
  };
};

let io: Server;

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const parseCookies = (cookieHeader?: string | null) =>
  String(cookieHeader || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, entry) => {
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

const loadSocketUser = async (socket: Socket) => {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const accessToken = cookies.accessToken;
  const refreshToken = cookies.refreshToken;

  let accessPayload: ReturnType<typeof verifyAccessToken> | null = null;
  let refreshPayload: ReturnType<typeof verifyRefreshToken> | null = null;

  try {
    accessPayload = accessToken ? verifyAccessToken(accessToken) : null;
  } catch {
    accessPayload = null;
  }

  try {
    refreshPayload = refreshToken ? verifyRefreshToken(refreshToken) : null;
  } catch {
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

    const storedToken = await prisma.refreshToken.findFirst({
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

  const user = await prisma.user.findUnique({
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

  if (
    !user ||
    !user.businessId ||
    !user.isActive ||
    user.deletedAt ||
    user.business?.deletedAt ||
    user.tokenVersion !== decoded.tokenVersion
  ) {
    throw new Error("Socket session is no longer valid");
  }

  return {
    id: user.id,
    businessId: user.businessId,
  };
};

const getLeadRoom = (leadId: string) => `lead_${leadId}`;
const getUserRoom = (userId: string) => `user_${userId}`;

const resolveSocketIdentity = (socket: Socket) =>
  (socket.data as AuthenticatedSocketData).user;

const ensureLeadRoomMembership = (socket: Socket, leadId: string) => {
  const room = getLeadRoom(leadId);
  return socket.rooms.has(room) ? room : null;
};

const ensureConversationAccess = async (socket: Socket, leadId: string) => {
  const identity = resolveSocketIdentity(socket);

  if (!identity?.businessId) {
    return null;
  }

  return prisma.lead.findFirst({
    where: {
      id: leadId,
      businessId: identity.businessId,
    },
    select: {
      id: true,
    },
  });
};

export const initSocket = (server: http.Server) => {
  io = new Server(server, {
    cors: {
      origin: env.ALLOWED_FRONTEND_ORIGINS,
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
    } catch (error) {
      next(error instanceof Error ? error : new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const identity = resolveSocketIdentity(socket);

    socket.join(getUserRoom(identity.id));

    socket.on("join_conversation", async (leadId: string, acknowledge?: Function) => {
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
      } catch {
        acknowledge?.({
          success: false,
          data: null,
          message: "Unable to join conversation",
        });
      }
    });

    socket.on("join_user_room", (_userId: string, acknowledge?: Function) => {
      acknowledge?.({
        success: true,
        data: {
          room: getUserRoom(identity.id),
        },
      });
    });

    socket.on("typing", (leadId: string) => {
      const normalizedLeadId = String(leadId || "").trim();
      const room = ensureLeadRoomMembership(socket, normalizedLeadId);

      if (!room) {
        return;
      }

      socket.to(room).emit("typing", normalizedLeadId);
    });

    socket.on("stop_typing", (leadId: string) => {
      const normalizedLeadId = String(leadId || "").trim();
      const room = ensureLeadRoomMembership(socket, normalizedLeadId);

      if (!room) {
        return;
      }

      socket.to(room).emit("stop_typing", normalizedLeadId);
    });
  });
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket not initialized");
  }

  return io;
};
