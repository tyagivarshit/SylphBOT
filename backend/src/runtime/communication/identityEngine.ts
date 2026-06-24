export interface CustomerIdentity {
  unifiedId: string;
  tenantId: string;
  channels: Map<string, string>; // channelName (e.g. WhatsApp, Instagram, Email) -> channelUserId
  verified: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
}

export class IdentityEngine {
  private identities = new Map<string, CustomerIdentity>(); // unifiedId -> Identity
  // Simple mapping index to find unified ID by channel identifier (e.g. "whatsapp:1234" -> unifiedId)
  private channelIndex = new Map<string, string>();

  /**
   * Resolve customer identity by channel identifier.
   * If not found, creates a new unified identity.
   */
  public resolveIdentity(tenantId: string, channel: string, channelUserId: string): CustomerIdentity {
    const key = `${tenantId}:${channel}:${channelUserId}`;
    const existingUnifiedId = this.channelIndex.get(key);

    if (existingUnifiedId) {
      const identity = this.identities.get(existingUnifiedId);
      if (identity && identity.tenantId === tenantId) {
        return { ...identity };
      }
    }

    // Generate new unified ID
    const unifiedId = "uid_" + Math.random().toString(36).substring(2, 12);
    const channels = new Map<string, string>();
    channels.set(channel, channelUserId);

    const newIdentity: CustomerIdentity = {
      unifiedId,
      tenantId,
      channels,
      verified: false,
      metadata: {},
      createdAt: new Date()
    };

    this.identities.set(unifiedId, newIdentity);
    this.channelIndex.set(key, unifiedId);

    console.log(`[Identity Engine] Created new unified identity [${unifiedId}] for tenant [${tenantId}] via [${channel}:${channelUserId}]`);
    return { ...newIdentity };
  }

  /**
   * Links a new channel account to an existing unified identity.
   */
  public linkIdentity(unifiedId: string, tenantId: string, newChannel: string, newChannelUserId: string): CustomerIdentity {
    const identity = this.identities.get(unifiedId);
    if (!identity) {
      throw new Error(`Unified identity [${unifiedId}] not found.`);
    }

    if (identity.tenantId !== tenantId) {
      throw new Error(`Tenant mismatch: Cannot link channel across tenants.`);
    }

    const key = `${tenantId}:${newChannel}:${newChannelUserId}`;
    const linkedUnifiedId = this.channelIndex.get(key);

    if (linkedUnifiedId) {
      if (linkedUnifiedId === unifiedId) {
        return { ...identity }; // Already linked
      }
      // If linked to a DIFFERENT unified ID, trigger merging instead
      return this.mergeIdentities(unifiedId, linkedUnifiedId, tenantId);
    }

    identity.channels.set(newChannel, newChannelUserId);
    this.channelIndex.set(key, unifiedId);
    this.identities.set(unifiedId, identity);

    console.log(`[Identity Engine] Linked [${newChannel}:${newChannelUserId}] to unified identity [${unifiedId}]`);
    return { ...identity };
  }

  /**
   * Merges two unified identities into one.
   * Keeps identityA as primary, linking all channels from identityB.
   */
  public mergeIdentities(unifiedIdA: string, unifiedIdB: string, tenantId: string): CustomerIdentity {
    const identityA = this.identities.get(unifiedIdA);
    const identityB = this.identities.get(unifiedIdB);

    if (!identityA || !identityB) {
      throw new Error("One or both identities not found for merging.");
    }

    if (identityA.tenantId !== tenantId || identityB.tenantId !== tenantId) {
      throw new Error("Cannot merge identities across different tenants.");
    }

    console.log(`[Identity Engine] Merging unified identity [${unifiedIdB}] into [${unifiedIdA}]`);

    // Copy all channels from B to A
    for (const [channel, userId] of identityB.channels.entries()) {
      identityA.channels.set(channel, userId);
      const key = `${tenantId}:${channel}:${userId}`;
      this.channelIndex.set(key, unifiedIdA);
    }

    // Merge metadata
    identityA.metadata = { ...identityB.metadata, ...identityA.metadata };
    identityA.verified = identityA.verified || identityB.verified;

    // Delete identity B
    this.identities.delete(unifiedIdB);
    this.identities.set(unifiedIdA, identityA);

    return { ...identityA };
  }

  /**
   * Verify identity.
   */
  public verifyIdentity(unifiedId: string, verified = true): void {
    const identity = this.identities.get(unifiedId);
    if (identity) {
      identity.verified = verified;
      this.identities.set(unifiedId, identity);
    }
  }

  /**
   * Lookup identity details.
   */
  public lookup(unifiedId: string): CustomerIdentity | null {
    const identity = this.identities.get(unifiedId);
    return identity ? { ...identity } : null;
  }

  /**
   * Reset engine (for tests).
   */
  public reset(): void {
    this.identities.clear();
    this.channelIndex.clear();
  }
}
