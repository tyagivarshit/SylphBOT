import prisma from "../config/prisma"

/*
GET CURRENT CONVERSATION STATE
*/
export const getConversationState = async (leadId: string) => {

  if (!leadId) return null;

  const state = await prisma.conversationState.findFirst({
    where: { leadId },
    orderBy: { updatedAt: "desc" }
  });

  if (!state) return null;

  /* CHECK EXPIRY */

  if (state.expiresAt && new Date() > state.expiresAt) {

    await prisma.conversationState.deleteMany({
      where: { leadId },
    });

    return null;

  }

  return state;

};

/*
SET OR UPDATE CONVERSATION STATE
*/
export const setConversationState = async (
  leadId: string,
  state: string,
  context?: string,
  ttlMinutes: number = 15
) => {

  if (!leadId) return null;

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const existing = await prisma.conversationState.findFirst({
    where: { leadId },
  });

  if (existing) {

    return prisma.conversationState.update({
      where: { id: existing.id },
      data: {
        state,
        context,
        expiresAt,
        updatedAt: new Date(),
      },
    });

  }

  return prisma.conversationState.create({
    data: {
      leadId,
      state,
      context,
      expiresAt,
    },
  });

};

/*
CLEAR CONVERSATION STATE
*/
export const clearConversationState = async (leadId: string) => {

  if (!leadId) return;

  return prisma.conversationState.deleteMany({
    where: { leadId },
  });

};