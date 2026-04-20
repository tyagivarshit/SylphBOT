import { analyzeUnifiedSalesIntent } from "./aiRuntime.service";

export type IntentResponse = {
  intent: string;
  confidence: number;
};

interface IntentInput {
  businessId: string;
  leadId: string;
  message: string;
  plan?: unknown;
}

export const generateIntentReply = async ({
  businessId,
  leadId,
  message,
  plan,
}: IntentInput): Promise<IntentResponse> => {
  try {
    const analysis = await analyzeUnifiedSalesIntent({
      businessId,
      leadId,
      message,
      plan,
      source: "LEGACY_INTENT_ENGINE",
    });

    return {
      intent: analysis.intent,
      confidence: analysis.confidence,
    };
  } catch (error) {
    console.error("Intent Engine Error:", error);

    return {
      intent: "GENERAL",
      confidence: 0.5,
    };
  }
};
