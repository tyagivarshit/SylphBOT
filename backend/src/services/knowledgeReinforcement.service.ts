import prisma from "../config/prisma";

const uniqueIds = (ids: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      ids
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

const OUTCOME_WEIGHTS: Record<string, number> = {
  replied: 0.08,
  opened: 0.04,
  link_clicked: 0.18,
  booked_call: 0.35,
  payment_completed: 0.45,
};

export const markKnowledgeRetrieved = async (knowledgeIds: string[]) => {
  const ids = uniqueIds(knowledgeIds);

  if (!ids.length) {
    return;
  }

  await prisma.knowledgeBase.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: {
      retrievalCount: {
        increment: 1,
      },
      lastRetrievedAt: new Date(),
    },
  });
};

export const reinforceKnowledgeHits = async ({
  knowledgeIds,
  outcome,
}: {
  knowledgeIds: string[];
  outcome: string;
}) => {
  const ids = uniqueIds(knowledgeIds);

  if (!ids.length) {
    return;
  }

  const delta = OUTCOME_WEIGHTS[String(outcome || "").trim().toLowerCase()] || 0.05;

  await Promise.all(
    ids.map((id) =>
      prisma.knowledgeBase.update({
        where: {
          id,
        },
        data: {
          successCount: {
            increment: 1,
          },
          reinforcementScore: {
            increment: delta,
          },
          lastReinforcedAt: new Date(),
        },
      })
    )
  );
};
