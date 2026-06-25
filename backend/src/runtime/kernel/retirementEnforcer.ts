export class RetirementEnforcer {
  private static bypassEnabled = false;

  /**
   * Enables or disables enforcement checks dynamically (useful for test isolation).
   */
  public static setBypass(enabled: boolean): void {
    this.bypassEnabled = enabled;
  }

  /**
   * Scans the call stack trace to verify the invocation originates within authorized Runtime layers.
   */
  public static enforce(operationName: string): void {
    if (this.bypassEnabled) return;

    const stack = new Error().stack || "";
    
    // Check if stack contains runtime folder path patterns
    const hasRuntime = stack.includes("/runtime/") || 
                        stack.includes("\\runtime\\") || 
                        stack.includes("bootstrap") || 
                        stack.includes("bootstrapper") || 
                        stack.includes("test");
    
    if (!hasRuntime) {
      throw new Error(`[Legacy Retirement Enforcement] Operation [${operationName}] bypassed the authorized Runtime path. All calls must flow through the Runtime OS.`);
    }
  }

  /**
   * Validates that direct client vendor usage is blocked outside adapters.
   */
  public static enforceNoDirectOpenAI(): void {
    if (this.bypassEnabled) return;
    const stack = new Error().stack || "";
    
    const isAllowed = stack.includes("adapters.ts") || stack.includes("test") || stack.includes("adapters.js");
    if (!isAllowed) {
      throw new Error(`[Legacy Retirement Enforcement] Direct usage of OpenAI client outside of adapters is strictly prohibited.`);
    }
  }
}
