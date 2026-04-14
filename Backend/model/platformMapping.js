import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';  // Adjust the path as needed
import Platform from './platform.js';
import Stories from './storiesMasters.js';
import ChapterMaster from './chapterMaster.js';
import ItemMaster from './itemMaster.js';

const PlatformCategoryMapping = sequelize.define('PlatformCategoryMapping', {
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
    onDelete: 'CASCADE'
  },
  storyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'stories_masters',  
      key: 'storyId'
    },
    onDelete: 'CASCADE'
  },
  chapterId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'chapter_masters',  
      key: 'chapterId'
    },
    onDelete: 'CASCADE'
  },
  itemId: {
    type: DataTypes.INTEGER,
    allowNull: true, 
    references: {
      model: 'items_masters',  
      key: 'itemId'
    },
    onDelete: 'CASCADE'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'platform_category_mapping',
  timestamps: false
});

Platform.hasMany(PlatformCategoryMapping, { foreignKey: 'platformId' });
PlatformCategoryMapping.belongsTo(Platform, { foreignKey: 'platformId' });

Stories.hasMany(PlatformCategoryMapping, { foreignKey: 'storyId' });
PlatformCategoryMapping.belongsTo(Stories, { foreignKey: 'storyId' });

ChapterMaster.hasMany(PlatformCategoryMapping, { foreignKey: 'chapterId' });
PlatformCategoryMapping.belongsTo(ChapterMaster, { foreignKey: 'chapterId' });

ItemMaster.hasMany(PlatformCategoryMapping, { foreignKey: 'itemId' });
PlatformCategoryMapping.belongsTo(ItemMaster, { foreignKey: 'itemId' });


export default PlatformCategoryMapping;

