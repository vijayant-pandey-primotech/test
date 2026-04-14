import express from "express";
import { adminLogin,token,allUsersList,updateUserById,deleteUserById ,
    allStoryList,updateStory,deleteStory,
    allChaptersList,allItemsListByChapterId,allItemsListByChapterIds,
    allItemsList,updateItem,deleteItem,
    allPoliciesList,allPoliciesListByItemId,updatePolicy,deletePolicy,
    questionListByPolicyId,mainQuestionByItemId,
    suggestionsListByItemId,updateSuggestion,deleteSuggestion,
    createClustorTest,getAssistantsList,getArticlesList,createArticle,
    updateItemSequence,deleteAssistantById,getArticleById,deleteArticleById,
    getAssistantById,updateAssistantById,updateArticleById,createItem,createUpdatePolicies,
    getStoriesWithImages,uploadStoryImage,updateChapterImages,allChaptersListForPersonal,
    getDynamicFunctions,requestDynamicFunction,getDynamicFunctionById,deleteDynamicFunction,getItem,     
    updateChapter,deleteChapter,getApiLogsByUserId,getAssistantbyPlatform,updateAssistantSequence,updateAssistantDependencies,
    getAssistantbyPlatformId,getActivitiesByPlatformId,
    getPromptTypes,listPromptTypeLookup,createPromptTypeLookup,updatePromptTypeLookup,listAllPrompts,listPromptVersionsByPromptId,listStoryPrompts,createPrompt,createStoryPrompt,updatePrompt,updatePromptPublishStatus,deletePrompt
}
from "../authControllers/adminControllers.js";
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  createTaskWidget,
  getTaskWidgetMappings,
  updateTaskWidget,
  deleteTaskWidget
} from "../authControllers/taskControllers.js";
import { copyStory,getItemsFromOtherStories, getStoriesForTemplate, copyChaptersToStory, getChaptersFromOtherStories } from '../authControllers/storyCopyController.js';

import { authorize } from "../middleware/adminAuthMiddleware.js";
import upload from "../helpers/multer.js";
const adminRoutes = express.Router();

adminRoutes.route("/new-access-token").get(token);
// adminRoutes.route("/signup").post(adminSignup);
adminRoutes.route("/login").post(adminLogin);

// //users actions
adminRoutes.route("/users-list").get(authorize("read:users"),allUsersList);
// adminRoutes.route("/user/:id").get(adminAuth,getUserById);
adminRoutes.route("/user/:id").put(authorize("write:users"),updateUserById);
adminRoutes.route("/user/:id").delete(authorize("delete:users"),deleteUserById);

//story actions
adminRoutes.route("/story-list").get(authorize("read:story"),allStoryList);
// adminRoutes.route("/story").post(adminAuth,createStory);
adminRoutes.route("/stories-with-images").get(authorize("read:story"),getStoriesWithImages);
adminRoutes.route("/upload-story-image/:subCategoryId").put(authorize("write:story"),upload.single('image'),uploadStoryImage);
adminRoutes.route("/story/:id").put(authorize("write:story"),updateStory);
adminRoutes.route("/story/:id").delete(authorize("delete:story"),deleteStory);

// Story copy actions
adminRoutes.route("/story/copy").post(authorize("write:story"), copyStory);
adminRoutes.route("/stories/templates").get(authorize("read:story"), getStoriesForTemplate);
adminRoutes.route("/story/:storyId/copy-chapters").post(authorize("write:story"), copyChaptersToStory);
adminRoutes.route("/chapters/from-other-stories/:storyId").get(authorize("read:chapters"), getChaptersFromOtherStories);
adminRoutes.route("/items-from-other-stories").get(authorize("read:items"),getItemsFromOtherStories);

// prompt actions
adminRoutes.route("/prompt-types").get(authorize("read:prompts"), getPromptTypes);
adminRoutes.route("/prompt-type-lookup").get(authorize("read:prompts"), listPromptTypeLookup);
adminRoutes.route("/prompt-type-lookup").post(authorize("write:prompts"), createPromptTypeLookup);
adminRoutes.route("/prompt-type-lookup/:id").put(authorize("write:prompts"), updatePromptTypeLookup);
adminRoutes.route("/prompts").get(authorize("read:prompts"), listAllPrompts);
adminRoutes.route("/prompts").post(authorize("write:prompts"), createPrompt);
adminRoutes.route("/prompts/:id/versions").get(authorize("read:prompts"), listPromptVersionsByPromptId);
adminRoutes.route("/story/:storyId/prompts").get(authorize("read:prompts"), listStoryPrompts);
adminRoutes.route("/story/:storyId/prompts").post(authorize("write:prompts"), createStoryPrompt);
adminRoutes.route("/prompts/:id").put(authorize("write:prompts"), updatePrompt);
adminRoutes.route("/prompts/:id/publish-status").post(authorize("write:prompts"), updatePromptPublishStatus);
adminRoutes.route("/prompts/:id").delete(authorize("delete:prompts"), deletePrompt);

//chapter actions
adminRoutes.route("/upload-chapter-image/:chapterId").put(authorize("write:chapters"),upload.single('image'),updateChapterImages);

//chapters list
adminRoutes.route("/chapters-list/:storyId").get(authorize("read:chapters"),allChaptersList);
adminRoutes.route("/chapters-list-for-personal").get(authorize("read:chapters"),allChaptersListForPersonal);
adminRoutes.route("/chapter-edit/:id").put(authorize("write:chapters"),updateChapter);
adminRoutes.route("/chapter-delete/:id").delete(authorize("delete:chapters"),deleteChapter);

