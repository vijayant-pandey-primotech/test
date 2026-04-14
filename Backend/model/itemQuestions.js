import {Sequelize, DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import ItemMaster from "./itemMaster.js";


const Questions = sequelize.define('questions', {
  questionId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
  },
  group: {
      type: DataTypes.STRING,
      defaultValue: 'default'  // Default , Male , Female , Elder ,Others
  },
  question: {
    type: DataTypes.TEXT,
    defaultValue: "",
  },
  itemId: {
    type: Sequelize.INTEGER,
    allowNull: false,
    references: {
      model: "items_masters", // name of the referenced table
      key: "itemId",
    },
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
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
  tableName: 'questions',
  timestamps: true
});




Questions.belongsTo(ItemMaster, { foreignKey: 'itemId', targetKey: 'itemId' });
ItemMaster.hasOne(Questions, { foreignKey: 'itemId', sourceKey: 'itemId' });

export default Questions;
