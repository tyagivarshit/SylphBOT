interface ToolMetricsState {
  successes: number;
  failures: number;
  retries: number;
  latencySum: number;
  latencySamples: number;
}

export class MetricsEngine {
  // Key format: `${tenantId}:${toolName}`
  private toolMetrics = new Map<string, ToolMetricsState>();
  private queueDepths = new Map<string, number[]>();

  constructor() {}

  /**
   * Logs a successful tool run event with latency info.
   */
  public recordExecutionSuccess(tenantId: string, toolName: string, latencyMs: number): void {
    const key = `${tenantId}:${toolName}`;
    const state = this.getOrCreateState(key);

    state.successes++;
    state.latencySum += latencyMs;
    state.latencySamples++;

    this.toolMetrics.set(key, state);
  }

  /**
   * Logs a failed tool run event.
   */
  public recordExecutionFailure(tenantId: string, toolName: string, latencyMs: number): void {
    const key = `${tenantId}:${toolName}`;
    const state = this.getOrCreateState(key);

    state.failures++;
    state.latencySum += latencyMs;
    state.latencySamples++;

    this.toolMetrics.set(key, state);
  }

  /**
   * Logs a tool retry event.
   */
  public recordExecutionRetry(tenantId: string, toolName: string): void {
    const key = `${tenantId}:${toolName}`;
    const state = this.getOrCreateState(key);

    state.retries++;
    this.toolMetrics.set(key, state);
  }

  /**
   * Logs worker queue depth status.
   */
  public recordQueueDepth(tenantId: string, depth: number): void {
    const depths = this.queueDepths.get(tenantId) || [];
    depths.push(depth);
    if (depths.length > 100) depths.shift(); // retain last 100 queue depth metrics
    this.queueDepths.set(tenantId, depths);
  }

  /**
   * Resolves aggregated metrics ratios and throughput limits for a tenant.
   */
  public getMetricsSummary(tenantId: string): Record<string, number> {
    let totalSuccesses = 0;
    let totalFailures = 0;
    let totalRetries = 0;
    let latencySum = 0;
    let latencySamples = 0;

    for (const [key, state] of this.toolMetrics.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        totalSuccesses += state.successes;
        totalFailures += state.failures;
        totalRetries += state.retries;
        latencySum += state.latencySum;
        latencySamples += state.latencySamples;
      }
    }

    const throughput = totalSuccesses + totalFailures;
    const successRate = throughput > 0 ? totalSuccesses / throughput : 1.0;
    const failureRate = throughput > 0 ? totalFailures / throughput : 0.0;
    const retryRate = throughput > 0 ? totalRetries / throughput : 0.0;
    const averageLatencyMs = latencySamples > 0 ? latencySum / latencySamples : 0;

    const depths = this.queueDepths.get(tenantId) || [];
    const averageQueueDepth = depths.length > 0 
      ? depths.reduce((sum, d) => sum + d, 0) / depths.length 
      : 0;

