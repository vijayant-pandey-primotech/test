import sequelize from "../config/db.js";
import { DataTypes } from "sequelize";
import ItemMaster from "./itemMaster.js";

const ChapterMaster = sequelize.define(
  "chapter_masters",
  {
    chapterId: {
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
    chapterName: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    description: {
      type: DataTypes.STRING,
      defaultValue: "",
    },
    sequence:{
      type:DataTypes.INTEGER,
      defaultValue:0
    },
    isCustom: {
      type: DataTypes.INTEGER,
      defaultValue: 0
   },
   isDynamic: {
    type: DataTypes.INTEGER,
    defaultValue: 0
   },
   icon: {
    type: DataTypes.STRING,
  },
  domain: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ["all_domain"]
},
isDeleted: {
  type: DataTypes.INTEGER,
  defaultValue: 0
},
isPublished: {
  type: DataTypes.INTEGER,
  defaultValue: 0
},
firstMessage: {
  type: DataTypes.STRING,
  defaultValue: ""
}
  },
  {
    tableName: "chapter_masters",
    timestamps: true,
  }
);

ChapterMaster.hasMany(ItemMaster, { foreignKey: 'chapterId' });
ItemMaster.belongsTo(ChapterMaster, { foreignKey: 'chapterId' });
export default ChapterMaster;
