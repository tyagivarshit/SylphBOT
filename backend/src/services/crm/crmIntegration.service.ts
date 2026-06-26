import prisma from "../../config/prisma";
import { container } from "../../runtime/core";
import { ActorProfile } from "../../runtime/interfaces/identity";
import { CustomerIdentity } from "../../runtime/communication/identityEngine";

/**
 * Latency recording helper.
 */
const recordLatency = (metricName: "lead_creation_latency" | "customer_lookup_latency" | "pipeline_update_latency", startTime: number) => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordCRMMetric(metricName, Date.now() - startTime);
  }
};

/**
 * Failure recording helper.
 */
const recordFailure = () => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordCRMMetric("crm_failure", 1);
  }
};

/**
 * Checks actor profile permission scopes and tenant alignment.
 */
export function enforceTenantIsolation(tenantId: string, actor?: ActorProfile) {
  if (actor) {
    if (actor.tenantId !== tenantId) {
      recordFailure();
      throw new Error(`Cross-tenant CRM operation blocked. Actor tenant [${actor.tenantId}] does not match resource tenant [${tenantId}].`);
    }
  }
}

/**
 * Resolves a customer's unified identity across messaging and communication channels.
 */
export async function resolveCustomerIdentity(
  tenantId: string,
  channel: string,
  channelUserId: string,
  actor?: ActorProfile
): Promise<CustomerIdentity> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);

  try {
    const identityEngine = container.resolve<any>("IIdentityEngineInstance");
    const identity = identityEngine.resolveIdentity(tenantId, channel, channelUserId);
    recordLatency("customer_lookup_latency", start);
    return identity;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Creates a new CRM Lead, resolving its identity and storing profile/lifecycle memory.
 */
export async function createLead(
  tenantId: string,
  data: any,
  actor?: ActorProfile
): Promise<any> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);

  try {
    const identityEngine = container.resolve<any>("IIdentityEngineInstance");
    let channel = "Phone";
    let channelId = data.phone || data.email || data.instagramId || "anonymous";
    if (data.instagramId) channel = "Instagram";
    else if (data.email) channel = "Email";

    const identity = identityEngine.resolveIdentity(tenantId, channel, channelId);

    const lead = await prisma.lead.create({
      data: {
        businessId: tenantId,
        name: data.name || null,
        phone: data.phone || null,
        instagramId: data.instagramId || null,
        email: data.email || null,
        platform: data.platform || "WHATSAPP",
        stage: data.stage || "NEW",
        aiStage: data.aiStage || "NEW",
        revenueState: data.revenueState || "COLD",
      }
    });

    // Write Profile and Lifecycle details to IMemoryEngine
    const memoryEngine = container.resolve<any>("IMemoryEngine");
    await memoryEngine.writeMemory(tenantId, "customer", `profile:${lead.id}`, JSON.stringify({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      instagramId: lead.instagramId,
      unifiedId: identity.unifiedId
    }));

    await memoryEngine.writeMemory(tenantId, "customer", `lifecycle:${lead.id}`, JSON.stringify({
      stage: lead.stage,
      aiStage: lead.aiStage,
      revenueState: lead.revenueState
    }));

    if (data.preferences) {
      await memoryEngine.writeMemory(tenantId, "customer", `preferences:${lead.id}`, JSON.stringify(data.preferences));
    }

    // Publish to Event Bus
    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("lead.created", "1.0.0", {
      leadId: lead.id,
      businessId: tenantId,
      platform: lead.platform,
      stage: lead.stage,
    }, { tenantId });

    await eventBus.publish("customer.created", "1.0.0", {
      customerId: lead.id,
      businessId: tenantId,
      unifiedId: identity.unifiedId,
    }, { tenantId });

    recordLatency("lead_creation_latency", start);
    return { lead, identity };
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Updates lead fields, writing modifications to customer memory namespace.
 */
export async function updateLead(
  tenantId: string,
  leadId: string,
  data: any,
  actor?: ActorProfile
): Promise<any> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);

  try {
    const lead = await prisma.lead.update({
      where: { id: leadId },
      data
    });

    const memoryEngine = container.resolve<any>("IMemoryEngine");
    await memoryEngine.writeMemory(tenantId, "customer", `profile:${lead.id}`, JSON.stringify({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      instagramId: lead.instagramId
    }));

    if (data.stage || data.aiStage || data.revenueState) {
      await memoryEngine.writeMemory(tenantId, "customer", `lifecycle:${lead.id}`, JSON.stringify({
        stage: lead.stage,
        aiStage: lead.aiStage,
        revenueState: lead.revenueState
      }));
    }

    // Publish event notifications
    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("lead.updated", "1.0.0", {
      leadId: lead.id,
      businessId: tenantId,
      stage: lead.stage,
    }, { tenantId });

    await eventBus.publish("customer.updated", "1.0.0", {
      customerId: lead.id,
      businessId: tenantId,
    }, { tenantId });

    recordLatency("pipeline_update_latency", start);
    return lead;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Soft deletes a lead and fires lead deletion events.
 */
export async function deleteLead(
  tenantId: string,
  leadId: string,
  actor?: ActorProfile
): Promise<any> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);

  try {
    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: { deletedAt: new Date() }
    });

    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("lead.deleted", "1.0.0", {
      leadId,
      businessId: tenantId,
      reason: "DELETED"
    }, { tenantId });

    return lead;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Qualifies a lead, publishing a customer conversion event.
 */
