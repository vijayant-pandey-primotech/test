import { Op } from "sequelize";
import { PromptTypeLookup, PromptsMaster } from "../model/index.js";
import {
  canonicalPlatformScopeKeyFromBody,
  canonicalPlatformScopeKeyFromRow,
} from "./platformScopePrompts.js";

export const parseNullableInt = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "null") return null;
    const parsed = parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const parseBoolean = (value) => {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "yes", "y"].includes(normalized);
  }
  return false;
};

export const validatePromptTypeExists = async (promptFunctionName) => {
  if (!promptFunctionName) return false;
  const exists = await PromptTypeLookup.findOne({
    where: { promptFunctionName },
    raw: true,
    attributes: ["id"],
  });
  return !!exists;
};

export const validatePromptTypeIdExists = async (id) => {
  const n = parseInt(String(id), 10);
  if (!id || Number.isNaN(n) || n < 1) return false;
  const exists = await PromptTypeLookup.findByPk(n, { attributes: ["id"] });
  return !!exists;
};

/**
 * Same published story/chapter/prompt_type_id/version with the same platform scope (incl. multi-platform).
 */
export const findPublishedPromptDuplicate = async ({
  storyId,
  chapterId,
  promptTypeId,
  version,
  platformScopeBody,
  excludeId,
}) => {
  const targetKey = canonicalPlatformScopeKeyFromBody(platformScopeBody || {});
  const candidates = await PromptsMaster.findAll({
    where: {
      storyId,
      chapterId: chapterId ?? null,
      promptTypeId,
      version,
      isDeleted: 0,
      isPublished: 1,
      ...(excludeId != null && excludeId !== undefined ? { id: { [Op.ne]: excludeId } } : {}),
    },
  });
  for (const c of candidates) {
    if (canonicalPlatformScopeKeyFromRow(c) === targetKey) return c;
  }
  return null;
};
