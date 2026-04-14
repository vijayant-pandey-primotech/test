import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';


const WidgetMapping = sequelize.define('WidgetMapping', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    widget_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'widgets', key: 'id' }
    },
    entity_type: {
      type: DataTypes.ENUM('Assistant', 'Plan'),
      allowNull: false,
      field: 'entity_type'
    },
    entity_id: { // points to recommendation_master.id or taskmaster.taskId
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'entity_id'
    },
    display_path: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
      field: 'display_path',
      comment: 'Hierarchical path: {page: "Home", section: "Left Panel", pos: "Top"}'
    },
    is_active: { 
      type: DataTypes.BOOLEAN, 
      allowNull: false, 
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'widget_mapping',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

export default WidgetMapping;