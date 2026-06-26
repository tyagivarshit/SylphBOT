import prisma from "../config/prisma";
import { container } from "../runtime/core";
import { ActorProfile } from "../runtime/interfaces/identity";
import { IModelManager } from "../runtime/interfaces/core";

/**
 * Latency helper.
 */
const recordLatency = (
  metricName: "conversation_latency" | "reply_latency" | "context_build_latency" | "summary_latency" | "memory_retrieval_latency" | "prompt_compilation_latency" | "model_latency",
  startTime: number
) => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordConversationMetric(metricName, Date.now() - startTime);
  }
};

/**
 * Failure helper.
 */
const recordFailure = () => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordConversationMetric("conversation_failure", 1);
  }
};

/**
 * Throughput helper.
 */
const recordMessageThroughput = (count = 1) => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordConversationMetric("message_throughput", count);
  }
};

/**
 * Permission checks.
 */
export function enforceTenantIsolation(tenantId: string, actor?: ActorProfile) {
  if (actor) {
    if (actor.tenantId !== tenantId) {
      recordFailure();
      throw new Error(`Cross-tenant conversation operation blocked. Actor tenant [${actor.tenantId}] does not match resource tenant [${tenantId}].`);
    }
  }
}

/**
 * Retrieves the message history using Memory Engine.
 */
