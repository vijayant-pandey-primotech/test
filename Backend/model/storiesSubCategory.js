import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import Stories from "./storiesMasters.js";

const StoriesSubCategory = sequelize.define('story_sub_categories', {
    subCategoryId: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    subCategoryName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    storyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'stories_masters',
            key: 'storyId'
        }
    },
    icon: {
        type: DataTypes.STRING,
    },
    isCustom: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'story_sub_categories',
    timestamps: true
});


// Correct the associations:
StoriesSubCategory.belongsTo(Stories, { foreignKey: "storyId" });
Stories.hasMany(StoriesSubCategory, { foreignKey: "storyId" });


export default StoriesSubCategory