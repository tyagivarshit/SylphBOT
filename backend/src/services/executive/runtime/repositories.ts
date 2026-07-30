import { IBusinessContextRepository, IKnowledgeRepository, IMemoryRepository } from "./repositoryContracts";
import globalPrisma from "../../../config/prisma";

export class PrismaBusinessContextRepository implements IBusinessContextRepository {
  constructor(private readonly db: any = globalPrisma) {}

  public async loadBusinessProfile(tenantId: string): Promise<any> {
    return this.db.business.findUnique({
      where: { id: tenantId },
    });
  }

  public async loadLatestSubscription(tenantId: string): Promise<any> {
    return this.db.subscriptionLedger.findFirst({
      where: { businessId: tenantId },
      orderBy: { updatedAt: "desc" },
    });
  }
}

export class PrismaKnowledgeRepository implements IKnowledgeRepository {
  constructor(private readonly db: any = globalPrisma) {}

  public async loadKnowledgeForRuntime(tenantId: string, query: string, options?: any): Promise<any[]> {
    try {
      return await this.db.receptionMemory.findMany({
        where: { businessId: tenantId },
        take: options?.limit || 10,
      });
    } catch {
      return [];
    }
  }
}

export class PrismaMemoryRepository implements IMemoryRepository {
  constructor(private readonly db: any = globalPrisma) {}

  public async loadMemoryForConversation(tenantId: string, executiveId: string, query: string, options?: any): Promise<any[]> {
    try {
      return await this.db.memory.findMany({
        where: { lead: { businessId: tenantId } },
        take: options?.limit || 10,
      });
    } catch {
      return [];
    }
  }

  public async storeExecutionTrace(tenantId: string, executiveId: string, memory: any): Promise<void> {
    try {
      await this.db.memory.create({
        data: {
          category: memory.category || "EXECUTION",
          key: memory.key,
          value: memory.value || {},
          lead: {
            connectOrCreate: {
              where: { id: memory.leadId || `lead_${tenantId}` },
              create: {
                id: memory.leadId || `lead_${tenantId}`,
                businessId: tenantId,
                name: "System Executive Lead",
                email: "system@sylph-ai.com",
                status: "ACTIVE"
              }
            }
          }
        }
      });
    } catch (err) {}
  }
}