    return {
      throughput,
      successRate,
      failureRate,
      retryRate,
      averageLatencyMs,
      averageQueueDepth
    };
  }

  private getOrCreateState(key: string): ToolMetricsState {
    let state = this.toolMetrics.get(key);
    if (!state) {
      state = {
        successes: 0,
        failures: 0,
        retries: 0,
        latencySum: 0,
        latencySamples: 0
      };
      this.toolMetrics.set(key, state);
    }
    return state;
  }

  /**
   * Resets internal metrics counters (for testing).
   */
  public clear(): void {
    this.toolMetrics.clear();
    this.queueDepths.clear();
    this.knowledgeMetrics = {
      retrievalLatencies: [],
      embeddingLatencies: [],
      searchLatencies: [],
      importLatencies: [],
      hits: 0,
      misses: 0,
      embeddingFailures: 0,
      vectorFailures: 0,
    };
    this.crmMetrics = {
      leadCreationLatencies: [],
      customerLookupLatencies: [],
      pipelineUpdateLatencies: [],
      conversionRateEvents: 0,
      duplicateMergeEvents: 0,
      crmFailures: 0,
    };
    this.conversationMetrics = {
      memoryRetrievalLatencies: [],
      promptCompilationLatencies: [],
      modelLatencies: [],
      messageThroughput: 0,
      conversationFailures: 0,
      escalationFrequency: 0,
    };
    this.schedulingMetrics = {
      bookingLatencies: [],
      availabilityLatencies: [],
      reminderLatencies: [],
      calendarSyncLatencies: [],
      conflictDetectionLatencies: [],
      cancellations: 0,
      reschedules: 0,
      completions: 0,
      totalBookings: 0,
      workerUtilizations: [],
    };
  }

  // ==========================================
  // Knowledge Base Observability Telemetry
  // ==========================================

  private knowledgeMetrics = {
    retrievalLatencies: [] as number[],
    embeddingLatencies: [] as number[],
    searchLatencies: [] as number[],
    importLatencies: [] as number[],
    hits: 0,
    misses: 0,
    embeddingFailures: 0,
    vectorFailures: 0,
  };

  public recordKnowledgeMetric(
    metricName: "retrieval_latency" | "embedding_latency" | "search_latency" | "import_latency" | "hit" | "miss" | "embedding_failure" | "vector_failure",
    value: number
  ): void {
    if (metricName === "retrieval_latency") {
      this.knowledgeMetrics.retrievalLatencies.push(value);
    } else if (metricName === "embedding_latency") {
      this.knowledgeMetrics.embeddingLatencies.push(value);
    } else if (metricName === "search_latency") {
      this.knowledgeMetrics.searchLatencies.push(value);
    } else if (metricName === "import_latency") {
      this.knowledgeMetrics.importLatencies.push(value);
    } else if (metricName === "hit") {
      this.knowledgeMetrics.hits += value;
    } else if (metricName === "miss") {
      this.knowledgeMetrics.misses += value;
    } else if (metricName === "embedding_failure") {
      this.knowledgeMetrics.embeddingFailures += value;
    } else if (metricName === "vector_failure") {
      this.knowledgeMetrics.vectorFailures += value;
    }
  }

  public getKnowledgeMetricsSummary() {
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      averageRetrievalLatencyMs: avg(this.knowledgeMetrics.retrievalLatencies),
      averageEmbeddingLatencyMs: avg(this.knowledgeMetrics.embeddingLatencies),
      averageSearchLatencyMs: avg(this.knowledgeMetrics.searchLatencies),
      averageImportLatencyMs: avg(this.knowledgeMetrics.importLatencies),
      hits: this.knowledgeMetrics.hits,
      misses: this.knowledgeMetrics.misses,
      hitRate: (this.knowledgeMetrics.hits + this.knowledgeMetrics.misses) > 0 
        ? this.knowledgeMetrics.hits / (this.knowledgeMetrics.hits + this.knowledgeMetrics.misses) 
        : 1.0,
      embeddingFailures: this.knowledgeMetrics.embeddingFailures,
      vectorFailures: this.knowledgeMetrics.vectorFailures,
    };
  }

  // ==========================================
  // CRM Observability Telemetry
  // ==========================================

  private crmMetrics = {
    leadCreationLatencies: [] as number[],
    customerLookupLatencies: [] as number[],
    pipelineUpdateLatencies: [] as number[],
    conversionRateEvents: 0,
    duplicateMergeEvents: 0,
    crmFailures: 0,
  };

  public recordCRMMetric(
    metricName: "lead_creation_latency" | "customer_lookup_latency" | "pipeline_update_latency" | "conversion_event" | "duplicate_merge" | "crm_failure",
    value: number
  ): void {
    if (metricName === "lead_creation_latency") {
      this.crmMetrics.leadCreationLatencies.push(value);
    } else if (metricName === "customer_lookup_latency") {
      this.crmMetrics.customerLookupLatencies.push(value);
    } else if (metricName === "pipeline_update_latency") {
      this.crmMetrics.pipelineUpdateLatencies.push(value);
    } else if (metricName === "conversion_event") {
      this.crmMetrics.conversionRateEvents += value;
    } else if (metricName === "duplicate_merge") {
      this.crmMetrics.duplicateMergeEvents += value;
    } else if (metricName === "crm_failure") {
      this.crmMetrics.crmFailures += value;
    }
  }

  public getCRMMetricsSummary() {
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      averageLeadCreationLatencyMs: avg(this.crmMetrics.leadCreationLatencies),
      averageCustomerLookupLatencyMs: avg(this.crmMetrics.customerLookupLatencies),
      averagePipelineUpdateLatencyMs: avg(this.crmMetrics.pipelineUpdateLatencies),
      conversionEvents: this.crmMetrics.conversionRateEvents,
      duplicateMerges: this.crmMetrics.duplicateMergeEvents,
      crmFailures: this.crmMetrics.crmFailures,
    };
  }

  // ==========================================
  // Conversation Observability Telemetry
  // ==========================================

  private conversationMetrics = {
    memoryRetrievalLatencies: [] as number[],
    promptCompilationLatencies: [] as number[],
    modelLatencies: [] as number[],
    messageThroughput: 0,
    conversationFailures: 0,
    escalationFrequency: 0,
  };

  public recordConversationMetric(
    metricName: "memory_retrieval_latency" | "prompt_compilation_latency" | "model_latency" | "message_throughput" | "conversation_failure" | "escalation",
    value: number
  ): void {
    if (metricName === "memory_retrieval_latency") {
      this.conversationMetrics.memoryRetrievalLatencies.push(value);
    } else if (metricName === "prompt_compilation_latency") {
      this.conversationMetrics.promptCompilationLatencies.push(value);
    } else if (metricName === "model_latency") {
      this.conversationMetrics.modelLatencies.push(value);
    } else if (metricName === "message_throughput") {
      this.conversationMetrics.messageThroughput += value;
    } else if (metricName === "conversation_failure") {
      this.conversationMetrics.conversationFailures += value;
    } else if (metricName === "escalation") {
      this.conversationMetrics.escalationFrequency += value;
    }
  }

  public getConversationMetricsSummary() {
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      averageMemoryRetrievalLatencyMs: avg(this.conversationMetrics.memoryRetrievalLatencies),
      averagePromptCompilationLatencyMs: avg(this.conversationMetrics.promptCompilationLatencies),
      averageModelLatencyMs: avg(this.conversationMetrics.modelLatencies),
      messageThroughput: this.conversationMetrics.messageThroughput,
      conversationFailures: this.conversationMetrics.conversationFailures,
      escalationFrequency: this.conversationMetrics.escalationFrequency,
    };
  }

  // ==========================================
  // Growth Observability Telemetry
  // ==========================================

  private growthMetrics = {
    policyEvaluationLatencies: [] as number[],
    executionLatencies: [] as number[],
    replayMatchLatencies: [] as number[],
    growthFailures: 0,
    growthExecutions: 0,
  };

  public recordGrowthMetric(
    metricName: "policy_evaluation_latency" | "execution_latency" | "replay_match_latency" | "growth_failure" | "growth_execution",
    value: number
  ): void {
    if (metricName === "policy_evaluation_latency") {
      this.growthMetrics.policyEvaluationLatencies.push(value);
    } else if (metricName === "execution_latency") {
      this.growthMetrics.executionLatencies.push(value);
    } else if (metricName === "replay_match_latency") {
      this.growthMetrics.replayMatchLatencies.push(value);
    } else if (metricName === "growth_failure") {
      this.growthMetrics.growthFailures += value;
    } else if (metricName === "growth_execution") {
      this.growthMetrics.growthExecutions += value;
    }
  }

  public getGrowthMetricsSummary() {
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      averagePolicyEvaluationLatencyMs: avg(this.growthMetrics.policyEvaluationLatencies),
      averageExecutionLatencyMs: avg(this.growthMetrics.executionLatencies),
      averageReplayMatchLatencyMs: avg(this.growthMetrics.replayMatchLatencies),
      growthFailures: this.growthMetrics.growthFailures,
      growthExecutions: this.growthMetrics.growthExecutions,
    };
  }

  // ==========================================
  // Scheduling Observability Telemetry
  // ==========================================

  private schedulingMetrics = {
    bookingLatencies: [] as number[],
    availabilityLatencies: [] as number[],
    reminderLatencies: [] as number[],
    calendarSyncLatencies: [] as number[],
    conflictDetectionLatencies: [] as number[],
    cancellations: 0,
    reschedules: 0,
    completions: 0,
    totalBookings: 0,
    workerUtilizations: [] as number[],
  };

  public recordSchedulingMetric(
    metricName: "booking_latency" | "availability_latency" | "reminder_latency" | "calendar_sync_latency" | "conflict_detection_latency" | "cancellation" | "reschedule" | "completion" | "booking" | "worker_utilization",
    value: number
  ): void {
    if (metricName === "booking_latency") {
      this.schedulingMetrics.bookingLatencies.push(value);
    } else if (metricName === "availability_latency") {
      this.schedulingMetrics.availabilityLatencies.push(value);
    } else if (metricName === "reminder_latency") {
      this.schedulingMetrics.reminderLatencies.push(value);
    } else if (metricName === "calendar_sync_latency") {
      this.schedulingMetrics.calendarSyncLatencies.push(value);
    } else if (metricName === "conflict_detection_latency") {
      this.schedulingMetrics.conflictDetectionLatencies.push(value);
    } else if (metricName === "cancellation") {
      this.schedulingMetrics.cancellations += value;
    } else if (metricName === "reschedule") {
      this.schedulingMetrics.reschedules += value;
    } else if (metricName === "completion") {
      this.schedulingMetrics.completions += value;
    } else if (metricName === "booking") {
      this.schedulingMetrics.totalBookings += value;
    } else if (metricName === "worker_utilization") {
      this.schedulingMetrics.workerUtilizations.push(value);
    }
  }

  public getSchedulingMetricsSummary() {
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const total = this.schedulingMetrics.totalBookings;
    return {
      averageBookingLatencyMs: avg(this.schedulingMetrics.bookingLatencies),
      averageAvailabilityLatencyMs: avg(this.schedulingMetrics.availabilityLatencies),
      averageReminderLatencyMs: avg(this.schedulingMetrics.reminderLatencies),
      averageCalendarSyncLatencyMs: avg(this.schedulingMetrics.calendarSyncLatencies),
      averageConflictDetectionLatencyMs: avg(this.schedulingMetrics.conflictDetectionLatencies),
      cancellations: this.schedulingMetrics.cancellations,
      reschedules: this.schedulingMetrics.reschedules,
      completions: this.schedulingMetrics.completions,
      cancellationRate: total > 0 ? this.schedulingMetrics.cancellations / total : 0.0,
      rescheduleRate: total > 0 ? this.schedulingMetrics.reschedules / total : 0.0,
      meetingCompletionRate: (this.schedulingMetrics.completions + this.schedulingMetrics.cancellations) > 0 
        ? this.schedulingMetrics.completions / (this.schedulingMetrics.completions + this.schedulingMetrics.cancellations) 
        : 1.0,
      averageWorkerUtilization: avg(this.schedulingMetrics.workerUtilizations),
    };
  }
}
