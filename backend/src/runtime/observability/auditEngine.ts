import { AuditRecord } from "./types";

export class AuditEngine {
  private audits: AuditRecord[] = [];
  private maxRetained = 20000;

  constructor() {}

  /**
   * Appends an immutable audit log record.
   */
  public logAudit(
    tenantId: string,
    action: string,
    userId: string,
    details: Record<string, any>
  ): void {
    const id = `aud_${tenantId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const record: AuditRecord = {
      id,
      tenantId,
      userId,
      action,
      timestamp: new Date(),
      details,
      version: "1.0.0"
    };

    this.audits.push(record);

    if (this.audits.length > this.maxRetained) {
      this.audits.shift(); // FIFO retention
    }
  }

  /**
   * Resolves tenant-isolated audit trail logs.
   */
  public getAuditHistory(tenantId: string): AuditRecord[] {
    return this.audits.filter(a => a.tenantId === tenantId);
  }

  /**
   * Applies cleanup policy based on dates.
   */
  public prune(olderThan: Date): void {
    const cutoff = olderThan.getTime();
    this.audits = this.audits.filter(a => a.timestamp.getTime() >= cutoff);
  }

  /**
   * Clears audit logs (for testing).
   */
  public clear(): void {
    this.audits = [];
  }
}
