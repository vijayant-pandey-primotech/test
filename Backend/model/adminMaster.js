import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const adminMaster = sequelize.define("adminMaster", {
  adminId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  roleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  emailAddress: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  is_active: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 0,
  },
  token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: "adminMaster",
  timestamps: false // you handle createdAt/updatedAt manually
});

export default adminMaster;
