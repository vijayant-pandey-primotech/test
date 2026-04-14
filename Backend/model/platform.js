import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';  // Adjust the path as needed

const Platform = sequelize.define('Platform', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  description: {
    type: DataTypes.TEXT,
    defaultValue: null
  }
}, {
  tableName: 'platforms',
  timestamps: true
});

export default Platform;
