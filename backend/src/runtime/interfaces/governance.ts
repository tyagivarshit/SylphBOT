import { ActorProfile } from "./identity";

export interface IPermissionEngine {
  checkPermission(
    actor: ActorProfile,
    resource: string,
    action: string
  ): boolean;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  repairedJson?: string;
}

export interface IValidationEngine {
  validateResponse(
    text: string,
    schema: Record<string, unknown>
  ): ValidationResult;
}

export interface PolicyLimits {
  maxTokens: number;
  allowedModels: string[];
  allowedCtas: string[];
  enableShadowMode: boolean;
}

export interface IPolicyEngine {
  resolvePolicyLimits(planKey: string): PolicyLimits;
  verifyUsageLimit(businessId: string, actionType: string): Promise<boolean>;
}
