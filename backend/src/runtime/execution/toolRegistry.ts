import { IToolRegistry, ToolDefinition } from "../interfaces/execution";
import { ExtendedToolDefinition } from "./types";
import { container } from "../kernel/diContainer";

export class ToolRegistry implements IToolRegistry {
  private tools = new Map<string, ExtendedToolDefinition>();

  constructor() {}

  /**
   * Registers a tool. Supports auto-upgrading normal ToolDefinitions to ExtendedToolDefinitions.
   */
  public registerTool(tool: ToolDefinition | ExtendedToolDefinition): void {
    if (!tool.name) {
      throw new Error("Tool registration failed: name is required.");
    }

    const version = (tool as any).version || "1.0.0";
    const permissions = (tool as any).permissions || [];
    const health = (tool as any).health || "Healthy";
    const capabilities = (tool as any).capabilities || [tool.name];
    const ownerTenantId = (tool as any).ownerTenantId;

    const incoming: ExtendedToolDefinition = {
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      execute: tool.execute,
      version,
      permissions,
      health,
      capabilities,
      ownerTenantId
    };

    // Capability validation
    if (!Array.isArray(incoming.capabilities)) {
      throw new Error(`Tool [${tool.name}] capability validation failed: capabilities must be an array.`);
    }

    // Compatibility check
    const compEngine = container.has("ICompatibilityEngine")
      ? container.resolve<any>("ICompatibilityEngine")
      : null;
    
    if (compEngine && !compEngine.isCapabilityVersionSupported(incoming.version)) {
      throw new Error(`Tool [${tool.name}] version [${incoming.version}] is not supported by CompatibilityEngine.`);
    }

    const existing = this.tools.get(tool.name);
    if (existing) {
      // Ownership validation
      if (existing.ownerTenantId !== incoming.ownerTenantId) {
        throw new Error(`Tool [${tool.name}] ownership validation failed: Cannot overwrite tool owned by tenant [${existing.ownerTenantId}] with tenant [${incoming.ownerTenantId}].`);
      }

      // Duplicate detection & version check
      if (existing.version === incoming.version) {
        // Signature comparison
        const existingSig = JSON.stringify({ schema: existing.schema, permissions: existing.permissions, capabilities: existing.capabilities });
        const incomingSig = JSON.stringify({ schema: incoming.schema, permissions: incoming.permissions, capabilities: incoming.capabilities });
        
        if (existingSig === incomingSig) {
          // Two identical tools -> Reuse (log and keep the existing tool)
          console.warn(`[Tool Registry] Idempotent tool registration: [${tool.name}] v[${incoming.version}] already registered with identical signature. Reusing existing.`);
          return;
        } else {
          // Signature conflict
          throw new Error(`Tool [${tool.name}] v[${incoming.version}] is already registered with a different signature. Duplicate registration rejected.`);
        }
      } else {
        // Validate schema compatibility
        const isCompatible = this.checkSchemaCompatibility(existing.schema, incoming.schema);
        if (!isCompatible) {
          throw new Error(`Tool [${tool.name}] version [${incoming.version}] is incompatible with existing version [${existing.version}].`);
        }

        console.log(`[Tool Registry] Upgrading tool [${tool.name}] from v[${existing.version}] to v[${incoming.version}] safely.`);
      }
    }

    this.tools.set(incoming.name, incoming);
    console.log(`[Tool Registry] Registered tool [${incoming.name}] v[${incoming.version}]`);
  }

  /**
   * Gets a tool by name.
   */
  public getTool(name: string): ExtendedToolDefinition | null {
    return this.tools.get(name) || null;
  }

  /**
   * Lists all registered tools.
   */
  public listTools(): ExtendedToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Updates health status of a tool (e.g. Healthy, Degraded, Failed)
   */
  public updateToolHealth(name: string, health: "Healthy" | "Degraded" | "Failed"): void {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool [${name}] not found to update health.`);
    }
    tool.health = health;
    this.tools.set(name, tool);
  }

  /**
   * Finds tools mapped to a specific capability.
   */
  public findToolsForCapability(capability: string): ExtendedToolDefinition[] {
    const matched: ExtendedToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      if (tool.capabilities.includes(capability)) {
        matched.push(tool);
      }
    }
    return matched;
  }

  /**
   * Resets registry contents (useful for testing)
   */
  public reset(): void {
    this.tools.clear();
  }

  private checkSchemaCompatibility(oldSchema: any, newSchema: any): boolean {
    if (!oldSchema || !newSchema) return true;
    if (typeof oldSchema !== "object" || typeof newSchema !== "object") return true;

    if (oldSchema.properties && newSchema.properties) {
      for (const [key, oldProp] of Object.entries(oldSchema.properties)) {
        const newProp = (newSchema.properties as any)[key];
        if (!newProp) {
          return false; // Property removed
        }
        if ((oldProp as any).type && (newProp as any).type && (oldProp as any).type !== (newProp as any).type) {
          return false; // Type mismatch
        }
      }
    }
    
    if (newSchema.required && Array.isArray(newSchema.required)) {
      const oldReq = new Set(oldSchema.required || []);
      for (const req of newSchema.required) {
        if (!oldReq.has(req)) {
          return false; // New required field breaks backward compatibility
        }
      }
    }

    return true;
  }
}

