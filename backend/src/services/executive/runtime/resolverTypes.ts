export class IdentityResolutionMetadata {
  constructor(
    public readonly resolvedAt: Date = new Date(),
    public readonly source: string = "production_di",
    public readonly resolverVersion: string = "1.0.0"
  ) {}
}

export class IdentityResolutionResult {
  constructor(
    public readonly success: boolean,
    public readonly identity: {
      identityId: string;
      userId: string;
      workspaceId: string;
      organizationId: string;
      role: string;
      permissions: string[];
    } | null,
    public readonly metadata: IdentityResolutionMetadata,
    public readonly error: Error | null = null
  ) {}
}

export class BusinessContextMetadata {
  constructor(
    public readonly resolvedAt: Date = new Date(),
    public readonly source: string = "production_di",
    public readonly resolverVersion: string = "1.0.0"
  ) {}
}

export class BusinessContextResolutionResult {
  constructor(
    public readonly success: boolean,
    public readonly business: {
      businessId: string;
      industry: string;
      businessType: string;
      timezone: string;
      language: string;
      currency: string;
      region: string;
      workspaceProfile: Record<string, any>;
      tenantInformation: Record<string, any>;
    } | null,
    public readonly metadata: BusinessContextMetadata,
    public readonly error: Error | null = null
  ) {}
}

export class KnowledgeResolutionMetadata {
  constructor(
    public readonly resolvedAt: Date = new Date(),
    public readonly source: string = "production_di",
    public readonly resolverVersion: string = "1.0.0"
  ) {}
}

export class KnowledgeResolutionResult {
  constructor(
    public readonly success: boolean,
    public readonly knowledgeIds: string[],
    public readonly retrievedKnowledge: any[],
    public readonly metadata: KnowledgeResolutionMetadata,
    public readonly error: Error | null = null,
    public readonly diagnostics: Record<string, any> = {}
  ) {}
}

export class MemoryResolutionMetadata {
  constructor(
    public readonly resolvedAt: Date = new Date(),
    public readonly source: string = "production_di",
    public readonly resolverVersion: string = "1.0.0"
  ) {}
}

export class MemoryResolutionResult {
  constructor(
    public readonly success: boolean,
    public readonly memoryIds: string[],
    public readonly retrievedMemories: any[],
    public readonly metadata: MemoryResolutionMetadata,
    public readonly error: Error | null = null,
    public readonly diagnostics: Record<string, any> = {}
  ) {}
}