export async function qualifyLead(
  tenantId: string,
  leadId: string,
  actor?: ActorProfile
): Promise<any> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);

  try {
    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: { stage: "QUALIFIED" }
    });

    // Publish conversion success
    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("customer.converted", "1.0.0", {
      customerId: lead.id,
      businessId: tenantId,
      stage: "QUALIFIED"
    }, { tenantId });

    const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
    if (metrics) {
      metrics.recordCRMMetric("conversion_event", 1);
    }

    recordLatency("pipeline_update_latency", start);
    return lead;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Transitions lead pipeline stage, emitting state change contracts.
 */
export async function movePipeline(
  tenantId: string,
  leadId: string,
  newStage: string,
  actor?: ActorProfile
): Promise<any> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);

  try {
    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: { stage: newStage }
    });

    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("pipeline.stage.changed", "1.0.0", {
      leadId: lead.id,
      businessId: tenantId,
      oldStage: lead.stage,
      newStage
    }, { tenantId });

    recordLatency("pipeline_update_latency", start);
    return lead;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Retrieves a customer profile from Memory Engine, falling back to database.
 */
export async function retrieveCustomer(
  tenantId: string,
  leadId: string,
  actor?: ActorProfile
): Promise<any> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);

  try {
    const memoryEngine = container.resolve<any>("IMemoryEngine");
    const record = await memoryEngine.readMemory(tenantId, "customer", `profile:${leadId}`);

    let profile = record ? JSON.parse(record.value) : null;
    if (!profile) {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId }
      });
      if (lead) {
        profile = {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          instagramId: lead.instagramId
        };
        await memoryEngine.writeMemory(tenantId, "customer", `profile:${leadId}`, JSON.stringify(profile));
      }
    }

    recordLatency("customer_lookup_latency", start);
    return profile;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Merges a secondary duplicate customer into the primary customer.
 */
