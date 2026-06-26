import prisma from "../config/prisma";
import { container } from "../runtime/core";
import { ActorProfile } from "../runtime/interfaces/identity";

/**
 * Latency helper for scheduling metrics.
 */
const recordLatency = (
  metricName:
    | "booking_latency"
    | "availability_latency"
    | "reminder_latency"
    | "calendar_sync_latency"
    | "conflict_detection_latency",
  startTime: number
) => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordSchedulingMetric(metricName, Date.now() - startTime);
  }
};

const recordRateMetric = (metricName: "cancellation" | "reschedule" | "completion" | "booking", value = 1) => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordSchedulingMetric(metricName, value);
  }
};

const recordWorkerUtilization = (utilization: number) => {
  const metrics = container.has("IMetricsEngine") ? container.resolve<any>("IMetricsEngine") : null;
  if (metrics) {
    metrics.recordSchedulingMetric("worker_utilization", utilization);
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
        metrics.recordExecutionFailure(tenantId, "enforceTenantIsolation", 0);
      }
      throw new Error(`Cross-tenant Scheduling operation blocked. Actor tenant [${actor.tenantId}] does not match resource tenant [${tenantId}].`);
    }
  }
}

/**
 * PHASE 1: Identity Engine resolution for scheduling.
 */
export async function resolveSchedulingIdentity(
  tenantId: string,
  type: "Customer" | "Lead" | "Employee" | "Agent" | "Resource" | "Workspace" | "Tenant",
  id: string,
  actor?: ActorProfile
): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const identityEngine = container.resolve<any>("IIdentityEngineInstance");
  return identityEngine.resolveIdentity(tenantId, type, id);
}

/**
 * PHASE 2: Memory Engine routing for bookings/scheduling.
 */
export async function writeAppointmentMemory(tenantId: string, bookingId: string, data: any, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  return memoryEngine.writeMemory(tenantId, "customer", `booking:${bookingId}`, typeof data === "string" ? data : JSON.stringify(data));
}

export async function readAppointmentMemory(tenantId: string, bookingId: string, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  const record = await memoryEngine.readMemory(tenantId, "customer", `booking:${bookingId}`);
  return record ? record.value : null;
}

export async function writeAvailabilityMemory(tenantId: string, resourceId: string, data: any, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  return memoryEngine.writeMemory(tenantId, "business", `availability:${resourceId}`, typeof data === "string" ? data : JSON.stringify(data));
}

export async function readAvailabilityMemory(tenantId: string, resourceId: string, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  const record = await memoryEngine.readMemory(tenantId, "business", `availability:${resourceId}`);
  return record ? record.value : null;
}

export async function writeReminderMemory(tenantId: string, reminderId: string, data: any, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  return memoryEngine.writeMemory(tenantId, "customer", `reminder:${reminderId}`, typeof data === "string" ? data : JSON.stringify(data));
}

export async function readReminderMemory(tenantId: string, reminderId: string, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  const record = await memoryEngine.readMemory(tenantId, "customer", `reminder:${reminderId}`);
  return record ? record.value : null;
}

export async function writeMeetingHistory(tenantId: string, meetingId: string, data: any, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  return memoryEngine.writeMemory(tenantId, "customer", `meeting_history:${meetingId}`, typeof data === "string" ? data : JSON.stringify(data));
}

export async function readMeetingHistory(tenantId: string, meetingId: string, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  const record = await memoryEngine.readMemory(tenantId, "customer", `meeting_history:${meetingId}`);
  return record ? record.value : null;
}

export async function writeRescheduleHistory(tenantId: string, rescheduleId: string, data: any, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  return memoryEngine.writeMemory(tenantId, "customer", `reschedule_history:${rescheduleId}`, typeof data === "string" ? data : JSON.stringify(data));
}

export async function readRescheduleHistory(tenantId: string, rescheduleId: string, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  const record = await memoryEngine.readMemory(tenantId, "customer", `reschedule_history:${rescheduleId}`);
  return record ? record.value : null;
}

export async function writeCancellationHistory(tenantId: string, cancellationId: string, data: any, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  return memoryEngine.writeMemory(tenantId, "customer", `cancellation_history:${cancellationId}`, typeof data === "string" ? data : JSON.stringify(data));
}

export async function readCancellationHistory(tenantId: string, cancellationId: string, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  const record = await memoryEngine.readMemory(tenantId, "customer", `cancellation_history:${cancellationId}`);
  return record ? record.value : null;
}

export async function writePreferenceMemory(tenantId: string, entityId: string, data: any, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  return memoryEngine.writeMemory(tenantId, "customer", `preference:${entityId}`, typeof data === "string" ? data : JSON.stringify(data));
}

export async function readPreferenceMemory(tenantId: string, entityId: string, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  const record = await memoryEngine.readMemory(tenantId, "customer", `preference:${entityId}`);
  return record ? record.value : null;
}

