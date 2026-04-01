import { shouldLearn } from "./learningFilter.service"
import { ingestKnowledge } from "./knowledgeIngestion.service";

const queue: any[] = [];
let processing = false;

export const enqueueLearning = async (data: any) => {
  queue.push(data);
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

/* auto runner */
setInterval(processQueue, 3000);