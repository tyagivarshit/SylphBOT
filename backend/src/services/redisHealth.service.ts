import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string);

export const checkRedisHealth = async () => {

  try {

    await redis.ping();

    return {
      status: "healthy",
    };

  } catch (error) {

    return {
      status: "unhealthy",
    };

  }

};