import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

/**
 * Prompts per story/chapter/prompt type & version.
 * DB table: `prompts_master`
 * Uses `prompt_type_id` → `prompt_type_lookup.id`; `platform_ids` JSON (multi-platform).
 */
const PromptsMaster = sequelize.define(
  "prompts_master",
  {
    id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    storyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "story_id",
    },
    /** Sorted unique platform ids; null/empty means all platforms (Redis uses platform `0`). */
    platformIds: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "platform_ids",
    },
    chapterId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "chapter_id",
    },
    promptTypeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "prompt_type_id",
    },
    promptText: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "prompt_text",
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
    },
    isDeleted: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 0,
      field: "is_deleted",
    },
    isPublished: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 0,
      field: "is_published",
    },
    /** One-way: set to 1 the first time this row is published; never cleared on unpublish. */
    hasEverBeenPublished: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 0,
      field: "has_been_published",
    },
  },
  {
    tableName: "prompts_master",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default PromptsMaster;
