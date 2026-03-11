import prisma from "../config/prisma";

/*
GET CURRENT CONVERSATION STATE
*/
export const getConversationState = async (leadId: string) => {

return prisma.conversationState.findFirst({
where: { leadId },
});

};

/*
SET OR UPDATE CONVERSATION STATE
*/
export const setConversationState = async (
leadId: string,
state: string,
context?: string
) => {

const existing = await prisma.conversationState.findFirst({
where: { leadId },
});

if (existing) {

return prisma.conversationState.update({
  where: { id: existing.id },
  data: {
    state,
    context,
  },
});

}

return prisma.conversationState.create({
data: {
leadId,
state,
context,
},
});

};

/*
CLEAR CONVERSATION STATE
*/
export const clearConversationState = async (leadId: string) => {

return prisma.conversationState.deleteMany({
where: { leadId },
});

};
