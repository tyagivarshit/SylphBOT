import { getQueueHealth } from "../services/queueHealth.service";
import { getSystemHealth } from "../services/systemHealth.service";

export const getSystemHealthSnapshot = async () => {
  const [system, queues] = await Promise.all([
    getSystemHealth(),
    getQueueHealth(),
  ]);

  return {
    ...system,
    queues,
  };
};
