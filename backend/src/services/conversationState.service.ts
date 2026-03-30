import prisma from "../config/prisma";

/* =====================================================
TYPES (STRICT 🔥)
===================================================== */
type StateContext = Record<string, any>;

interface SetStateOptions {
  context?: StateContext;
  ttlMinutes?: number;
}

/* =====================================================
STRICT HELPERS (NO SILENT FAILS)
===================================================== */

/* 🔥 ALWAYS PARSE STRING → OBJECT */
const parseContext = (data: any): StateContext => {
  if (!data) return {};

  try {
    if (typeof data === "string") {
      return JSON.parse(data);
    }

    /* 🚨 If object stored directly (old bug), force stringify+parse */
    return JSON.parse(JSON.stringify(data));
  } catch (err) {
    console.error("CONTEXT PARSE ERROR:", err);
    return {};
  }
};

/* 🔥 ALWAYS STORE STRING */
const stringifyContext = (data: any): string => {
  try {
    if (!data) return JSON.stringify({});
    return JSON.stringify(data);
  } catch (err) {
    console.error("CONTEXT STRINGIFY ERROR:", err);
    return JSON.stringify({});
  }
};

/* =====================================================
GET STATE (STRICT + SAFE)
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
    context: parseContext(state.context), // ALWAYS OBJECT
  };
};

/* =====================================================
SET STATE (STRICT)
===================================================== */
export const setConversationState = async (
  leadId: string,
  state: string,
  options: SetStateOptions = {}
) => {
  if (!leadId) return null;

  const { context = {}, ttlMinutes = 15 } = options;

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  try {
    return await prisma.conversationState.upsert({
      where: { leadId },
      update: {
        state,
        context: stringifyContext(context), // ALWAYS STRING
        expiresAt,
        updatedAt: new Date(),
      },
      create: {
        leadId,
        state,
        context: stringifyContext(context),
        expiresAt,
      },
    });
  } catch (error) {
    console.error("SET STATE ERROR:", error);
    return null;
  }
};

/* =====================================================
UPDATE STATE (SAFE MERGE)
===================================================== */
export const updateConversationState = async (
  leadId: string,
  partialContext: StateContext
) => {
  if (!leadId) return null;

  const current = await getConversationState(leadId);
  if (!current) return null;

  const updatedContext = {
    ...(current.context || {}),
    ...(partialContext || {}),
  };

  try {
    return await prisma.conversationState.update({
      where: { leadId },
      data: {
        context: stringifyContext(updatedContext),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("UPDATE STATE ERROR:", error);
    return null;
  }
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
DEBUG
===================================================== */
export const getRawState = async (leadId: string) => {
  return prisma.conversationState.findUnique({
    where: { leadId },
  });
};