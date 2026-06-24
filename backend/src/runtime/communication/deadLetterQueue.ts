export interface DqItem {
  id: string;
  topic: string;
  payload: any;
  correlationId: string;
  errorReason: string;
  failedAt: Date;
  retryCount: number;
  quarantined: boolean;
}

export class DeadLetterQueue {
  private queue = new Map<string, DqItem>();

  /**
   * Put a failed event into the DLQ quarantine.
   */
  public quarantine(topic: string, payload: any, correlationId: string, errorReason: string): string {
    const id = "dlq_" + Math.random().toString(36).substring(2, 10);
    this.queue.set(id, {
      id,
      topic,
      payload,
      correlationId,
      errorReason,
      failedAt: new Date(),
      retryCount: 0,
      quarantined: true
    });
    console.error(`[DLQ] Quarantined failed event on [${topic}]. Reason: ${errorReason}`);
    return id;
  }

  /**
   * Retrieve all quarantined items.
   */
  public listQuarantined(): DqItem[] {
    return Array.from(this.queue.values()).filter(item => item.quarantined);
  }

  /**
   * Trigger a retry for a quarantined event.
   */
  public retry(id: string): { success: boolean; payload?: any; topic?: string } {
    const item = this.queue.get(id);
    if (item && item.quarantined) {
      item.retryCount += 1;
      // If it has retried too many times (e.g. 3), keep in quarantine but increment attempts
      if (item.retryCount >= 3) {
        console.warn(`[DLQ] Event [${id}] has exceeded max retries in DLQ.`);
        return { success: false };
      }
      
      return {
        success: true,
        payload: item.payload,
        topic: item.topic
      };
    }
    return { success: false };
  }

  /**
   * Mark an item as resolved or discarded.
   */
  public discard(id: string): void {
    const item = this.queue.get(id);
    if (item) {
      item.quarantined = false;
      this.queue.set(id, item);
    }
  }

  /**
   * Reset DLQ (for tests).
   */
  public reset(): void {
    this.queue.clear();
  }
}