export async function retrieveConversation(
  tenantId: string,
  leadId: string,
  actor?: ActorProfile
): Promise<any[]> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);
  try {
    const memoryEngine = container.resolve<any>("IMemoryEngine");
    const messages = await memoryEngine.getRecentMessages(leadId, 50);
    recordLatency("memory_retrieval_latency", start);
    return messages;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Appends a message to the memory timeline and DB, firing events.
 */
export async function appendMessage(
  tenantId: string,
  leadId: string,
  messageData: any,
  actor?: ActorProfile
): Promise<any> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);
  try {
    const memoryEngine = container.resolve<any>("IMemoryEngine");
    const appended = await memoryEngine.appendMessage(leadId, {
      sender: messageData.sender,
      content: messageData.content
    });

    await prisma.message.create({
      data: {
        leadId,
        businessId: tenantId,
        sender: messageData.sender,
        content: messageData.content
      }
    });

    recordMessageThroughput(1);

    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish(messageData.sender === "USER" ? "message.received" : "message.sent", "1.0.0", {
      leadId,
      businessId: tenantId,
      sender: messageData.sender,
      content: messageData.content
    }, { tenantId });

    recordLatency("conversation_latency", start);
    return appended;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Searches messages.
 */
export async function searchMessages(
  tenantId: string,
  leadId: string,
  query: string,
  actor?: ActorProfile
): Promise<any[]> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);
  try {
    const messages = await prisma.message.findMany({
      where: {
        leadId,
        businessId: tenantId,
        content: { contains: query }
      }
    });
    recordLatency("memory_retrieval_latency", start);
    return messages;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Summarizes the conversation.
 */
export async function summarizeConversation(
  tenantId: string,
  leadId: string,
  actor?: ActorProfile
): Promise<string> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);
  try {
    const messages = await prisma.message.findMany({
      where: { leadId },
      orderBy: { createdAt: "asc" },
      take: 30
    });
    const conversationText = messages.map(m => `${m.sender}: ${m.content}`).join("\n");

    const promptStart = Date.now();
    const compiler = container.resolve<any>("IPromptCompiler");
    const compiled = compiler.compile(tenantId, "conversation_summary", "1.0.0", {}, { conversationText });
    recordLatency("prompt_compilation_latency", promptStart);

    const modelStart = Date.now();
    const modelManager = container.resolve<IModelManager>("IModelManager");
    const response = await modelManager.generateCompletion([
      { role: "system", content: compiled.system },
      { role: "user", content: compiled.user }
    ], { model: "llama3-70b-8192", temperature: 0.2 });
    recordLatency("model_latency", modelStart);

    const summary = response.content?.trim() || "";

    const existing = await prisma.conversationSummary.findFirst({ where: { leadId } });
    if (existing) {
      await prisma.conversationSummary.update({ where: { id: existing.id }, data: { summary, updatedAt: new Date() } });
    } else {
      await prisma.conversationSummary.create({ data: { leadId, summary } });
    }

    const memoryEngine = container.resolve<any>("IMemoryEngine");
    await memoryEngine.writeMemory(tenantId, "customer", `summary:${leadId}`, summary);

    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("conversation.summary.updated", "1.0.0", {
      leadId,
      businessId: tenantId,
      summary
    }, { tenantId });

    recordLatency("summary_latency", start);
    return summary;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Updates summary in memory and database.
 */
export async function updateSummary(
  tenantId: string,
  leadId: string,
  summary: string,
  actor?: ActorProfile
): Promise<void> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);
  try {
    const existing = await prisma.conversationSummary.findFirst({ where: { leadId } });
    if (existing) {
      await prisma.conversationSummary.update({ where: { id: existing.id }, data: { summary, updatedAt: new Date() } });
    } else {
      await prisma.conversationSummary.create({ data: { leadId, summary } });
    }

    const memoryEngine = container.resolve<any>("IMemoryEngine");
    await memoryEngine.writeMemory(tenantId, "customer", `summary:${leadId}`, summary);

    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("conversation.summary.updated", "1.0.0", {
      leadId,
      businessId: tenantId,
      summary
    }, { tenantId });

    recordLatency("summary_latency", start);
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Attaches metadata context.
 */
export async function attachContext(
  tenantId: string,
  leadId: string,
  contextKey: string,
  contextVal: string,
  actor?: ActorProfile
): Promise<void> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);
  try {
    const memoryEngine = container.resolve<any>("IMemoryEngine");
    await memoryEngine.writeMemory(tenantId, "customer", `context:${leadId}:${contextKey}`, contextVal);

    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("context.updated", "1.0.0", {
      leadId,
      businessId: tenantId,
      contextKey,
      contextVal
    }, { tenantId });

    recordLatency("context_build_latency", start);
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Retrieves metadata context.
 */
export async function retrieveContext(
  tenantId: string,
  leadId: string,
  contextKey: string,
  actor?: ActorProfile
): Promise<string | null> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);
  try {
    const memoryEngine = container.resolve<any>("IMemoryEngine");
    const record = await memoryEngine.readMemory(tenantId, "customer", `context:${leadId}:${contextKey}`);
    recordLatency("memory_retrieval_latency", start);
    return record ? record.value : null;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Standard prompt compilation and reply generation.
 * Follows pipeline: Conversation -> Prompt Compiler -> Constitution Injection -> Policy Injection -> Context Injection -> Validation -> Model Manager.
 */
export async function generateReply(
  tenantId: string,
  leadId: string,
  userMessage: string,
  actor?: ActorProfile
): Promise<string> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);
  try {
    const memoryEngine = container.resolve<any>("IMemoryEngine");
    const recentMessages = await memoryEngine.getRecentMessages(leadId, 10);
    const historyText = recentMessages.map((m: any) => `${m.sender}: ${m.content}`).join("\n");

    // 1. Context Assembling (Context Router Injection)
    const budgetManager = container.resolve<any>("IContextBudgetManager");
    const contextEngine = container.resolve<any>("IContextIntelligenceEngine");
    const budget = budgetManager.getBudget();
    const contextItems = await contextEngine.assembleContext(tenantId, {
      query: userMessage,
      history: recentMessages,
    }, budget);

    // 2. Prompt Compilation & Constitution / Policy Injection
    const compiler = container.resolve<any>("IPromptCompiler");
    const promptStart = Date.now();
    const compiled = compiler.compile(tenantId, "reply_generation", "1.0.0", {
      input: userMessage,
      memories: historyText,
      knowledge: contextItems.map((item: any) => item.content).join("\n")
    }, {});
    recordLatency("prompt_compilation_latency", promptStart);

    // 3. Validation
    const validationEngine = container.resolve<any>("IValidationEngine");
    const validated = validationEngine.validateSafety({ prompt: compiled.system + "\n" + compiled.user });
    if (!validated.isSafe) {
      throw new Error(`Safety violation: ${validated.blockReason}`);
    }

    // 4. Model Manager Inference
    const modelStart = Date.now();
    const modelManager = container.resolve<IModelManager>("IModelManager");
    const response = await modelManager.generateCompletion([
      { role: "system", content: compiled.system },
      { role: "user", content: compiled.user }
    ], { model: "llama3-70b-8192", temperature: 0.7 });
    recordLatency("model_latency", modelStart);

    const reply = response.content || "";

    // Record interaction in Memory and Database
    await memoryEngine.appendMessage(leadId, {
      sender: "AI",
      content: reply
    });

    await prisma.message.create({
      data: {
        leadId,
        businessId: tenantId,
        sender: "AI",
        content: reply
      }
    });

    recordMessageThroughput(1);

    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("message.sent", "1.0.0", {
      leadId,
      businessId: tenantId,
      sender: "AI",
      content: reply
    }, { tenantId });

    recordLatency("reply_latency", start);
    return reply;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Handsoff conversation to agent.
 */
export async function handoffConversation(
  tenantId: string,
  leadId: string,
  targetAgentId: string,
  actor?: ActorProfile
): Promise<void> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);
  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: { isHumanActive: true, assignedAgentId: targetAgentId }
    });

    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("conversation.handoff", "1.0.0", {
      leadId,
      businessId: tenantId,
      targetAgentId
    }, { tenantId });

    const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
    if (metrics) {
      metrics.recordConversationMetric("escalation", 1);
    }

    recordLatency("conversation_latency", start);
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Closes the conversation.
 */
export async function closeConversation(
  tenantId: string,
  leadId: string,
  actor?: ActorProfile
): Promise<void> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);
  try {
    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("conversation.closed", "1.0.0", {
      leadId,
      businessId: tenantId
    }, { tenantId });

    recordLatency("conversation_latency", start);
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Stage 2.3 — Phase 10: Business Intelligence Graph links.
 */
export async function linkConversationKnowledge(tenantId: string, conversationId: string, knowledgeId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `conversation:${conversationId}`,
    targetId: `knowledge:${knowledgeId}`,
    predicate: "CONVERSATION_KNOWLEDGE"
  });
}

