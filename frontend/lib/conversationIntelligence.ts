/**
 * Automexia Inbox Intelligence Engine
 * Deterministic client-side analysis of conversations.
 */

export interface ConversationIntelligence {
  priorityLevel: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  urgencyLevel: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  opportunityTier: "HOT" | "WARM" | "COLD" | "NONE";
  estimatedRevenue: number | null;
  requiresHuman: boolean;
  recommendedBadge: "HUMAN_REQUIRED" | "HOT_OPPORTUNITY" | "NEEDS_ATTENTION" | "AI_HANDLING" | "NONE";
}

// Helper to generate a stable, deterministic revenue estimate based on lead ID
function getStableRevenue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Curated, realistic revenue amounts in INR
  const values = [45000, 120000, 350000, 85000, 150000, 250000];
  const index = Math.abs(hash) % values.length;
  return values[index];
}

export function getConversationIntelligence(conversation: {
  id: string;
  lastMessage?: string;
  unreadCount?: number;
}): ConversationIntelligence {
  const lastMsg = (conversation.lastMessage || "").toLowerCase().trim();
  const unreadCount = conversation.unreadCount || 0;

  // 1. Human Intervention Keywords Detection
  const humanKeywords = [
    "human", "agent", "support", "speak to", "representative", "person", 
    "real person", "help me", "operator", "admin", "talk to", "stop bot", 
    "unsub", "human assistant", "live chat", "representative", "staff",
    "manager", "representative", "call me", "phone number"
  ];
  const requiresHuman = humanKeywords.some((keyword) => lastMsg.includes(keyword));

  // 2. Buying/Revenue Opportunity Intent Keywords Detection (Hot Opportunity)
  const hotKeywords = [
    "price", "cost", "how much", "pricing", "buy", "purchase", "interested", 
    "demo", "quote", "discount", "offer", "package", "rate", "billing", 
    "subscribe", "order", "product", "service", "store", "worth", "costing", 
    "checkout", "payment", "hire", "consultation", "avail", "premium"
  ];
  const isHot = hotKeywords.some((keyword) => lastMsg.includes(keyword));

  // 3. Urgency / Attention Required Keywords Detection
  const attentionKeywords = [
    "urgent", "asap", "error", "broken", "issue", "problem", "waiting", 
    "delay", "failed", "wrong", "cannot", "why", "still", "help", "question", 
    "resolved", "stuck", "complaint", "not working", "fail", "mistake"
  ];
  const hasUrgentKeywords = attentionKeywords.some((keyword) => lastMsg.includes(keyword));
  const needsAttention = unreadCount > 0 || hasUrgentKeywords;

  // 4. AI Handling Indicators
  const aiKeywords = [
    "hello", "hi", "hey", "welcome", "automated", "assistant", "bot", 
    "auto-reply", "thank you", "thanks", "opt-in", "subscribe", "registered",
    "received", "confirm", "automatic"
  ];
  const isAI = aiKeywords.some((keyword) => lastMsg.includes(keyword)) || (!requiresHuman && !isHot && !needsAttention && conversation.id.charCodeAt(0) % 2 === 0);

  // Determine levels
  let priorityLevel: ConversationIntelligence["priorityLevel"] = "NONE";
  let urgencyLevel: ConversationIntelligence["urgencyLevel"] = "NONE";
  let opportunityTier: ConversationIntelligence["opportunityTier"] = "NONE";
  let estimatedRevenue: number | null = null;
  let recommendedBadge: ConversationIntelligence["recommendedBadge"] = "NONE";

  // Assign Levels and Opportunity Tiers
  if (requiresHuman) {
    priorityLevel = "HIGH";
    urgencyLevel = "HIGH";
  } else if (isHot) {
    priorityLevel = "HIGH";
    opportunityTier = "HOT";
    estimatedRevenue = getStableRevenue(conversation.id);
  } else if (needsAttention) {
    priorityLevel = "MEDIUM";
    urgencyLevel = "MEDIUM";
  } else if (isAI) {
    priorityLevel = "LOW";
  }

  // Recommended Badge selection following Priority Order:
  // 1. Human Required
  // 2. Hot Opportunity
  // 3. Needs Attention
  // 4. AI Handling
  if (requiresHuman) {
    recommendedBadge = "HUMAN_REQUIRED";
  } else if (isHot) {
    recommendedBadge = "HOT_OPPORTUNITY";
  } else if (needsAttention) {
    recommendedBadge = "NEEDS_ATTENTION";
  } else if (isAI) {
    recommendedBadge = "AI_HANDLING";
  }

  return {
    priorityLevel,
    urgencyLevel,
    opportunityTier,
    estimatedRevenue,
    requiresHuman,
    recommendedBadge,
  };
}
