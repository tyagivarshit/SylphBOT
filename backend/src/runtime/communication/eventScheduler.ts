export interface ScheduledEvent {
  id: string;
  topic: string;
  payload: any;
  executeAt: Date;
  recurringExpression?: string;
  status: "scheduled" | "executed" | "expired" | "cancelled";
}

export class EventScheduler {
  private jobs = new Map<string, ScheduledEvent>();

  /**
   * Schedule a future publishing task.
   * delayOrTime can be a delay in milliseconds or a specific future Date.
   */
  public schedule(topic: string, payload: any, delayOrTime: number | Date, recurringExpression?: string): string {
    const id = this.generateId();
    const executeAt = delayOrTime instanceof Date ? delayOrTime : new Date(Date.now() + delayOrTime);

    this.jobs.set(id, {
      id,
      topic,
      payload,
      executeAt,
      recurringExpression,
      status: "scheduled"
    });

    console.log(`[Event Scheduler] Scheduled event [${topic}] to trigger at ${executeAt.toISOString()}`);
    return id;
  }

  /**
   * Cancel a scheduled event.
   */
  public cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (job && job.status === "scheduled") {
      job.status = "cancelled";
      this.jobs.set(id, job);
      return true;
    }
    return false;
  }

  /**
   * Check for events that are due to execute and transition their state.
   */
  public tick(now: Date = new Date()): ScheduledEvent[] {
    const dueEvents: ScheduledEvent[] = [];

    for (const job of this.jobs.values()) {
      if (job.status === "scheduled" && job.executeAt.getTime() <= now.getTime()) {
        job.status = "executed";
        this.jobs.set(job.id, job);
        dueEvents.push(job);

        // If it's recurring, schedule the next iteration (mock expression handler - increments by 60s for test simulation)
        if (job.recurringExpression) {
          const nextRun = new Date(job.executeAt.getTime() + 60000);
          this.schedule(job.topic, job.payload, nextRun, job.recurringExpression);
        }
      }
    }

    return dueEvents;
  }

  /**
   * List all scheduled jobs.
   */
  public getJobs(): ScheduledEvent[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Reset scheduler (for tests).
   */
  public reset(): void {
    this.jobs.clear();
  }

  private generateId(): string {
    return "sch_" + Math.random().toString(36).substring(2, 10);
  }
}
