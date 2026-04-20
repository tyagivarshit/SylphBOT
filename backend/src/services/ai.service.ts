import { generateUnifiedAIReplyText } from "./aiRuntime.service";

interface AIInput {
  businessId: string;
  leadId: string;
  message: string;
  plan?: unknown;
  source?: string | null;
  preview?: boolean;
}

export const generateAIReply = async ({
  businessId,
  leadId,
  message,
  plan,
  source,
  preview,
}: AIInput): Promise<string | null> => {
  return generateUnifiedAIReplyText({
    businessId,
    leadId,
    message,
    plan,
    source: source || "LEGACY_AI_SERVICE",
    preview,
  });
};
