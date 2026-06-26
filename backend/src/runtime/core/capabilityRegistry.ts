import { ICapabilityRegistry, AgentCapability } from "../interfaces/contracts";

export interface CapabilityMetadata {
  name: string; // e.g. LeadQualification, Booking, CampaignLaunch
  version: string;
  ownerId: string; // Name or ID of owner (e.g. SalesAI, CEOAI)
  permissionsRequired: string[];
  metadata: Record<string, any>;
  health: "Healthy" | "Degraded" | "Unavailable";
  status: "Active" | "Inactive";
}

export class CapabilityRegistry implements ICapabilityRegistry {
  private capabilities = new Map<string, CapabilityMetadata[]>();
  private agentCapabilities = new Map<string, AgentCapability>();

  /**
   * Register a capability version.
   */
  public register(cap: CapabilityMetadata): void {
    const list = this.capabilities.get(cap.name) || [];
    
    // Check if version is already registered for this capability
    const exists = list.some(c => c.version === cap.version && c.ownerId === cap.ownerId);
    if (exists) {
      const existing = list.find(c => c.version === cap.version && c.ownerId === cap.ownerId)!;
      const existingSig = JSON.stringify({ permissionsRequired: existing.permissionsRequired, metadata: existing.metadata });
      const incomingSig = JSON.stringify({ permissionsRequired: cap.permissionsRequired, metadata: cap.metadata });
      
      if (existingSig === incomingSig) {
        console.warn(`[Capability Registry] Idempotent registration: Capability [${cap.name}] v[${cap.version}] already registered. Reusing.`);
        return;
      } else {
        throw new Error(`Capability [${cap.name}] version [${cap.version}] is already registered with a different signature for owner [${cap.ownerId}].`);
      }
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

  // --- ICapabilityRegistry Interface Implementation ---

  public async registerAgentCapabilities(capabilities: AgentCapability): Promise<void> {
    if (!capabilities.agentId) {
      throw new Error("Agent capabilities registration failed: agentId is required.");
    }
    
    if (this.agentCapabilities.has(capabilities.agentId)) {
      const existing = this.agentCapabilities.get(capabilities.agentId)!;
      const existingSig = JSON.stringify({ intents: existing.intents, platforms: existing.platforms, supportedCtas: existing.supportedCtas });
      const incomingSig = JSON.stringify({ intents: capabilities.intents, platforms: capabilities.platforms, supportedCtas: capabilities.supportedCtas });
      
      if (existingSig === incomingSig) {
        console.warn(`[Capability Registry] Idempotent agent capabilities registration for agent [${capabilities.agentId}]. Reusing.`);
        return;
      } else {
        throw new Error(`Agent [${capabilities.agentId}] already registered with different capabilities. Duplicate registration rejected.`);
      }
    }
    
    this.agentCapabilities.set(capabilities.agentId, { ...capabilities });
    console.log(`[Capability Registry] Registered agent capabilities for [${capabilities.agentId}]`);
  }

  public async getAgentForIntent(intent: string): Promise<string | null> {
    for (const [agentId, cap] of this.agentCapabilities.entries()) {
      if (cap.intents.includes(intent)) {
        return agentId;
      }
    }
    return null;
  }

  public async getAgentCapabilities(agentId: string): Promise<AgentCapability | null> {
    return this.agentCapabilities.get(agentId) || null;
  }

  /**
   * Clear capabilities (for testing).
   */
  public reset(): void {
    this.capabilities.clear();
    this.agentCapabilities.clear();
  }
}

