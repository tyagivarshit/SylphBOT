import prisma from "../../../config/prisma";
import { createNotification } from "../../notification.service";
import type {
  RevenueBrainContext,
  RevenueBrainNotifyOwnerResult,
  RevenueBrainToolExecution,
} from "../types";

export const runNotifyOwnerTool = async ({
  context,
  title,
  message,
}: {
  context: RevenueBrainContext;
  title?: string;
  message: string;
}): Promise<{
  execution: RevenueBrainToolExecution;
  result: RevenueBrainNotifyOwnerResult;
}> => {
  if (context.preview) {
    return {
      execution: {
        name: "notifyOwner",
        phase: "after_reply",
        status: "skipped",
        payload: {
          reason: "preview_mode",
        },
      },
      result: {
        notified: false,
        reason: "preview_mode",
      },
    };
  }

  const business = await prisma.business.findUnique({
    where: {
      id: context.businessId,
    },
    select: {
      ownerId: true,
    },
  });

  if (!business?.ownerId) {
    return {
      execution: {
        name: "notifyOwner",
        phase: "after_reply",
        status: "skipped",
        payload: {
          reason: "owner_not_found",
        },
      },
      result: {
        notified: false,
        reason: "owner_not_found",
      },
    };
  }

  try {
    await createNotification({
      userId: business.ownerId,
      businessId: context.businessId,
      title: title || "Revenue Brain Escalation",
      message,
      type: "REVENUE_BRAIN_ESCALATION",
      link: `/conversations?leadId=${context.leadId}`,
    });

    return {
      execution: {
        name: "notifyOwner",
        phase: "after_reply",
        status: "applied",
        payload: {
          notified: true,
        },
      },
      result: {
        notified: true,
        reason: "owner_notified",
      },
    };
  } catch (error: any) {
    return {
      execution: {
        name: "notifyOwner",
        phase: "after_reply",
        status: "failed",
        error: error?.message || "owner_notification_failed",
      },
      result: {
        notified: false,
        reason: error?.message || "owner_notification_failed",
      },
    };
  }
};
