import sequelize from "../config/db.js"
import { Sequelize, DataTypes } from "sequelize";

const Policy = sequelize.define(
    "policy",
    {
      policyId: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      storyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "stories_masters",
          key: "storyId",
        },
      },
      chapterId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "chapter_masters",
          key: "chapterId",
        },
      },
      itemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "items_masters",
          key: "itemId",
        },
      },
      policyDescription: {
        type: DataTypes.STRING,
        defaultValue: "",
      },
      isLocation:{
        type: DataTypes.TINYINT(1),
        defaultValue: 0,
      },
      isMandatory: {
        type: DataTypes.TINYINT(1),
        defaultValue: 0,
      },
      isDeleted: {
        type: DataTypes.TINYINT(1),
        defaultValue: 0,
      },
      policies:{
        type: DataTypes.JSON,
        defaultValue: [],
      }
    },
{
    tableName: 'policy',
    timestamps: true
}
)

export default Policy

