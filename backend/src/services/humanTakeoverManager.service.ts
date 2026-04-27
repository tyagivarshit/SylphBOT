import prisma from "../config/prisma";
import {
  getLeadControlAuthority,
  isLeadHumanControlActive,
  setLeadHumanControl,
} from "./leadControlState.service";

export const isHumanActive = async (leadId: string) => {
  try {
    const controlState = await getLeadControlAuthority({
      leadId,
    });

    return isLeadHumanControlActive(controlState);
  } catch (error) {
    console.error("HUMAN CHECK ERROR:", error);
    return false;
  }
};

export const activateHuman = async (leadId: string) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        businessId: true,
      },
    });

    await setLeadHumanControl({
      leadId,
      businessId: lead?.businessId || null,
      isActive: true,
    });
  } catch (error) {
    console.error("ACTIVATE HUMAN ERROR:", error);
    throw error;
  }
};

export const deactivateHuman = async (leadId: string) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        businessId: true,
      },
    });

    await setLeadHumanControl({
      leadId,
      businessId: lead?.businessId || null,
      isActive: false,
    });
  } catch (error) {
    console.error("DEACTIVATE HUMAN ERROR:", error);
    throw error;
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
      },
    });

    if (!lead || !(await isHumanActive(leadId))) return;

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
