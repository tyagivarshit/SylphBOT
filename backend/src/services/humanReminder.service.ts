import prisma from "../config/prisma";
import { buildHumanOpsEventDedupeKey, publishHumanOpsEvent } from "./humanOpsEvent.service";
import { mergeJsonRecords, toRecord } from "./reception.shared";
import { findOutboxEventByDedupeKey } from "./eventOutbox.service";

export const HUMAN_REMINDER_TYPES = [
  "STALE_ASSIGNMENT",
  "PENDING_REPLY",
  "SLA_RISK",
  "TAKEOVER_PENDING",
  "UNRESOLVED_CRITICAL",
] as const;

export type HumanReminderType = (typeof HUMAN_REMINDER_TYPES)[number];

export type HumanReminderCandidate = {
  queueId: string;
  interactionId: string;
  businessId: string;
  leadId: string;
  reminderType: HumanReminderType;
  targetHumanId: string | null;
  dueAt: Date;
};

type ReminderQueueRow = {
  id: string;
  interactionId: string;
  businessId: string;
  leadId: string;
  state: string;
  priority: string;
  assignedHumanId: string | null;
  slaDeadline: Date | null;
  updatedAt: Date;
  metadata: any;
};

type HumanReminderRepository = {
  loadQueueCandidates: (businessId?: string | null) => Promise<ReminderQueueRow[]>;
  recordReminderNudge?: (input: {
    queueId: string;
    reminderType: HumanReminderType;
    targetHumanId: string | null;
    bucket: string;
    at: Date;
  }) => Promise<void>;
};

const DEFAULT_CAPS: Record<HumanReminderType, number> = {
  STALE_ASSIGNMENT: 50,
  PENDING_REPLY: 50,
  SLA_RISK: 50,
  TAKEOVER_PENDING: 25,
  UNRESOLVED_CRITICAL: 25,
};

const createPrismaHumanReminderRepository = (): HumanReminderRepository => ({
  loadQueueCandidates: async (businessId) =>
    prisma.humanWorkQueue.findMany({
      where: {
        ...(businessId ? { businessId } : {}),
        state: {
          in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ESCALATED"],
        },
      },
      select: {
        id: true,
        interactionId: true,
        businessId: true,
        leadId: true,
        state: true,
        priority: true,
        assignedHumanId: true,
        slaDeadline: true,
        updatedAt: true,
        metadata: true,
      },
    }),
  recordReminderNudge: async ({
    queueId,
    reminderType,
    targetHumanId,
    bucket,
    at,
  }) => {
    const queueRow = await prisma.humanWorkQueue.findUnique({
      where: {
        id: queueId,
      },
      select: {
        metadata: true,
      },
    });
    await prisma.humanWorkQueue.update({
      where: {
        id: queueId,
      },
      data: {
        metadata: mergeJsonRecords(toRecord(queueRow?.metadata), {
          reminders: {
            lastReminderType: reminderType,
            lastReminderAt: at.toISOString(),
            bucket,
            targetHumanId,
          },
        }) as any,
      },
    });
  },
});

const buildHourBucket = (now: Date) => {
  const bucket = new Date(now.getTime());
  bucket.setMinutes(0, 0, 0);
  return bucket.toISOString();
};

const chooseReminderType = ({
  row,
  now,
}: {
  row: ReminderQueueRow;
  now: Date;
}): HumanReminderType | null => {
  const minutesSinceUpdate = Math.max(
    0,
    Math.floor((now.getTime() - row.updatedAt.getTime()) / 60_000)
  );
  const minutesToSla =
    row.slaDeadline instanceof Date
      ? Math.floor((row.slaDeadline.getTime() - now.getTime()) / 60_000)
      : null;
  const metadata = toRecord(row.metadata);
  const takeover = toRecord(metadata.takeover);

  if (
    String(row.priority || "").toUpperCase() === "CRITICAL" &&
    ["PENDING", "ASSIGNED", "IN_PROGRESS", "ESCALATED"].includes(row.state)
  ) {
    return "UNRESOLVED_CRITICAL";
  }

  if (Boolean(takeover.active) && ["PENDING", "ASSIGNED"].includes(row.state)) {
    return "TAKEOVER_PENDING";
  }

  if (minutesToSla !== null && minutesToSla <= 10 && minutesToSla >= -5) {
    return "SLA_RISK";
  }

  if (row.state === "ASSIGNED" && minutesSinceUpdate >= 15) {
    return "STALE_ASSIGNMENT";
  }

  if (row.state === "IN_PROGRESS" && minutesSinceUpdate >= 20) {
    return "PENDING_REPLY";
  }

  return null;
};

