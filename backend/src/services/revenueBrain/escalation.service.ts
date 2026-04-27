import prisma from "../../config/prisma";
import {
  createNotificationTx,
  emitNotification,
} from "../notification.service";
import { setLeadHumanControl } from "../leadControlState.service";

export const activateRevenueBrainEscalation = async ({
  businessId,
  leadId,
  title,
  message,
}: {
  businessId: string;
  leadId: string;
  title: string;
  message: string;
}) => {
  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: {
      ownerId: true,
    },
  });

  if (!business?.ownerId) {
    throw new Error("owner_not_found");
  }

  const controlState = await setLeadHumanControl({
    leadId,
    businessId,
    isActive: true,
  });

  const result = await prisma.$transaction(async (tx) => {
    if (!controlState.manualSuppressUntil) {
      throw new Error("human_lock_verification_failed");
    }

    const notification = await createNotificationTx(tx, {
      userId: business.ownerId,
      businessId,
      title,
      message,
      type: "REVENUE_BRAIN_ESCALATION",
      link: `/conversations?leadId=${leadId}`,
    });

    return {
      ownerId: business.ownerId,
      notification,
    };
  });

  emitNotification(result.notification);

  return {
    activated: true,
    ownerId: result.ownerId,
    notificationId: result.notification.id,
  };
};
