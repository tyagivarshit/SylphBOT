export interface CapabilityMetadata {
  name: string; // e.g. LeadQualification, Booking, CampaignLaunch
  version: string;
  ownerId: string; // Name or ID of owner (e.g. SalesAI, CEOAI)
  permissionsRequired: string[];
  metadata: Record<string, any>;
  health: "Healthy" | "Degraded" | "Unavailable";
  status: "Active" | "Inactive";
}

export class CapabilityRegistry {
  private capabilities = new Map<string, CapabilityMetadata[]>();

  /**
   * Register a capability version.
   */
  public register(cap: CapabilityMetadata): void {
    const list = this.capabilities.get(cap.name) || [];
    
    // Check if version is already registered for this capability
    const exists = list.some(c => c.version === cap.version && c.ownerId === cap.ownerId);
    if (exists) {
      throw new Error(`Capability [${cap.name}] version [${cap.version}] is already registered for owner [${cap.ownerId}].`);
    }

    list.push({ ...cap });
    this.capabilities.set(cap.name, list);
    console.log(`[Capability Registry] Registered capability [${cap.name}] v[${cap.version}] owned by [${cap.ownerId}]`);
  }

  /**
   * Discover capabilities based on criteria.
   */
  public discover(criteria?: Partial<Omit<CapabilityMetadata, "metadata" | "permissionsRequired">>): CapabilityMetadata[] {
    const results: CapabilityMetadata[] = [];

    for (const list of this.capabilities.values()) {
      for (const cap of list) {
        let match = true;
        
        if (criteria) {
          if (criteria.name && cap.name !== criteria.name) match = false;
          if (criteria.version && cap.version !== criteria.version) match = false;
          if (criteria.ownerId && cap.ownerId !== criteria.ownerId) match = false;
          if (criteria.health && cap.health !== criteria.health) match = false;
          if (criteria.status && cap.status !== criteria.status) match = false;
        }

        if (match) {
          results.push({ ...cap });
        }
      }
    }

    return results;
  }

  /**
   * Look up a specific capability version.
   * If version is omitted, returns the latest registered version.
   */
  public lookup(name: string, version?: string): CapabilityMetadata | null {
    const list = this.capabilities.get(name);
    if (!list || list.length === 0) {
      return null;
    }

    if (version) {
      return list.find(c => c.version === version) || null;
    }

    // Default to latest version (simple sort based on version string)
    const sorted = [...list].sort((a, b) => b.version.localeCompare(a.version));
    return sorted[0];
  }

  /**
   * Update dynamic health status for a capability.
   */
  public updateHealth(name: string, version: string, health: "Healthy" | "Degraded" | "Unavailable"): void {
    const list = this.capabilities.get(name);
    if (!list) {
      throw new Error(`Capability [${name}] is not registered.`);
    }

    const cap = list.find(c => c.version === version);
    if (!cap) {
      throw new Error(`Capability [${name}] version [${version}] not found.`);
    }

    cap.health = health;
  }

  /**
   * Check permissions of an actor against capability requirements.
   */
  public hasPermission(name: string, version: string, actorScopes: string[]): boolean {
    const cap = this.lookup(name, version);
    if (!cap) {
      return false;
    }

    // If no scopes are required, anyone has access
    if (cap.permissionsRequired.length === 0) {
      return true;
    }

    const actorScopesSet = new Set(actorScopes);
    return cap.permissionsRequired.every(scope => actorScopesSet.has(scope));
  }

  /**
   * Clear capabilities (for testing).
   */
  public reset(): void {
    this.capabilities.clear();
  }
}
