import sequelize from "../config/db.js";
import {
  PromptTypeLookup,
  PromptsMaster,
  Stories,
  ChapterMaster,
} from "../model/index.js";
import { refreshPromptsCache } from "../config/redisAdminCache.js";
import {
  parseNullableInt,
  parseBoolean,
  validatePromptTypeExists,
  validatePromptTypeIdExists,
} from "../helpers/promptHelpers.js";
import {
  normalizePlatformIdsForStorage,
  canonicalPlatformScopeKeyFromRow,
  canonicalPlatformScopeKeyFromBody,
} from "../helpers/platformScopePrompts.js";

/** Next version number for a new row (same story/chapter/prompt type + platform scope). */
const getNextVersionForNewPrompt = async ({
  storyId,
  chapterId,
  promptTypeId,
  platformScopeBody,
  transaction,
  lock,
}) => {
  const targetKey = canonicalPlatformScopeKeyFromBody(platformScopeBody || {});
  const rows = await PromptsMaster.findAll({
    where: {
      storyId,
      chapterId: chapterId ?? null,
      promptTypeId,
      isDeleted: 0,
    },
    ...(transaction ? { transaction, lock } : {}),
  });
  let maxV = 0;
  for (const r of rows) {
    if (canonicalPlatformScopeKeyFromRow(r) !== targetKey) continue;
    const v = r.version != null ? Number(r.version) : 0;
    if (!Number.isNaN(v) && v > maxV) maxV = v;
  }
  return maxV + 1;
};

const serviceError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
};

/** MySQL TINYINT(1) / Sequelize boolean-ish */
const isTinyintTrue = (v) =>
  v === 1 || v === true || String(v) === "1";

/**
 * Resolves `prompt_type_id` from body, or legacy `prompt_type` (prompt_function_name).
 */
const resolvePromptTypeIdFromBody = async (body, { required } = { required: true }) => {
  const rawId = body?.prompt_type_id ?? body?.promptTypeId;
  if (rawId !== undefined && rawId !== null && rawId !== "") {
    const n = parseInt(String(rawId), 10);
    if (!Number.isNaN(n) && n > 0) {
      const ok = await validatePromptTypeIdExists(n);
      if (!ok) throw serviceError(400, "Invalid prompt_type_id");
      return n;
    }
  }
  const name = body?.prompt_type ?? body?.promptType;
  if (name != null && String(name).trim() !== "") {
    const row = await PromptTypeLookup.findOne({
      where: { promptFunctionName: String(name).trim() },
      attributes: ["id"],
      raw: true,
    });
    if (!row) throw serviceError(400, "Invalid prompt_type");
    return row.id;
  }
  if (required) throw serviceError(400, "prompt_type_id is required");
  return undefined;
};

const attachPromptTypeDisplay = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => {
    const j = typeof row.toJSON === "function" ? row.toJSON() : { ...row };
    const lu = j.promptTypeLookup;
    if (lu) {
      j.promptTypeDisplay = (lu.display && String(lu.display).trim()) || lu.promptFunctionName;
      j.promptFunctionName = lu.promptFunctionName;
    }
    if (j.hasEverBeenPublished !== undefined) {
      const flag = isTinyintTrue(j.hasEverBeenPublished) ? 1 : 0;
      // Keep both snake-case keys for compatibility across frontend revisions.
      j.has_been_published = flag;
      j.has_ever_been_published = flag;
    }
    return j;
  });
};

export const getPromptTypesService = async () => {
  const rows = await PromptTypeLookup.findAll({
    attributes: ["id", "promptFunctionName", "display"],
    raw: true,
    order: [
      ["display", "ASC"],
      ["promptFunctionName", "ASC"],
    ],
  });

  const body = rows.map((r) => ({
    id: r.id,
    promptFunctionName: r.promptFunctionName,
    display: (r.display && String(r.display).trim()) || r.promptFunctionName,
  }));

  return {
    status: 200,
    message: "Prompt types fetched successfully",
    body,
  };
};