export async function linkConversationCrm(tenantId: string, conversationId: string, leadId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `conversation:${conversationId}`,
    targetId: `customer:${leadId}`,
    predicate: "CONVERSATION_CRM"
  });
}

export async function linkConversationCampaign(tenantId: string, conversationId: string, campaignId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `conversation:${conversationId}`,
    targetId: `campaign:${campaignId}`,
    predicate: "CONVERSATION_CAMPAIGN"
  });
}

export async function linkConversationBooking(tenantId: string, conversationId: string, bookingId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `conversation:${conversationId}`,
    targetId: `booking:${bookingId}`,
    predicate: "CONVERSATION_BOOKING"
  });
}

export async function linkConversationPayment(tenantId: string, conversationId: string, paymentId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `conversation:${conversationId}`,
    targetId: `payment:${paymentId}`,
    predicate: "CONVERSATION_PAYMENT"
  });
}

export async function linkConversationSupportCase(tenantId: string, conversationId: string, caseId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `conversation:${conversationId}`,
    targetId: `case:${caseId}`,
    predicate: "CONVERSATION_SUPPORT_CASE"
  });
}

export async function linkConversationAIDecision(tenantId: string, conversationId: string, decisionId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `conversation:${conversationId}`,
    targetId: `decision:${decisionId}`,
    predicate: "CONVERSATION_AI_DECISION"
  });
}

export async function linkConversationTimeline(tenantId: string, conversationId: string, timelineId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `conversation:${conversationId}`,
    targetId: `timeline:${timelineId}`,
    predicate: "CONVERSATION_TIMELINE"
  });
}

/**
 * Future AI Connector Interfaces (Phase 11).
 */
export interface IFutureAIConnector {
  tenantId: string;
  actorProfile: ActorProfile;
  getCustomerIntelligenceContext(leadId: string): Promise<any>;
  dispatchCrmAction(toolName: string, args: any): Promise<any>;
}

export interface ISalesAIConnector extends IFutureAIConnector {
  getLeadScorecard(leadId: string): Promise<any>;
  wonDeal(dealId: string): Promise<void>;
}

export interface ICustomerSuccessAIConnector extends IFutureAIConnector {
  getRelationshipHealth(leadId: string): Promise<any>;
  escalateToHuman(leadId: string, reason: string): Promise<void>;
}

export interface IMarketingAIConnector extends IFutureAIConnector {
  getCustomerSegments(leadId: string): Promise<string[]>;
}

export interface IOperationsAIConnector extends IFutureAIConnector {
  getInteractionTimeline(leadId: string): Promise<any[]>;
}

export interface IFinanceAIConnector extends IFutureAIConnector {
  getCustomerPurchaseHistory(leadId: string): Promise<any[]>;
}

export interface ICEOAIConnector extends IFutureAIConnector {
  getEnterpriseAggregates(): Promise<any>;
}

/**
 * Validates Conversation layer adoption percentages (Phase 12).
 */
export async function validateConversationRuntimeAdoption() {
  const hasIdentity = container.has("IIdentityEngineInstance");
  const hasMemory = container.has("IMemoryEngine");
  const hasContextRouter = container.has("IContextIntelligenceEngine");
  const hasPromptCompiler = container.has("IPromptCompiler");
  const hasModelManager = container.has("IModelManager");
  const hasEventBus = container.has("IEventBus");
  const hasToolRegistry = container.has("IToolRegistry");
  const hasPermission = container.has("IPermissionEngine");
  const hasObservability = container.has("IMetricsEngine");

  const identityAdoption = hasIdentity ? 100 : 0;
  const memoryAdoption = hasMemory ? 100 : 0;
  const routerAdoption = hasContextRouter ? 100 : 0;
  const compilerAdoption = hasPromptCompiler ? 100 : 0;
  const modelAdoption = hasModelManager ? 100 : 0;
  const eventAdoption = hasEventBus ? 100 : 0;
  const toolAdoption = hasToolRegistry ? 100 : 0;
  const permissionAdoption = hasPermission ? 100 : 0;
  const observabilityAdoption = hasObservability ? 100 : 0;

  const overall = Math.round(
    (identityAdoption + memoryAdoption + routerAdoption + compilerAdoption + modelAdoption + eventAdoption + toolAdoption + permissionAdoption + observabilityAdoption) / 9
  );

  return {
    identityEngineAdoption: identityAdoption,
    memoryEngineAdoption: memoryAdoption,
    contextRouterAdoption: routerAdoption,
    promptCompilerAdoption: compilerAdoption,
    modelManagerAdoption: modelAdoption,
    eventBusAdoption: eventAdoption,
    toolRegistryAdoption: toolAdoption,
    permissionAdoption: permissionAdoption,
    observabilityAdoption: observabilityAdoption,
    overallAdoption: overall
  };
}
