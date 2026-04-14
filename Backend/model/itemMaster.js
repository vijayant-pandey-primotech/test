import sequelize from "../config/db.js";
import { DataTypes } from "sequelize";

const ItemMaster = sequelize.define(
  "items_masters",
  {
    itemId: {
      type: DataTypes.INTEGER,
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
      itemName:{
        type: DataTypes.STRING,
      },
      suggestions: {
      type: DataTypes.TEXT,
      defaultValue: "",
    },
    sample_conversation:{
        type: DataTypes.STRING, 
        defaultValue: ""
    },
    sequence:{
      type:DataTypes.INTEGER,
      defaultValue:0
    },
    isHidden: {
      type: DataTypes.TINYINT(0),
      defaultValue: 0
    },
    isCustom: {
      type: DataTypes.INTEGER,
      defaultValue: 0
  },
  is_deleted: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
  },
  {
    tableName: "items_masters",
    timestamps: true,
  }
);

export default ItemMaster;
