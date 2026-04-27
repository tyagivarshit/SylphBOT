import prisma from "../config/prisma";
import { conflict } from "../utils/AppError";
import { stripe } from "./stripe.service";

const buildDeletedEmail = (email: string) => {
  const [local, domain = "deleted.local"] = email.split("@");
  return `${local}+deleted_${Date.now()}@${domain}`;
};

type DeleteMode = "soft" | "permanent";

export const exportBusinessData = async (input: {
  userId: string;
  businessId: string;
}) => {
  const [user, business, clients, leads, flows, subscriptions, invoices, apiKeys] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          role: true,
          businessId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.business.findUnique({
        where: { id: input.businessId },
        include: {
          subscription: {
            include: {
              plan: true,
            },
          },
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.client.findMany({
        where: { businessId: input.businessId },
        select: {
          id: true,
          platform: true,
          phoneNumberId: true,
          pageId: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.lead.findMany({
        where: { businessId: input.businessId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
          appointments: true,
          summaries: true,
          memories: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.automationFlow.findMany({
        where: { businessId: input.businessId },
        include: {
          steps: {
            orderBy: { createdAt: "asc" },
          },
          executions: true,
        },
      }),
      prisma.subscription.findMany({
        where: { businessId: input.businessId },
        include: {
          plan: true,
        },
      }),
      prisma.invoice.findMany({
        where: { businessId: input.businessId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.apiKey.findMany({
        where: {
          businessId: input.businessId,
          revokedAt: null,
        },
        select: {
          id: true,
          prefix: true,
          name: true,
          permissions: true,
          scopes: true,
          lastUsedAt: true,
          createdAt: true,
        },
      }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    business,
    clients,
    leads,
    automationFlows: flows,
    subscriptions,
    invoices,
    apiKeys,
  };
};

const cancelBusinessSubscription = async (businessId: string) => {
  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    select: {
      stripeSubscriptionId: true,
    },
  });

  if (!subscription?.stripeSubscriptionId) {
    return;
  }

  try {
    await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
  } catch {
    // Preserve current behavior by failing open when Stripe cleanup is unavailable.
  }
};

const softDeleteBusinessData = async (input: {
  userId: string;
  businessId: string;
}) => {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      archivedEmail: true,
      businessId: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const now = new Date();

  await cancelBusinessSubscription(input.businessId);

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id: input.businessId },
      data: {
        deletedAt: now,
      },
    });

    await Promise.all([
      tx.client.updateMany({
        where: { businessId: input.businessId },
        data: {
          isActive: false,
          deletedAt: now,
        },
      }),
      tx.lead.updateMany({
        where: { businessId: input.businessId },
        data: {
          deletedAt: now,
        },
      }),
      tx.commentTrigger.updateMany({
        where: { businessId: input.businessId },
        data: {
          isActive: false,
        },
      }),
      tx.automationFlow.updateMany({
        where: { businessId: input.businessId },
        data: {
          status: "INACTIVE",
        },
      }),
      tx.knowledgeBase.updateMany({
        where: { businessId: input.businessId },
        data: {
          isActive: false,
        },
      }),
      tx.bookingSlot.updateMany({
        where: { businessId: input.businessId },
        data: {
          isActive: false,
        },
      }),
      tx.subscription.updateMany({
        where: { businessId: input.businessId },
        data: {
          status: "CANCELLED",
          graceUntil: null,
          isTrial: false,
        },
      }),
      tx.apiKey.updateMany({
        where: {
          businessId: input.businessId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
      tx.refreshToken.deleteMany({
        where: { userId: input.userId },
      }),
      tx.user.update({
        where: { id: input.userId },
        data: {
          email: buildDeletedEmail(user.email),
          archivedEmail: user.archivedEmail || user.email,
          isActive: false,
          deletedAt: now,
          businessId: null,
          tokenVersion: { increment: 1 },
          avatar: null,
          phone: null,
          resetToken: null,
          resetTokenExpiry: null,
          verifyToken: null,
          verifyTokenExpiry: null,
        },
      }),
    ]);
  });
};

export const restoreBusinessData = async (input: {
  businessId: string;
}) => {
  const business = await prisma.business.findFirst({
    where: {
      id: input.businessId,
      deletedAt: {
        not: null,
      },
    },
    select: {
      id: true,
      ownerId: true,
    },
  });

  if (!business) {
    return null;
  }

  const owner = await prisma.user.findUnique({
    where: {
      id: business.ownerId,
    },
    select: {
      id: true,
      email: true,
      archivedEmail: true,
    },
  });

  if (!owner) {
    throw new Error("Owner not found");
  }

  if (owner.archivedEmail) {
    const conflictingUser = await prisma.user.findFirst({
      where: {
        email: owner.archivedEmail,
        NOT: {
          id: owner.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (conflictingUser) {
      throw conflict("Original owner email is already in use");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: {
        id: business.id,
      },
      data: {
        deletedAt: null,
      },
    });

    await Promise.all([
      tx.client.updateMany({
        where: {
          businessId: business.id,
          deletedAt: {
            not: null,
          },
        },
        data: {
          deletedAt: null,
        },
      }),
      tx.lead.updateMany({
        where: {
          businessId: business.id,
          deletedAt: {
            not: null,
          },
        },
        data: {
          deletedAt: null,
        },
      }),
      tx.user.updateMany({
        where: {
          businessId: business.id,
          deletedAt: {
            not: null,
          },
        },
        data: {
          deletedAt: null,
          isActive: true,
        },
      }),
      tx.user.update({
        where: {
          id: owner.id,
        },
        data: {
          email: owner.archivedEmail || owner.email,
          archivedEmail: null,
          isActive: true,
          deletedAt: null,
          businessId: business.id,
          tokenVersion: {
            increment: 1,
          },
        },
      }),
    ]);
  });

  return {
    businessId: business.id,
    ownerId: owner.id,
    restoredAt: new Date().toISOString(),
  };
};

const permanentDeleteBusinessData = async (input: {
  businessId: string;
}) => {
  const [business, workspaceUsers, leads, flows, appointments] = await Promise.all([
    prisma.business.findUnique({
      where: { id: input.businessId },
      select: {
        id: true,
        ownerId: true,
      },
    }),
    prisma.user.findMany({
      where: {
        businessId: input.businessId,
      },
      select: {
        id: true,
      },
    }),
    prisma.lead.findMany({
      where: { businessId: input.businessId },
      select: { id: true },
    }),
    prisma.automationFlow.findMany({
      where: { businessId: input.businessId },
      select: { id: true },
    }),
    prisma.appointment.findMany({
      where: { businessId: input.businessId },
      select: { id: true },
    }),
  ]);

  if (!business) {
    throw new Error("Business not found");
  }

  const userIds = Array.from(
    new Set([...workspaceUsers.map((user) => user.id), business.ownerId])
  );
  const leadIds = leads.map((lead) => lead.id);
  const flowIds = flows.map((flow) => flow.id);
  const appointmentIds = appointments.map((appointment) => appointment.id);

  await cancelBusinessSubscription(input.businessId);

  await prisma.$transaction(async (tx) => {
    if (leadIds.length) {
      await Promise.all([
        tx.memory.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.conversationSummary.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.conversationState.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.salesMessageTracking.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.revenueTouchLedger.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.conversionEvent.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.consentLedger.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.autonomousCapReservation.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.channelHealth.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.leadControlState.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.autonomousCampaign.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.autonomousOpportunity.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.leadStateHistory.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
        tx.message.deleteMany({
          where: {
            leadId: { in: leadIds },
          },
        }),
      ]);
    }

    if (flowIds.length) {
      await Promise.all([
        tx.automationExecution.deleteMany({
          where: {
            flowId: { in: flowIds },
          },
        }),
        tx.automationStep.deleteMany({
          where: {
            flowId: { in: flowIds },
          },
        }),
      ]);
    }

    if (appointmentIds.length) {
      await tx.reminderLog.deleteMany({
        where: {
          appointmentId: { in: appointmentIds },
        },
      });
    }

    if (userIds.length) {
      await Promise.all([
        tx.refreshToken.deleteMany({
          where: {
            userId: { in: userIds },
          },
        }),
        tx.notificationSettings.deleteMany({
          where: {
            userId: { in: userIds },
          },
        }),
        tx.notification.deleteMany({
          where: {
            userId: { in: userIds },
          },
        }),
        tx.auditLog.deleteMany({
          where: {
            userId: { in: userIds },
          },
        }),
      ]);
    }

    await Promise.all([
      tx.apiKey.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.securityAlert.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.auditLog.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.salesOptimizationInsight.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.salesMessageVariant.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.commentTrigger.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.automationFlow.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.knowledgeBase.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.bookingSlot.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.calendarConnection.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.appointment.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.lead.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.client.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.usageDaily.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.usage.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.addonBalance.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.invoice.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.analytics.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
      tx.subscription.deleteMany({
        where: {
          businessId: input.businessId,
        },
      }),
    ]);

    await tx.business.delete({
      where: {
        id: input.businessId,
      },
    });

    await tx.user.deleteMany({
      where: {
        id: { in: userIds },
      },
    });
  });
};

export const deleteBusinessData = async (input: {
  userId: string;
  businessId: string;
  mode: DeleteMode;
}) => {
  if (input.mode === "permanent") {
    await permanentDeleteBusinessData({
      businessId: input.businessId,
    });
    return;
  }

  await softDeleteBusinessData({
    userId: input.userId,
    businessId: input.businessId,
  });
};
