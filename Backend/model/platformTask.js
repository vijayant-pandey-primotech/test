import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const PlatformTask = sequelize.define('PlatformTask', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  platformId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'platforms',
      key: 'id'
    },
    comment: 'Reference to platform from platforms table'
  },
  activityId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'taskmaster',
      key: 'taskId'
    },
    comment: 'Reference to task_master.id (Onboarding)'
  },
  meta_data: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    comment: 'Items array [{ itemId, answerType }] OR url object { type: "url", url: string } OR assistant object { assistantId: number }'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Name of onboarding task (e.g., Goal Selection)'
  },
  taskOrder: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Display order in onboarding flow'
  },
  isMandatory: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Indicates if task is mandatory'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active',
    comment: 'Task status'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "",
    comment: 'Description of the task'
  }
}, {
  tableName: 'platform_tasks',
  timestamps: true
});

export default PlatformTask;
