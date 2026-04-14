import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import { Sequelize } from "sequelize";
const RecommendationMaster = sequelize.define(
  "recommendation_master",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    widgetId: {
      type: DataTypes.INTEGER,
      references: {
        model: "widgets",
        key: "id",
      },
      allowNull: true,     
      defaultValue: null,  
    },
    assistantName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    targetType: {
      type: DataTypes.ENUM('Article', 'Assistant', 'Task'),
      allowNull: true,
    },
    targetValue: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
    },
    image: {
      type: DataTypes.STRING(979),
      allowNull: false,
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
    },
    expireDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    userRecommendedPeriod: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    callToAction: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    firstMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isLoop:{
      type:DataTypes.TINYINT(0),
      defaultValue: 0,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    },
    platforms: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    prerequisite_agents: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
    publishStatus:{
      type: DataTypes.ENUM('Draft', 'Published'),
      allowNull: false,
      defaultValue: 'Draft',
    },
    activityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      references: {
        model: "activity",
        key: "id",
      },
    },
  },
  {
    tableName: "recommendation_master",
    timestamps: true,
    createdAt: true,
    updatedAt: true,
  }
);

export default RecommendationMaster;