export const createHumanReminderService = ({
  repository = createPrismaHumanReminderRepository(),
}: {
  repository?: HumanReminderRepository;
} = {}) => ({
  collectDueReminders: async ({
    businessId,
    now = new Date(),
  }: {
    businessId?: string | null;
    now?: Date;
  }): Promise<HumanReminderCandidate[]> => {
    const queues = await repository.loadQueueCandidates(businessId);
    const reminders: HumanReminderCandidate[] = [];

    for (const row of queues) {
      const reminderType = chooseReminderType({
        row,
        now,
      });

      if (!reminderType) {
        continue;
      }

      reminders.push({
        queueId: row.id,
        interactionId: row.interactionId,
        businessId: row.businessId,
        leadId: row.leadId,
        reminderType,
        targetHumanId: row.assignedHumanId || null,
        dueAt: now,
      });
    }

    reminders.sort((left, right) => {
      if (left.reminderType !== right.reminderType) {
        return left.reminderType.localeCompare(right.reminderType);
      }

      return left.queueId.localeCompare(right.queueId);
    });

    return reminders;
  },
  emitDueReminders: async ({
    businessId,
    now = new Date(),
    caps,
  }: {
    businessId?: string | null;
    now?: Date;
    caps?: Partial<Record<HumanReminderType, number>>;
  }) => {
    const due = await createHumanReminderService({
      repository,
    }).collectDueReminders({
      businessId,
      now,
    });
    const effectiveCaps = {
      ...DEFAULT_CAPS,
      ...(caps || {}),
    };
    const counter: Record<HumanReminderType, number> = {
      STALE_ASSIGNMENT: 0,
      PENDING_REPLY: 0,
      SLA_RISK: 0,
      TAKEOVER_PENDING: 0,
      UNRESOLVED_CRITICAL: 0,
    };
    const emitted: HumanReminderCandidate[] = [];
    const bucket = buildHourBucket(now);

    for (const reminder of due) {
      const cap = Math.max(0, Number(effectiveCaps[reminder.reminderType] || 0));

      if (counter[reminder.reminderType] >= cap) {
        continue;
      }

      const eventKey = `${reminder.queueId}:${reminder.reminderType}:${bucket}`;
      const dedupeKey = buildHumanOpsEventDedupeKey({
        event: "human.reminder.nudged",
        aggregateId: reminder.queueId,
        eventKey,
      });
      const existing = await findOutboxEventByDedupeKey(dedupeKey);

      if (existing) {
        continue;
      }

      await repository.recordReminderNudge?.({
        queueId: reminder.queueId,
        reminderType: reminder.reminderType,
        targetHumanId: reminder.targetHumanId,
        bucket,
        at: now,
      });

      counter[reminder.reminderType] += 1;

      await publishHumanOpsEvent({
        event: "human.reminder.nudged",
        businessId: reminder.businessId,
        aggregateType: "human_work_queue",
        aggregateId: reminder.queueId,
        eventKey,
        dedupeKey,
        payload: {
          queueId: reminder.queueId,
          interactionId: reminder.interactionId,
          businessId: reminder.businessId,
          leadId: reminder.leadId,
          reminderType: reminder.reminderType,
          targetHumanId: reminder.targetHumanId,
        },
      });

      emitted.push(reminder);
    }

    return {
      scanned: due.length,
      emitted: emitted.length,
      byType: counter,
      reminders: emitted,
    };
  },
});