export async function mergeCustomer(
  tenantId: string,
  primaryLeadId: string,
  secondaryLeadId: string,
  actor?: ActorProfile
): Promise<any> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);

  try {
    const identityEngine = container.resolve<any>("IIdentityEngineInstance");
    const primaryLead = await prisma.lead.findUnique({ where: { id: primaryLeadId } });
    const secondaryLead = await prisma.lead.findUnique({ where: { id: secondaryLeadId } });

    if (!primaryLead || !secondaryLead) {
      throw new Error("Primary or secondary lead not found.");
    }

    const pIdentity = identityEngine.resolveIdentity(tenantId, "Phone", primaryLead.phone || `primary_${primaryLeadId}`);
    const sIdentity = identityEngine.resolveIdentity(tenantId, "Phone", secondaryLead.phone || `secondary_${secondaryLeadId}`);

    const mergedIdentity = identityEngine.mergeIdentities(pIdentity.unifiedId, sIdentity.unifiedId, tenantId);

    // Soft delete the secondary duplicate lead
    await prisma.lead.update({
      where: { id: secondaryLeadId },
      data: { deletedAt: new Date() }
    });

    // Write merged memory representation
    const memoryEngine = container.resolve<any>("IMemoryEngine");
    const mergedProfile = {
      name: primaryLead.name || secondaryLead.name,
      email: primaryLead.email || secondaryLead.email,
      phone: primaryLead.phone || secondaryLead.phone,
      instagramId: primaryLead.instagramId || secondaryLead.instagramId,
      unifiedId: mergedIdentity.unifiedId
    };
    await memoryEngine.writeMemory(tenantId, "customer", `profile:${primaryLeadId}`, JSON.stringify(mergedProfile));

    // Fire duplicate merge events
    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("customer.updated", "1.0.0", {
      customerId: primaryLeadId,
      businessId: tenantId,
      action: "MERGE",
      secondaryCustomerId: secondaryLeadId
    }, { tenantId });

    await eventBus.publish("lead.deleted", "1.0.0", {
      leadId: secondaryLeadId,
      businessId: tenantId,
      reason: "MERGED"
    }, { tenantId });

    const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
    if (metrics) {
      metrics.recordCRMMetric("duplicate_merge", 1);
    }

    recordLatency("customer_lookup_latency", start);
    return { primaryLeadId, mergedIdentity };
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Searches for customer leads.
 */
export async function searchCustomer(
  tenantId: string,
  query: string,
  actor?: ActorProfile
): Promise<any[]> {
  const start = Date.now();
  enforceTenantIsolation(tenantId, actor);

  try {
    const leads = await prisma.lead.findMany({
      where: {
        businessId: tenantId,
        OR: [
          { name: { contains: query } },
          { email: { contains: query } },
          { phone: { contains: query } }
        ]
      }
    });

    recordLatency("customer_lookup_latency", start);
    return leads;
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Link contact details updates.
 */
export async function updateContact(
  tenantId: string,
  customerId: string,
  contactData: any,
  actor?: ActorProfile
): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  try {
    const eventBus = container.resolve<any>("IEventBus");
    await eventBus.publish("contact.updated", "1.0.0", {
      customerId,
      businessId: tenantId,
      contactData
    }, { tenantId });
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Links a customer context to a conversation summary and maps relation edges.
 */
export async function linkConversation(
  tenantId: string,
  leadId: string,
  conversationId: string,
  actor?: ActorProfile
): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  try {
    const memoryEngine = container.resolve<any>("IMemoryEngine");
    await memoryEngine.writeMemory(tenantId, "customer", `interaction:${leadId}:${conversationId}`, JSON.stringify({
      conversationId,
      linkedAt: new Date()
    }));

    await memoryEngine.linkKnowledgeRelation(tenantId, {
      sourceId: `customer:${leadId}`,
      targetId: `conversation:${conversationId}`,
      predicate: "CONVERSATION_LINK",
      weight: 1.0
    });
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Attaches a knowledge resource association to a customer context.
 */
export async function attachKnowledge(
  tenantId: string,
  leadId: string,
  knowledgeId: string,
  actor?: ActorProfile
): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  try {
    const memoryEngine = container.resolve<any>("IMemoryEngine");
    await memoryEngine.writeMemory(tenantId, "customer", `knowledge_link:${leadId}:${knowledgeId}`, JSON.stringify({
      knowledgeId,
      linkedAt: new Date()
    }));

    await memoryEngine.linkKnowledgeRelation(tenantId, {
      sourceId: `customer:${leadId}`,
      targetId: `knowledge:${knowledgeId}`,
      predicate: "KNOWLEDGE_LINK",
      weight: 1.0
    });
  } catch (err) {
    recordFailure();
    throw err;
  }
}

/**
 * Stage 2.2 — Business Graph preparation relationship linkage operations.
 */
export async function linkCompany(tenantId: string, leadId: string, companyId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `customer:${leadId}`,
    targetId: `company:${companyId}`,
    predicate: "COMPANY_LINK"
  });
}

export async function linkPayment(tenantId: string, leadId: string, paymentId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `customer:${leadId}`,
    targetId: `payment:${paymentId}`,
    predicate: "PAYMENT_LINK"
  });
}

export async function linkCampaign(tenantId: string, leadId: string, campaignId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `customer:${leadId}`,
    targetId: `campaign:${campaignId}`,
    predicate: "CAMPAIGN_LINK"
  });
}

export async function linkBooking(tenantId: string, leadId: string, bookingId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `customer:${leadId}`,
    targetId: `booking:${bookingId}`,
    predicate: "BOOKING_LINK"
  });
}

export async function linkDeal(tenantId: string, leadId: string, dealId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `customer:${leadId}`,
    targetId: `deal:${dealId}`,
    predicate: "DEAL_LINK"
  });
}

