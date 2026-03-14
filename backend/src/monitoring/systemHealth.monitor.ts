import { getQueueHealth } from "../services/queueHealth.service"
import { checkRedisHealth } from "../services/redisHealth.service";

export const getSystemHealth = async () => {

  const queueHealth = await getQueueHealth();

  const redisHealth = await checkRedisHealth();

  return {
    redis: redisHealth,
    queues: queueHealth,
    uptime: process.uptime(),
  };

};