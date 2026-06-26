import { IRuntimeGovernanceEngine, PluginLifecycleState, GovernancePolicy, PluginLifecycleEvent } from "./interfaces";
import { OigSecurityContext } from "../oig/interfaces";
import { getRequestContext } from "../../observability/requestContext";

const ALLOWED_TRANSITIONS: Record<PluginLifecycleState, PluginLifecycleState[]> = {
  Installed: ["Validated", "Failed"],
  Validated: ["Loaded", "Failed"],
  Loaded: ["Initializing", "Failed"],
  Initializing: ["Running", "Failed"],
  Running: ["Paused", "Updating", "Migrating", "Deprecated", "Failed"],
  Paused: ["Running", "Updating", "Retired", "Failed"],
  Updating: ["Running", "Failed"],
  Migrating: ["Running", "Failed"],
  Deprecated: ["Retired", "Failed"],
  Retired: [],
  Failed: ["Initializing", "Updating", "Retired"]
};

export class RuntimeGovernanceEngine implements IRuntimeGovernanceEngine {
  private pluginStates = new Map<string, PluginLifecycleState>();
  private policies = new Map<string, GovernancePolicy>();
  private frozenTenants = new Set<string>();
  
  private container: any;
  private eventBus: any;

  constructor(container: any, eventBus: any) {
    this.container = container;
    this.eventBus = eventBus;

    // Register a default runtime freeze check policy
    this.registerPolicy({
      id: "policy.freeze_check",
      name: "Enforce write locks during active Runtime Freeze",
      type: "FreezeRule",
      evaluate: (ctx, input) => {
        const tenantId = ctx.tenantId;
        if (this.frozenTenants.has(tenantId)) {
          // Allow admins to bypass freeze
          const isAdmin = ctx.roles?.includes("ADMIN") || ctx.scopes?.includes("oig:admin");
          if (!isAdmin && input.action === "write") {
            return { allowed: false, reason: `Runtime Freeze Policy Violation: Tenant [${tenantId}] is frozen. Write operations are blocked.` };
          }
        }
        return { allowed: true };
      }
    });

    // Register a default compatibility policy (Phase 5 requirement)
    this.registerPolicy({
      id: "policy.plugin_compatibility",
      name: "Enforce plugin version compatibility checks",
      type: "CompatibilityRule",
      evaluate: (ctx, input) => {
        const { version, requiredMinVersion } = input;
        if (version && requiredMinVersion) {
          const vNum = parseFloat(version);
          const minNum = parseFloat(requiredMinVersion);
          if (vNum < minNum) {
            return { allowed: false, reason: `Compatibility Violation: Plugin version [${version}] is below required minimum [${requiredMinVersion}].` };
          }
        }
        return { allowed: true };
      }
    });
  }

  // ==========================================
  // PLUGIN LIFECYCLE MANAGER (Phase 4)
  // ==========================================

  public getPluginState(pluginId: string): PluginLifecycleState {
    return this.pluginStates.get(pluginId) || "Installed";
  }

  public async transitionPlugin(pluginId: string, targetState: PluginLifecycleState, ctx?: OigSecurityContext): Promise<void> {
    const currentState = this.getPluginState(pluginId);
    
    // Validate state transition (if not transitioning to Fail state from anywhere)
    if (targetState !== "Failed") {
      const allowed = ALLOWED_TRANSITIONS[currentState] || [];
      if (!allowed.includes(targetState)) {
        throw new Error(`Plugin Lifecycle Violation: Transition from state [${currentState}] to [${targetState}] is not permitted for plugin [${pluginId}].`);
      }
    }

    this.pluginStates.set(pluginId, targetState);

    // Record observability transition count if graph engine is available
    if (this.container && this.container.has("IOrganizationIntelligenceGraph")) {
      const graph = this.container.resolve("IOrganizationIntelligenceGraph");
      if (typeof graph.recordTelemetryMetric === "function") {
        graph.recordTelemetryMetric("pluginLifecycleTransitionsCount", 1);
      }
    }

    // Publish event to Event Bus (Phase 4 requirement)
    if (this.eventBus) {
      const tenantId = ctx?.tenantId || "default_tenant";
      try {
        await this.eventBus.publish("plugin.lifecycle.transitioned", "1.0.0", {
          pluginId,
          oldState: currentState,
          newState: targetState,
          timestamp: new Date()
        }, { tenantId });
      } catch (err) {
        // Safe to ignore or log
      }
    }
  }

  // ==========================================
  // RUNTIME GOVERNANCE (Phase 5)
  // ==========================================

  public registerPolicy(policy: GovernancePolicy): void {
    if (this.policies.has(policy.id)) {
      throw new Error(`Governance policy with ID [${policy.id}] already registered.`);
    }
    this.policies.set(policy.id, policy);
  }

  public evaluatePolicy(policyId: string, ctx: OigSecurityContext, input: any): { allowed: boolean; reason?: string } {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Governance policy [${policyId}] is not registered.`);
    }

    const start = Date.now();
    try {
      const result = policy.evaluate(ctx, input);
      
      // Log governance execution count in graph observability
      if (this.container && this.container.has("IOrganizationIntelligenceGraph")) {
        const graph = this.container.resolve("IOrganizationIntelligenceGraph");
        if (typeof graph.recordTelemetryMetric === "function") {
          graph.recordTelemetryMetric("governancePolicyExecutionsCount", 1);
          if (!result.allowed) {
            graph.recordTelemetryMetric("runtimeGovernanceViolationsCount", 1);
          }
        }
      }

      return result;
    } finally {
      // Intent resolution latency or governance tracking can be recorded here
    }
  }

  public isRuntimeFrozen(tenantId: string): boolean {
    return this.frozenTenants.has(tenantId);
  }

  public setRuntimeFreeze(tenantId: string, freeze: boolean, ctx: OigSecurityContext): void {
    // Identity & role validation
    const isAdmin = ctx.roles?.includes("ADMIN") || ctx.scopes?.includes("oig:admin");
    if (!isAdmin) {
      throw new Error("Security Violation: Only administrators can modify Runtime Freeze status.");
    }
    
    if (freeze) {
      this.frozenTenants.add(tenantId);
    } else {
      this.frozenTenants.delete(tenantId);
    }
  }
}
