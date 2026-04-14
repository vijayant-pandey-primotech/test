import platformMappingService from "../services/platformService.js";
import { PlatformTask, TaskMaster, ItemMaster, Activity, Platform } from "../model/index.js";
import { Op } from "sequelize";
import {
  invalidatePlatformTaskRecommendationCache,
  invalidatePlatformMappingCache,
  invalidateChaptersCache,
  invalidateItemsCache,
  invalidateActivitiesAndAssistantsCache,
  isOnboardingRecommendationPlan,
} from "../config/redisAdminCache.js";

const createPlatforms = async (req, res) => {
  try {
    const platforms = await platformMappingService.createPlatform(req.body);
    await invalidatePlatformMappingCache();
    res.status(platforms.status).json(platforms);
  } catch (err) {
    console.error("Error creating platforms:", err);
    res.status(500).json({ error: "Failed to create platforms" });
  }
};

const getPlatforms = async (req, res) => {
  try {
    const platforms = await platformMappingService.getAllPlatforms();
    res.status(200).json(platforms);
  } catch (err) {
    console.error("Error fetching platforms:", err);
    res.status(500).json({ error: "Failed to fetch platforms" });
  }
};

const removePlatforms = async (req, res) => {
  try {
    const platforms = await platformMappingService.removePlatform(req.query.id);
    await invalidatePlatformMappingCache();
    console.log(platforms, "============================== platforms ");
    res.status(200).json(platforms);
  } catch (err) {
    console.error("Error deleting platforms:", err);
    res.status(500).json({ error: "Failed to delete platforms" });
  }
};

const updatePlatform = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, onboardingMessage } = req.body;
    
    // Only allow name, description, and onboardingMessage - ignore any goals field
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (onboardingMessage !== undefined) updateData.onboardingMessage = onboardingMessage;
    
    const result = await platformMappingService.updatePlatform(id, updateData);
    await invalidatePlatformMappingCache();
    res.status(result.status).json(result);
  } catch (err) {
    console.error("Error updating platform:", err);
    res.status(500).json({ 
      status: 500,
      error: "Failed to update platform",
      message: err.message 
    });
  }
};

const createPlatformMappings = async (req, res) => {
  try {
    const response = await platformMappingService.createMappings(req.body);
    await invalidatePlatformMappingCache();
    res.status(201).json(response);
  } catch (error) {
    console.error("Error in controller:", error);
    res
      .status(error?.status || 500)
      .json({ error: error.message || "Internal server error" });
  }
};

const getPlatformMappings = async (req, res) => {
  try {
    const mappings = await platformMappingService.getMappings(req.query);
    res.json(mappings);
  } catch (err) {
    res
      .status(err?.status || 500)
      .json({ error: err.message || "Internal server error" });
  }
};

const getPlatformMappingById = async (req, res) => {
  try {
    const mapping = await platformMappingService.getMappingByPlatformId(
      req.params.id
    );
    if (!mapping) return res.status(404).json({ error: "Not found" });
    res.json(mapping);
  } catch (err) {
    res
      .status(err?.status || 500)
      .json({ error: err.message || "Internal server error" });
  }
};

const createPlatFormStories = async (req, res) => {
  try {
    const response = await platformMappingService.createPlatFormStory(req.body);
    await invalidatePlatformMappingCache();
    res.status(response.status).json(response);
  } catch (error) {
    console.error("Error in controller:", error);
    res
      .status(error?.status || 500)
      .json({ error: error.message || "Internal server error" });
  }
};

const createPlatFormChapters = async (req, res) => {
  try {
    const response = await platformMappingService.createPlatFormChapter(
      req.body
    );
    await invalidatePlatformMappingCache();
    res.status(response.status).json(response);
  } catch (error) {
    console.error("Error in controller:", error);
    res
      .status(error?.status || 500)
      .json({ error: error.message || "Internal server error" });
  }
};

const filterPlatforms = async (req, res) => {
  try {
    const response = await platformMappingService.filterPlatforms(req.body);
    res.status(response.status).json(response);
  } catch (error) {
    console.error("Error in controller:", error);
    res
      .status(error?.status || 500)
      .json({ error: error.message || "Internal server error" });
  }
};

