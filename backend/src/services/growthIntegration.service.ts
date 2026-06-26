import prisma from "../config/prisma";
import { container } from "../runtime/core";
import { ActorProfile } from "../runtime/interfaces/identity";

/**
 * Observability metric helpers.
 */
const recordLatency = (
  metricName: "policy_evaluation_latency" | "execution_latency" | "replay_match_latency",
  startTime: number
) => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordGrowthMetric(metricName, Date.now() - startTime);
  }
};

const recordFailure = () => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordGrowthMetric("growth_failure", 1);
  }
};

const recordExecution = () => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordGrowthMetric("growth_execution", 1);
  }
};

/**
 * Tenant Isolation Boundary Enforcement.
 */
export function enforceTenantIsolation(tenantId: string, actor?: ActorProfile) {
  if (actor) {
    if (actor.tenantId !== tenantId) {
      recordFailure();
      throw new Error(`Cross-tenant Growth operation blocked. Actor tenant [${actor.tenantId}] does not match resource tenant [${tenantId}].`);
    }
  }
}

/**
 * Reliability Wrapper. Enforces circuit breaker limits and handles retries.
 */
export async function executeGrowthWorkflowWithReliability<T>(
  tenantId: string,
  workflowName: string,
  fn: () => Promise<T>
): Promise<T> {
  const cb = container.has("ICircuitBreakerEngine") ? container.resolve<any>("ICircuitBreakerEngine") : null;
  const retry = container.has("IRetryManager") ? container.resolve<any>("IRetryManager") : null;

  if (cb && !cb.canExecute(workflowName)) {
    recordFailure();
    throw new Error(`Circuit open for growth workflow [${workflowName}]. Execution blocked.`);
  }

  const start = Date.now();
  try {
    const result = await fn();
    if (cb) cb.recordSuccess(workflowName);
    recordLatency("execution_latency", start);
    recordExecution();
    return result;
  } catch (err) {
    if (cb) cb.recordFailure(workflowName);
    recordFailure();

    if (retry) {
      try {
        const result = await retry.executeWithRetry(async () => {
          const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
          if (metrics) {
            metrics.recordExecutionRetry(tenantId, workflowName);
          }
          return await fn();
        });
        if (cb) cb.recordSuccess(workflowName);
        recordLatency("execution_latency", start);
        return result;
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw err;
  }
}

/**
 * Policy & Permission execution validator.
 */
export async function validateGrowthExecution(
  tenantId: string,
  toolName: string,
  args: any,
  actor?: ActorProfile
): Promise<void> {
  enforceTenantIsolation(tenantId, actor);

  // 1. Permission Engine Check
  const permissionEngine = container.has("IPermissionEngine") ? container.resolve<any>("IPermissionEngine") : null;
  if (permissionEngine && actor) {
    const authContext = {
      tenantId,
      roles: [actor.role, ...(actor.scopes || [])],
    };
    const toolDef = {
      name: toolName,
      ownerTenantId: tenantId,
      permissions: ["SYSTEM", "crm:write", "growth:write"],
    };
    const isAuthorized = permissionEngine.authorize(authContext, toolDef);
    if (!isAuthorized.authorized) {
      recordFailure();
      throw new Error(`Security Violation: Caller lacks permission to execute ${toolName}. Reason: ${isAuthorized.reason}`);
    }
  }

  // 2. Policy Engine Check
  const policyEngine = container.has("IPolicyEngine") ? container.resolve<any>("IPolicyEngine") : null;
  if (policyEngine) {
    const policyStart = Date.now();
    const evaluation = policyEngine.evaluate({ tenantId, roles: [] }, args);
    recordLatency("policy_evaluation_latency", policyStart);
    if (!evaluation.allowed) {
      recordFailure();
      throw new Error(`Policy Violation: Execution of [${toolName}] blocked. Reason: ${evaluation.reasons.join(", ")}`);
    }
  }
}

/**
 * Publishes events to Runtime Event Bus under strict schemas.
 */
export async function publishGrowthEvent(
  tenantId: string,
  eventName: string,
  payload: any
): Promise<void> {
  const eventBus = container.has("IEventBus") ? container.resolve<any>("IEventBus") : null;
  if (eventBus) {
    await eventBus.publish(eventName, "1.0.0", payload, { tenantId });
  }
}

/**
 * Decoupled Business Graph Linkages (Phase 10).
 */
export async function linkCampaignCustomer(tenantId: string, campaignId: string, customerId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `campaign:${campaignId}`,
    targetId: `customer:${customerId}`,
    predicate: "CAMPAIGN_CUSTOMER"
  });
}

