import prisma from "../config/prisma";
import { startAutonomousSchedulerCron } from "../cron/autonomousScheduler.cron";
import {
  closeRedisConnection,
  initRedis as initRedisConnections,
  waitForRedisReady as waitForRedisConnectionsReady,
} from "../config/redis";
import { startCleanupCron } from "../cron/cron.runner";
import { startMessageCleanupCron } from "../cron/messageCleanup.cron";
import { startConnectionHealthCron } from "../cron/connectionHealth.cron";
import { startMetaTokenRefreshCron } from "../cron/metaTokenRefresh.cron";
import { startUsageResetCron } from "../cron/resetUsage.cron";
import { startTrialExpiryCron } from "../cron/trial.cron";
import { closeAIQueue, initAIQueues } from "../queues/ai.queue";
import {
  closeAuthEmailQueue,
  initAuthEmailQueue,
} from "../queues/authEmail.queue";
import {
  closeBookingReminderQueue,
  initBookingReminderQueue,
} from "../queues/bookingReminder.queue";
import {
  closeAppointmentOpsQueue,
  initAppointmentOpsQueue,
} from "../queues/appointmentOps.queue";
import {
  closeCalendarSyncQueue,
  initCalendarSyncQueue,
} from "../queues/calendarSync.queue";
import {
  closeFollowupQueue,
  initFollowupQueues,
} from "../queues/followup.queue";
import {
  closeReceptionRuntimeQueues,
  initReceptionRuntimeQueues,
} from "../queues/receptionRuntime.queue";
import {
  closeHumanReminderQueue,
  initHumanReminderQueue,
} from "../queues/humanReminder.queue";
import {
  closeCRMRefreshQueue,
  initCRMRefreshQueue,
} from "../services/crm/refreshQueue.service";
import { startInboundSlaMonitorCron } from "../cron/inboundSlaMonitor.cron";
import { startHumanReminderCron } from "../cron/humanReminder.cron";
import { startAppointmentOpsCron } from "../cron/appointmentOps.cron";
import { startCalendarSyncCron } from "../cron/calendarSync.cron";
import { startIntelligenceLoopCron } from "../cron/intelligenceLoop.cron";
import { startCommerceReconcileCron } from "../cron/commerceReconcile.cron";
import { initRevenueBrainEventQueues } from "../services/revenueBrain/eventBus.service";
import { shutdownLearningQueue } from "../services/learningQueue.service";
import {
  closeAuthEmailWorker,
  initAuthEmailWorker,
} from "../workers/authEmail.worker";
import {
  closeBookingReminderWorker,
  initBookingReminderWorker,
} from "../workers/bookingReminder.worker";
import {
  closeAppointmentOpsWorker,
  initAppointmentOpsWorker,
} from "../workers/appointmentOps.worker";
import {
  closeCalendarSyncWorker,
  initCalendarSyncWorker,
} from "../workers/calendarSync.worker";
import {
  closeAIPartitionWorkers,
  initAIPartitionWorkers,
} from "../workers/ai.partition.worker";
import {
  closeFollowupWorkers,
  initFollowupWorkers,
} from "../workers/followup.worker";
import {
  closeReceptionRuntimeWorkers,
  initReceptionRuntimeWorkers,
} from "../workers/receptionRuntime.worker";
import {
  closeHumanReminderWorker,
  initHumanReminderWorker,
} from "../workers/humanReminder.worker";
import {
  startCRMRefreshWorker,
  stopCRMRefreshWorker,
} from "../workers/crmRefresh.worker";
import {
  startRevenueBrainEventWorker,
  stopRevenueBrainEventWorker,
} from "../workers/revenueBrainEvents.worker";
import { bootstrapReliabilityOS } from "../services/reliability/reliabilityOS.service";
import { bootstrapInfrastructureResilienceOS } from "../services/reliability/infrastructureResilienceOS.service";
import { bootstrapSaaSPackagingConnectHubOS } from "../services/saasPackagingConnectHubOS.service";
import { bootstrapDeveloperPlatformExtensibilityOS } from "../services/developerPlatformExtensibilityOS.service";
import { bootstrapGrowthExpansionOS } from "../services/growthExpansionOS.service";

type CronTask = {
  stop?: () => void;
  destroy?: () => void;
};

export type WorkerLifecycleOptions = {
  crmRefresh?: boolean;
  revenueBrainEvents?: boolean;
  aiPartition?: boolean;
  followup?: boolean;
  authEmail?: boolean;
  bookingReminder?: boolean;
  appointmentOps?: boolean;
  calendarSync?: boolean;
  receptionRuntime?: boolean;
  humanReminder?: boolean;
};

