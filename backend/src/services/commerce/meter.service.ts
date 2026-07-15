import prisma from "../../config/prisma";
import logger from "../../utils/logger";

export type MeteredEventType =
  | "MESSAGES"
  | "AI_REPLIES"
  | "TOKENS"
  | "EXECUTIONS"
  | "WORKFLOWS"
  | "AUTOMATION_RUNS"
  | "STORAGE"
  | "KNOWLEDGE_QUERIES"
  | "MEMORY_OPERATIONS"
  | "SIMULATION_RUNS";

export interface UsageEvent {
  businessId: string;
  eventType: MeteredEventType;
  quantity: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface QuotaOverageResult {
  allowed: boolean;
  limit: number;
  consumed: number;
  overage: number;
}

export class MeterService {
  /**
   * Records a raw usage event into the system.
   * Updates daily counters and stores event metadata.
   */
  static async recordUsageEvent(event: UsageEvent): Promise<boolean> {
    try {
      const now = event.timestamp || new Date();
      const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // 1. Update/upsert the daily aggregated usage counters
      await prisma.usageDaily.upsert({
        where: {
          businessId_feature_dateKey: {
            businessId: event.businessId,
            feature: event.eventType,
            dateKey,
          },
        },
        create: {
          businessId: event.businessId,
          feature: event.eventType,
          dateKey,
          count: event.quantity,
        },
        update: {
          count: {
            increment: event.quantity,
          },
        },
      });

      // 2. Backwards-compatible monthly Usage ledger update for core features
      if (["AI_REPLIES", "MESSAGES"].includes(event.eventType)) {
        const updateData: Record<string, any> = {};
        if (event.eventType === "AI_REPLIES") {
          updateData.aiCallsUsed = { increment: event.quantity };
        } else if (event.eventType === "MESSAGES") {
          updateData.messagesUsed = { increment: event.quantity };
        }

        await prisma.usage.upsert({
          where: {
            businessId_month_year: {
              businessId: event.businessId,
              month,
              year,
            },
          },
          create: {
            businessId: event.businessId,
            month,
            year,
            aiCallsUsed: event.eventType === "AI_REPLIES" ? event.quantity : 0,
            messagesUsed: event.eventType === "MESSAGES" ? event.quantity : 0,
            followupsUsed: 0,
          },
          update: updateData,
        });
      }

      logger.info(
        { businessId: event.businessId, eventType: event.eventType, quantity: event.quantity },
        "Usage event metered successfully"
      );
      return true;
    } catch (error) {
      logger.error({ err: error, event }, "Failed to record usage event");
      return false;
    }
  }

  /**
   * Retrieves the aggregated usage count for a business and event type over a specific period.
   */
  static async getUsageCounter(
    businessId: string,
    eventType: MeteredEventType,
    start: Date,
    end: Date
  ): Promise<number> {
    const startKey = start.toISOString().slice(0, 10);
    const endKey = end.toISOString().slice(0, 10);

    const aggregates = await prisma.usageDaily.findMany({
      where: {
        businessId,
        feature: eventType,
        dateKey: {
          gte: startKey,
          lte: endKey,
        },
      },
      select: {
        count: true,
      },
    }).catch(() => []);

    return (aggregates as any[]).reduce((sum, item) => sum + (item.count || 0), 0);
  }

  /**
   * Checks if the current consumption has exceeded limits and calculates the overage.
   */
  static async checkQuotaAndOverage(
    businessId: string,
    eventType: MeteredEventType,
    limit: number,
    start: Date,
    end: Date
  ): Promise<QuotaOverageResult> {
    const consumed = await this.getUsageCounter(businessId, eventType, start, end);
    const overage = Math.max(0, consumed - limit);

    return {
      allowed: limit === -1 || consumed < limit,
      limit,
      consumed,
      overage,
    };
  }
}
