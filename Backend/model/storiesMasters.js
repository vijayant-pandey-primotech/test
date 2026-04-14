import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import ChapterMaster from "./chapterMaster.js";

const Stories = sequelize.define('stories_masters', {
    storyId: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    storyName: {
        type: DataTypes.STRING,
    },
    description: {
        type: DataTypes.STRING,
        defaultValue: null
    },
    color: {
        type: DataTypes.TEXT,
    },
    isCustom: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    domain: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: ["all_domain"]
    },
    isDeleted: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    isPublished: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'stories_masters',
    timestamps: true
});


Stories.hasMany(ChapterMaster, { foreignKey: 'storyId' });
ChapterMaster.belongsTo(Stories, { foreignKey: 'storyId' });

export default Stories;
