export type HealthStatus = "Healthy" | "Degraded" | "Unavailable" | "Initializing";
export type ModuleStatus = "REGISTERED" | "INITIALIZED" | "STARTED" | "STOPPED" | "FAILED";

export interface RuntimeModuleMetadata {
  name: string;
  version: string;
  dependencies: string[];
  health: HealthStatus;
  status: ModuleStatus;
}

export class ModuleRegistry {
  private modules = new Map<string, RuntimeModuleMetadata>();

  /**
   * Register a new module with the registry.
   */
  public register(module: Omit<RuntimeModuleMetadata, "health" | "status">): void {
    if (this.modules.has(module.name)) {
      throw new Error(`Module [${module.name}] is already registered.`);
    }

    this.modules.set(module.name, {
      ...module,
      health: "Initializing",
      status: "REGISTERED",
    });
  }

  /**
   * Retrieve module metadata by name.
   */
  public getModule(name: string): RuntimeModuleMetadata | null {
    return this.modules.get(name) || null;
  }

  /**
   * List all registered modules.
   */
  public listModules(): RuntimeModuleMetadata[] {
    return Array.from(this.modules.values());
  }

  /**
   * Update the health status of a module.
   */
  public updateHealth(name: string, health: HealthStatus): void {
    const mod = this.modules.get(name);
    if (!mod) {
      throw new Error(`Module [${name}] not found in registry.`);
    }
    mod.health = health;
    this.modules.set(name, mod);
  }

  /**
   * Update the execution status of a module.
   */
  public updateStatus(name: string, status: ModuleStatus): void {
    const mod = this.modules.get(name);
    if (!mod) {
      throw new Error(`Module [${name}] not found in registry.`);
    }
    mod.status = status;
    this.modules.set(name, mod);
  }

  /**
   * Validate that all registered modules' dependencies are satisfied.
   */
  public validateDependencies(): { isValid: boolean; missing: string[] } {
    const missing: string[] = [];
    const registeredNames = new Set(this.modules.keys());

    for (const mod of this.modules.values()) {
      for (const dep of mod.dependencies) {
        if (!registeredNames.has(dep)) {
          missing.push(`Module [${mod.name}] requires dependency [${dep}] which is not registered.`);
        }
      }
    }

    return {
      isValid: missing.length === 0,
      missing,
    };
  }

  /**
   * Reset the registry (for test teardowns).
   */
  public reset(): void {
    this.modules.clear();
  }
}