export async function linkCampaignKnowledge(tenantId: string, campaignId: string, knowledgeId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `campaign:${campaignId}`,
    targetId: `knowledge:${knowledgeId}`,
    predicate: "CAMPAIGN_KNOWLEDGE"
  });
}

export async function linkReferralCustomer(tenantId: string, referralKey: string, customerId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `referral:${referralKey}`,
    targetId: `customer:${customerId}`,
    predicate: "REFERRAL_CUSTOMER"
  });
}

export async function linkAffiliatePartner(tenantId: string, affiliateKey: string, partnerKey: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `affiliate:${affiliateKey}`,
    targetId: `partner:${partnerKey}`,
    predicate: "AFFILIATE_PARTNER"
  });
}

export async function linkJourneyTimeline(tenantId: string, journeyKey: string, timelineId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `journey:${journeyKey}`,
    targetId: `timeline:${timelineId}`,
    predicate: "JOURNEY_TIMELINE"
  });
}

export async function linkOfferCustomer(tenantId: string, offerKey: string, customerId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `offer:${offerKey}`,
    targetId: `customer:${customerId}`,
    predicate: "OFFER_CUSTOMER"
  });
}

export async function linkChannelPerformance(tenantId: string, performanceKey: string, channel: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `performance:${performanceKey}`,
    targetId: `channel:${channel}`,
    predicate: "CHANNEL_PERFORMANCE"
  });
}

export async function linkExecutionDecision(tenantId: string, executionKey: string, decisionId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `execution:${executionKey}`,
    targetId: `decision:${decisionId}`,
    predicate: "EXECUTION_DECISION"
  });
}

export async function linkOverridePolicy(tenantId: string, overrideKey: string, policyKey: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `override:${overrideKey}`,
    targetId: `policy:${policyKey}`,
    predicate: "OVERRIDE_POLICY"
  });
}

export async function linkPromotionTimeline(tenantId: string, promotionKey: string, timelineId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `promotion:${promotionKey}`,
    targetId: `timeline:${timelineId}`,
    predicate: "PROMOTION_TIMELINE"
  });
}

/**
 * Future AI Connector Interfaces (Phase 11).
 */
export interface IGrowthAIConnector {
  tenantId: string;
  actorProfile: ActorProfile;
  evaluateWorkflowRules(scope: string, targetKey: string, payload: any): Promise<boolean>;
  dispatchGrowthAction(toolName: string, args: any): Promise<any>;
}

export interface ISalesGrowthAIConnector extends IGrowthAIConnector {
  getConversionOptimizationInsight(leadId: string): Promise<any>;
  triggerReferralReward(code: string, referredLeadId: string): Promise<void>;
}

export interface IMarketingGrowthAIConnector extends IGrowthAIConnector {
  getActiveCampaignPerformance(channel: string): Promise<any>;
  publishContentWorkflow(channel: string, type: string, objective: string): Promise<string>;
}

export interface ICEOGrowthAIConnector extends IGrowthAIConnector {
  getEnterpriseCACAndLTV(): Promise<any>;
}

/**
 * Runtime Adoption Percentage Validator (Phase 12).
 */
export async function validateGrowthRuntimeAdoption() {
  const hasEventBus = container.has("IEventBus");
  const hasToolRegistry = container.has("IToolRegistry");
  const hasPolicy = container.has("IPolicyEngine");
  const hasPermission = container.has("IPermissionEngine");
  const hasObservability = container.has("IMetricsEngine");
  const hasCircuitBreaker = container.has("ICircuitBreakerEngine");
  const hasRetry = container.has("IRetryManager");
  const hasMemory = container.has("IMemoryEngine");

  const eventAdoption = hasEventBus ? 100 : 0;
  const toolAdoption = hasToolRegistry ? 100 : 0;
  const policyAdoption = hasPolicy ? 100 : 0;
  const permissionAdoption = hasPermission ? 100 : 0;
  const observabilityAdoption = hasObservability ? 100 : 0;
  const reliabilityAdoption = (hasCircuitBreaker && hasRetry) ? 100 : 0;
  const memoryAdoption = hasMemory ? 100 : 0;

  const overall = Math.round(
    (eventAdoption + toolAdoption + policyAdoption + permissionAdoption + observabilityAdoption + reliabilityAdoption + memoryAdoption) / 7
  );

  return {
    eventBusAdoption: eventAdoption,
    toolRegistryAdoption: toolAdoption,
    policyEngineAdoption: policyAdoption,
    permissionEngineAdoption: permissionAdoption,
    observabilityAdoption: observabilityAdoption,
    reliabilityAdoption: reliabilityAdoption,
    memoryEngineAdoption: memoryAdoption,
    overallAdoption: overall,
  };
}
