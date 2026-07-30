import { RuntimeContext } from "./context";
import { IContextBuilder, IContextValidator, IContextValidationResult, ContextValidationResult } from "./builderTypes";

/**
 * 1. Identity Context Builder
 */
export class IdentityContextBuilder implements IContextBuilder {
  public readonly name = "IdentityContextBuilder";

  public async build(currentContext: RuntimeContext, rawRequest: any): Promise<RuntimeContext> {
    const actorId = rawRequest?.actorId || "system";
    const role = rawRequest?.executiveRole || "SPRINT2_EXECUTIVE_RUNTIME";

    // Enriches identity parameter immutably without database queries
    return currentContext.with({
      identity: {
        id: `exec_${role.toLowerCase()}_${Math.random().toString(36).substring(2, 9)}`,
        actorId,
        role,
        status: "ACTIVE",
        version: 1,
      },
    });
  }
}

/**
 * 2. Business Context Builder
 */
export class BusinessContextBuilder implements IContextBuilder {
  public readonly name = "BusinessContextBuilder";

  public async build(currentContext: RuntimeContext, rawRequest: any): Promise<RuntimeContext> {
    const tenantId = rawRequest?.tenantId || null;

    return currentContext.with({
      businessContext: {
        tenantId,
        status: "ACTIVE",
        industry: "General",
        onboardingComplete: true,
      },
    });
  }
}

/**
 * 3. Workspace Context Builder
 */
export class WorkspaceContextBuilder implements IContextBuilder {
  public readonly name = "WorkspaceContextBuilder";

  public async build(currentContext: RuntimeContext, rawRequest: any): Promise<RuntimeContext> {
    const tenantId = rawRequest?.tenantId || null;

    return currentContext.with({
      workspace: {
        id: tenantId,
        name: "SylphBOT Workspace",
        plan: "ELITE",
        isUnlimited: false,
      },
    });
  }
}

/**
 * 4. Conversation Context Builder
 */
export class ConversationContextBuilder implements IContextBuilder {
  public readonly name = "ConversationContextBuilder";

  public async build(currentContext: RuntimeContext, rawRequest: any): Promise<RuntimeContext> {
    const objective = rawRequest?.objective || "";

    return currentContext.with({
      conversation: {
        lastObjective: objective,
        activeChannel: "http",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * 5. Permissions Context Builder
 */
export class PermissionsContextBuilder implements IContextBuilder {
  public readonly name = "PermissionsContextBuilder";

  public async build(currentContext: RuntimeContext, rawRequest: any): Promise<RuntimeContext> {
    const permissions = rawRequest?.permissions || ["executive:execute"];

    return currentContext.with({
      permissions,
    });
  }
}

/**
 * 6. Metadata Context Builder
 */
export class MetadataContextBuilder implements IContextBuilder {
  public readonly name = "MetadataContextBuilder";

  public async build(currentContext: RuntimeContext, rawRequest: any): Promise<RuntimeContext> {
    const runtimeMetadata = {
      ...currentContext.runtimeMetadata,
      tags: [...currentContext.runtimeMetadata.tags, "assembled"],
    };

    return currentContext.with({
      runtimeMetadata,
    });
  }
}

/**
 * Tenant Isolation Validator
 */
export class TenantIsolationValidator implements IContextValidator {
  public readonly name = "TenantIsolationValidator";

  public async validate(context: RuntimeContext): Promise<IContextValidationResult> {
    const errors: Error[] = [];
    const warnings: string[] = [];

    // Verify tenantId exists
    const tenantId = context.workspace?.id || context.businessContext?.tenantId;
    if (!tenantId) {
      errors.push(new Error("Security violation: Tenant context isolation requires a valid tenant ID."));
    }

    return new ContextValidationResult(errors.length === 0, errors, warnings);
  }
}

/**
 * Required Properties Validator
 */
export class RequiredPropertiesValidator implements IContextValidator {
  public readonly name = "RequiredPropertiesValidator";

  public async validate(context: RuntimeContext): Promise<IContextValidationResult> {
    const errors: Error[] = [];
    const warnings: string[] = [];

    if (!context.identity) {
      errors.push(new Error("Validation Error: Identity context is missing."));
    }

    if (!context.permissions || context.permissions.length === 0) {
      warnings.push("No explicit permissions assigned to this execution context.");
    }

    return new ContextValidationResult(errors.length === 0, errors, warnings);
  }
}