export async function writeRelationshipMemory(tenantId: string, relationKey: string, data: any, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  return memoryEngine.writeMemory(tenantId, "customer", `relationship:${relationKey}`, typeof data === "string" ? data : JSON.stringify(data));
}

export async function readRelationshipMemory(tenantId: string, relationKey: string, actor?: ActorProfile): Promise<any> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  const record = await memoryEngine.readMemory(tenantId, "customer", `relationship:${relationKey}`);
  return record ? record.value : null;
}

/**
 * PHASE 4 & PHASE 7: Validation, Permission, Policy Engine validation.
 */
export async function validateSchedulingExecution(
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
    const toolDef = {
      name: toolName,
      ownerTenantId: tenantId,
      permissions: ["SYSTEM", "crm:write", "scheduling:write"],
    };
    const isAuthorized = permissionEngine.authorize(authContext, toolDef);
    if (!isAuthorized.authorized) {
      throw new Error(`Security Violation: Caller lacks permission to execute scheduling action ${toolName}. Reason: ${isAuthorized.reason}`);
    }
  }

  // 2. Policy Engine validation
  const policyEngine = container.has("IPolicyEngine") ? container.resolve<any>("IPolicyEngine") : null;
  if (policyEngine) {
    const startPolicy = Date.now();
    const evaluation = policyEngine.evaluate({ tenantId, roles: [] }, args);
    recordLatency("conflict_detection_latency", startPolicy); // track policy conflict & schedule logic latency
    if (!evaluation.allowed) {
      throw new Error(`Policy Violation: Scheduling execution of [${toolName}] blocked. Reason: ${evaluation.reasons.join(", ")}`);
    }
  }
}

/**
 * PHASE 9: Reliability Wrapper. Enforces circuit breaker and retries.
 */
export async function executeSchedulingWorkflowWithReliability<T>(
  tenantId: string,
  workflowName: string,
  fn: () => Promise<T>
): Promise<T> {
  const cb = container.has("ICircuitBreakerEngine") ? container.resolve<any>("ICircuitBreakerEngine") : null;
  const retry = container.has("IRetryManager") ? container.resolve<any>("IRetryManager") : null;

  if (cb && !cb.canExecute(workflowName)) {
    throw new Error(`Circuit open for scheduling workflow [${workflowName}]. Execution blocked.`);
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
 * PHASE 3: Event Bus integration.
 */
export async function publishSchedulingEvent(
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
 * PHASE 10: Business Intelligence Graph preparation link hooks.
 */
export async function linkBookingCustomer(tenantId: string, bookingId: string, customerId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `booking:${bookingId}`,
    targetId: `customer:${customerId}`,
    predicate: "BOOKING_CUSTOMER"
  });
}

export async function linkBookingCrm(tenantId: string, bookingId: string, leadId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `booking:${bookingId}`,
    targetId: `customer:${leadId}`,
    predicate: "BOOKING_CRM"
  });
}

export async function linkBookingConversation(tenantId: string, bookingId: string, conversationId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `booking:${bookingId}`,
    targetId: `conversation:${conversationId}`,
    predicate: "BOOKING_CONVERSATION"
  });
}

export async function linkBookingCampaign(tenantId: string, bookingId: string, campaignId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `booking:${bookingId}`,
    targetId: `campaign:${campaignId}`,
    predicate: "BOOKING_CAMPAIGN"
  });
}

export async function linkBookingPayment(tenantId: string, bookingId: string, paymentId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `booking:${bookingId}`,
    targetId: `payment:${paymentId}`,
    predicate: "BOOKING_PAYMENT"
  });
}

export async function linkBookingKnowledge(tenantId: string, bookingId: string, knowledgeId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `booking:${bookingId}`,
    targetId: `knowledge:${knowledgeId}`,
    predicate: "BOOKING_KNOWLEDGE"
  });
}

export async function linkBookingEmployee(tenantId: string, bookingId: string, employeeId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `booking:${bookingId}`,
    targetId: `employee:${employeeId}`,
    predicate: "BOOKING_EMPLOYEE"
  });
}

export async function linkBookingAIDecision(tenantId: string, bookingId: string, decisionId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `booking:${bookingId}`,
    targetId: `decision:${decisionId}`,
    predicate: "BOOKING_AI_DECISION"
  });
}

export async function linkBookingTimeline(tenantId: string, bookingId: string, timelineId: string, actor?: ActorProfile): Promise<void> {
  enforceTenantIsolation(tenantId, actor);
  const memoryEngine = container.resolve<any>("IMemoryEngine");
  await memoryEngine.linkKnowledgeRelation(tenantId, {
    sourceId: `booking:${bookingId}`,
    targetId: `timeline:${timelineId}`,
    predicate: "BOOKING_TIMELINE"
  });
}

/**
 * PHASE 12: Validate adoption percentages.
 */
export async function validateSchedulingRuntimeAdoption() {
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
    overallAdoption: overall,
  };
}
