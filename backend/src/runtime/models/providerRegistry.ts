import { ProviderConfig, ProviderAdapter } from "./types";

export class ProviderRegistry {
  private configs = new Map<string, ProviderConfig>();
  private adapters = new Map<string, ProviderAdapter>();

  constructor() {}

  /**
   * Register a provider config and its matching HTTP adapter instance.
   */
  public registerProvider(config: ProviderConfig, adapter: ProviderAdapter): void {
    if (this.configs.has(config.id)) {
      throw new Error(`Provider [${config.id}] is already registered in provider registry.`);
    }
    this.configs.set(config.id, config);
    this.adapters.set(config.id, adapter);
  }

  /**
   * Retrieves provider configurations.
   */
  public getProviderConfig(providerId: string): ProviderConfig | null {
    return this.configs.get(providerId) || null;
  }

  /**
   * Retrieves provider adapters.
   */
  public getAdapter(providerId: string): ProviderAdapter | null {
    return this.adapters.get(providerId) || null;
  }

  /**
   * Sets dynamic health state of a provider.
   */
  public updateProviderHealth(providerId: string, health: "Healthy" | "Degraded" | "Failed"): void {
    const config = this.configs.get(providerId);
    if (!config) {
      throw new Error(`Provider [${providerId}] not found.`);
    }
    config.health = health;
    this.configs.set(providerId, config);
  }

  /**
   * Updates provider status (active vs inactive).
   */
  public updateProviderStatus(providerId: string, status: "active" | "inactive"): void {
    const config = this.configs.get(providerId);
    if (!config) {
      throw new Error(`Provider [${providerId}] not found.`);
    }
    config.status = status;
    this.configs.set(providerId, config);
  }

  /**
   * Lists configs.
   */
  public listProviders(): ProviderConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Clears registry entries (for tests).
   */
  public clear(): void {
    this.configs.clear();
    this.adapters.clear();
  }
}
