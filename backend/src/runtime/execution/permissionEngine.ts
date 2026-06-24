import { ExecutionContext, ExtendedToolDefinition } from "./types";

export class PermissionEngine {
  constructor() {}

  /**
   * Authorizes a tool execution request against security boundaries and tenant boundaries.
   */
  public authorize(
    context: ExecutionContext,
    tool: ExtendedToolDefinition
  ): { authorized: boolean; reason?: string } {
    if (!context || !tool) {
      return { authorized: false, reason: "Missing execution context or tool definition." };
    }

    // 1. Tenant Isolation Boundary Enforcement
    if (tool.ownerTenantId && tool.ownerTenantId !== context.tenantId) {
      return {
        authorized: false,
        reason: `Tenant Boundary Violation: Tenant [${context.tenantId}] is not permitted to access tool owned by tenant [${tool.ownerTenantId}].`
      };
    }

    // 2. Action & Capability Scope Verification
    if (tool.permissions && tool.permissions.length > 0) {
      const callerRoles = context.roles || [];
      const hasPermission = tool.permissions.some(permission => callerRoles.includes(permission));
      
      if (!hasPermission) {
        return {
          authorized: false,
          reason: `Access Enforcement: Caller roles [${callerRoles.join(", ")}] lack required permission scope [${tool.permissions.join(", ")}] to execute tool [${tool.name}].`
        };
      }
    }

    return { authorized: true };
  }
}
