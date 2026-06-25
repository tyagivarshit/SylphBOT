import { container } from "./diContainer";

export class RuntimeGuard {
  private static bypassEnabled = false;
  private static violations: Array<{ timestamp: Date; category: string; detail: string }> = [];

  public static setBypass(enabled: boolean): void {
    this.bypassEnabled = enabled;
  }

  public static getViolations() {
    return this.violations;
  }

  public static clearViolations(): void {
    this.violations = [];
  }

  /**
   * Enforces that model access flows only through the IModelManager gateway.
   */
  public static enforceModelAccess(modelId: string): void {
    if (this.bypassEnabled) return;
    const stack = new Error().stack || "";
    const isAuthorized = stack.includes("modelManager.js") || 
                        stack.includes("modelManager.ts") || 
                        stack.includes("bootstrap") ||
                        stack.includes("test");
    if (!isAuthorized) {
      this.logViolation("ModelAccess", `Direct invocation of model [${modelId}] outside ModelManager.`);
      throw new Error(`[RuntimeGuard] Access denied: direct model execution of [${modelId}] bypassing IModelManager.`);
    }
  }

  /**
   * Enforces that memory access flows only through the IMemoryEngine gateway.
   */
  public static enforceMemoryAccess(operation: string): void {
    if (this.bypassEnabled) return;
    const stack = new Error().stack || "";
    const isAuthorized = stack.includes("memoryEngine.js") || 
                        stack.includes("memoryEngine.ts") || 
                        stack.includes("bootstrap") ||
                        stack.includes("test");
    if (!isAuthorized) {
      this.logViolation("MemoryAccess", `Direct memory operation [${operation}] outside IMemoryEngine.`);
      throw new Error(`[RuntimeGuard] Access denied: direct memory access [${operation}] bypassing IMemoryEngine.`);
    }
  }

  /**
   * Enforces that prompt compilation flows only through the PromptCompiler.
   */
  public static enforcePromptExecution(templateId: string): void {
    if (this.bypassEnabled) return;
    const stack = new Error().stack || "";
    const isAuthorized = stack.includes("promptCompiler.js") || 
                        stack.includes("promptCompiler.ts") || 
                        stack.includes("bootstrap") ||
                        stack.includes("test");
    if (!isAuthorized) {
      this.logViolation("PromptExecution", `Direct prompt execution of [${templateId}] outside PromptCompiler.`);
      throw new Error(`[RuntimeGuard] Access denied: direct prompt construction [${templateId}] bypassing PromptCompiler.`);
    }
  }

  /**
   * Enforces that event publishing flows only through the IEventBus.
   */
  public static enforceEventRouting(topic: string): void {
    if (this.bypassEnabled) return;
    const stack = new Error().stack || "";
    const isAuthorized = stack.includes("eventBus.js") || 
                        stack.includes("eventBus.ts") || 
                        stack.includes("bootstrap") ||
                        stack.includes("test");
    if (!isAuthorized) {
      this.logViolation("EventRouting", `Direct event routing of topic [${topic}] outside IEventBus.`);
      throw new Error(`[RuntimeGuard] Access denied: direct event routing [${topic}] bypassing IEventBus.`);
    }
  }

  /**
   * Enforces that tool execution flows only through the ToolExecutor.
   */
  public static enforceToolExecution(toolName: string): void {
    if (this.bypassEnabled) return;
    const stack = new Error().stack || "";
    const isAuthorized = stack.includes("toolExecutor.js") || 
                        stack.includes("toolExecutor.ts") || 
                        stack.includes("bootstrap") ||
                        stack.includes("test");
    if (!isAuthorized) {
      this.logViolation("ToolExecution", `Direct tool execution of [${toolName}] outside IToolExecutor.`);
      throw new Error(`[RuntimeGuard] Access denied: direct tool execution of [${toolName}] bypassing IToolExecutor.`);
    }
  }

  private static logViolation(category: string, detail: string): void {
    const violation = {
      timestamp: new Date(),
      category,
      detail
    };
    this.violations.push(violation);
    console.error(`[RuntimeGuard VIOLATION] ${category}: ${detail}`);

    // Emit observability event if telemetryEngine is registered in DI
    try {
      if (container.has("ITelemetryEngine")) {
        const telemetry = container.resolve<any>("ITelemetryEngine");
        telemetry.logEvent("runtime_guard_violation", violation);
      }
    } catch {}
  }
}
