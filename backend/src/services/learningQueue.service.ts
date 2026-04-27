import { shouldLearn } from "./learningFilter.service";
import { ingestKnowledge } from "./knowledgeIngestion.service";

const queue: any[] = [];
let processing = false;

const globalForLearningQueue = globalThis as typeof globalThis & {
  __sylphLearningQueueInterval?: ReturnType<typeof setInterval>;
};

export const enqueueLearning = async (data: any) => {
  queue.push(data);
  initLearningQueue();
};

const processQueue = async () => {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const item = queue.shift();

    try {
      if (!shouldLearn(item.input, item.output)) continue;

      await ingestKnowledge(item);
    } catch (err) {
      console.error("Queue processing error:", err);
    }
  }

  processing = false;
};

export const initLearningQueue = () => {
  if (!globalForLearningQueue.__sylphLearningQueueInterval) {
    globalForLearningQueue.__sylphLearningQueueInterval = setInterval(
      processQueue,
      3000
    );
  }

  return globalForLearningQueue.__sylphLearningQueueInterval;
};

export const shutdownLearningQueue = () => {
  if (globalForLearningQueue.__sylphLearningQueueInterval) {
    clearInterval(globalForLearningQueue.__sylphLearningQueueInterval);
    globalForLearningQueue.__sylphLearningQueueInterval = undefined;
  }
};
