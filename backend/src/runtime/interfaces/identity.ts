export interface ActorProfile {
  actorId: string;
  tenantId: string;
  role: "SERVICE" | "USER" | "AI_AGENT";
  scopes: string[];
}

export interface IIdentityEngine {
  resolveActorContext(authToken: string): Promise<ActorProfile>;
  validateActorScope(actor: ActorProfile, requiredScope: string): boolean;
}

export interface TenantContext {
  tenantId: string;
  databaseUrl: string;
  isActive: boolean;
}

export interface ITenantResolver {
  resolveTenant(businessId: string): Promise<TenantContext>;
  validateTenantAccess(tenantId: string, actorId: string): Promise<boolean>;
}
