import { Sequelize, DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Activity = sequelize.define('Activity', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  activityName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('Active', 'Inactive'),
    allowNull: false,
    defaultValue: 'Active'
  },
  platforms: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  sequence: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Display order within the activity\'s platform'
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
  tableName: 'activity',
  timestamps: true
});

export default Activity;

