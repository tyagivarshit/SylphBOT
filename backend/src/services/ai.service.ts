import { generateUnifiedAIReplyText } from "./aiRuntime.service";
import { enforceSecurityGovernanceInfluence } from "./security/securityGovernanceOS.service";

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
  await enforceSecurityGovernanceInfluence({
    domain: "AI",
    action: "messages:enqueue",
    businessId,
    tenantId: businessId,
    actorId: "ai_runtime",
    actorType: "SERVICE",
    role: "SERVICE",
    permissions: ["messages:enqueue"],
    scopes: ["WRITE"],
    resourceType: "AI_REPLY",
    resourceId: leadId,
    resourceTenantId: businessId,
    purpose: "GENERATE_REPLY",
    metadata: {
      preview: Boolean(preview),
      source: source || "LEGACY_AI_SERVICE",
    },
  });

  return generateUnifiedAIReplyText({
    businessId,
    leadId,
    message,
    plan,
    source: source || "LEGACY_AI_SERVICE",
    preview,
  });
};
