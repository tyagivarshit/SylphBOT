import { ContractRegistry } from "./contractRegistry";
import { CorrelationEngine, CorrelationContext } from "./correlationEngine";
import { EventScheduler } from "./eventScheduler";
import { DeadLetterQueue } from "./deadLetterQueue";
import { RoutingEngine } from "./routingEngine";

export interface EventEnvelope {
  id: string;
  topic: string;
  version: string;
  payload: any;
  metadata: {
    tenantId: string;
    timestamp: Date;
    priority: "high" | "medium" | "low";
    status: "received" | "processing" | "completed" | "failed" | "dlq";
  };
  correlation: CorrelationContext;
}

export type EventCallback = (envelope: EventEnvelope) => void | Promise<void>;

export class EventBus {
  private contractRegistry: ContractRegistry;
  private correlationEngine: CorrelationEngine;
  private eventScheduler: EventScheduler;
  private dlq: DeadLetterQueue;
  private routingEngine?: RoutingEngine;

  // Persistence storage block for replaying
  private eventStore: EventEnvelope[] = [];
  
  // Subscribers map: topic -> priority-categorized callbacks
  private subscribers = new Map<string, Array<{
    priority: "high" | "medium" | "low";
    callback: EventCallback;
  }>>();

  constructor(
    contractRegistry: ContractRegistry,
    correlationEngine: CorrelationEngine,
    eventScheduler: EventScheduler,
    dlq: DeadLetterQueue,
    routingEngine?: RoutingEngine
  ) {
    this.contractRegistry = contractRegistry;
    this.correlationEngine = correlationEngine;
    this.eventScheduler = eventScheduler;
    this.dlq = dlq;
    this.routingEngine = routingEngine;
  }

  /**
   * Publish an event.
   */
  public async publish(
    topic: string,
    version: string,
    payload: any,
    options: {
      tenantId: string;
      priority?: "high" | "medium" | "low";
      parentCorrelation?: CorrelationContext;
      delayMs?: number;
    }
  ): Promise<string> {
    const eventId = "evt_" + Math.random().toString(36).substring(2, 12);
    const priority = options.priority || "medium";

    // 1. If a delayed execution is specified, forward to EventScheduler
    if (options.delayMs && options.delayMs > 0) {
      const scheduledId = this.eventScheduler.schedule(topic, { payload, version, options }, options.delayMs);
      return scheduledId;
    }

    // 2. Validate payload against registered Contract Registry schemas
    const validation = this.contractRegistry.validateEvent(topic, version, payload);
    if (!validation.isValid) {
      const errorMsg = `Contract Validation Failed: ${validation.errors.join("; ")}`;
      // Quarantines automatically in Dead Letter Queue (DLQ)
      this.dlq.quarantine(topic, payload, options.parentCorrelation?.correlationId || "unknown", errorMsg);
      throw new Error(errorMsg);
    }

    // 3. Trace tracking correlation context binding
    const correlation = this.correlationEngine.createContext(options.parentCorrelation);
    const extendedCorrelation = this.correlationEngine.extendContext(correlation, `publish:${topic}`, eventId);

    const envelope: EventEnvelope = {
      id: eventId,
      topic,
      version,
      payload,
      metadata: {
        tenantId: options.tenantId,
        timestamp: new Date(),
        priority,
        status: "received"
      },
      correlation: extendedCorrelation
    };

    // 4. Persistence storage (for replay support)
    this.eventStore.push(envelope);

    // 5. Asynchronous dispatching
    void this.dispatchEvent(envelope);

    return eventId;
  }

  /**
   * Subscribe to a topic with priority routing.
   */
  public subscribe(
    topic: string,
    callback: EventCallback,
    priority: "high" | "medium" | "low" = "medium"
  ): void {
    const list = this.subscribers.get(topic) || [];
    list.push({ priority, callback });
    // Keep priority order: high -> medium -> low
    list.sort((a, b) => {
      const priorities = { high: 3, medium: 2, low: 1 };
      return priorities[b.priority] - priorities[a.priority];
    });
    this.subscribers.set(topic, list);
  }

