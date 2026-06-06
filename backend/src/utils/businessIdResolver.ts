import { PrismaClient } from "@prisma/client";

/**
 * Resolves the businessId for a given leadId by querying the Lead model.
 * Used by the production dual-write path.
 */
export async function resolveBusinessIdForLead(
  prisma: { lead: { findUnique: (args: any) => Promise<any> } },
  leadId: string
): Promise<string | null> {
  if (!leadId) return null;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { businessId: true },
  });
  return lead?.businessId || null;
}

/**
 * Resolves businessIds for a batch of leadIds.
 * Used by the backfill migration/validation for efficient batch queries.
 */
export async function resolveBusinessIdsForLeads(
  prisma: { lead: { findMany: (args: any) => Promise<any> } },
  leadIds: string[]
): Promise<Record<string, string>> {
  if (!leadIds || leadIds.length === 0) return {};
  const uniqueLeadIds = Array.from(new Set(leadIds));
  const leads = await prisma.lead.findMany({
    where: { id: { in: uniqueLeadIds } },
    select: { id: true, businessId: true },
  });
  
  const map: Record<string, string> = {};
  for (const lead of leads) {
    if (lead.businessId) {
      map[lead.id] = lead.businessId;
    }
  }
  return map;
}

/**
 * Resolves lead information (existence and businessId) for a batch of leadIds.
 * Used by the validation report to distinguish between orphan messages and missing businessIds.
 */
export async function getLeadsBatchInfo(
  prisma: { lead: { findMany: (args: any) => Promise<any> } },
  leadIds: string[]
): Promise<{ exists: Set<string>; businessIds: Record<string, string> }> {
  const exists = new Set<string>();
  const businessIds: Record<string, string> = {};

  if (!leadIds || leadIds.length === 0) {
    return { exists, businessIds };
  }

  const uniqueLeadIds = Array.from(new Set(leadIds));
  const leads = await prisma.lead.findMany({
    where: { id: { in: uniqueLeadIds } },
    select: { id: true, businessId: true },
  });

  for (const lead of leads) {
    exists.add(lead.id);
    if (lead.businessId) {
      businessIds[lead.id] = lead.businessId;
    }
  }

  return { exists, businessIds };
}
