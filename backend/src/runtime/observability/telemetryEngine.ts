import { ITelemetry } from "../interfaces/observability";
import { MetricEntry, EventEntry } from "./types";

export class TelemetryEngine implements ITelemetry {
  private metrics: MetricEntry[] = [];
  private events: EventEntry[] = [];
  private maxRetainedRecords = 10000;

  constructor() {}

  /**
   * Records a numerical telemetry metric.
   */
  public recordMetric(name: string, value: number, tags: Record<string, string> = {}): void {
    const entry: MetricEntry = {
      name,
      value,
      timestamp: new Date(),
      tags
    };

    this.metrics.push(entry);
    
    // Simple FIFO retention management
    if (this.metrics.length > this.maxRetainedRecords) {
      this.metrics.shift();
    }
  }

  /**
   * Records a telemetry event payload.
   */
  public recordEvent(name: string, payload: Record<string, unknown>): void {
    const entry: EventEntry = {
      name,
      timestamp: new Date(),
      payload
    };

    this.events.push(entry);

    if (this.events.length > this.maxRetainedRecords) {
      this.events.shift();
    }
  }

  /**
   * Queries metrics filtering by name and/or tags.
   */
  public getMetrics(name?: string, tags: Record<string, string> = {}): MetricEntry[] {
    return this.metrics.filter(m => {
      if (name && m.name !== name) return false;
      for (const [k, v] of Object.entries(tags)) {
        if (m.tags[k] !== v) return false;
      }
      return true;
    });
  }

  /**
   * Queries events matching a name.
   */
  public getEvents(name?: string): EventEntry[] {
    if (!name) return this.events;
    return this.events.filter(e => e.name === name);
  }

  /**
   * Applies a retention policy to delete logs older than a specific date threshold.
   */
  public prune(olderThan: Date): void {
    const cutoffTime = olderThan.getTime();
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() >= cutoffTime);
    this.events = this.events.filter(e => e.timestamp.getTime() >= cutoffTime);
  }

  /**
   * Resets collected telemetry arrays.
   */
  public clear(): void {
    this.metrics = [];
    this.events = [];
  }
}
