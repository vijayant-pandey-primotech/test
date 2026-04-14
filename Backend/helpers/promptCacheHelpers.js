import { redisPublisher as redis } from "../config/redisPublisher.js";
import Logger from "../logger/logger.js";
import sequelize from "../config/db.js";
import { PromptsMaster, PromptTypeLookup } from "../model/index.js";

/** Legacy admin cache prefix (cleared on rebuild). */
export const PROMPTS_CACHE_PREFIX_LEGACY = "cache:prompts:";

/**
 * Key format: prompts:{prompt_function_name}:{platform_id}:{story_id}:{chapter_id}
 * `prompt_function_name` is escaped (colons → __) so it is safe as a Redis key segment.
 */
export const PROMPTS_KEY_PREFIX = "prompts:";

export const normId = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

/** Escape `:` in prompt function names so keys stay unambiguous. */
export const redisKeySegmentPromptFunction = (name) => {
  if (name == null || name === "") return "_";
  return String(name).replace(/:/g, "__");
};

export const redisPromptKey = (promptFunctionName, platformId, storyId, chapterId) =>
  `${PROMPTS_KEY_PREFIX}${redisKeySegmentPromptFunction(promptFunctionName)}:${normId(
    platformId
  )}:${normId(storyId)}:${normId(chapterId)}`;

/**
 * Redis bucket keys for a published row: one key per platform id in `platform_ids`,
 * or a single key with platform `0` when scope is “all platforms”.
 */
export const redisKeysForPromptRow = (row) => {
  const j = typeof row.toJSON === "function" ? row.toJSON() : { ...row };
  const fn =
    j.promptTypeLookup?.promptFunctionName ??
    j.prompt_function_name ??
    j.promptFunctionName;
  if (!fn) {
    Logger.warn("redisKeysForPromptRow: missing prompt_function_name on row", j.id);
    return [];
  }

  let ids = j.platformIds ?? j.platform_ids;
  if (typeof ids === "string") {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = null;
    }
  }
  let platformBuckets = [];
  if (Array.isArray(ids) && ids.length > 0) {
    platformBuckets = [...new Set(ids.map((x) => normId(x)).filter((n) => n > 0))];
  }
  if (platformBuckets.length === 0) {
    platformBuckets = [0];
  }
  return platformBuckets.map((pid) =>
    redisPromptKey(fn, pid, j.storyId, j.chapterId)
  );
};

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
  }
};

/**
 * Clear all prompt cache keys (legacy `cache:prompts:*` and new `prompts:*`).
 * storyId is ignored; kept for API compatibility with older callers.
 */
export const invalidatePromptsCache = async (storyId = null) => {
  await invalidateByPrefix(PROMPTS_KEY_PREFIX);
  await invalidateByPrefix(PROMPTS_CACHE_PREFIX_LEGACY);
};

/**
 * Rebuild Redis from DB: one key per (prompt_function_name, platform_id, story_id, chapter_id),
 * each value a JSON array of published prompt rows (`is_deleted = 0`, `is_published = 1`).
 */
export const refreshAllPromptsRedisCache = async () => {
  try {
    await invalidateByPrefix(PROMPTS_KEY_PREFIX);
    await invalidateByPrefix(PROMPTS_CACHE_PREFIX_LEGACY);

    const prompts = await PromptsMaster.findAll({
      where: {
        isDeleted: 0,
        isPublished: 1,
      },
      include: [
        {
          model: PromptTypeLookup,
          as: "promptTypeLookup",
          attributes: ["id", "promptFunctionName", "display"],
          required: true,
        },
      ],
      order: [
        [sequelize.col("prompts_master.prompt_type_id"), "ASC"],
        [sequelize.col("prompts_master.chapter_id"), "ASC"],
        [sequelize.col("prompts_master.version"), "DESC"],
        [sequelize.col("prompts_master.updated_at"), "DESC"],
      ],
    });

    const buckets = new Map();
    for (const p of prompts) {
      const payload = p.toJSON();
      for (const key of redisKeysForPromptRow(payload)) {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(payload);
      }
    }

    for (const [key, rows] of buckets) {
      await redis.set(key, JSON.stringify(rows));
    }

    Logger.info(
      `Prompts Redis rebuilt: ${buckets.size} key(s), ${prompts.length} published row(s)`
    );
  } catch (err) {
    Logger.error("Failed to rebuild Prompts Redis cache:", err);
  }
};

/** @deprecated Use refreshAllPromptsRedisCache; storyId ignored. */
export const refreshPromptsCache = async (storyId) => {
  await refreshAllPromptsRedisCache();
};
