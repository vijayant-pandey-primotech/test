import {Sequelize, DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const UserMaster = sequelize.define('UserMaster', {
  userId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
  },
  userType: {
      type: DataTypes.STRING,
      defaultValue: 'user'
  },
  emailAddress: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
  },
  mailAddress: {
      type: DataTypes.STRING,
      defaultValue: null
  },
  dateOfBirth: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  },
  maritalStatus: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
  },
  phone: {
      type: DataTypes.STRING(15)
  },
  firstName: {
      type: DataTypes.STRING
  },
  lastName: {
      type: DataTypes.STRING
  },
  password: {
      type: DataTypes.STRING
  },
  isMarried: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isDivorced: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  servedMilitary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_active: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '0 for signup process is not complete, 1 for active'
  },
  is_deleted: {
      type: DataTypes.INTEGER,
      defaultValue: 0
  },
  is_two_fa_enabled: {
      type: DataTypes.INTEGER,
      defaultValue: 0
  },
  state: {
      type: DataTypes.STRING,
      defaultValue: ''
  },
  city: {
      type: DataTypes.STRING,
      defaultValue: ''
  },
  country: {
      type: DataTypes.STRING,
      defaultValue: '236'
  },
  zipcode: {
      type: DataTypes.STRING,
      defaultValue: ''
  },
  userImage: {
      type: DataTypes.TEXT,
      defaultValue: ''
  },
  token: {
      type: DataTypes.TEXT,
      defaultValue: null
  },
  isAuthenticated: {
    type: DataTypes.TINYINT(1),
    defaultValue: 0
},
isMigrated: {
  type: DataTypes.TINYINT(1),
  defaultValue: 0,
  comment: '0 for not migrated, 1 for migrated'
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
  tableName: 'usermaster',
  timestamps: true
});

export default UserMaster;