const globalForLifecycle = globalThis as typeof globalThis & {
  __sylphCronTasks?: CronTask[];
  __sylphQueuesInitialized?: boolean;
  __sylphQueueInitPromise?: Promise<void>;
};

export const initRedis = () => initRedisConnections();

export const waitForRedisReady = () =>
  waitForRedisConnectionsReady({
    requireQueue: true,
  });

export const initQueues = async () => {
  if (globalForLifecycle.__sylphQueuesInitialized) {
    return;
  }

  if (globalForLifecycle.__sylphQueueInitPromise) {
    await globalForLifecycle.__sylphQueueInitPromise;
    return;
  }

  const initPromise = (async () => {
    initRedisConnections();
    await waitForRedisReady();
    void bootstrapReliabilityOS().catch(() => undefined);
    void bootstrapInfrastructureResilienceOS().catch(() => undefined);
    void bootstrapSaaSPackagingConnectHubOS().catch(() => undefined);
    void bootstrapDeveloperPlatformExtensibilityOS().catch(() => undefined);
    void bootstrapGrowthExpansionOS().catch(() => undefined);
    initAIQueues();
    initFollowupQueues();
    initAuthEmailQueue();
    initBookingReminderQueue();
    initAppointmentOpsQueue();
    initCalendarSyncQueue();
    initCRMRefreshQueue();
    initRevenueBrainEventQueues();
    initReceptionRuntimeQueues();
    initHumanReminderQueue();
    globalForLifecycle.__sylphQueuesInitialized = true;
  })();

  globalForLifecycle.__sylphQueueInitPromise = initPromise;
  try {
    await initPromise;
  } finally {
    if (globalForLifecycle.__sylphQueueInitPromise === initPromise) {
      globalForLifecycle.__sylphQueueInitPromise = undefined;
    }
  }
};

export const initWorkers = (options: WorkerLifecycleOptions = {}) => {
  if (options.crmRefresh) {
    startCRMRefreshWorker();
  }

  if (options.revenueBrainEvents) {
    startRevenueBrainEventWorker();
  }

  if (options.aiPartition) {
    initAIPartitionWorkers();
  }

  if (options.followup) {
    initFollowupWorkers();
  }

  if (options.authEmail) {
    initAuthEmailWorker();
  }

  if (options.bookingReminder) {
    initBookingReminderWorker();
  }

  if (options.appointmentOps) {
    initAppointmentOpsWorker();
  }

  if (options.calendarSync) {
    initCalendarSyncWorker();
  }

  if (options.receptionRuntime) {
    initReceptionRuntimeWorkers();
  }

  if (options.humanReminder) {
    initHumanReminderWorker();
  }
};

export const initCrons = () => {
  if (globalForLifecycle.__sylphCronTasks) {
    return globalForLifecycle.__sylphCronTasks;
  }

  globalForLifecycle.__sylphCronTasks = [
    startAutonomousSchedulerCron(),
    startTrialExpiryCron(),
    startMetaTokenRefreshCron(),
    startUsageResetCron(),
    startConnectionHealthCron(),
    startCleanupCron(),
    startMessageCleanupCron(),
    startInboundSlaMonitorCron(),
    startHumanReminderCron(),
    startAppointmentOpsCron(),
    startCalendarSyncCron(),
    startIntelligenceLoopCron(),
    startCommerceReconcileCron(),
  ];

  return globalForLifecycle.__sylphCronTasks;
};

export const shutdownCrons = () => {
  for (const task of globalForLifecycle.__sylphCronTasks || []) {
    task.stop?.();
    task.destroy?.();
  }

  globalForLifecycle.__sylphCronTasks = undefined;
};

export const shutdown = async () => {
  shutdownCrons();
  shutdownLearningQueue();

  await Promise.allSettled([
    closeAIPartitionWorkers(),
    closeFollowupWorkers(),
    closeBookingReminderWorker(),
    closeAppointmentOpsWorker(),
    closeCalendarSyncWorker(),
    closeAuthEmailWorker(),
    closeReceptionRuntimeWorkers(),
    closeHumanReminderWorker(),
    stopRevenueBrainEventWorker(),
    stopCRMRefreshWorker(),
    closeCRMRefreshQueue(),
    closeAIQueue(),
    closeFollowupQueue(),
    closeAuthEmailQueue(),
    closeBookingReminderQueue(),
    closeAppointmentOpsQueue(),
    closeCalendarSyncQueue(),
    closeReceptionRuntimeQueues(),
    closeHumanReminderQueue(),
    prisma.$disconnect(),
    closeRedisConnection(),
  ]);

  globalForLifecycle.__sylphQueuesInitialized = undefined;
  globalForLifecycle.__sylphQueueInitPromise = undefined;
};
