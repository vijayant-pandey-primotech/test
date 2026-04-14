import { Sequelize, DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Widgets = sequelize.define('Widgets', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  widgetName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  widgetDescription: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  platforms: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  widgetKey: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: false,
    comment: 'key to identify or group widget in frontend'
  },
  widgetTemplateJson: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Stored Puck JSON configuration for dynamic widgets'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
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
  tableName: 'widgets',
  timestamps: true
});

export default Widgets;
