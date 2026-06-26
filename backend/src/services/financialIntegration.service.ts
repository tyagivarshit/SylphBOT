import { container } from "../runtime/core";
import { ActorProfile } from "../runtime/interfaces/identity";

// Immutable Financial Event Store
export interface FinancialEvent {
  id: string;
  tenantId: string;
  eventType: string;
  amount: number;
  currency: string;
  entityId: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

const financialEventStore: FinancialEvent[] = [];

export function resetFinancialEventStore(): void {
  financialEventStore.length = 0;
}

export function getFinancialEvents(tenantId: string): FinancialEvent[] {
  return financialEventStore.filter(e => e.tenantId === tenantId);
}

export function recordFinancialEvent(event: Omit<FinancialEvent, "id" | "timestamp">): FinancialEvent {
  const newEvent: FinancialEvent = {
    id: `fin-evt-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
    timestamp: new Date(),
    ...event
  };
  financialEventStore.push(newEvent);
  return newEvent;
}

export function replayFinancialEvents(tenantId: string): { balance: number; currency: string; lastUpdated: Date | null } {
  const events = getFinancialEvents(tenantId);
  let balance = 0;
  let currency = "USD";
  let lastUpdated: Date | null = null;

  for (const e of events) {
    currency = e.currency;
    lastUpdated = e.timestamp;
    if (e.eventType === "financial.revenue.recorded" || e.eventType === "financial.payment.charged") {
      balance += e.amount;
    } else if (e.eventType === "financial.expense.recorded" || e.eventType === "financial.payment.refunded") {
      balance -= e.amount;
    }
  }

  return { balance, currency, lastUpdated };
}

/**
 * Normalizes transactions, categorizes events, links entities, and prepares structured financial context for Future Finance AI.
 */
export function prepareFinancialIntelligence(tenantId: string) {
  const events = getFinancialEvents(tenantId);
  
  const normalized = events.map(e => ({
    transactionId: e.id,
    amountNormalized: e.amount,
    currencyNormalized: e.currency.toUpperCase(),
    category: e.eventType.split(".")[1] || "general",
    entityReference: e.entityId,
    timestamp: e.timestamp.toISOString(),
    isOutflow: e.eventType.includes("expense") || e.eventType.includes("refund")
  }));

  const summary = replayFinancialEvents(tenantId);

  return {
    tenantId,
    summary,
    transactionsCount: normalized.length,
    transactions: normalized,
    readyForFinanceAI: true,
    preparedAt: new Date().toISOString()
  };
}

/**
 * Latency helper for financial metrics.
 */
const recordLatency = (
  metricName:
    | "revenue_latency"
    | "expense_latency"
    | "invoice_latency"
    | "refund_latency",
  startTime: number
) => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordSchedulingMetric(metricName, Date.now() - startTime);
  }
};

/**
 * Tenant Isolation Boundary Enforcement.
 */
export function enforceTenantIsolation(tenantId: string, actor?: ActorProfile) {
  if (actor) {
    if (actor.tenantId !== tenantId) {
      const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
      if (metrics) {
        metrics.recordExecutionFailure(tenantId, "enforceFinancialTenantIsolation", 0);
      }
      throw new Error(`Cross-tenant Financial operation blocked. Actor tenant [${actor.tenantId}] does not match resource tenant [${tenantId}].`);
    }
  }
}

/**
 * Resolve identity via IdentityEngine
 */
export async function resolveFinancialIdentity(
  tenantId: string,
  type: string,
  id: string,
  actor?: ActorProfile
): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const identityEngine = container.resolve<any>("IIdentityEngineInstance");
  return identityEngine.resolveIdentity(tenantId, type, id);
}

/**
 * Memory Engine routing.
 */
export async function writeFinancialMemory(tenantId: string, key: string, data: any, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  return memoryEngine.writeMemory(tenantId, "business", `financial:${key}`, typeof data === "string" ? data : JSON.stringify(data));
}

export async function readFinancialMemory(tenantId: string, key: string, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  const record = await memoryEngine.readMemory(tenantId, "business", `financial:${key}`);
  return record ? record.value : null;
}

/**
 * Validation, Permission, Policy Engine verification.
 */
export async function validateFinancialExecution(
  tenantId: string,
  toolName: string,
  args: any,
  actor?: ActorProfile
): Promise<void> {
  enforceTenantIsolation(tenantId, actor);

  // 1. Permission Engine validation
  const permissionEngine = container.has("IPermissionEngine") ? container.resolve<any>("IPermissionEngine") : null;
  if (permissionEngine && actor) {
    const authContext = {
      tenantId,
      roles: [actor.role, ...(actor.scopes || [])],
    };
    
    // Determine required permission based on tool
    let requiredPermission = "finance.read";
    if (toolName.includes("invoice")) {
      requiredPermission = "finance.invoice";
    } else if (toolName.includes("refund")) {
      requiredPermission = "finance.refund";
    } else if (toolName.includes("charge") || toolName.includes("write") || toolName.includes("record") || toolName.includes("budget")) {
      requiredPermission = "finance.write";
    }

    const toolDef = {
      name: toolName,
      ownerTenantId: tenantId,
      permissions: [requiredPermission, "finance.admin"],
    };
    
    const isAuthorized = permissionEngine.authorize(authContext, toolDef);
    if (!isAuthorized.authorized) {
      throw new Error(`Security Violation: Caller lacks permission to execute financial action ${toolName}. Reason: ${isAuthorized.reason}`);
    }
  }

  // 2. Policy Engine validation
  const policyEngine = container.has("IPolicyEngine") ? container.resolve<any>("IPolicyEngine") : null;
  if (policyEngine) {
    const startPolicy = Date.now();
    const evaluation = policyEngine.evaluate({ tenantId, roles: [] }, { ...args, toolName });
    
    // Track execution check latency as invoice_latency or general latency
    if (toolName.includes("invoice")) {
      recordLatency("invoice_latency", startPolicy);
    }
    
    if (!evaluation.allowed) {
      throw new Error(`Policy Violation: Financial execution of [${toolName}] blocked. Reason: ${evaluation.reasons.join(", ")}`);
    }
  }
}

/**
 * Reliability Wrapper.
 */
export async function executeFinancialWorkflowWithReliability<T>(
  tenantId: string,
  workflowName: string,
  fn: () => Promise<T>
): Promise<T> {
  const cb = container.has("ICircuitBreakerEngine") ? container.resolve<any>("ICircuitBreakerEngine") : null;
  const retry = container.has("IRetryManager") ? container.resolve<any>("IRetryManager") : null;

  if (cb && !cb.canExecute(workflowName)) {
    throw new Error(`Circuit open for financial workflow [${workflowName}]. Execution blocked.`);
  }

  try {
    const result = await fn();
    if (cb) cb.recordSuccess(workflowName);
    return result;
  } catch (err) {
    if (cb) cb.recordFailure(workflowName);

    if (retry) {
      try {
        const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
        if (metrics) {
          metrics.recordExecutionRetry(tenantId, workflowName);
        }
        const result = await retry.executeWithRetry(fn);
        if (cb) cb.recordSuccess(workflowName);
        return result;
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw err;
  }
}

/**
 * Event Bus publishing.
 */
export async function publishFinancialEvent(
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
 * Business Intelligence Graph preparation link hooks.
 */
export async function linkFinancialEntity(
  tenantId: string,
  sourceId: string,
  targetId: string,
  predicate: string,
  actor?: ActorProfile
): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId,
    targetId,
    predicate
  });
}

/**
 * Validate adoption percentages for the Financial Stage.
 */
export async function validateFinancialRuntimeAdoption() {
  const hasIdentity = container.has("IIdentityEngineInstance");
  const hasMemory = container.has("IMemoryEngine");
  const hasEventBus = container.has("IEventBus");
  const hasExecution = container.has("IToolExecutor");
  const hasToolRegistry = container.has("IToolRegistry");
  const hasPermission = container.has("IPermissionEngine");
  const hasPolicy = container.has("IPolicyEngine");
  const hasObservability = container.has("IMetricsEngine");
  const hasCircuitBreaker = container.has("ICircuitBreakerEngine");
  const hasRetry = container.has("IRetryManager");

  const identityAdoption = hasIdentity ? 100 : 0;
  const memoryAdoption = hasMemory ? 100 : 0;
  const eventAdoption = hasEventBus ? 100 : 0;
  const executionAdoption = hasExecution ? 100 : 0;
  const toolAdoption = hasToolRegistry ? 100 : 0;
  const permissionAdoption = hasPermission ? 100 : 0;
  const policyAdoption = hasPolicy ? 100 : 0;
  const observabilityAdoption = hasObservability ? 100 : 0;
  const reliabilityAdoption = (hasCircuitBreaker && hasRetry) ? 100 : 0;

  const overall = Math.round(
    (identityAdoption +
      memoryAdoption +
      eventAdoption +
      executionAdoption +
      toolAdoption +
      permissionAdoption +
      policyAdoption +
      observabilityAdoption +
      reliabilityAdoption) /
      9
  );

  return {
    identityEngineAdoption: identityAdoption,
    memoryEngineAdoption: memoryAdoption,
    eventBusAdoption: eventAdoption,
    executionLayerAdoption: executionAdoption,
    toolRegistryAdoption: toolAdoption,
    permissionEngineAdoption: permissionAdoption,
    policyEngineAdoption: policyAdoption,
    observabilityAdoption: observabilityAdoption,
    reliabilityAdoption: reliabilityAdoption,
    overallAdoption: overall
  };
}
