import Redis from "ioredis";
import Logger from "../logger/logger.js";

// Create Redis publisher client
export const redisPublisher = new Redis({
  host: process.env.REDISHOST,
  port: process.env.REDISPORT || 6379,
  password: process.env.REDISPASSWORD,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000); // Exponential backoff, max 2s
    Logger.info(`Retrying Redis publisher connection in ${delay}ms...`);
    return delay;
  },
});

// Connection Events
redisPublisher.on("connect", () => {
  Logger.info("Redis publisher connected successfully");
});

redisPublisher.on("ready", () => {
  Logger.info("Redis publisher connection is ready");
});

redisPublisher.on("error", (error) => {
  Logger.error(`Redis publisher connection error: ${error.message}`);
});

redisPublisher.on("close", () => {
  Logger.warn("Redis publisher connection closed");
});

redisPublisher.on("reconnecting", (delay) => {
  Logger.warn(`Redis publisher reconnecting in ${delay}ms...`);
});

redisPublisher.on("end", () => {
  Logger.error("Redis publisher connection ended. No more retries.");
});


export const publishNotification = async (
  channel,
  userId,
  notificationCount,
  notificationData = null
) => {
  try {
    if (!channel || !userId || notificationCount === undefined) {
      throw new Error(
        "Invalid input: channel, userId, and notificationCount are required."
      );
    }

    const payload = JSON.stringify({
      userId,
      notificationCount,
      notificationData,
    });

    Logger.info(`Publishing notification to channel: ${channel}`, {
      channel,
      userId,
      notificationCount,
    });

    const numSubscribers = await redisPublisher.publish(channel, payload);

    if (numSubscribers === 0) {
      Logger.warn(`No active subscribers for channel: ${channel}`);
    } else {
      Logger.info(
        `Notification published to ${channel}. Subscribers count: ${numSubscribers}`
      );
    }

    return numSubscribers;
  } catch (error) {
    Logger.error(
      `Error publishing notification to channel: ${channel}. Details: ${error.message}`
    );
    throw new Error(
      `Failed to publish notification to ${channel}: ${error.message}`
    );
  }
};


export const publishRealtimeUpdate = async (
  channel,
  userId = null,
  payload = {},
  communityListUpdate = null
) => {
  try {
    if (!channel || !payload) {
      throw new Error("Invalid input: channel and payload are required.");
    }

    const messagePayload = JSON.stringify({
      userId,
      payload,
      communityListUpdate,
    });

    Logger.info(`Publishing real-time update to channel: ${channel}`, {
      channel,
      userId,
      payload,
    });

    const numSubscribers = await redisPublisher.publish(
      channel,
      messagePayload
    );

    if (numSubscribers === 0) {
      Logger.warn(`No active subscribers for channel: ${channel}`);
    } else {
      Logger.info(
        `Real-time update published to ${channel}. Subscribers count: ${numSubscribers}`
      );
    }

    return numSubscribers;
  } catch (error) {
    Logger.error(
      `Error publishing real-time update to channel: ${channel}. Details: ${error.message}`
    );
    throw new Error(
      `Failed to publish real-time update to ${channel}: ${error.message}`
    );
  }
};

export const publishToChannel = async (channel, data) => {
  try {
    if (!channel || !data) {
      throw new Error("Invalid input: channel and data are required.");
    }

    const payload = JSON.stringify(data);

    Logger.info(`Publishing message to channel: ${channel}`, {
      channel,
      data,
    });

    const numSubscribers = await redisPublisher.publish(channel, payload);

    if (numSubscribers === 0) {
      Logger.warn(`No active subscribers for channel: ${channel}`);
    } else {
      Logger.info(
        `Message published to ${channel}. Subscribers count: ${numSubscribers}`
      );
    }

    return numSubscribers;
  } catch (error) {
    Logger.error(
      `Error publishing message to channel: ${channel}. Details: ${error.message}`
    );
    throw new Error(
      `Failed to publish message to ${channel}: ${error.message}`
    );
  }
};


export const publishAdminUpdate = async (userId = null, payload = {}) => {
  return publishRealtimeUpdate("admin:updates", userId, payload);
};

