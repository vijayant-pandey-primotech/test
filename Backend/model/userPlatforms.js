import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';  // Adjust the path as needed

const UserPlatform = sequelize.define('UserPlatform', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'usermaster',  
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  platformId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'platforms',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW  // Auto-generated timestamp
  }
}, {
  tableName: 'user_platforms',
  timestamps: false  // Manually defining createdAt, so no automatic timestamps
});

export default UserPlatform;