export const listAllPromptsService = async ({ query }) => {
  const includeUnpublished = parseBoolean(
    query?.includeUnpublished ?? query?.include_unpublished
  );
  const unpublishedOnly = parseBoolean(
    query?.unpublishedOnly ?? query?.unpublished_only
  );

  const where = { isDeleted: 0 };
  if (unpublishedOnly) {
    where.isPublished = 0;
  } else if (!includeUnpublished) {
    where.isPublished = 1;
  }

  const prompts = await PromptsMaster.findAll({
    where,
    include: [
      {
        model: PromptTypeLookup,
        as: "promptTypeLookup",
        attributes: ["id", "promptFunctionName", "display"],
        required: true,
      },
      {
        model: Stories,
        as: "story",
        attributes: ["storyId", "storyName"],
        required: false,
      },
      {
        model: ChapterMaster,
        as: "chapter",
        attributes: ["chapterId", "chapterName"],
        required: false,
      },
    ],
    /** Newest rows first: primary key DESC (matches “new → older” in prompts_master). */
    order: [[sequelize.col("prompts_master.id"), "DESC"]],
  });

  const body = attachPromptTypeDisplay(prompts);

  return {
    status: 200,
    message: "Prompts fetched successfully",
    body,
  };
};

/**
 * All prompts for the same versioning pattern as `id`: same story, chapter, prompt_type_id,
 * and platform scope (including unpublished). Ordered by version DESC, then id DESC.
 */
export const listPromptVersionsByPromptIdService = async ({ id }) => {
  const promptId = parseInt(id, 10);
  if (!id || Number.isNaN(promptId)) throw serviceError(400, "Invalid prompt id");

  const prompt = await PromptsMaster.findByPk(promptId, {
    include: [
      {
        model: PromptTypeLookup,
        as: "promptTypeLookup",
        attributes: ["id", "promptFunctionName", "display"],
        required: true,
      },
    ],
  });
  if (!prompt || prompt.isDeleted === 1) throw serviceError(404, "Prompt not found");

  const scopeKey = canonicalPlatformScopeKeyFromRow(prompt);

  const candidates = await PromptsMaster.findAll({
    where: {
      storyId: prompt.storyId,
      chapterId: prompt.chapterId ?? null,
      promptTypeId: prompt.promptTypeId,
      isDeleted: 0,
    },
    include: [
      {
        model: PromptTypeLookup,
        as: "promptTypeLookup",
        attributes: ["id", "promptFunctionName", "display"],
        required: true,
      },
      {
        model: Stories,
        as: "story",
        attributes: ["storyId", "storyName"],
        required: false,
      },
      {
        model: ChapterMaster,
        as: "chapter",
        attributes: ["chapterId", "chapterName"],
        required: false,
      },
    ],
    order: [
      [sequelize.col("prompts_master.version"), "DESC"],
      [sequelize.col("prompts_master.id"), "DESC"],
    ],
  });

  const scoped = candidates.filter(
    (r) => canonicalPlatformScopeKeyFromRow(r) === scopeKey
  );
  const body = attachPromptTypeDisplay(scoped);

  return {
    status: 200,
    message: "Prompt versions fetched successfully",
    body,
  };
};

