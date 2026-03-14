import OpenAI from "openai";
import prisma from "../config/prisma";
import { generateAIFunnelReply } from "./aiFunnel.service";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

interface IntentInput {
  businessId: string;
  leadId: string;
  message: string;
}

/* ---------------------------------------------------
GET CLIENT CONTEXT
--------------------------------------------------- */

const getBusinessContext = async (businessId: string) => {

  const client = await prisma.client.findFirst({
    where: {
      businessId,
      isActive: true,
    },
  });

  if (!client) return null;

  return {
    businessInfo: client.businessInfo || "",
    pricingInfo: client.pricingInfo || "",
    aiTone: client.aiTone || "Professional",
  };

};

/* ---------------------------------------------------
LLM INTENT DETECTION
--------------------------------------------------- */

const detectIntentWithAI = async (message: string) => {

  const prompt = `
Classify the user's intent.

Possible intents:
GREETING
PRICING
PRODUCT_INFO
BOOKING
NEGOTIATION
BUYING
SUPPORT
GENERAL

User message:
"${message}"

Return ONLY the intent label.
`;

  const response = await openai.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "You are an intent classification AI.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const intent =
    response.choices?.[0]?.message?.content?.trim() || "GENERAL";

  return intent;

};

/* ---------------------------------------------------
SENTIMENT DETECTION
--------------------------------------------------- */

const detectSentiment = async (message: string) => {

  const prompt = `
Analyze the sentiment of this message.

Possible outputs:
POSITIVE
NEUTRAL
NEGATIVE

Message:
"${message}"

Return only the sentiment label.
`;

  const response = await openai.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "You are a sentiment analysis AI.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return response.choices?.[0]?.message?.content?.trim() || "NEUTRAL";

};

/* ---------------------------------------------------
LEAD SCORE
--------------------------------------------------- */

const updateLeadScore = async (leadId: string, intent: string) => {

  let score = 0;

  if (intent === "PRICING") score = 3;
  if (intent === "BOOKING") score = 5;
  if (intent === "NEGOTIATION") score = 4;
  if (intent === "BUYING") score = 10;

  if (score === 0) return;

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      leadScore: { increment: score },
    },
  });

};

/* ---------------------------------------------------
STAGE UPDATE
--------------------------------------------------- */

const updateStage = async (leadId: string, intent: string) => {

  let stage = "NEW";

  if (intent === "PRICING") stage = "INTERESTED";
  if (intent === "BOOKING") stage = "QUALIFIED";
  if (intent === "BUYING") stage = "READY_TO_BUY";

  await prisma.lead.update({
    where: { id: leadId },
    data: { stage },
  });

};

/* ---------------------------------------------------
INTENT STRATEGY
--------------------------------------------------- */

const intentStrategy = (intent: string, sentiment: string) => {

  if (intent === "GREETING")
    return "Greet the user and ask what service they are interested in.";

  if (intent === "PRICING")
    return "Explain pricing packages clearly and ask what service they want.";

  if (intent === "PRODUCT_INFO")
    return "Explain available services and recommend the best option.";

  if (intent === "BOOKING")
    return "Encourage booking a call or demo immediately.";

  if (intent === "NEGOTIATION")
    return "Handle negotiation professionally and emphasize value.";

  if (intent === "BUYING")
    return "The user wants to purchase. Send the payment link and help them complete the purchase.";

  if (sentiment === "NEGATIVE")
    return "Respond calmly and resolve concerns.";

  return "Answer helpfully and guide the conversation toward conversion.";

};

/* ---------------------------------------------------
GET STRIPE PAYMENT LINK
--------------------------------------------------- */

const getPaymentLink = async (businessId: string) => {

  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  });

  if (!subscription?.plan?.priceId) return null;

  return `https://buy.stripe.com/${subscription.plan.priceId}`;

};

/* ---------------------------------------------------
MAIN INTENT ENGINE
--------------------------------------------------- */

export const generateIntentReply = async ({
  businessId,
  leadId,
  message,
}: IntentInput) => {

  try {

    const context = await getBusinessContext(businessId);

    if (!context) {
      return "Thanks for your message!";
    }

    /* DETECT INTENT */

    const intent = await detectIntentWithAI(message);

    /* SENTIMENT */

    const sentiment = await detectSentiment(message);

    console.log("Intent:", intent);
    console.log("Sentiment:", sentiment);

    /* UPDATE CRM */

    await updateLeadScore(leadId, intent);
    await updateStage(leadId, intent);

    /* BUYING FLOW */

    if (intent === "BUYING") {

      const paymentLink = await getPaymentLink(businessId);

      if (paymentLink) {

        return `Awesome! You can complete your purchase here:

${paymentLink}

Let me know once you've completed the payment and we'll get started immediately.`;

      }

    }

    /* STRATEGY */

    const strategy = intentStrategy(intent, sentiment);

    const enhancedMessage = `

User message:
${message}

Intent:
${intent}

Sentiment:
${sentiment}

Response strategy:
${strategy}
`;

    const reply = await generateAIFunnelReply({
      businessId,
      leadId,
      message: enhancedMessage,
    });

    return reply;

  } catch (error) {

    console.error("Intent Engine Error:", error);

    return "Thanks for reaching out! How can we help you today?";

  }

};