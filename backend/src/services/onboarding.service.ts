import prisma from "../config/prisma";
import { TRIAL_DAYS } from "../config/pricing.config";
import { enqueueAIBatch } from "../queues/ai.queue";
import { getUsageOverview } from "./usage.service";
import logger from "../utils/logger";

const ONBOARDING_DEMO_MESSAGE =
  "Hi, I want to know more about your service";

const ONBOARDING_DEMO_LEAD_NAME = "Onboarding Demo";

type ChatPreviewMessage = {
  id: string;
  content: string;
  createdAt: string;
};

type ChatPreview = {
  leadId: string | null;
  userMessage: ChatPreviewMessage | null;
  aiMessage: ChatPreviewMessage | null;
};

type IntegrationClient = {
  id: string;
  platform: string;
  isActive: boolean;
};

const normalizeBusinessId = (businessId: string) =>
  String(businessId || "").trim();

const buildChatPreviewMessage = (
  message?: {
    id: string;
    content: string;
    createdAt: Date;
  } | null
): ChatPreviewMessage | null =>
  message
    ? {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      }
    : null;

const getActiveMessagingClients = async (businessId: string) =>
  prisma.client.findMany({
    where: {
      businessId,
      isActive: true,
      platform: {
        in: ["INSTAGRAM", "WHATSAPP"],
      },
    },
    select: {
      id: true,
      platform: true,
      isActive: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

const getLeadPreview = async (leadId?: string | null): Promise<ChatPreview> => {
  const normalizedLeadId = String(leadId || "").trim();

  if (!normalizedLeadId) {
    return {
      leadId: null,
      userMessage: null,
      aiMessage: null,
    };
  }

  const lead = await prisma.lead.findUnique({
    where: {
      id: normalizedLeadId,
    },
    select: {
      id: true,
      messages: {
        where: {
          sender: {
            in: ["USER", "AI"],
          },
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          content: true,
          sender: true,
          createdAt: true,
        },
      },
    },
  });

  if (!lead) {
    return {
      leadId: null,
      userMessage: null,
      aiMessage: null,
    };
  }

  const userMessage = lead.messages.find((message) => message.sender === "USER");
  const aiMessage = lead.messages.find((message) => message.sender === "AI");

  return {
    leadId: lead.id,
    userMessage: buildChatPreviewMessage(userMessage),
    aiMessage: buildChatPreviewMessage(aiMessage),
  };
};

const getFirstRealReplyPreview = async (
  businessId: string,
  demoLeadId?: string | null
): Promise<ChatPreview> => {
  const aiMessage = await prisma.message.findFirst({
    where: {
      sender: "AI",
      lead: {
        businessId,
        ...(demoLeadId
          ? {
              id: {
                not: demoLeadId,
              },
            }
          : {}),
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      leadId: true,
    },
  });

  if (!aiMessage) {
    return {
      leadId: null,
      userMessage: null,
      aiMessage: null,
    };
  }

  const userMessage = await prisma.message.findFirst({
    where: {
      leadId: aiMessage.leadId,
      sender: "USER",
      createdAt: {
        lte: aiMessage.createdAt,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
    },
  });

  return {
    leadId: aiMessage.leadId,
    userMessage: buildChatPreviewMessage(userMessage),
    aiMessage: buildChatPreviewMessage(aiMessage),
  };
};

const resolveOnboardingStep = ({
  connected,
  demoCompleted,
  onboardingCompleted,
}: {
  connected: boolean;
  demoCompleted: boolean;
  onboardingCompleted: boolean;
}) => {
  if (onboardingCompleted) {
    return 5;
  }

  if (!connected) {
    return 1;
  }

  if (!demoCompleted) {
    return 2;
  }

  return 3;
};

const updateOnboardingStateIfNeeded = async ({
  businessId,
  onboardingCompleted,
  onboardingStep,
  demoCompleted,
}: {
  businessId: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
  demoCompleted: boolean;
}) => {
  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: {
      onboardingCompleted: true,
      onboardingStep: true,
      demoCompleted: true,
    },
  });

  if (!business) {
    return null;
  }

  if (
    business.onboardingCompleted === onboardingCompleted &&
    business.onboardingStep === onboardingStep &&
    business.demoCompleted === demoCompleted
  ) {
    return business;
  }

  return prisma.business.update({
    where: {
      id: businessId,
    },
    data: {
      onboardingCompleted,
      onboardingStep,
      demoCompleted,
    },
    select: {
      onboardingCompleted: true,
      onboardingStep: true,
      demoCompleted: true,
    },
  });
};

export const triggerOnboardingDemo = async ({
  businessId,
  client,
}: {
  businessId: string;
  client: IntegrationClient;
}) => {
  const normalizedBusinessId = normalizeBusinessId(businessId);

  if (!normalizedBusinessId || !client?.id || !client?.platform) {
    return null;
  }

  const business = await prisma.business.findUnique({
    where: {
      id: normalizedBusinessId,
    },
    select: {
      id: true,
      onboardingCompleted: true,
      onboardingStep: true,
      demoCompleted: true,
      onboardingDemoLeadId: true,
    },
  });

  if (!business || business.onboardingCompleted || business.demoCompleted) {
    return null;
  }

  const subscription = await prisma.subscription.findUnique({
    where: {
      businessId: normalizedBusinessId,
    },
    include: {
      plan: true,
    },
  });

  const demoLead = business.onboardingDemoLeadId
    ? await prisma.lead.findUnique({
        where: {
          id: business.onboardingDemoLeadId,
        },
        select: {
          id: true,
          messages: {
            where: {
              sender: {
                in: ["USER", "AI"],
              },
            },
            orderBy: {
              createdAt: "asc",
            },
            select: {
              id: true,
              sender: true,
              content: true,
            },
          },
        },
      })
    : null;

  if (demoLead?.messages.some((message) => message.sender === "AI")) {
    await prisma.business.update({
      where: {
        id: normalizedBusinessId,
      },
      data: {
        demoCompleted: true,
        onboardingStep: 3,
      },
    });
    return demoLead;
  }

  const lead =
    demoLead ||
    (await prisma.lead.create({
      data: {
        businessId: normalizedBusinessId,
        clientId: client.id,
        name: ONBOARDING_DEMO_LEAD_NAME,
        platform: client.platform,
        stage: "ONBOARDING_DEMO",
        aiStage: "ONBOARDING_DEMO",
        revenueState: "WARM",
      },
      select: {
        id: true,
      },
    }));

  if (!demoLead?.messages.some((message) => message.sender === "USER")) {
    await prisma.message.create({
      data: {
        leadId: lead.id,
        content: ONBOARDING_DEMO_MESSAGE,
        sender: "USER",
        metadata: {
          onboardingDemo: true,
          internalSimulation: true,
          source: "ONBOARDING_DEMO",
          platform: client.platform,
        },
      },
    });
  }

  await prisma.business.update({
    where: {
      id: normalizedBusinessId,
    },
    data: {
      onboardingDemoLeadId: lead.id,
      onboardingStep: 2,
    },
  });

  await enqueueAIBatch(
    [
      {
        businessId: normalizedBusinessId,
        leadId: lead.id,
        message: ONBOARDING_DEMO_MESSAGE,
        kind: "router",
        plan: subscription?.plan || null,
        skipInboundPersist: true,
        metadata: {
          onboardingDemo: true,
          internalSimulation: true,
          source: "ONBOARDING_DEMO",
          clientPlatform: client.platform,
        },
      },
    ],
    {
      source: "router",
      idempotencyKey: `onboarding-demo:${normalizedBusinessId}`,
    }
  );

  logger.info(
    {
      businessId: normalizedBusinessId,
      leadId: lead.id,
      platform: client.platform,
    },
    "Onboarding demo queued"
  );

  return lead;
};

export const getOnboardingSnapshot = async (businessId: string) => {
  const normalizedBusinessId = normalizeBusinessId(businessId);

  if (!normalizedBusinessId) {
    throw new Error("Invalid business id");
  }

  const [business, connectedClients, usageOverview] = await Promise.all([
    prisma.business.findUnique({
      where: {
        id: normalizedBusinessId,
      },
      select: {
        id: true,
        onboardingCompleted: true,
        onboardingStep: true,
        demoCompleted: true,
        onboardingDemoLeadId: true,
      },
    }),
    getActiveMessagingClients(normalizedBusinessId),
    getUsageOverview(normalizedBusinessId),
  ]);

  if (!business) {
    throw new Error("Business not found");
  }

  const [demoPreview, realReplyPreview] = await Promise.all([
    getLeadPreview(business.onboardingDemoLeadId),
    getFirstRealReplyPreview(
      normalizedBusinessId,
      business.onboardingDemoLeadId
    ),
  ]);

  const connected = connectedClients.length > 0;
  const demoCompleted = business.demoCompleted || Boolean(demoPreview.aiMessage);
  const onboardingCompleted =
    business.onboardingCompleted || Boolean(realReplyPreview.aiMessage);
  const onboardingStep = resolveOnboardingStep({
    connected,
    demoCompleted,
    onboardingCompleted,
  });

  await updateOnboardingStateIfNeeded({
    businessId: normalizedBusinessId,
    onboardingCompleted,
    onboardingStep,
    demoCompleted,
  });

  const aiLimit = usageOverview.ai.limit;
  const aiUsedToday = usageOverview.ai.usedToday;
  const aiUsagePercent =
    aiLimit > 0 ? Math.min(aiUsedToday / aiLimit, 1) : 0;
  const nearTrialEnd = usageOverview.trialActive && usageOverview.daysLeft <= 2;
  const upgradeReasons = [
    usageOverview.warning ? "usage_80" : null,
    nearTrialEnd ? "trial_ending" : null,
    realReplyPreview.aiMessage ? "results" : null,
  ].filter(Boolean) as string[];

  return {
    onboardingCompleted,
    onboardingStep,
    demoCompleted,
    connectedPlatforms: connectedClients.map((client) => ({
      id: client.id,
      platform: client.platform,
    })),
    primaryPlatform: connectedClients[0]?.platform || null,
    checklist: {
      connectedAccount: connected,
      demoReplyReady: Boolean(demoPreview.aiMessage),
      sendTestPromptReady: demoCompleted && !onboardingCompleted,
      realReplyReady: Boolean(realReplyPreview.aiMessage),
    },
    demo: {
      label: "\uD83E\uDD16 This is how AI replies automatically",
      prompt: ONBOARDING_DEMO_MESSAGE,
      ...demoPreview,
    },
    realReply: realReplyPreview,
    trial: {
      active: usageOverview.trialActive,
      totalDays: TRIAL_DAYS,
      daysLeft: usageOverview.daysLeft,
      nearEnd: nearTrialEnd,
    },
    usage: {
      aiUsedToday,
      aiLimit,
      aiRemaining: usageOverview.ai.remaining,
      aiUsagePercent,
      warning: usageOverview.warning,
      warningMessage: usageOverview.warningMessage,
    },
    upgrade: {
      show: upgradeReasons.length > 0,
      reasons: upgradeReasons,
      headline: "You're getting great results \uD83D\uDE80",
      message: "Upgrade to keep automation running",
      ctaHref: "/billing",
    },
  };
};