export async function linkSupportCase(tenantId: string, leadId: string, caseId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `customer:${leadId}`,
    targetId: `case:${caseId}`,
    predicate: "SUPPORT_CASE_LINK"
  });
}

/**
 * Deal management endpoints with contract events.
 */
export async function createDeal(tenantId: string, data: any, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const eventBus = container.resolve<any>("IEventBus");
  const dealId = "deal_" + Math.random().toString(36).substring(2, 12);
  await eventBus.publish("deal.created", "1.0.0", {
    dealId,
    businessId: tenantId,
    amount: data.amount,
    title: data.title,
  }, { tenantId });
  return { id: dealId };
}

export async function wonDeal(tenantId: string, dealId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const eventBus = container.resolve<any>("IEventBus");
  await eventBus.publish("deal.won", "1.0.0", {
    dealId,
    businessId: tenantId,
  }, { tenantId });
}

export async function lostDeal(tenantId: string, dealId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const eventBus = container.resolve<any>("IEventBus");
  await eventBus.publish("deal.lost", "1.0.0", {
    dealId,
    businessId: tenantId,
  }, { tenantId });
}

/**
 * Verify CRM integration adoption status.
 */
export async function validateCrmRuntimeAdoption() {
  const hasMemoryEngine = container.has("IMemoryEngine");
  const hasEventBus = container.has("IEventBus");
  const hasToolRegistry = container.has("IToolRegistry");
  const hasMetricsEngine = container.has("IMetricsEngine");
  const hasIdentityEngine = container.has("IIdentityEngineInstance");
  const hasPermissionEngine = container.has("IPermissionEngine");

  const memoryAdoption = hasMemoryEngine ? 100 : 0;
  const eventAdoption = hasEventBus ? 100 : 0;
  const toolAdoption = hasToolRegistry ? 100 : 0;
  const metricsAdoption = hasMetricsEngine ? 100 : 0;
  const identityAdoption = hasIdentityEngine ? 100 : 0;
  const permissionAdoption = hasPermissionEngine ? 100 : 0;

  const overall = Math.round(
    (memoryAdoption + eventAdoption + toolAdoption + metricsAdoption + identityAdoption + permissionAdoption) / 6
  );

  return {
    identityEngineAdoption: identityAdoption,
    memoryEngineAdoption: memoryAdoption,
    eventBusAdoption: eventAdoption,
    toolRegistryAdoption: toolAdoption,
    permissionAdoption,
    observabilityAdoption: metricsAdoption,
    overallAdoption: overall
  };
}

// =====================================================
// PHASE 10: BUSINESS INTELLIGENCE GRAPH PREPARATION
// =====================================================

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

// =====================================================
// PHASE 11: FUTURE AI PREPARATION INTERFACES
// =====================================================

export interface IFutureAIConnector {
  tenantId: string;
  actorProfile: ActorProfile;
  getCustomerIntelligenceContext(leadId: string): Promise<any>;
  dispatchCrmAction(toolName: string, args: any): Promise<any>;
}

export interface ISalesAIConnector extends IFutureAIConnector {
  getLeadScorecard(leadId: string): Promise<any>;
  wonDeal(dealId: string): Promise<void>;
  lostDeal(dealId: string): Promise<void>;
}

export interface IMarketingAIConnector extends IFutureAIConnector {
  getCustomerSegments(leadId: string): Promise<string[]>;
  linkCampaignTouch(leadId: string, campaignId: string): Promise<void>;
}

export interface ICustomerSuccessAIConnector extends IFutureAIConnector {
  getRelationshipHealth(leadId: string): Promise<any>;
  escalateToHuman(leadId: string, reason: string): Promise<void>;
}

export interface IOperationsAIConnector extends IFutureAIConnector {
  getInteractionTimeline(leadId: string): Promise<any[]>;
  logLifecycleStateTransition(leadId: string, newStage: string): Promise<void>;
}

export interface IFinanceAIConnector extends IFutureAIConnector {
  getCustomerPurchaseHistory(leadId: string): Promise<any[]>;
  linkInvoicePayment(leadId: string, paymentId: string): Promise<void>;
}

export interface ICEOAIConnector extends IFutureAIConnector {
  getEnterpriseAggregates(): Promise<{
    activeCustomersCount: number;
    conversionsCount: number;
    totalDealsValue: number;
    observabilityHealthSummary: any;
  }>;
}

