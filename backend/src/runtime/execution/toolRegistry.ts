import { IToolRegistry, ToolDefinition } from "../interfaces/execution";
import { ExtendedToolDefinition } from "./types";

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
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool [${tool.name}] is already registered. Duplicate registrations not allowed.`);
    }

    const extendedTool: ExtendedToolDefinition = {
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      execute: tool.execute,
      version: (tool as any).version || "1.0.0",
      permissions: (tool as any).permissions || [],
      health: (tool as any).health || "Healthy",
      capabilities: (tool as any).capabilities || [tool.name],
      ownerTenantId: (tool as any).ownerTenantId
    };

    this.tools.set(extendedTool.name, extendedTool);
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
}
