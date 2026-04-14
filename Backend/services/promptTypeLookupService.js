import { UniqueConstraintError } from "sequelize";
import sequelize from "../config/db.js";
import { PromptTypeLookup } from "../model/index.js";
import { refreshPromptsCache } from "../config/redisAdminCache.js";

const serviceError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
};

export const listPromptTypeLookupService = async () => {
  const rows = await PromptTypeLookup.findAll({
    order: [
      ["display", "ASC"],
      ["promptFunctionName", "ASC"],
    ],
  });
  return {
    status: 200,
    message: "Prompt type lookup rows fetched successfully",
    body: rows,
  };
};

export const createPromptTypeLookupService = async ({ body }) => {
  const name = body?.prompt_function_name ?? body?.promptFunctionName;
  const display = body?.display;

  if (!name || !String(name).trim()) {
    throw serviceError(400, "prompt_function_name is required");
  }

  const trimmedName = String(name).trim();
  try {
    const created = await PromptTypeLookup.create({
      promptFunctionName: trimmedName,
      display:
        display != null && String(display).trim() !== ""
          ? String(display).trim()
          : null,
    });
    return {
      status: 200,
      message: "Prompt type created successfully",
      body: created,
    };
  } catch (err) {
    if (err instanceof UniqueConstraintError || err?.name === "SequelizeUniqueConstraintError") {
      throw serviceError(409, "A prompt type with this function name already exists");
    }
    throw err;
  }
};

export const updatePromptTypeLookupService = async ({ id, body }) => {
  const pid = parseInt(id, 10);
  if (!id || Number.isNaN(pid)) throw serviceError(400, "Invalid id");

  const row = await PromptTypeLookup.findByPk(pid);
  if (!row) throw serviceError(404, "Prompt type not found");

  const nextName = body?.prompt_function_name ?? body?.promptFunctionName;
  const nextDisplay = body?.display;

  const updates = {};
  if (nextName !== undefined) {
    const trimmed = String(nextName).trim();
    if (!trimmed) throw serviceError(400, "prompt_function_name cannot be empty");
    updates.promptFunctionName = trimmed;
  }
  if (nextDisplay !== undefined) {
    updates.display =
      nextDisplay === null || nextDisplay === ""
        ? null
        : String(nextDisplay).trim();
  }

  if (Object.keys(updates).length === 0) {
    throw serviceError(400, "At least one of prompt_function_name or display must be provided");
  }

  const oldName = row.promptFunctionName;
  const isRename =
    updates.promptFunctionName !== undefined && updates.promptFunctionName !== oldName;

  if (isRename) {
    const taken = await PromptTypeLookup.findOne({
      where: { promptFunctionName: updates.promptFunctionName },
    });
    if (taken && taken.id !== row.id) {
      throw serviceError(409, "A prompt type with this function name already exists");
    }
  }

  try {
  if (isRename) {
    const t = await sequelize.transaction();
    try {
      await row.update(updates, { transaction: t });
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
    await refreshPromptsCache(0);
  } else {
      await row.update(updates);
    }
  } catch (err) {
    if (err instanceof UniqueConstraintError || err?.name === "SequelizeUniqueConstraintError") {
      throw serviceError(409, "A prompt type with this function name already exists");
    }
    throw err;
  }

  const updated = await PromptTypeLookup.findByPk(pid);
  return {
    status: 200,
    message: "Prompt type updated successfully",
    body: updated,
  };
};
