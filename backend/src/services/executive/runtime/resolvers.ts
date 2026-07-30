import { container, DIContainer } from "../../../runtime/kernel/diContainer";
import {
  IdentityResolutionResult,
  IdentityResolutionMetadata,
  BusinessContextResolutionResult,
  BusinessContextMetadata,
  KnowledgeResolutionResult,
  KnowledgeResolutionMetadata,
  MemoryResolutionResult,
  MemoryResolutionMetadata
} from "./resolverTypes";
import globalPrisma from "../../../config/prisma";
import { IBusinessContextRepository, IKnowledgeRepository, IMemoryRepository } from "./repositoryContracts";
import { PrismaBusinessContextRepository, PrismaKnowledgeRepository, PrismaMemoryRepository } from "./repositories";

export class RuntimeIdentityResolver {
  constructor(private readonly di: DIContainer = container) {}

  public async resolve(actorId: string, role: string, tenantId: string): Promise<IdentityResolutionResult> {
    const resolvedAt = new Date();
    const metadata = new IdentityResolutionMetadata(resolvedAt, "production_di", "1.0.0");

    try {
      if (!this.di.has("IExecutiveIdentityService")) {
        return new IdentityResolutionResult(
          false,
          null,
          metadata,
          new Error("DI Error: IExecutiveIdentityService is not registered in container.")
        );
      }

      const identityService = this.di.resolve<any>("IExecutiveIdentityService");
      
      // Query the list of executives for this tenant to see if an active one matching the role is available
      const executives = await identityService.listExecutives(tenantId);
      let executive = executives.find((e: any) => e.role === role && e.status === "ACTIVE");

      // Fallback: if no active one matches but there is at least one active, resolve it
      if (!executive && executives.length > 0) {
        executive = executives.find((e: any) => e.status === "ACTIVE") || executives[0];
      }

      if (!executive) {
        return new IdentityResolutionResult(
          false,
          null,
          metadata,
          new Error(`Identity Error: No active Executive Identity found for tenant [${tenantId}] with role [${role}].`)
        );
      }

      return new IdentityResolutionResult(
        true,
        {
          identityId: executive.id,
          userId: actorId,
          workspaceId: tenantId,
          organizationId: tenantId,
          role: executive.role,
          permissions: executive.dna?.capabilityProfile?.executableCapabilities || ["executive:execute"],
        },
        metadata
      );
    } catch (err: any) {
      return new IdentityResolutionResult(
        false,
        null,
        metadata,
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }
}

export class RuntimeBusinessContextResolver {
  constructor(private readonly di: DIContainer = container) {}

  public async resolve(tenantId: string): Promise<BusinessContextResolutionResult> {
    const resolvedAt = new Date();
    const metadata = new BusinessContextMetadata(resolvedAt, "production_di", "1.0.0");

    try {
      // Resolve repository from DI container if registered, otherwise instantiate fallback wrapping the resolved database instance
      let repo: IBusinessContextRepository;
      if (this.di.has("IBusinessContextRepository")) {
        repo = this.di.resolve<IBusinessContextRepository>("IBusinessContextRepository");
      } else {
        let db = globalPrisma;
        if (this.di.has("PrismaTransactionClient")) {
          db = this.di.resolve<any>("PrismaTransactionClient");
        } else if (this.di.has("PrismaClient")) {
          db = this.di.resolve<any>("PrismaClient");
        }
        repo = new PrismaBusinessContextRepository(db);
      }

      // Query database for business profile details
      const business = await repo.loadBusinessProfile(tenantId);

      if (!business) {
        return new BusinessContextResolutionResult(
          false,
          null,
          metadata,
          new Error(`Business Context Error: Business profile [${tenantId}] does not exist in database.`)
        );
      }

      const subscription = await repo.loadLatestSubscription(tenantId);

      return new BusinessContextResolutionResult(
        true,
        {
          businessId: tenantId,
          industry: business.industry || "General",
          businessType: business.teamSize || "1-10",
          timezone: "UTC",
          language: "en",
          currency: "USD",
          region: "US",
          workspaceProfile: {
            name: business.name || "Default Workspace",
            website: business.website || null,
          },
          tenantInformation: {
            subscriptionStatus: subscription?.status || "INACTIVE",
            planCode: subscription?.planCode || "FREE",
          },
        },
        metadata
      );
    } catch (err: any) {
      return new BusinessContextResolutionResult(
        false,
        null,
        metadata,
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }
}

export class RuntimeKnowledgeResolver {
  constructor(private readonly di: DIContainer = container) {}

  public async resolve(tenantId: string, query: string, options?: any): Promise<KnowledgeResolutionResult> {
    const startedAt = Date.now();
    const resolvedAt = new Date();
    const metadata = new KnowledgeResolutionMetadata(resolvedAt, "production_di", "1.0.0");

    try {
      let repo: IKnowledgeRepository;
      if (this.di.has("IKnowledgeRepository")) {
        repo = this.di.resolve<IKnowledgeRepository>("IKnowledgeRepository");
      } else {
        let db = globalPrisma;
        if (this.di.has("PrismaTransactionClient")) {
          db = this.di.resolve<any>("PrismaTransactionClient");
        } else if (this.di.has("PrismaClient")) {
          db = this.di.resolve<any>("PrismaClient");
        }
        repo = new PrismaKnowledgeRepository(db);
      }

      const retrievedKnowledge = await repo.loadKnowledgeForRuntime(tenantId, query, options);
      const knowledgeIds = retrievedKnowledge.map((item: any) => item.id || String(item.key || ""));
      const durationMs = Date.now() - startedAt;

      return new KnowledgeResolutionResult(
        true,
        knowledgeIds,
        retrievedKnowledge,
        metadata,
        null,
        {
          retrievedCount: retrievedKnowledge.length,
          durationMs,
          cacheHit: false,
        }
      );
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      return new KnowledgeResolutionResult(
        false,
        [],
        [],
        metadata,
        error,
        {
          durationMs: Date.now() - startedAt,
          retrievedCount: 0,
        }
      );
    }
  }
}

export class RuntimeMemoryResolver {
  constructor(private readonly di: DIContainer = container) {}

  public async resolve(tenantId: string, executiveId: string, query: string, options?: any): Promise<MemoryResolutionResult> {
    const startedAt = Date.now();
    const resolvedAt = new Date();
    const metadata = new MemoryResolutionMetadata(resolvedAt, "production_di", "1.0.0");

    try {
      let repo: IMemoryRepository;
      if (this.di.has("IMemoryRepository")) {
        repo = this.di.resolve<IMemoryRepository>("IMemoryRepository");
      } else {
        let db = globalPrisma;
        if (this.di.has("PrismaTransactionClient")) {
          db = this.di.resolve<any>("PrismaTransactionClient");
        } else if (this.di.has("PrismaClient")) {
          db = this.di.resolve<any>("PrismaClient");
        }
        repo = new PrismaMemoryRepository(db);
      }

      const retrievedMemories = await repo.loadMemoryForConversation(tenantId, executiveId, query, options);
      const memoryIds = retrievedMemories.map((item: any) => item.id || String(item.key || ""));
      const durationMs = Date.now() - startedAt;

      return new MemoryResolutionResult(
        true,
        memoryIds,
        retrievedMemories,
        metadata,
        null,
        {
          retrievedCount: retrievedMemories.length,
          durationMs,
          cacheHit: false,
        }
      );
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      return new MemoryResolutionResult(
        false,
        [],
        [],
        metadata,
        error,
        {
          durationMs: Date.now() - startedAt,
          retrievedCount: 0,
        }
      );
    }
  }
}
