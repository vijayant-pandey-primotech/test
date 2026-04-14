import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const adminRoles = sequelize.define("adminRoles", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  roleName: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true, // Usually roleName should be unique
  },
  roleDescription: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: "adminRoles",
  timestamps: false // No createdAt/updatedAt columns
});

export default adminRoles;
