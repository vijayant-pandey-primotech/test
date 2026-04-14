import {Sequelize, DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const AssistanceTopics = sequelize.define('AssistanceTopics', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  assistance_type: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  customer_journey_stage: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  target_age_segment: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  topic: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  starting_paragraph: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ending_paragraph: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.NOW
  }
}, {
  tableName: 'assistance_topics',
  timestamps: true
});

export default AssistanceTopics; 