const getStoriesByPlatforms = async (req, res) => {
  try {
    const response = await platformMappingService.getStoriesByPlatforms(
      req.body
    );
    res.status(response.status).json(response);
  } catch (error) {
    console.error("Error in getStoriesByPlatforms controller:", error);
    res.status(error?.status || 500).json({
      error: error.message || "Internal server error",
      status: error?.status || 500,
      message: error.message || "Failed to fetch stories by platforms",
    });
  }
};

const getChaptersByPlatformStories = async (req, res) => {
  try {
    const response = await platformMappingService.getChaptersByPlatformStories(
      req.body
    );
    res.status(response.status).json(response);
  } catch (error) {
    console.error("Error in getChaptersByPlatformStories controller:", error);
    res.status(error?.status || 500).json({
      error: error.message || "Internal server error",
      status: error?.status || 500,
      message: error.message || "Failed to fetch chapters by platform stories",
    });
  }
};

const getItemsByPlatformChapters=async(req,res)=>{
  try {
    const response = await platformMappingService.getItemsByPlatformChapters(
      req.body
    );
    res.status(response.status).json(response);
  } catch (error) {
    console.error("Error in getItemsByPlatformChapters controller:", error);
    res.status(error?.status || 500).json({
      error: error.message || "Internal server error",
      status: error?.status || 500,
      message: error.message || "Failed to fetch Items by platform chapters",
    });
  }
}

const importExcelData = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ 
        error: 'No Excel file uploaded. Please upload a file with the field name "excelFile"' 
      });
    }

    const excelFile = req.file;
    
    // Validate file type (simplified: rely on extension primarily, but check mimetype as fallback)
    const fileExtension = excelFile.originalname.split('.').pop().toLowerCase();
    const validExtensions = ['xlsx', 'xls', 'csv'];
    if (!validExtensions.includes(fileExtension)) {
      return res.status(400).json({ 
        error: 'Invalid file type. Please upload an Excel file (.xlsx, .xls, or .csv)' 
      });
    }

    // Validate mimetype as additional check
    if (!excelFile.mimetype.includes('spreadsheet') &&
        !excelFile.mimetype.includes('spreadsheetml') && 
        !excelFile.mimetype.includes('excel') && 
        !excelFile.mimetype.includes('csv') &&
        !excelFile.mimetype.includes('text/csv')) {
      return res.status(400).json({ 
        error: 'Invalid file type based on content. Please upload a valid Excel or CSV file.' 
      });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (excelFile.size > maxSize) {
      return res.status(400).json({ 
        error: 'File size too large. Maximum size is 10MB' 
      });
    }

    // Pass both buffer and originalname to service
    const result = await platformMappingService.importExcelData(excelFile.buffer, excelFile.originalname);

    if (result.status === 200 || result.status === 201) {
      await invalidatePlatformMappingCache();
      await invalidateChaptersCache();
      await invalidateItemsCache();
    }
    res.status(result.status).json(result);
    
  } catch (error) {
    console.error('Error importing Excel data:', error);
    res.status(500).json({ 
      error: 'Failed to import Excel data',
      details: error.message 
    });
  }
};

const exportExcelData = async (req, res) => {
  try {
    // Get story IDs from request body or query params
    let storyIds = req.body.storyIds || req.query.storyIds;
    
    if (!storyIds) {
      return res.status(400).json({ 
        error: 'Story IDs are required. Please provide storyIds as an array.' 
      });
    }

    // Convert to array if it's a string (comma-separated)
    if (typeof storyIds === 'string') {
      storyIds = storyIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    }

    // Validate array
    if (!Array.isArray(storyIds) || storyIds.length === 0) {
      return res.status(400).json({ 
        error: 'Story IDs must be a non-empty array of numbers' 
      });
    }

    // Validate all IDs are numbers
    const invalidIds = storyIds.filter(id => typeof id !== 'number' || isNaN(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        error: 'All story IDs must be valid numbers' 
      });
    }

    // Call service to generate Excel
    const result = await platformMappingService.exportExcelData(storyIds);
    
// ✅ Set headers for Excel
res.setHeader(
  'Content-Type',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
);
res.setHeader(
  'Content-Disposition',
  `attachment; filename="${result.filename}"`
);

// ✅ Add message + status in custom headers
res.setHeader('X-Export-Message', 'Story exported successfully');
res.setHeader('X-Export-Status', '200');

// ✅ Send file
res.end(result.buffer);


  } catch (error) {
    console.error('Error exporting Excel data:', error);
    res.status(500).json({ 
      error: 'Failed to export Excel data',
      details: error.message 
    });
  }
};




