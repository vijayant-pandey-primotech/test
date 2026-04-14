import { redisPublisher as redis } from "./redisPublisher.js";
import Logger from "../logger/logger.js";
import {
  invalidatePromptsCache as invalidatePromptsCacheHelper,
  refreshAllPromptsRedisCache,
} from "../helpers/promptCacheHelpers.js";

/** Cache key prefixes - clear all keys starting with these when invalidating */
export const ADMIN_CACHE_KEYS = {
  ALL_ADMIN_ASSISTANTS: "cache:admin:assistants:",
  ALL_ADMIN_ARTICLES: "cache:admin:articles:",
  PLATFORM_TASK_RECOMMENDATION: "cache:platform:task:recommendation:",
  /** Platform mapping cache - invalidate when platform mappings change */
  PLATFORM_MAPPING: "cache:platform_mapping:",
  /** Chapters list cache - invalidate when chapters change */
  CHAPTERS: "cache:chapters:all",
  /** Items list cache - invalidate when items change */
  ITEMS: "cache:items:all",
  /** All assistants (recommendation_master) - invalidate when assistants/activities change */
  ALL_ASSISTANTS: "cache:recommendation_master:all_assistants:",
  /** Activities with assistants - invalidate when activities or assistants change */
  ACTIVITIES_WITH_ASSISTANTS: "cache:activities:with_assistants:",
  /** Prompts cache (legacy prefix; new keys use `prompts:`) */
  PROMPTS: "prompts:",
};

/** Plan name that uses the platform task recommendation cache (task_type in TaskMaster). */
export const ONBOARDING_RECOMMENDATION_PLAN_NAME = "Onboarding Recommendation";

/** Returns true if the given TaskMaster row is the Onboarding Recommendation plan. */
export const isOnboardingRecommendationPlan = (task) =>
  task && String(task.task_type || "").trim() === ONBOARDING_RECOMMENDATION_PLAN_NAME;

/**
 * Delete all Redis keys matching a prefix (e.g. cache:admin:assistants:*).
 * Safe to call even if Redis is down; logs errors and does not throw.
 */
const invalidateByPrefix = async (prefix) => {
  try {
    const pattern = `${prefix}*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      Logger.info(`Admin cache invalidated: ${keys.length} key(s) for prefix ${prefix}`);
    }
  } catch (err) {
    Logger.error(`Failed to invalidate admin cache for prefix ${prefix}:`, err);
    // Don't throw - cache invalidation failure shouldn't break the main operation
  }
};

/** Invalidate all admin assistants list cache (call after create/update/delete assistant). */
export const invalidateAdminAssistantsCache = async () => {
  await invalidateByPrefix(ADMIN_CACHE_KEYS.ALL_ADMIN_ASSISTANTS);
};

/** Invalidate all admin articles list cache (call after create/update/delete article). */
export const invalidateAdminArticlesCache = async () => {
  await invalidateByPrefix(ADMIN_CACHE_KEYS.ALL_ADMIN_ARTICLES);
};

/** Invalidate platform task recommendation cache (call when plan/task or platform tasks change). */
export const invalidatePlatformTaskRecommendationCache = async () => {
  await invalidateByPrefix(ADMIN_CACHE_KEYS.PLATFORM_TASK_RECOMMENDATION);
};

/** Invalidate platform mapping cache (call when platform mapping / stories / chapters mappings change). */
export const invalidatePlatformMappingCache = async () => {
  await invalidateByPrefix(ADMIN_CACHE_KEYS.PLATFORM_MAPPING);
};

/** Invalidate chapters cache (call when chapters or related data change). */
export const invalidateChaptersCache = async () => {
  await invalidateByPrefix(ADMIN_CACHE_KEYS.CHAPTERS);
};

/** Invalidate items cache (call when items or related data change). */
export const invalidateItemsCache = async () => {
  await invalidateByPrefix(ADMIN_CACHE_KEYS.ITEMS);
};

/**
 * Invalidate prompt cache (all `prompts:*` and legacy `cache:prompts:*` keys).
 */
export const invalidatePromptsCache = async (storyId = null) => {
  await invalidatePromptsCacheHelper(storyId);
};

/** Invalidate activities-with-assistants and all-assistants caches (call when activity or assistants change). */
export const invalidateActivitiesAndAssistantsCache = async () => {
  await invalidateByPrefix(ADMIN_CACHE_KEYS.ACTIVITIES_WITH_ASSISTANTS);
  await invalidateByPrefix(ADMIN_CACHE_KEYS.ALL_ASSISTANTS);
};

/**
 * Rebuild all prompt Redis keys (`prompts:{platform_id}:{story_id}:{chapter_id}`).
 * storyId is ignored; kept for call-site compatibility.
 */
export const refreshPromptsCache = async (storyId) => {
  await refreshAllPromptsRedisCache();
};

export { refreshAllPromptsRedisCache };
