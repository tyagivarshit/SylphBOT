import prisma from "../config/prisma";

export const isHumanActive = async (leadId: string) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { isHumanActive: true },
    });

    return lead?.isHumanActive || false;
  } catch (error) {
    console.error("HUMAN CHECK ERROR:", error);
    return false;
  }
};

export const activateHuman = async (leadId: string) => {
  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        isHumanActive: true,
      },
    });
  } catch (error) {
    console.error("ACTIVATE HUMAN ERROR:", error);
  }
};

export const deactivateHuman = async (leadId: string) => {
  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        isHumanActive: false,
      },
    });
  } catch (error) {
    console.error("DEACTIVATE HUMAN ERROR:", error);
  }
};

/* 🔥 AUTO SWITCH BACK TO AI AFTER INACTIVITY */
export const autoDisableHumanAfterTimeout = async (
  leadId: string,
  timeoutMinutes = 10
) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        lastMessageAt: true,
        isHumanActive: true,
      },
    });

    if (!lead || !lead.isHumanActive) return;

    const last = new Date(lead.lastMessageAt || 0).getTime();
    const now = Date.now();

    const diffMinutes = (now - last) / (1000 * 60);

    if (diffMinutes >= timeoutMinutes) {
      await deactivateHuman(leadId);
    }
  } catch (error) {
    console.error("AUTO HUMAN TIMEOUT ERROR:", error);
  }
};