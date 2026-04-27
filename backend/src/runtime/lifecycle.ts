import prisma from "../config/prisma";
import { startAutonomousSchedulerCron } from "../cron/autonomousScheduler.cron";
import {
  closeRedisConnection,
  initRedis as initRedisConnections,
} from "../config/redis";
import { startCleanupCron } from "../cron/cron.runner";
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
  closeLegacyInboxQueueWorker,
  initLegacyInboxQueueWorker,
} from "../queues/inbox.queue";
import {
  closeAutomationQueue,
  initAutomationQueue,
} from "../queues/automation.queue";
import {
  closeBookingReminderQueue,
  initBookingReminderQueue,
} from "../queues/bookingReminder.queue";
import {
  closeFollowupQueue,
  initFollowupQueues,
} from "../queues/followup.queue";
import { closeFunnelQueue, initFunnelQueue } from "../queues/funnel.queue";
import {
  closeCRMRefreshQueue,
  initCRMRefreshQueue,
} from "../services/crm/refreshQueue.service";
import { initRevenueBrainEventQueues } from "../services/revenueBrain/eventBus.service";
import { shutdownLearningQueue } from "../services/learningQueue.service";
import {
  closeLegacyInboxRouteWorker,
  initLegacyInboxRouteWorker,
} from "../routes/inbox.routes";
import {
  closeAuthEmailWorker,
  initAuthEmailWorker,
} from "../workers/authEmail.worker";
import {
  closeAutomationWorker,
  initAutomationWorker,
} from "../workers/automation.worker";
import {
  closeBookingMonitorWorker,
  initBookingMonitorWorker,
} from "../workers/bookingMonitor.worker";
import {
  closeBookingReminderWorker,
  initBookingReminderWorker,
} from "../workers/bookingReminder.worker";
import {
  closeAIPartitionWorkers,
  initAIPartitionWorkers,
} from "../workers/ai.partition.worker";
import {
  closeFollowupWorkers,
  initFollowupWorkers,
} from "../workers/followup.worker";
import {
  startCRMRefreshWorker,
  stopCRMRefreshWorker,
} from "../workers/crmRefresh.worker";
import {
  startRevenueBrainEventWorker,
  stopRevenueBrainEventWorker,
} from "../workers/revenueBrainEvents.worker";

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
  automation?: boolean;
  bookingReminder?: boolean;
  bookingMonitor?: boolean;
  legacyInboxQueue?: boolean;
  legacyInboxRoute?: boolean;
};

const globalForLifecycle = globalThis as typeof globalThis & {
  __sylphCronTasks?: CronTask[];
};

export const initRedis = () => initRedisConnections();

export const initQueues = () => {
  initRedisConnections();
  initAIQueues();
  initFollowupQueues();
  initAutomationQueue();
  initAuthEmailQueue();
  initBookingReminderQueue();
  initFunnelQueue();
  initCRMRefreshQueue();
  initRevenueBrainEventQueues();
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

  if (options.automation) {
    initAutomationWorker();
  }

  if (options.bookingReminder) {
    initBookingReminderWorker();
  }

  if (options.bookingMonitor) {
    initBookingMonitorWorker();
  }

  if (options.legacyInboxQueue) {
    initLegacyInboxQueueWorker();
  }

  if (options.legacyInboxRoute) {
    initLegacyInboxRouteWorker();
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
    closeBookingMonitorWorker(),
    closeBookingReminderWorker(),
    closeAutomationWorker(),
    closeAuthEmailWorker(),
    closeLegacyInboxQueueWorker(),
    closeLegacyInboxRouteWorker(),
    stopRevenueBrainEventWorker(),
    stopCRMRefreshWorker(),
    closeCRMRefreshQueue(),
    closeAIQueue(),
    closeFollowupQueue(),
    closeAutomationQueue(),
    closeAuthEmailQueue(),
    closeBookingReminderQueue(),
    closeFunnelQueue(),
    prisma.$disconnect(),
    closeRedisConnection(),
  ]);
};
