import { registerAutonomousCampaignTrackers } from "../services/autonomous/campaign.service";
import { registerRevenueBrainAnalyticsTracker } from "../services/revenueBrain/analytics.tracker";
import {
  closeRevenueBrainEventQueue,
  initRevenueBrainEventWorker,
} from "../services/revenueBrain/eventBus.service";
import { registerRevenueBrainLearningTracker } from "../services/revenueBrain/learning.tracker";

export const startRevenueBrainEventWorker = () => {
  registerAutonomousCampaignTrackers();
  registerRevenueBrainAnalyticsTracker();
  registerRevenueBrainLearningTracker();

  const worker = initRevenueBrainEventWorker();

  if (!worker) {
    console.log(
      "[revenueBrainEvents.worker] RUN_WORKER disabled, worker not started"
    );
  }

  return worker;
};

export const stopRevenueBrainEventWorker = async () => {
  await closeRevenueBrainEventQueue();
};