export const listStoryPromptsService = async ({ storyId, query }) => {
  const storyIdInt = parseInt(storyId, 10);
  if (!storyId || Number.isNaN(storyIdInt)) {
    throw serviceError(400, "Invalid storyId");
  }

  const promptTypeName = query.promptType ?? query.prompt_type ?? undefined;
  const promptTypeIdRaw = query.prompt_type_id ?? query.promptTypeId ?? undefined;
  const chapterIdRaw = query.chapterId ?? query.chapter_id ?? undefined;
  const includeUnpublished = parseBoolean(
    query.includeUnpublished ?? query.include_unpublished
  );

  const chapterId = parseNullableInt(chapterIdRaw);
  if (chapterIdRaw !== undefined && chapterId === undefined) {
    throw serviceError(400, "Invalid chapterId");
  }

  let filterPromptTypeId;
  if (promptTypeIdRaw !== undefined && promptTypeIdRaw !== null && promptTypeIdRaw !== "") {
    const n = parseInt(String(promptTypeIdRaw), 10);
    if (Number.isNaN(n) || n < 1) throw serviceError(400, "Invalid prompt_type_id");
    const ok = await validatePromptTypeIdExists(n);
    if (!ok) throw serviceError(400, "Invalid prompt_type_id");
    filterPromptTypeId = n;
  } else if (promptTypeName !== undefined) {
    const ok = await validatePromptTypeExists(promptTypeName);
    if (!ok) throw serviceError(400, "Invalid prompt_type");
    const row = await PromptTypeLookup.findOne({
      where: { promptFunctionName: promptTypeName },
      attributes: ["id"],
      raw: true,
    });
    filterPromptTypeId = row?.id;
  }

  const where = { storyId: storyIdInt, isDeleted: 0 };
  if (filterPromptTypeId !== undefined) where.promptTypeId = filterPromptTypeId;
  if (chapterIdRaw !== undefined) where.chapterId = chapterId;
  if (!includeUnpublished) where.isPublished = 1;

  const prompts = await PromptsMaster.findAll({
    where,
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

  if (!prompts || prompts.length === 0) {
    return {
      status: 200,
      message: "No prompts found for this story",
      body: [],
    };
  }

  const body = attachPromptTypeDisplay(prompts);

  return {
    status: 200,
    message: "Prompts fetched successfully",
    body,
  };
};

export const createPromptService = async ({ storyId: storyIdParam, body }) => {
  const storyIdFromBody = body?.storyId ?? body?.story_id;
  const storyIdRaw = storyIdParam !== undefined ? storyIdParam : storyIdFromBody;
  const storyIdParsed = parseNullableInt(storyIdRaw);
  if (storyIdRaw !== undefined && storyIdParsed === undefined) {
    throw serviceError(400, "Invalid story_id");
  }
  const storyIdInt = storyIdParsed ?? null;

  const promptText = body.promptText ?? body.prompt_text;
  const chapterIdRaw = body.chapterId ?? body.chapter_id;

  const promptTypeId = await resolvePromptTypeIdFromBody(body, { required: true });

  if (!promptText) throw serviceError(400, "prompt_text is required");

  if (storyIdInt !== null) {
    const story = await Stories.findByPk(storyIdInt);
    if (!story || story.isDeleted === 1) throw serviceError(404, "Story not found");
  }

  const chapterId = parseNullableInt(chapterIdRaw);
  if (chapterIdRaw !== undefined && chapterId === undefined) {
    throw serviceError(400, "Invalid chapterId");
  }

  const normalizedPlatformIds = normalizePlatformIdsForStorage(body);
  if (!normalizedPlatformIds || normalizedPlatformIds.length === 0) {
    throw serviceError(400, "At least one platform is required (platform_ids)");
  }
  const platformScopeForVersion = {
    platform_ids: normalizedPlatformIds ?? undefined,
  };

  if (chapterId !== null && chapterId !== undefined) {
    if (storyIdInt === null) {
      throw serviceError(400, "chapter_id requires story_id");
    }
    const chapter = await ChapterMaster.findOne({
      where: { chapterId, storyId: storyIdInt, isDeleted: 0 },
      raw: false,
    });
    if (!chapter) throw serviceError(404, "Chapter not found for this story");
  }

  const parsedIsPublished = 0;
  const t = await sequelize.transaction();
  let created;
  try {
    // Lock candidate rows for this "pattern" so concurrent create calls won't reuse versions.
    const parsedVersion = await getNextVersionForNewPrompt({
      storyId: storyIdInt,
      chapterId: chapterId ?? null,
      promptTypeId,
      platformScopeBody: platformScopeForVersion,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    created = await PromptsMaster.create(
      {
        storyId: storyIdInt ?? null,
        platformIds: normalizedPlatformIds,
        chapterId: chapterId ?? null,
        promptTypeId,
        promptText,
        version: parsedVersion,
        isDeleted: 0,
        isPublished: parsedIsPublished,
        hasEverBeenPublished: 0,
      },
      { transaction: t }
    );

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  const createdFull = await PromptsMaster.findByPk(created.id, {
    include: [
      {
        model: PromptTypeLookup,
        as: "promptTypeLookup",
        attributes: ["id", "promptFunctionName", "display"],
        required: false,
      },
    ],
  });
  await refreshPromptsCache(storyIdInt ?? undefined);
  const bodyOut = createdFull ? attachPromptTypeDisplay([createdFull])[0] : created;
  return { status: 200, message: "Prompt created successfully", body: bodyOut };
};

export const createStoryPromptService = async ({ storyId, body }) =>
  createPromptService({ storyId, body });

export const updatePromptService = async ({ id, body }) => {
  const promptId = parseInt(id, 10);
  if (!id || Number.isNaN(promptId)) throw serviceError(400, "Invalid prompt id");

  const prompt = await PromptsMaster.findByPk(promptId);
  if (!prompt || prompt.isDeleted === 1) throw serviceError(404, "Prompt not found");

  const nextPromptText = body.promptText ?? body.prompt_text;
  const chapterIdRaw = body.chapterId ?? body.chapter_id;
  const updateData = {};

  if (nextPromptText !== undefined) updateData.promptText = nextPromptText;
  if (chapterIdRaw !== undefined) {
    const nextChapterId = parseNullableInt(chapterIdRaw);
    if (chapterIdRaw !== null && chapterIdRaw !== "null" && nextChapterId === undefined) {
      throw serviceError(400, "Invalid chapterId");
    }
    updateData.chapterId = nextChapterId;
  }
  const hasPlatformScope =
    body.platform_ids !== undefined ||
    body.platformIds !== undefined ||
    body.platformId !== undefined ||
    body.platform_id !== undefined;
  if (hasPlatformScope) {
    const normalized = normalizePlatformIdsForStorage(body);
    updateData.platformIds = normalized;
  }

  const hasPromptType =
    body.prompt_type_id !== undefined ||
    body.promptTypeId !== undefined ||
    body.prompt_type !== undefined ||
    body.promptType !== undefined;
  if (hasPromptType) {
    const pid = await resolvePromptTypeIdFromBody(body, { required: true });
    updateData.promptTypeId = pid;
  }

  if (Object.keys(updateData).length === 0) {
    throw serviceError(400, "At least one field must be provided to update");
  }

  const isPublishedRow = isTinyintTrue(prompt.isPublished);
  const hasEverBeenPublishedRow = isTinyintTrue(prompt.hasEverBeenPublished);

  /**
   * Currently published, or ever published before: do not mutate the row. Create a new
   * unpublished row with the merged edits; the original stays unchanged.
   */
  if (isPublishedRow || hasEverBeenPublishedRow) {
    const mergedPromptText =
      updateData.promptText !== undefined ? updateData.promptText : prompt.promptText;
    const mergedChapterId =
      updateData.chapterId !== undefined ? updateData.chapterId : prompt.chapterId;
    const mergedPromptTypeId =
      updateData.promptTypeId !== undefined ? updateData.promptTypeId : prompt.promptTypeId;
    const mergedPlatformIds =
      updateData.platformIds !== undefined ? updateData.platformIds : prompt.platformIds;

    let mergedPlatformIdsArr = mergedPlatformIds;
    if (typeof mergedPlatformIdsArr === "string") {
      try {
        mergedPlatformIdsArr = JSON.parse(mergedPlatformIdsArr);
      } catch {
        mergedPlatformIdsArr = null;
      }
    }
    if (!Array.isArray(mergedPlatformIdsArr)) mergedPlatformIdsArr = [];

    const normalizedForkPlatforms = normalizePlatformIdsForStorage({
      platform_ids: mergedPlatformIdsArr,
    });
    if (!normalizedForkPlatforms || normalizedForkPlatforms.length === 0) {
      throw serviceError(400, "At least one platform is required (platform_ids)");
    }

    if (mergedChapterId !== null && mergedChapterId !== undefined) {
      const chapter = await ChapterMaster.findOne({
        where: { chapterId: mergedChapterId, storyId: prompt.storyId, isDeleted: 0 },
        raw: false,
      });
      if (!chapter) throw serviceError(404, "Chapter not found for this story");
    }

    const platformScopeForVersion = {
      platform_ids: normalizedForkPlatforms ?? undefined,
    };

    const t = await sequelize.transaction();
    try {
      const nextVersion = await getNextVersionForNewPrompt({
        storyId: prompt.storyId,
        chapterId: mergedChapterId ?? null,
        promptTypeId: mergedPromptTypeId,
        platformScopeBody: platformScopeForVersion,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const created = await PromptsMaster.create(
        {
          storyId: prompt.storyId,
          platformIds: normalizedForkPlatforms,
          chapterId: mergedChapterId ?? null,
          promptTypeId: mergedPromptTypeId,
          promptText: mergedPromptText,
          version: nextVersion,
          isDeleted: 0,
          isPublished: 0,
          hasEverBeenPublished: 0,
        },
        { transaction: t }
      );

      await t.commit();

      const createdFull = await PromptsMaster.findByPk(created.id, {
        include: [
          {
            model: PromptTypeLookup,
            as: "promptTypeLookup",
            attributes: ["id", "promptFunctionName", "display"],
            required: false,
          },
        ],
      });
      await refreshPromptsCache(prompt.storyId);
      const bodyOut = createdFull ? attachPromptTypeDisplay([createdFull])[0] : created;
      return {
        status: 200,
        message:
          "Draft saved. The published prompt stays live; publish the new row from Actions when ready.",
        body: bodyOut,
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  /** Unpublished row: edit in place; stays draft until published via Actions. */
  updateData.isPublished = 0;

  const nextChapterId = updateData.chapterId !== undefined ? updateData.chapterId : prompt.chapterId;
  const nextPromptTypeId =
    updateData.promptTypeId !== undefined ? updateData.promptTypeId : prompt.promptTypeId;
  const nextPlatformIds =
    updateData.platformIds !== undefined ? updateData.platformIds : prompt.platformIds;

  const currentScopeKey = canonicalPlatformScopeKeyFromRow(prompt);
  const nextScopeKey = canonicalPlatformScopeKeyFromBody({
    platform_ids: nextPlatformIds ?? undefined,
  });

  const patternChanged =
    (nextChapterId ?? null) !== (prompt.chapterId ?? null) ||
    nextPromptTypeId !== prompt.promptTypeId ||
    nextScopeKey !== currentScopeKey;

  if (patternChanged) {
    const t = await sequelize.transaction();
    try {
      const nextVersion = await getNextVersionForNewPrompt({
        storyId: prompt.storyId,
        chapterId: nextChapterId ?? null,
        promptTypeId: nextPromptTypeId,
        platformScopeBody: { platform_ids: nextPlatformIds ?? undefined },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      await PromptsMaster.update(
        { ...updateData, version: nextVersion, updatedAt: new Date() },
        { where: { id: promptId }, transaction: t }
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } else {
    await PromptsMaster.update(
      { ...updateData, updatedAt: new Date() },
      { where: { id: promptId } }
    );
  }

  const updated = await PromptsMaster.findByPk(promptId, {
    include: [
      {
        model: PromptTypeLookup,
        as: "promptTypeLookup",
        attributes: ["id", "promptFunctionName", "display"],
        required: false,
      },
    ],
  });
  await refreshPromptsCache(prompt.storyId);

  const bodyOut = updated ? attachPromptTypeDisplay([updated])[0] : updated;
  return { status: 200, message: "Prompt updated successfully", body: bodyOut };
};

export const updatePromptPublishStatusService = async ({ id, body }) => {
  const promptId = parseInt(id, 10);
  if (!id || Number.isNaN(promptId)) throw serviceError(400, "Invalid prompt id");

  const prompt = await PromptsMaster.findByPk(promptId);
  if (!prompt || prompt.isDeleted === 1) throw serviceError(404, "Prompt not found");

  const requestedValue = body?.is_published ?? body?.isPublished;
  if (requestedValue === undefined || ![0, 1, "0", "1", false, true].includes(requestedValue)) {
    throw serviceError(400, "is_published is required and must be 0 or 1");
  }
  const shouldPublish = requestedValue === 1 || requestedValue === "1" || requestedValue === true;
  if (!shouldPublish && prompt.isPublished === 0) {
    return { status: 200, message: "Prompt is already unpublished", body: prompt };
  }

  if (shouldPublish) {
    const t = await sequelize.transaction();
    try {
      // Lock the whole "pattern" scope to prevent concurrent publishes from reusing versions.
      const candidates = await PromptsMaster.findAll({
        where: {
          storyId: prompt.storyId,
          chapterId: prompt.chapterId ?? null,
          promptTypeId: prompt.promptTypeId,
          isDeleted: 0,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const scopeKey = canonicalPlatformScopeKeyFromRow(prompt);
      const scopedCandidates = candidates.filter(
        (r) => canonicalPlatformScopeKeyFromRow(r) === scopeKey
      );

      let maxV = 0;
      const promptInScope = scopedCandidates.find(
        (r) => Number(r.id) === Number(prompt.id)
      );
      const currentVersionNum = Number(promptInScope?.version ?? prompt.version);

      for (const r of scopedCandidates) {
        const v = r.version != null ? Number(r.version) : 0;
        if (!Number.isNaN(v) && v > maxV) maxV = v;
      }

      const hasConflict =
        !Number.isNaN(currentVersionNum) &&
        scopedCandidates.some(
          (r) => Number(r.id) !== Number(prompt.id) && Number(r.version) === currentVersionNum
        );

      const nextVersion =
        !Number.isFinite(currentVersionNum) || currentVersionNum <= 0 || hasConflict
          ? maxV + 1
          : currentVersionNum;

      const otherScopedIds = scopedCandidates
        .filter((r) => Number(r.id) !== Number(prompt.id))
        .map((r) => Number(r.id));

      // Strict rule: only one published prompt per exact pattern/scope at a time.
      if (otherScopedIds.length > 0) {
        await PromptsMaster.update(
          { isPublished: 0, updatedAt: new Date() },
          { where: { id: otherScopedIds }, transaction: t }
        );
      }

      await PromptsMaster.update(
        {
          isPublished: 1,
          hasEverBeenPublished: 1,
          version: nextVersion,
          updatedAt: new Date(),
        },
        { where: { id: promptId }, transaction: t }
      );
      const updated = await PromptsMaster.findByPk(promptId, {
        transaction: t,
        include: [
          {
            model: PromptTypeLookup,
            as: "promptTypeLookup",
            attributes: ["id", "promptFunctionName", "display"],
            required: false,
          },
        ],
      });
      await t.commit();

      await refreshPromptsCache(prompt.storyId);
      const bodyOut = updated ? attachPromptTypeDisplay([updated])[0] : updated;
      return { status: 200, message: "Prompt published successfully", body: bodyOut };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  await PromptsMaster.update(
    { isPublished: 0, updatedAt: new Date() },
    { where: { id: promptId } }
  );
  const updated = await PromptsMaster.findByPk(promptId, {
    include: [
      {
        model: PromptTypeLookup,
        as: "promptTypeLookup",
        attributes: ["id", "promptFunctionName", "display"],
        required: false,
      },
    ],
  });
  await refreshPromptsCache(prompt.storyId);
  const bodyOut = updated ? attachPromptTypeDisplay([updated])[0] : updated;
  return { status: 200, message: "Prompt unpublished successfully", body: bodyOut };
};

export const deletePromptService = async ({ id }) => {
  const promptId = parseInt(id, 10);
  if (!id || Number.isNaN(promptId)) throw serviceError(400, "Invalid prompt id");

  const prompt = await PromptsMaster.findByPk(promptId);
  if (!prompt || prompt.isDeleted === 1) throw serviceError(404, "Prompt not found");
  if (isTinyintTrue(prompt.hasEverBeenPublished)) {
    throw serviceError(
      400,
      "Cannot delete a version that has been published before"
    );
  }

  await PromptsMaster.update(
    { isDeleted: 1, updatedAt: new Date() },
    { where: { id: promptId } }
  );

  await refreshPromptsCache(prompt.storyId);
  return { status: 200, message: "Prompt deleted successfully" };
};
