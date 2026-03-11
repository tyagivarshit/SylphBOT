import OpenAI from "openai";
import prisma from "../config/prisma";
import { getCurrentMonthYear } from "../utils/monthlyUsage.helper";

/* FUNNEL */
import { generateAIFunnelReply } from "./aiFunnel.service";

/* MEMORY ENGINE */
import {
buildMemoryContext,
updateMemory
} from "./aiMemoryEngine.service";

const openai = new OpenAI({
apiKey: process.env.GROQ_API_KEY,
baseURL: "https://api.groq.com/openai/v1",
});

interface AIInput {
businessId: string;
leadId: string;
message: string;
}

/* ---------------- USAGE + PLAN CHECK ---------------- */

const checkAndIncrementUsage = async (businessId: string) => {

const { month, year } = getCurrentMonthYear();

const subscription = await prisma.subscription.findUnique({
where: { businessId },
include: { plan: true },
});

if (!subscription || subscription.status !== "ACTIVE") {
return { blocked: true, reason: "INACTIVE_SUBSCRIPTION" };
}

if (
subscription.plan.name === "FREE_TRIAL" &&
subscription.currentPeriodEnd &&
new Date() > subscription.currentPeriodEnd
) {
return { blocked: true, reason: "TRIAL_EXPIRED" };
}

let usage = await prisma.usage.findUnique({
where: {
businessId_month_year: {
businessId,
month,
year,
},
},
});

if (!usage) {
usage = await prisma.usage.create({
data: {
businessId,
month,
year,
aiCallsUsed: 0,
messagesUsed: 0,
followupsUsed: 0,
},
});
}

if (usage.aiCallsUsed >= subscription.plan.maxAiCalls) {
return { blocked: true, reason: "PLAN_LIMIT" };
}

await prisma.usage.update({
where: {
businessId_month_year: {
businessId,
month,
year,
},
},
data: {
aiCallsUsed: { increment: 1 },
messagesUsed: { increment: 1 },
},
});

return { blocked: false, plan: subscription.plan.name };
};

/* ---------------- RECENT CHAT MEMORY ---------------- */

const getRecentMessages = async (leadId: string) => {

const messages = await prisma.message.findMany({
where: { leadId },
orderBy: { createdAt: "desc" },
take: 6,
});

return messages
.reverse()
.map((m) => ({
role: m.sender === "AI" ? "assistant" : "user",
content: m.content,
}));

};

/* ---------------- LEAD DATA EXTRACTION ---------------- */

const extractLeadData = async (leadId: string, message: string) => {

const emailMatch = message.match(
/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+.[A-Z]{2,}\b/i
);

const phoneMatch = message.match(/\b\d{10,15}\b/);

await prisma.lead.update({
where: { id: leadId },
data: {
email: emailMatch?.[0] || undefined,
phone: phoneMatch?.[0] || undefined,
},
});

};

/* ---------------- STAGE SYSTEM ---------------- */

const determineStage = (message: string) => {

if (/price|cost|pricing/i.test(message)) return "INTERESTED";

if (/buy|purchase|order/i.test(message)) return "READY_TO_BUY";

return "NEW";

};

const updateStage = async (leadId: string, message: string) => {

const stage = determineStage(message);

await prisma.lead.update({
where: { id: leadId },
data: { stage },
});

};

/* ---------------- MAIN AI FUNCTION ---------------- */

export const generateAIReply = async ({
businessId,
leadId,
message,
}: AIInput) => {

console.log("AI SERVICE START", { businessId, leadId, message });

try {

/* SAVE USER MESSAGE */

await prisma.message.create({
  data: {
    leadId,
    content: message,
    sender: "USER",
  },
});

/* PLAN CHECK */

const usageCheck = await checkAndIncrementUsage(businessId);

if (usageCheck.blocked) {

  if (usageCheck.reason === "TRIAL_EXPIRED") {
    return "Your 7-day trial has expired. Please upgrade to continue using our AI services.";
  }

  if (usageCheck.reason === "PLAN_LIMIT") {
    return "You have reached your monthly AI usage limit. Please upgrade your plan.";
  }

  if (usageCheck.reason === "INACTIVE_SUBSCRIPTION") {
    return "Your subscription is inactive. Please upgrade your plan.";
  }

}

const planName = usageCheck.plan || "FREE_TRIAL";

/* PRO / ENTERPRISE → FUNNEL AI */

if (planName === "PRO" || planName === "ENTERPRISE") {

  return generateAIFunnelReply({
    businessId,
    leadId,
    message,
  });

}

/* BASIC PLAN AI */

const client = await prisma.client.findFirst({
  where: {
    businessId,
    isActive: true,
  },
});

if (!client) {
  return "No active client found.";
}

/* MEMORY SYSTEM */

const memoryContext = await buildMemoryContext(leadId);

const recentMessages = await getRecentMessages(leadId);

/* SYSTEM PROMPT */

const systemPrompt = `

You are a helpful AI assistant for a business.

Business Information:
${client.businessInfo || "Not provided"}

Pricing Information:
${client.pricingInfo || "Ask admin for pricing"}

Communication Style:
${client.aiTone || "Professional"}

Customer Memory:
${memoryContext.memory}

Rules:

* Use only the provided business information
* Do not invent pricing
* Be concise and helpful
  `;

  const prompt = [
  { role: "system", content: systemPrompt },
  ...recentMessages,
  { role: "user", content: message },
  ];

  const response = await openai.chat.completions.create({
  model: "llama-3.1-8b-instant",
  messages: prompt as any,
  });

  const reply =
  response.choices?.[0]?.message?.content?.trim() ||
  "Thanks for reaching out!";

  /* SAVE AI MESSAGE */

  await prisma.message.create({
  data: {
  leadId,
  content: reply,
  sender: "AI",
  },
  });

  /* MEMORY UPDATE */

  await updateMemory(leadId, message);

  /* CRM UPDATE */

  await extractLeadData(leadId, message);

  await updateStage(leadId, message);

  return reply;

  } catch (error: any) {

  console.error("AI SERVICE ERROR:", error);

  return "Thanks for your message. Our team will respond shortly.";

  }

};