//items list
adminRoutes.route("/items-list/:chapterId").get(authorize("read:items"),allItemsListByChapterId);
adminRoutes.route("/items-list-by-chapters").post(authorize("read:items"),allItemsListByChapterIds);
adminRoutes.route("/items-list").get(authorize("read:items"),allItemsList);
adminRoutes.route("/item-edit/:id").put(authorize("write:items"),updateItem);
adminRoutes.route("/item-delete/:id").delete(authorize("delete:items"),deleteItem);
adminRoutes.route("/create-item").post(authorize("write:items"),createItem);
adminRoutes.route("/item-details/:itemId").get(authorize("read:items"),getItem);

//policies list
adminRoutes.route("/policies-list").get(authorize("read:policies"),allPoliciesList);
adminRoutes.route("/policies-list/:itemId").get(authorize("read:policies"),allPoliciesListByItemId);
adminRoutes.route("/policy-edit/:policyId/policies/:policyIndex").put(authorize("write:policies"),updatePolicy);
adminRoutes.route("/policy-edit/:policyId/updatePolicies").put(authorize("write:policies"),createUpdatePolicies);
adminRoutes.route("/policy-edit/:itemId/createPolicies").post(authorize("write:policies"),createUpdatePolicies);
adminRoutes.route("/policy-delete/:policyId/policies/:policyIndex").delete(authorize("delete:policies"),deletePolicy);

//question list
adminRoutes.route("/main-question/:itemId").get(authorize("read:items"),mainQuestionByItemId);
adminRoutes.route("/question-list/:policyId").get(authorize("read:questions"),questionListByPolicyId);

//suggestions list
adminRoutes.route("/suggestions-list/:itemId").get(authorize("read:suggestions"),suggestionsListByItemId);
adminRoutes.route("/suggestion-edit/:itemId/suggestion/:suggestionId").put(authorize("write:suggestions"),updateSuggestion);
adminRoutes.route("/suggestion-delete/:itemId/suggestion/:suggestionId").delete(authorize("delete:suggestions"),deleteSuggestion);

//clustor agents
adminRoutes.route("/assistant").post(authorize("write:clustor"),upload.single('assistantImage'),createClustorTest);
adminRoutes.route("/assistants").get(authorize("read:assistants"),getAssistantsList);
adminRoutes.route("/assistant/:id").get(authorize("read:assistants"),getAssistantById);
adminRoutes.route("/update/assistant/:id").put(authorize("write:assistants"),upload.single('assistantImage'),updateAssistantById);
adminRoutes.route("/assistant/:id").delete(authorize("delete:assistants"),deleteAssistantById);
adminRoutes.route("/assistant/:id/dependencies").put(authorize("write:assistants"),updateAssistantDependencies);
adminRoutes.route("/assistant-by-platform").get(authorize("read:assistants"),getAssistantbyPlatform);
adminRoutes.route("/articles").get(authorize("read:articles"),getArticlesList);
adminRoutes.route("/article/:id").get(authorize("read:articles"),getArticleById);
adminRoutes.route("/article").post(authorize("write:articles"),upload.single('articleImage'),createArticle);
adminRoutes.route("/article/:id").delete(authorize("delete:articles"),deleteArticleById);
adminRoutes.route("/update/article/:id").put(authorize("write:articles"),upload.single('articleImage'),updateArticleById);
adminRoutes.route("/update-item-sequence").put(updateItemSequence);
adminRoutes.route("/update-assistant-sequence").put(updateAssistantSequence);
adminRoutes.route("/assistant-by-platform/:id").get(authorize("read:assistants"),getAssistantbyPlatformId);
//agent actions
adminRoutes.route("/get-dynamic-functions").get(authorize("read:dynamic-functions"),getDynamicFunctions);
adminRoutes.route("/request-dynamic-function").post(authorize("write:dynamic-functions"),requestDynamicFunction);
adminRoutes.route("/get-dynamic-function/:id").get(authorize("read:dynamic-functions"),getDynamicFunctionById);
adminRoutes.route("/delete-dynamic-function/:id").delete(authorize("delete:dynamic-functions"),deleteDynamicFunction);

//task actions
adminRoutes.route("/tasks/tasks").get(authorize("read:tasks"), getAllTasks);
adminRoutes.route("/tasks/task/:taskId").get(authorize("read:tasks"), getTaskById);
adminRoutes.route("/tasks/task").post(authorize("write:tasks"), createTask);
adminRoutes.route("/tasks/task/:taskId").put(authorize("write:tasks"), updateTask);
adminRoutes.route("/tasks/task/:taskId").delete(authorize("delete:tasks"), deleteTask);
adminRoutes.route("/tasks/task-widget").post(authorize("write:tasks"), createTaskWidget);
adminRoutes.route("/tasks/task-widget/:mappingId").put(authorize("write:tasks"), updateTaskWidget);
adminRoutes.route("/tasks/task-widget/:mappingId").delete(authorize("delete:tasks"), deleteTaskWidget);
adminRoutes.route("/tasks/widget-mappings").get(authorize("read:tasks"), getTaskWidgetMappings);

//api logs by email id,
adminRoutes.route("/get-api-logs/:userId").get(authorize("read:api-logs"),getApiLogsByUserId);

//activities by platform id
adminRoutes.route("/:platformId/activities").get(authorize("read:activities"),getActivitiesByPlatformId);

export default adminRoutes;
