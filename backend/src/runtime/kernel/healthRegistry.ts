export type HealthStatus = "Healthy" | "Degraded" | "Unavailable";
export type ReadinessStatus = "Ready" | "Not Ready";
export type LivenessStatus = "Alive" | "Dead";
export type StartupStatus = "Initializing" | "Started" | "Failed";
export type DependencyHealth = "Dependency Healthy" | "Dependency Degraded" | "Dependency Unavailable";

export interface ModuleHealthReport {
  moduleName: string;
  health: HealthStatus;
  readiness: ReadinessStatus;
  liveness: LivenessStatus;
  startup: StartupStatus;
  dependencyHealth: DependencyHealth;
  reason?: string;
  lastCheckAt: Date;
}

export interface AggregateHealthReport {
  health: HealthStatus;
  readiness: ReadinessStatus;
  liveness: LivenessStatus;
  dependencyHealth: DependencyHealth;
  modulesCount: number;
}

export class HealthRegistry {
  private healthReports = new Map<string, ModuleHealthReport>();
  private changeListeners: Array<(report: ModuleHealthReport) => void> = [];

  /**
   * Set or update all health statuses for a module.
   */
  public setHealth(
    moduleName: string,
    status: {
      health: HealthStatus;
      readiness: ReadinessStatus;
      liveness: LivenessStatus;
      startup: StartupStatus;
      dependencyHealth: DependencyHealth;
      reason?: string;
    }
  ): void {
    const report: ModuleHealthReport = {
      moduleName,
      health: status.health,
      readiness: status.readiness,
      liveness: status.liveness,
      startup: status.startup,
      dependencyHealth: status.dependencyHealth,
      reason: status.reason,
      lastCheckAt: new Date(),
    };

    const previous = this.healthReports.get(moduleName);
    this.healthReports.set(moduleName, report);

    if (
      !previous ||
      previous.health !== report.health ||
      previous.readiness !== report.readiness ||
      previous.liveness !== report.liveness ||
      previous.startup !== report.startup ||
      previous.dependencyHealth !== report.dependencyHealth ||
      previous.reason !== report.reason
    ) {
      this.notifyListeners(report);
    }
  }

  /**
   * Quick update helper for simple state changes.
   */
  public updateHealthStatus(moduleName: string, health: HealthStatus, reason?: string): void {
    const existing = this.healthReports.get(moduleName) || {
      moduleName,
      health: "Unavailable",
      readiness: "Not Ready",
      liveness: "Dead",
      startup: "Initializing",
      dependencyHealth: "Dependency Unavailable",
      lastCheckAt: new Date(),
    };

    this.setHealth(moduleName, {
      ...existing,
      health,
      reason: reason || existing.reason,
    });
  }

  /**
   * Get health report of a module.
   */
  public getHealth(moduleName: string): ModuleHealthReport | null {
    return this.healthReports.get(moduleName) || null;
  }

  /**
   * List all current health reports.
   */
  public getReports(): ModuleHealthReport[] {
    return Array.from(this.healthReports.values());
  }

  /**
   * Get the aggregate health of the entire Runtime.
   */
  public getAggregateHealth(): AggregateHealthReport {
    const reports = this.getReports();
    if (reports.length === 0) {
      return {
        health: "Healthy",
        readiness: "Ready",
        liveness: "Alive",
        dependencyHealth: "Dependency Healthy",
        modulesCount: 0,
      };
    }

    let hasUnavailable = false;
    let hasDegraded = false;
    let hasNotReady = false;
    let hasDead = false;
    let hasDepUnavailable = false;
    let hasDepDegraded = false;

    for (const r of reports) {
      if (r.health === "Unavailable") hasUnavailable = true;
      if (r.health === "Degraded") hasDegraded = true;
      if (r.readiness === "Not Ready") hasNotReady = true;
      if (r.liveness === "Dead") hasDead = true;
      if (r.dependencyHealth === "Dependency Unavailable") hasDepUnavailable = true;
      if (r.dependencyHealth === "Dependency Degraded") hasDepDegraded = true;
    }

    return {
      health: hasUnavailable ? "Unavailable" : hasDegraded ? "Degraded" : "Healthy",
      readiness: hasNotReady ? "Not Ready" : "Ready",
      liveness: hasDead ? "Dead" : "Alive",
      dependencyHealth: hasDepUnavailable
        ? "Dependency Unavailable"
        : hasDepDegraded
        ? "Dependency Degraded"
        : "Dependency Healthy",
      modulesCount: reports.length,
    };
  }

  /**
   * Register a listener for module health updates.
   */
  public onHealthChange(callback: (report: ModuleHealthReport) => void): void {
    this.changeListeners.push(callback);
  }

  private notifyListeners(report: ModuleHealthReport): void {
    for (const listener of this.changeListeners) {
      try {
        listener(report);
      } catch (err) {
        console.error(`Error in health change listener:`, err);
      }
    }
  }

  /**
   * Clear health logs (for tests).
   */
  public reset(): void {
    this.healthReports.clear();
    this.changeListeners = [];
  }
}
