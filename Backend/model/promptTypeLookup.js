import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

/**
 * Lookup table for prompt types/functions.
 * Maps `prompt_function_name` to a normalized prompt type string used by the app.
 */
const PromptTypeLookup = sequelize.define(
  "prompt_type_lookup",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    promptFunctionName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "prompt_function_name",
      unique: true,
    },
    display: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "display",
    },
  },
  {
    tableName: "prompt_type_lookup",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default PromptTypeLookup;

