import redis from "../config/redis";

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