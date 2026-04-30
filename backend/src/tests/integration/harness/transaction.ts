import type { Prisma, PrismaClient } from "@prisma/client";

const ROLLBACK_MARKER = "__integration_rollback_marker__";

export const runWithRollback = async <T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
) => {
  try {
    await prisma.$transaction(async (tx) => {
      await operation(tx);
      throw new Error(ROLLBACK_MARKER);
    });
  } catch (error) {
    if (String((error as { message?: unknown })?.message || "") === ROLLBACK_MARKER) {
      return;
    }

    throw error;
  }
};
