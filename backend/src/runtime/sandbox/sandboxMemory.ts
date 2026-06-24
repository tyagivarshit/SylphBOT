export class SandboxMemory {
  // Key formats: `${tenantId}:${type}:${key}`
  private store = new Map<string, string>();

  constructor() {}

  /**
   * Writes a fact to the isolated sandbox memory store.
   */
  public writeMemory(tenantId: string, type: "business" | "customer" | "department" | "learning", key: string, value: string): void {
    const storeKey = `${tenantId}:${type}:${key}`;
    this.store.set(storeKey, value);
  }

  /**
   * Reads a fact from the isolated sandbox memory store.
   */
  public readMemory(tenantId: string, type: "business" | "customer" | "department" | "learning", key: string): string | null {
    const storeKey = `${tenantId}:${type}:${key}`;
    return this.store.get(storeKey) || null;
  }

  /**
   * Clears the isolated store.
   */
  public clear(): void {
    this.store.clear();
  }
}
