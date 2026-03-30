import prisma from "../config/prisma";

/* =====================================================
TYPES
===================================================== */
type StateContext = any;

interface SetStateOptions {
  context?: StateContext;
  ttlMinutes?: number;
}

/* =====================================================
HELPERS
===================================================== */

const safeParse = (data: any) => {
  try {
    if (!data) return null;
    if (typeof data === "object") return data;
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const safeStringify = (data: any) => {
  try {
    if (!data) return null;
    if (typeof data === "string") return data;
    return JSON.stringify(data);
  } catch {
    return null;
  }
};

/* =====================================================
GET STATE (SMART + SAFE)
===================================================== */
export const getConversationState = async (leadId: string) => {
  if (!leadId) return null;

  const state = await prisma.conversationState.findUnique({
    where: { leadId },
  });

  if (!state) return null;

  /* 🔥 AUTO EXPIRE */
  if (state.expiresAt && new Date() > state.expiresAt) {
    await prisma.conversationState.delete({
      where: { leadId },
    });
    return null;
  }

  return {
    ...state,
    context: safeParse(state.context),
  };
};

/* =====================================================
SET STATE (UPSERT + FLEXIBLE)
===================================================== */
export const setConversationState = async (
  leadId: string,
  state: string,
  options: SetStateOptions = {}
) => {
  if (!leadId) return null;

  const { context, ttlMinutes = 15 } = options;

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  try {
    return await prisma.conversationState.upsert({
      where: { leadId },
      update: {
        state,
        context: safeStringify(context),
        expiresAt,
        updatedAt: new Date(),
      },
      create: {
        leadId,
        state,
        context: safeStringify(context),
        expiresAt,
      },
    });
  } catch (error) {
    console.error("SET STATE ERROR:", error);
    return null;
  }
};

/* =====================================================
UPDATE STATE (PARTIAL UPDATE 🔥)
===================================================== */
export const updateConversationState = async (
  leadId: string,
  partialContext: any
) => {
  if (!leadId) return null;

  const current = await getConversationState(leadId);

  if (!current) return null;

  const updatedContext = {
    ...(current.context || {}),
    ...partialContext,
  };

  return await prisma.conversationState.update({
    where: { leadId },
    data: {
      context: safeStringify(updatedContext),
      updatedAt: new Date(),
    },
  });
};

/* =====================================================
CLEAR STATE
===================================================== */
export const clearConversationState = async (leadId: string) => {
  if (!leadId) return;

  try {
    await prisma.conversationState.delete({
      where: { leadId },
    });
  } catch (error) {
    console.error("CLEAR STATE ERROR:", error);
  }
};

/* =====================================================
DEBUG (OPTIONAL 🔥)
===================================================== */
export const getRawState = async (leadId: string) => {
  return prisma.conversationState.findUnique({
    where: { leadId },
  });
};