// ============================================
// Platform Tasks CRUD Operations
// ============================================

const getPlatformTasks = async (req, res) => {
  try {
    const { platformId, ActivityId } = req.query;
    const where = {};
    
    if (platformId) {
      where.platformId = platformId;
    }
    if (ActivityId) {
      where.activityId = ActivityId;
    }
    const tasks = await PlatformTask.findAll({
      where,
      include: [
        {
          model: Platform,
          as: 'Platform',
          attributes: ['id', 'name']
        },
        {
          model: TaskMaster,
          as: 'Activity',
          attributes: ['taskId', 'task_type', 'description']
        }
      ],
      order: [['taskOrder', 'ASC'], ['createdAt', 'DESC']]
    });
    
    res.status(200).json({
      status: 200,
      message: "Platform tasks fetched successfully",
      body: tasks
    });
  } catch (error) {
    console.error("Error fetching platform tasks:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to fetch platform tasks",
      message: error.message
    });
  }
};

const createPlatformTask = async (req, res) => {
  try {
    const { platformId, activityId, meta_data, title, taskOrder, isMandatory, status, description } = req.body;
    
    if (!platformId || !activityId || !title || taskOrder === undefined) {
      return res.status(400).json({
        status: 400,
        error: "platformId, activityId, title, and taskOrder are required"
      });
    }
    
    // Validate platform exists
    const platform = await Platform.findByPk(platformId);
    if (!platform) {
      return res.status(404).json({
        status: 404,
        error: "Platform not found"
      });
    }
    
    // Validate activity exists
    const activity = await TaskMaster.findByPk(activityId);
    if (!activity) {
      return res.status(404).json({
        status: 404,
        error: "Activity (task) not found"
      });
    }
    
    // meta_data: array of { itemId, answerType } OR { type: 'url', url: string } OR { assistantId: number }; optional functionId (Activity id) in object forms; stored as string e.g. "2"
    const withFunctionId = (payload) => {
      if (payload == null) return null;
      if (meta_data && typeof meta_data === 'object' && !Array.isArray(meta_data) && meta_data.functionId != null && meta_data.functionId !== '') {
        const fid = String(meta_data.functionId).trim();
        if (fid && /^\d+$/.test(fid)) return { ...(typeof payload === 'object' && !Array.isArray(payload) ? payload : {}), ...(Array.isArray(payload) ? { items: payload } : {}), functionId: fid };
      }
      return payload;
    };
    const metaDataPayload = (() => {
      if (meta_data && typeof meta_data === 'object' && !Array.isArray(meta_data)) {
        if (meta_data.type === 'url' && typeof meta_data.url === 'string' && meta_data.url.trim()) {
          return withFunctionId({ type: 'url', url: meta_data.url.trim() });
        }
        if (meta_data.assistantId != null && meta_data.assistantId !== '') {
          const aid = parseInt(meta_data.assistantId, 10);
          if (!isNaN(aid)) return withFunctionId({ assistantId: aid });
        }
        if (Array.isArray(meta_data.items) && meta_data.items.length > 0) {
          const items = meta_data.items.filter((e) => e && (e.itemId != null) && e.answerType).map((e) => ({
            itemId: parseInt(e.itemId),
            answerType: e.answerType
          }));
          if (items.length > 0) return withFunctionId(items);
        }
      }
      if (Array.isArray(meta_data) && meta_data.length > 0) {
        const items = meta_data.filter((e) => e && (e.itemId != null) && e.answerType).map((e) => ({
          itemId: parseInt(e.itemId),
          answerType: e.answerType
        }));
        return items.length > 0 ? items : null;
      }
      return null;
    })();
    const task = await PlatformTask.create({
      platformId,
      activityId,
      meta_data: metaDataPayload,
      title,
      taskOrder,
      isMandatory: isMandatory ?? false,
      status: status || 'active',
      description: description != null ? String(description) : ''
    });
    
    // Fetch with associations
    const createdTask = await PlatformTask.findByPk(task.id, {
      include: [
        {
          model: Platform,
          as: 'Platform',
          attributes: ['id', 'name']
        },
        {
          model: TaskMaster,
          as: 'Activity',
          attributes: ['taskId', 'task_type', 'description']
        }
      ]
    });

    await invalidatePlatformTaskRecommendationCache();
    res.status(201).json({
      status: 201,
      message: "Platform task created successfully",
      body: createdTask
    });
  } catch (error) {
    console.error("Error creating platform task:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to create platform task",
      message: error.message
    });
  }
};

const updatePlatformTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { platformId, activityId, meta_data, title, taskOrder, isMandatory, status, description } = req.body;
    
    const task = await PlatformTask.findByPk(id);
    
    if (!task) {
      return res.status(404).json({
        status: 404,
        error: "Platform task not found"
      });
    }
    
    // Validate platform if provided
    if (platformId) {
      const platform = await Platform.findByPk(platformId);
      if (!platform) {
        return res.status(404).json({
          status: 404,
          error: "Platform not found"
        });
      }
    }
    
    // Validate activity if provided
    if (activityId) {
      const activity = await TaskMaster.findByPk(activityId);
      if (!activity) {
        return res.status(404).json({
          status: 404,
          error: "Activity (task) not found"
        });
      }
    }
    
    const withFunctionIdUpdate = (payload, reqMeta) => {
      if (payload == null) return null;
      if (reqMeta && typeof reqMeta === 'object' && !Array.isArray(reqMeta) && reqMeta.functionId != null && reqMeta.functionId !== '') {
        const fid = String(reqMeta.functionId).trim();
        if (fid && /^\d+$/.test(fid)) return { ...(typeof payload === 'object' && !Array.isArray(payload) ? payload : {}), ...(Array.isArray(payload) ? { items: payload } : {}), functionId: fid };
      }
      return payload;
    };
    const metaDataPayload = meta_data !== undefined
      ? (() => {
          if (meta_data && typeof meta_data === 'object' && !Array.isArray(meta_data)) {
            if (meta_data.type === 'url' && typeof meta_data.url === 'string' && meta_data.url.trim()) {
              return withFunctionIdUpdate({ type: 'url', url: meta_data.url.trim() }, meta_data);
            }
            if (meta_data.assistantId != null && meta_data.assistantId !== '') {
              const aid = parseInt(meta_data.assistantId, 10);
              if (!isNaN(aid)) return withFunctionIdUpdate({ assistantId: aid }, meta_data);
            }
            if (Array.isArray(meta_data.items) && meta_data.items.length > 0) {
              const items = meta_data.items.filter((e) => e && (e.itemId != null) && e.answerType).map((e) => ({
                itemId: parseInt(e.itemId),
                answerType: e.answerType
              }));
              if (items.length > 0) return withFunctionIdUpdate(items, meta_data);
            }
          }
          if (Array.isArray(meta_data) && meta_data.length > 0) {
            const items = meta_data.filter((e) => e && (e.itemId != null) && e.answerType).map((e) => ({
              itemId: parseInt(e.itemId),
              answerType: e.answerType
            }));
            return items.length > 0 ? items : null;
          }
          return null;
        })()
      : task.meta_data;
    await task.update({
      platformId: platformId ?? task.platformId,
      activityId: activityId ?? task.activityId,
      meta_data: metaDataPayload,
      title: title ?? task.title,
      taskOrder: taskOrder ?? task.taskOrder,
      isMandatory: isMandatory !== undefined ? isMandatory : task.isMandatory,
      status: status ?? task.status,
      ...(description !== undefined ? { description: description != null ? String(description) : '' } : {})
    });
    
    // Fetch updated task with associations
    const updatedTask = await PlatformTask.findByPk(id, {
      include: [
        {
          model: Platform,
          as: 'Platform',
          attributes: ['id', 'name']
        },
        {
          model: TaskMaster,
          as: 'Activity',
          attributes: ['taskId', 'task_type', 'description']
        }
      ]
    });

    const planId = activityId ?? task.activityId;
    const plan = planId ? await TaskMaster.findByPk(planId, { attributes: ['task_type'] }) : null;
    if (isOnboardingRecommendationPlan(plan)) {
      await invalidatePlatformTaskRecommendationCache();
    }
    res.status(200).json({
      status: 200,
      message: "Platform task updated successfully",
      body: updatedTask
    });
  } catch (error) {
    console.error("Error updating platform task:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to update platform task",
      message: error.message
    });
  }
};

const deletePlatformTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await PlatformTask.findByPk(id);
    
    if (!task) {
      return res.status(404).json({
        status: 404,
        error: "Platform task not found"
      });
    }
    
    // Soft delete by setting status to inactive
    await task.update({ status: 'inactive' });

    const activity = await TaskMaster.findByPk(task.activityId, { attributes: ['task_type'] });
    if (isOnboardingRecommendationPlan(activity)) {
      await invalidatePlatformTaskRecommendationCache();
    }
    res.status(200).json({
      status: 200,
      message: "Platform task deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting platform task:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to delete platform task",
      message: error.message
    });
  }
};

// Get TaskMaster entries for onboarding
const getOnboardingTasks = async (req, res) => {
  try {
    const tasks = await TaskMaster.findAll({
      
        is_active: 1,
      is_deleted: 0
    });
    
    res.status(200).json({
      status: 200,
      message: "Onboarding tasks fetched successfully",
      body: tasks
    });
  } catch (error) {
    console.error("Error fetching onboarding tasks:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to fetch onboarding tasks",
      message: error.message
    });
  }
};

// Update platform task order
const updatePlatformTaskOrder = async (req, res) => {
  try {
    const { tasks } = req.body;
    console.log(tasks, "============================== tasks ");
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        status: 400,
        error: "Tasks array is required"
      });
    }
    
    // Normalize task IDs to integers
    const taskIds = tasks.map(t => parseInt(t.id)).filter(id => !isNaN(id));
    
    if (taskIds.length === 0) {
      return res.status(400).json({
        status: 400,
        error: "No valid task IDs provided"
      });
    }
    
    if (taskIds.length !== tasks.length) {
      console.warn("Some task IDs were invalid and filtered out");
    }
    
    // Verify all tasks exist before updating
    const existingTasks = await PlatformTask.findAll({
      where: { 
        id: { [Op.in]: taskIds },
        status: { [Op.ne]: 'inactive' } // Only check active tasks
      },
      attributes: ['id']
    });
    
    const existingTaskIds = existingTasks.map(t => parseInt(t.id));
    const missingTaskIds = taskIds.filter(id => !existingTaskIds.includes(id));
    
    if (missingTaskIds.length > 0) {
      console.error("Missing task IDs:", missingTaskIds);
      console.error("Requested task IDs:", taskIds);
      console.error("Existing task IDs:", existingTaskIds);
      return res.status(404).json({
        status: 404,
        error: `Platform tasks not found: ${missingTaskIds.join(', ')}. Please refresh the page and try again.`
      });
    }
    
    // Update each task's order - ensure IDs are integers
    const updatePromises = tasks.map((task) => {
      const taskId = parseInt(task.id);
      const taskOrder = parseInt(task.taskOrder);
      if (isNaN(taskId) || isNaN(taskOrder)) {
        throw new Error(`Invalid task data: id=${task.id}, taskOrder=${task.taskOrder}`);
      }
      return PlatformTask.update(
        { taskOrder: taskOrder },
        { where: { id: taskId } }
      );
    });
    
    await Promise.all(updatePromises);

    const platformTasksWithActivity = await PlatformTask.findAll({
      where: { id: { [Op.in]: taskIds } },
      attributes: ['activityId']
    });
    const activityIds = [...new Set(platformTasksWithActivity.map((t) => t.activityId).filter(Boolean))];
    const plans = activityIds.length > 0 ? await TaskMaster.findAll({ where: { taskId: { [Op.in]: activityIds } }, attributes: ['task_type'] }) : [];
    const shouldInvalidate = plans.some(isOnboardingRecommendationPlan);
    if (shouldInvalidate) {
      await invalidatePlatformTaskRecommendationCache();
    }
    res.status(200).json({
      status: 200,
      message: "Platform task order updated successfully"
    });
  } catch (error) {
    console.error("Error updating platform task order:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to update platform task order",
      message: error.message
    });
  }
};

