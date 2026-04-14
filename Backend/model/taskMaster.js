import { Sequelize, DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const TaskMaster = sequelize.define('TaskMaster', {
  taskId: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  task_type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  platform_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'platforms',
      key: 'id'
    },
    comment: 'Reference to platform from platforms table'
  },
  story_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'stories_masters',
      key: 'storyId'
    },
    comment: 'Reference to story from stories_masters table'
  },
  fields: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'Array of field objects with type, label, options, etc.'
  },
  is_active: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: '0 for inactive, 1 for active'
  },
  is_deleted: {
    type: DataTypes.INTEGER,
    defaultValue: 0
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
  tableName: 'taskmaster',
  timestamps: true
});

export default TaskMaster; 