type HelpKnowledgeEntry = {
  key: string;
  aliases: string[];
  answer: string;
};

export const HELP_AI_FALLBACK_REPLY =
  "I'm not sure about that. Please contact our support team.";

const HELP_AI_KNOWLEDGE_BASE: HelpKnowledgeEntry[] = [
  {
    key: "ai credits",
    aliases: [
      "ai credits",
      "credits",
      "credit balance",
      "credit usage",
      "extra credits",
      "ai allowance",
    ],
    answer:
      "AI credits are used when the system generates intelligent replies. Template replies do not use credits.",
  },
  {
    key: "automation",
    aliases: [
      "automation",
      "automations",
      "comment automation",
      "auto reply",
      "auto replies",
    ],
    answer:
      "Automation allows you to automatically reply to comments and messages using AI or templates.",
  },
  {
    key: "billing",
    aliases: [
      "billing",
      "pricing",
      "subscription",
      "invoice",
      "payment",
      "upgrade plan",
      "trial",
    ],
    answer:
      "You can upgrade your plan from the billing section. Extra AI credits can also be purchased.",
  },
  {
    key: "connect instagram",
    aliases: [
      "connect instagram",
      "instagram setup",
      "instagram integration",
      "connect meta",
      "instagram connection",
    ],
    answer:
      "You can connect Instagram from the integrations section in your dashboard.",
  },
  {
    key: "whatsapp setup",
    aliases: [
      "whatsapp setup",
      "connect whatsapp",
      "whatsapp integration",
      "whatsapp connection",
      "meta integration",
    ],
    answer:
      "WhatsApp can be connected via Meta integration in your dashboard.",
  },
  {
    key: "support",
    aliases: ["support", "contact support", "help team"],
    answer:
      "Please contact our support team at support@automexiaai.in for anything that needs direct assistance.",
  },
];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value: string) =>
  normalizeText(value)
    .split(" ")
    .filter(Boolean);

const scoreAlias = (
  normalizedMessage: string,
  messageTokens: Set<string>,
  alias: string
) => {
  const normalizedAlias = normalizeText(alias);

  if (!normalizedAlias) {
    return 0;
  }

  if (normalizedMessage === normalizedAlias) {
    return 1000 + normalizedAlias.length;
  }

  if (normalizedMessage.includes(normalizedAlias)) {
    return 800 + normalizedAlias.length;
  }

  const aliasTokens = tokenize(normalizedAlias);
  const overlap = aliasTokens.filter((token) => messageTokens.has(token)).length;

  if (!overlap) {
    return 0;
  }

  if (overlap === aliasTokens.length && aliasTokens.length > 1) {
    return 600 + overlap;
  }

  if (overlap >= Math.min(2, aliasTokens.length)) {
    return 400 + overlap;
  }

  if (aliasTokens.length === 1 && overlap === 1 && normalizedAlias.length >= 7) {
    return 200;
  }

  return 0;
};

export const getHelpAiReply = (message: string) => {
  const normalizedMessage = normalizeText(message);

  if (!normalizedMessage) {
    return HELP_AI_FALLBACK_REPLY;
  }

  const messageTokens = new Set(tokenize(normalizedMessage));
  let bestMatch:
    | {
        answer: string;
        score: number;
      }
    | undefined;

  for (const entry of HELP_AI_KNOWLEDGE_BASE) {
    const aliases = [entry.key, ...entry.aliases];

    for (const alias of aliases) {
      const score = scoreAlias(normalizedMessage, messageTokens, alias);

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          answer: entry.answer,
          score,
        };
      }
    }
  }

  if (!bestMatch || bestMatch.score < 200) {
    return HELP_AI_FALLBACK_REPLY;
  }

  return bestMatch.answer;
};