  /**
   * Unsubscribe from a topic.
   */
  public unsubscribe(topic: string, callback: EventCallback): void {
    const list = this.subscribers.get(topic);
    if (list) {
      const filtered = list.filter(item => item.callback !== callback);
      this.subscribers.set(topic, filtered);
    }
  }

  /**
   * Broadcast an event to all subscribers matching wildcard topic prefixes.
   */
  public async broadcast(topic: string, version: string, payload: any, tenantId: string): Promise<void> {
    const eventId = "evt_bc_" + Math.random().toString(36).substring(2, 12);
    const correlation = this.correlationEngine.createContext();

    const envelope: EventEnvelope = {
      id: eventId,
      topic,
      version,
      payload,
      metadata: {
        tenantId,
        timestamp: new Date(),
        priority: "medium",
        status: "received"
      },
      correlation
    };

    this.eventStore.push(envelope);

    // Dispatch to subscribers matching wildcard or exact topic name
    for (const [subTopic, subList] of this.subscribers.entries()) {
      if (subTopic === topic || subTopic === "*") {
        for (const item of subList) {
          try {
            await item.callback(envelope);
          } catch (err) {
            console.error(`[Event Bus] Broadcast failed for subscriber [${subTopic}]:`, err);
          }
        }
      }
    }
  }

  /**
   * Replay events from the store matching filters.
   */
  public replay(
    topic: string,
    offset = 0,
    filter?: { tenantId?: string; startFrom?: Date }
  ): EventEnvelope[] {
    let list = this.eventStore.filter(evt => evt.topic === topic);
    
    if (filter) {
      if (filter.tenantId) {
        list = list.filter(evt => evt.metadata.tenantId === filter.tenantId);
      }
      if (filter.startFrom) {
        list = list.filter(evt => evt.metadata.timestamp.getTime() >= filter.startFrom!.getTime());
      }
    }

    return list.slice(offset);
  }

  /**
   * Process and route tick-based scheduled events.
   */
  public async processScheduledEvents(now: Date = new Date()): Promise<void> {
    const due = this.eventScheduler.tick(now);
    for (const job of due) {
      try {
        const { payload, version, options } = job.payload;
        await this.publish(job.topic, version, payload, {
          ...options,
          delayMs: 0 // clear delay to prevent rescheduling
        });
      } catch (err) {
        console.error(`[Event Bus] Scheduled job [${job.id}] dispatch failed:`, err);
      }
    }
  }

  private async dispatchEvent(envelope: EventEnvelope): Promise<void> {
    envelope.metadata.status = "processing";
    const topicSubscribers = this.subscribers.get(envelope.topic) || [];
    
    // Add global wildcard subscribers if any
    const wildcardSubscribers = this.subscribers.get("*") || [];
    const allSubs = [...topicSubscribers, ...wildcardSubscribers];

    if (allSubs.length === 0) {
      envelope.metadata.status = "completed"; // No active receivers
      return;
    }

    let successCount = 0;
    let failReason = "";

    for (const sub of allSubs) {
      try {
        await sub.callback(envelope);
        successCount++;
      } catch (err) {
        failReason = String(err);
        console.error(`[Event Bus] Event [${envelope.id}] dispatch failed:`, err);
      }
    }

    if (successCount === allSubs.length) {
      envelope.metadata.status = "completed";
    } else {
      envelope.metadata.status = "failed";
      // Forward to Dead Letter Queue (DLQ) for analysis
      this.dlq.quarantine(envelope.topic, envelope.payload, envelope.correlation.correlationId, failReason);
    }
  }

  /**
   * Clear in-memory event stores (for tests).
   */
  public reset(): void {
    this.eventStore = [];
    this.subscribers.clear();
  }
}
