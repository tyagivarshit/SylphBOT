import { DIContainer, container } from "../kernel/diContainer";
import { SystemHealthStatus } from "./types";

export class HealthMonitor {
  private diContainer: DIContainer;

  constructor(diContainer: DIContainer = container) {
    this.diContainer = diContainer;
  }

  /**
   * Performs a liveness check (is the system process responsive?).
   */
  public checkLiveness(): "Alive" | "Dead" {
    // Process is running and DI Container is accessible, meaning Alive
    return this.diContainer ? "Alive" : "Dead";
  }

  /**
   * Performs a readiness check (are all runtime subsystems fully bootstrapped?).
   */
  public checkReadiness(): "Ready" | "Not Ready" {
    try {
      if (this.diContainer.has("IStateManager")) {
        const stateManager = this.diContainer.resolve<any>("IStateManager");
        const ready = stateManager.get("system.ready");
        return ready === true ? "Ready" : "Not Ready";
      }
    } catch {
      // Fail-silent
    }
    
    // Fallback check: check if critical engines are registered in DI
    const coreRegistered = 
      this.diContainer.has("IConfigManager") &&
      this.diContainer.has("IMemoryEngine") &&
      this.diContainer.has("IToolExecutor");

    return coreRegistered ? "Ready" : "Not Ready";
  }

  /**
   * Resolves aggregated component statuses, availability metrics, and dependency states.
   */
  public aggregateSystemHealth(): SystemHealthStatus {
    const components: Record<string, { health: string; message: string }> = {};
    
    // 1. Kernel Health
    const hasKernel = this.diContainer.has("IConfigManager") && this.diContainer.has("ILifecycleManager");
    components["runtime.kernel"] = {
      health: hasKernel ? "Healthy" : "Failed",
      message: hasKernel ? "Kernel engines active." : "Kernel manager interfaces missing."
    };

    // 2. Communication Health
    const hasComm = this.diContainer.has("IContractRegistry");
    components["runtime.communication"] = {
      health: hasComm ? "Healthy" : "Failed",
      message: hasComm ? "Event communication active." : "Contract registries missing."
    };

    // 3. Intelligence Health
    const hasIntel = this.diContainer.has("IConstitutionIntegrationLayer") && this.diContainer.has("IMemoryEngine");
    components["runtime.intelligence"] = {
      health: hasIntel ? "Healthy" : "Failed",
      message: hasIntel ? "Intelligence context engines active." : "Memory or Constitution layers missing."
    };

    // 4. Execution Health
    const hasExec = this.diContainer.has("IToolExecutor") && this.diContainer.has("IToolRegistry");
    components["runtime.execution"] = {
      health: hasExec ? "Healthy" : "Failed",
      message: hasExec ? "Tool execution engine active." : "Executors or Registries missing."
    };

    // Calculate aggregated score
    const states = Object.values(components).map(c => c.health);
    let health: "Healthy" | "Degraded" | "Failed" = "Healthy";

    if (states.every(s => s === "Healthy")) {
      health = "Healthy";
    } else if (states.some(s => s === "Failed")) {
      health = "Failed";
    } else {
      health = "Degraded";
    }

    return {
      health,
      readiness: this.checkReadiness(),
      liveness: this.checkLiveness(),
      timestamp: new Date(),
      components
    };
  }
}
