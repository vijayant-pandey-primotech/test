import { redisPublisher as redis } from "./redisPublisher.js";
import { publishToChannel } from "./redisPublisher.js";
import Logger from "../logger/logger.js";
import { Policy } from "../model/index.js";

const POLICY_CACHE_CHANNEL = "policy:items:cache";

export const getAllPoliciesFromDB = async () => {
  try {
    const policies = await Policy.findAll({ raw: true });

    Logger.info("Policies fetched from database successfully:", policies);
    // Pipeline for batch writes (much faster)
    const pipeline = redis.pipeline();

    for (const policy of policies) {
      pipeline.hset(POLICY_CACHE_CHANNEL,policy.itemId, JSON.stringify(policy.policies));
    }
    await pipeline.exec();
    Logger.info("Policies cached successfully in Redis");
    Logger.info(`✅ Cached ${policies.length} policies in Redis.`);
    
    return policies.length;
  } catch (error) {
    Logger.error("Error caching policies in Redis:", error);
    throw error;
  }
};


export const updatePolicyCacheForItem = async (itemId) => {
  try {
    if (!itemId) {
      throw new Error("Item ID is required");
    }
    Logger.info(`🔄 Updating cache for itemId: ${itemId} (type: ${typeof itemId})`);
    
    // Fetch the latest policy for this item from the database
    const policy = await Policy.findOne({
      where: { itemId },
      raw: true,
    });

    Logger.info(`Policy lookup result: ${policy ? 'FOUND' : 'NOT FOUND'}`, policy ? { itemId: policy.itemId, policyId: policy.policyId } : null);

    if (!policy) {
      // ❌ No policy found → remove this field from the hash
      const itemIdStr = String(itemId);
      await redis.hdel(POLICY_CACHE_CHANNEL, itemIdStr);
      Logger.info(`🧹 Policy cache deleted for itemId: ${itemId} (no policy found)`);

      
      return;
    }

    // ✅ Policy found → update it in the Redis hash
    const itemIdStr = String(itemId);
    const policiesJson = JSON.stringify(policy.policies);
    Logger.info(`Setting cache: hash=${POLICY_CACHE_CHANNEL}, key=${itemIdStr}, policies length=${policiesJson.length}`);
    
    const result = await redis.hset(POLICY_CACHE_CHANNEL, itemIdStr, policiesJson);
    Logger.info(`Redis hset result: ${result}`);
    
    // Verify the update was successful
    const cachedValue = await redis.hget(POLICY_CACHE_CHANNEL, itemIdStr);
    if (cachedValue) {
      Logger.info(`✅ Cache verification SUCCESS - cached value length: ${cachedValue.length}`);
    } else {
      Logger.error(`❌ Cache verification FAILED - no value found in cache for itemId: ${itemId}`);
    }

    Logger.info(`✅ Policy cache updated for itemId: ${itemId}`);

    // Notify subscribers about update
    await publishToChannel(POLICY_CACHE_CHANNEL, {
      event: "policy_cache_updated",
      itemId,
      action: "updated",
      timestamp: Date.now(),
      message: `Policy cache updated for itemId: ${itemId}`,
    });
  } catch (error) {
    Logger.error(`❌ Error updating policy cache for itemId ${itemId}:`, error);
    throw error;
  }
};