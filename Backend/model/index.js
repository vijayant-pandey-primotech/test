import ChapterMaster from "./chapterMaster.js";
import ItemMaster from "./itemMaster.js";
import Policy from "./policy.js";
import Stories from "./storiesMasters.js";
import StoriesSubCategory from "./storiesSubCategory.js";
import UserMaster from "./userMasterModel.js";
import Questions from "./itemQuestions.js";
import adminMaster from "./adminMaster.js";
import adminRoles from "./adminRoles.js";
import AssistanceTopics from "./assistanceTopics.js";
import TaskMaster from "./taskMaster.js";
import Widgets from "./widgets.js";
import Platform from "./platform.js";
import PlatformMapping from "./platformMapping.js";
import RecommendationMaster from "./recommendation_master.js";
import WidgetMapping from "./widgetMapping.js";
import Activity from "./activity.js";
import PlatformTask from "./platformTask.js";
import PromptTypeLookup from "./promptTypeLookup.js";
import PromptsMaster from "./promptsMaster.js";

WidgetMapping.belongsTo(Widgets, { 
  foreignKey: "widget_id", 
  targetKey: "id",
  as: "Widget"
});

Widgets.hasMany(WidgetMapping, { 
  foreignKey: "widget_id", 
  sourceKey: "id",
  as: "WidgetMappings"
});

// Association between RecommendationMaster and WidgetMapping
WidgetMapping.belongsTo(RecommendationMaster, { 
  foreignKey: "entity_id", 
  targetKey: "id",
  as: "Recommendation",
  constraints: false, // Since entity_id can point to different tables based on entity_type
  scope: {
    // This will only apply when entity_type is 'Assistant'
    // The actual filtering should be done in queries
  }
});

RecommendationMaster.hasMany(WidgetMapping, { 
  foreignKey: "entity_id", 
  sourceKey: "id",
  as: "WidgetMappings",
  constraints: false, // Since entity_id can point to different tables based on entity_type
  onDelete: 'CASCADE', // This will delete related WidgetMapping records when RecommendationMaster is deleted
  hooks: true // Enable hooks for cascade delete
});

// Association between TaskMaster and Stories
TaskMaster.belongsTo(Stories, { 
  foreignKey: "story_id", 
  targetKey: "storyId",
  as: "Story"
});

Stories.hasMany(TaskMaster, { 
  foreignKey: "story_id", 
  sourceKey: "storyId",
  as: "Tasks"
});

// Association between ItemMaster and Policy (moved here to avoid circular dependency)
ItemMaster.hasMany(Policy, {
  as: 'policies',
  foreignKey: 'itemId',
});

Policy.belongsTo(ItemMaster, {
  foreignKey: 'itemId',
  targetKey: 'itemId',
  as: 'item'
});




// Association between Platform and PlatformTask
Platform.hasMany(PlatformTask, {
  foreignKey: 'platformId',
  sourceKey: 'id',
  as: 'Tasks'
});

PlatformTask.belongsTo(Platform, {
  foreignKey: 'platformId',
  targetKey: 'id',
  as: 'Platform'
});

// Association between TaskMaster and PlatformTask
TaskMaster.hasMany(PlatformTask, {
  foreignKey: 'activityId',
  sourceKey: 'taskId',
  as: 'PlatformTasks'
});

PlatformTask.belongsTo(TaskMaster, {
  foreignKey: 'activityId',
  targetKey: 'taskId',
  as: 'Activity'
});

PromptsMaster.belongsTo(Stories, {
  foreignKey: "storyId",
  targetKey: "storyId",
  as: "story",
});

PromptsMaster.belongsTo(ChapterMaster, {
  foreignKey: "chapterId",
  targetKey: "chapterId",
  as: "chapter",
});

PromptsMaster.belongsTo(PromptTypeLookup, {
  foreignKey: "promptTypeId",
  targetKey: "id",
  as: "promptTypeLookup",
});

PromptTypeLookup.hasMany(PromptsMaster, {
  foreignKey: "promptTypeId",
  sourceKey: "id",
  as: "prompts",
});

export {
  ChapterMaster,
  ItemMaster,
  Policy,
  Stories,
  StoriesSubCategory,
  UserMaster,
  Questions,
  adminMaster,
  adminRoles,
  AssistanceTopics,
  TaskMaster,
  Widgets,
  Platform,
  PlatformMapping,
  RecommendationMaster,
  WidgetMapping,
  Activity,
  PlatformTask,
  PromptTypeLookup,
  PromptsMaster,
};
