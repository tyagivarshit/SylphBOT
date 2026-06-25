export class FallbackManager {
  private fallbackChains = new Map<string, string[]>();

  constructor() {
    // Register default fallback hierarchies (completely business-agnostic)
    this.registerFallbackChain("gpt-4o", ["claude-3-5-sonnet", "llama3-70b-8192"]);
    this.registerFallbackChain("claude-3-5-sonnet", ["gpt-4o", "llama3-70b-8192"]);
    this.registerFallbackChain("gemini-1.5-pro", ["gpt-4o", "llama3-70b-8192"]);
    this.registerFallbackChain("llama3-70b-8192", ["gpt-4o"]);
  }

  /**
   * Registers a list of fallback models to route to in sequence upon failure of primary.
   */
  public registerFallbackChain(modelId: string, fallbacks: string[]): void {
    this.fallbackChains.set(modelId, fallbacks);
  }

  /**
   * Retrieves the fallback list configured for a model.
   */
  public getFallbackChain(modelId: string): string[] {
    return this.fallbackChains.get(modelId) || [];
  }

  /**
   * Orchestrates execution through the fallback model chain if failures occur.
   */
  public async executeWithFailover<T>(
    primaryModelId: string,
    executeTask: (modelId: string) => Promise<T>,
    isModelAvailable: (modelId: string) => boolean
  ): Promise<T> {
    const attempts = [primaryModelId, ...this.getFallbackChain(primaryModelId)];
    let finalError: any = null;

    for (const modelId of attempts) {
      // Skip if marked unavailable by health monitors
      if (!isModelAvailable(modelId)) {
        console.warn(`[Fallback Manager] Skipping unavailable model: [${modelId}]`);
        continue;
      }

      try {
        return await executeTask(modelId);
      } catch (err: any) {
        console.warn(`[Fallback Manager] Execution failed for model [${modelId}]. Retrying next fallback. Error: ${err.message || err}`);
        finalError = err;
      }
    }

    throw new Error(`[Fallback Manager] All failover attempts exhausted. Last Error: ${finalError?.message || finalError}`);
  }
}
