export class FeatureFlagEngine {
  private flags = new Map<string, boolean>();

  constructor() {
    this.loadFromEnv();
  }

  private loadFromEnv(): void {
    this.flags.set("shadowMode", process.env.FF_SHADOW_MODE === "true");
    this.flags.set("circuitBreaker", process.env.FF_CIRCUIT_BREAKER !== "false");
    this.flags.set("learningRegistry", process.env.FF_LEARNING_REGISTRY === "true");
    this.flags.set("simulationEngine", process.env.FF_SIMULATION_ENGINE === "true");
    
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("FF_")) {
        const flagName = this.camelCase(key.replace("FF_", ""));
        this.flags.set(flagName, value === "true");
      }
    }
  }

  public isEnabled(flagName: string, context?: { tenantId?: string; actorId?: string }): boolean {
    const flag = this.flags.get(flagName);
    
    if (flag === undefined) {
      return false;
    }

    if (context && context.tenantId) {
      const tenantOverride = process.env[`FF_${this.snakeCase(flagName).toUpperCase()}_BYPASS_TENANTS`] || "";
      const bypassedTenants = tenantOverride.split(",").map(t => t.trim()).filter(Boolean);
      if (bypassedTenants.includes(context.tenantId)) {
        return false;
      }
    }

    return flag;
  }

  public setFlag(flagName: string, value: boolean): void {
    this.flags.set(flagName, value);
  }

  public getAllFlags(): Record<string, boolean> {
    const snapshot: Record<string, boolean> = {};
    for (const [k, v] of this.flags.entries()) {
      snapshot[k] = v;
    }
    return snapshot;
  }

  private camelCase(str: string): string {
    return str.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private snakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  public reset(): void {
    this.flags.clear();
    this.loadFromEnv();
  }
}