// ============================================
// Activities CRUD Operations
// ============================================

// Normalize platforms to an array and check if it contains platformId (handles number/string in array)
const activityBelongsToPlatform = (activity, platformId) => {
  let platforms = activity.platforms;
  if (platforms == null) return false;
  if (typeof platforms === 'string') {
    try {
      platforms = JSON.parse(platforms);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(platforms)) return false;
  const idStr = String(platformId);
  return platforms.some(p => p != null && String(p) === idStr);
};

const getActivities = async (req, res) => {
  try {
    const { platformId } = req.query;
    let activities = await Activity.findAll({
      where: {
        status: 'Active'
      },
      order: [['createdAt', 'DESC']]
    });

    if (platformId) {
      activities = activities.filter(activity => activityBelongsToPlatform(activity, platformId));
      // Platform-wise order: by sequence (nulls last), then createdAt
      activities.sort((a, b) => {
        const seqA = a.sequence == null ? 999999 : a.sequence;
        const seqB = b.sequence == null ? 999999 : b.sequence;
        if (seqA !== seqB) return seqA - seqB;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }

    res.status(200).json({
      status: 200,
      message: "Activities fetched successfully",
      body: activities
    });
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to fetch activities",
      message: error.message
    });
  }
};

// Normalize platforms to array of strings for consistent JSON storage (e.g. ["2"] not [2])
const normalizePlatformsArray = (platforms) => {
  if (platforms == null) return null;
  let arr = platforms;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.map(p => p != null ? String(p).trim() : null).filter(Boolean);
};

const createActivity = async (req, res) => {
  try {
    const { activityName, description, platforms: rawPlatforms, status, activityLabel, labelInfo } = req.body;
    const platforms = normalizePlatformsArray(rawPlatforms);

    if (!activityName || !platforms || platforms.length === 0) {
      return res.status(400).json({
        status: 400,
        error: "Activity name and at least one platform are required"
      });
    }

    if (platforms.length > 1) {
      return res.status(400).json({
        status: 400,
        error: "Activity can be assigned to only one platform"
      });
    }

    const platformId = platforms[0];
    const existingForPlatform = await Activity.findAll({
      where: { status: 'Active' },
      attributes: ['sequence', 'platforms']
    });
    const samePlatform = existingForPlatform.filter(a =>
      Array.isArray(a.platforms) && a.platforms.some(p => String(p) === String(platformId))
    );
    const maxSeq = samePlatform.reduce((max, a) => Math.max(max, a.sequence == null ? 0 : a.sequence), 0);
    const nextSequence = maxSeq + 1;

    const newActivity = await Activity.create({
      activityName,
      description,
      platforms,
      status: status || 'Active',
      activityLabel,
      labelInfo,
      sequence: nextSequence
    });

    await invalidateActivitiesAndAssistantsCache();

    res.status(201).json({
      status: 201,
      message: "Activity created successfully",
      body: newActivity
    });
  } catch (error) {
    console.error("Error creating activity:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to create activity",
      message: error.message
    });
  }
};

const updateActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { activityName, description, platforms: rawPlatforms, status, activityLabel, labelInfo } = req.body;
    const platforms = rawPlatforms != null ? normalizePlatformsArray(rawPlatforms) : null;

    const activity = await Activity.findByPk(id);
    if (!activity) {
      return res.status(404).json({
        status: 404,
        error: "Activity not found"
      });
    }

    if (platforms && platforms.length > 1) {
      return res.status(400).json({
        status: 400,
        error: "Activity can be assigned to only one platform"
      });
    }

    const platformsToSave = platforms && platforms.length > 0 ? platforms : activity.platforms;

    const updatedActivity = await activity.update({
      activityName: activityName || activity.activityName,
      description: description !== undefined ? description : activity.description,
      platforms: platformsToSave,
      status: status || activity.status,
      activityLabel: activityLabel !== undefined ? activityLabel : activity.activityLabel,
      labelInfo: labelInfo !== undefined ? labelInfo : activity.labelInfo
    });

    res.status(200).json({
      status: 200,
      message: "Activity updated successfully",
      body: updatedActivity
    });
  } catch (error) {
    console.error("Error updating activity:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to update activity",
      message: error.message
    });
  }
};

// Update activity order (platform-wise: only activities for the given platform are reordered)
const updateActivityOrder = async (req, res) => {
  try {
    const { activities: activitiesPayload, platformId } = req.body;
    if (!Array.isArray(activitiesPayload) || activitiesPayload.length === 0) {
      return res.status(400).json({
        status: 400,
        error: "activities array and platformId are required"
      });
    }
    if (!platformId) {
      return res.status(400).json({
        status: 400,
        error: "platformId is required"
      });
    }

    const updates = activitiesPayload.map((item, index) => ({
      id: parseInt(item.id, 10),
      sequence: index + 1
    })).filter(u => !isNaN(u.id));

    if (updates.length === 0) {
      return res.status(400).json({
        status: 400,
        error: "No valid activity IDs provided"
      });
    }

    const ids = updates.map(u => u.id);
    const existing = await Activity.findAll({
      where: { id: ids, status: 'Active' },
      attributes: ['id', 'platforms']
    });
    const belongToPlatform = existing.filter(a =>
      Array.isArray(a.platforms) && a.platforms.some(p => String(p) === String(platformId))
    );
    if (belongToPlatform.length !== updates.length) {
      return res.status(400).json({
        status: 400,
        error: "All activities must belong to the specified platform"
      });
    }

    await Promise.all(updates.map(({ id, sequence }) =>
      Activity.update({ sequence }, { where: { id } })
    ));

    res.status(200).json({
      status: 200,
      message: "Activity order updated successfully",
      body: updates
    });
  } catch (error) {
    console.error("Error updating activity order:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to update activity order",
      message: error.message
    });
  }
};

const deleteActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const activity = await Activity.findByPk(id);
    
    if (!activity) {
      return res.status(404).json({
        status: 404,
        error: "Activity not found"
      });
    }

    // Soft delete
    await activity.update({ status: 'Inactive' });

    res.status(200).json({
      status: 200,
      message: "Activity deleted (archived) successfully"
    });
  } catch (error) {
    console.error("Error deleting activity:", error);
    res.status(500).json({
      status: 500,
      error: "Failed to delete activity",
      message: error.message
    });
  }
};

export default {
  getActivities,
  createActivity,
  updateActivity,
  updateActivityOrder,
  deleteActivity,
  getPlatforms,
  createPlatformMappings,
  getPlatformMappings,
  getPlatformMappingById,
  removePlatforms,
  createPlatforms,
  updatePlatform,
  createPlatFormStories,
  createPlatFormChapters,
  filterPlatforms,
  getStoriesByPlatforms,
  getChaptersByPlatformStories,
  getItemsByPlatformChapters,
  importExcelData,
  exportExcelData,
  // Platform Tasks
  getPlatformTasks,
  createPlatformTask,
  updatePlatformTask,
  deletePlatformTask,
  getOnboardingTasks,
  updatePlatformTaskOrder
};
