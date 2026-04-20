import { generateUnifiedAIReplyText } from "./aiRuntime.service";

interface FunnelInput {
  businessId: string;
  leadId: string;
  message: string;
  plan?: unknown;
}

export const generateAIFunnelReply = async ({
  businessId,
  leadId,
  message,
  plan,
}: FunnelInput) => {
  return generateUnifiedAIReplyText({
    businessId,
    leadId,
    message,
    plan,
    source: "LEGACY_FUNNEL",
  });
};
