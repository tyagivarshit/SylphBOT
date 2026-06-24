import { AlertRule, AlertRecord } from "./types";

export class AlertEngine {
  private rules = new Map<string, AlertRule>();
  private alerts: AlertRecord[] = [];

  constructor() {
    // Register some default platform alert rules
    this.registerRule({
      id: "rule_high_failure_rate",
      metricName: "failureRate",
      threshold: 0.1, // 10% limit
      operator: "gt",
      severity: "critical",
      escalationPath: ["ops_pager", "sys_architect"]
    });

    this.registerRule({
      id: "rule_high_latency",
      metricName: "averageLatencyMs",
      threshold: 2000, // 2s limit
      operator: "gt",
      severity: "warning",
      escalationPath: ["dev_team"]
    });
  }

  /**
   * Registers a custom alert threshold rule.
   */
  public registerRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Scans metrics and costs, raising alert entries on threshold breaches.
   */
  public evaluateRules(
    tenantId: string,
    metrics: Record<string, number>,
    tenantCost = 0
  ): AlertRecord[] {
    const raisedAlerts: AlertRecord[] = [];

    for (const rule of this.rules.values()) {
      let valueToTest = 0;
      
      if (rule.metricName === "cost") {
        valueToTest = tenantCost;
      } else if (rule.metricName in metrics) {
        valueToTest = metrics[rule.metricName];
      } else {
        continue; // Metric not found in current payload
      }

      let triggered = false;
      if (rule.operator === "gt" && valueToTest > rule.threshold) {
        triggered = true;
      } else if (rule.operator === "lt" && valueToTest < rule.threshold) {
        triggered = true;
      } else if (rule.operator === "eq" && valueToTest === rule.threshold) {
        triggered = true;
      }

      if (triggered) {
        const id = `alert_${tenantId}_${rule.id}_${Date.now()}`;
        
        // Avoid duplicate active alerts for same rule/tenant
        const exists = this.alerts.some(a => a.ruleId === rule.id && a.tenantId === tenantId && !a.resolved);
        if (!exists) {
          const alert: AlertRecord = {
            id,
            ruleId: rule.id,
            tenantId,
            severity: rule.severity,
            message: `Alert triggered on rule [${rule.id}]: ${rule.metricName} is ${valueToTest} (threshold: ${rule.threshold})`,
            timestamp: new Date(),
            resolved: false
          };
          this.alerts.push(alert);
          raisedAlerts.push(alert);
        }
      }
    }

    return raisedAlerts;
  }

  /**
   * Resolves a raised alert.
   */
  public resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
    }
  }

  /**
   * Gets alerts.
   */
  public getAlerts(tenantId: string, onlyActive = true): AlertRecord[] {
    return this.alerts.filter(a => a.tenantId === tenantId && (!onlyActive || !a.resolved));
  }

  /**
   * Clears alerts registry (for testing).
   */
  public clear(): void {
    this.alerts = [];
  }
}
