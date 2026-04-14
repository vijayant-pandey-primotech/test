import { TaskMaster } from "../model/index.js";
import WidgetMapping from "../model/widgetMapping.js";
import Widgets from "../model/widgets.js";
import Logger from "../logger/logger.js";
import { invalidatePlatformTaskRecommendationCache } from "../config/redisAdminCache.js";

// Get all tasks
export const getAllTasks = async (req, res) => {
  try {
    const tasks = await TaskMaster.findAll({
      where: { is_deleted: 0 },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: tasks
    });
  } catch (error) {
    Logger.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks',
      error: error.message
    });
  }
};

// Get task by ID
export const getTaskById = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const task = await TaskMaster.findOne({
      where: { taskId, is_deleted: 0 }
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    Logger.error('Error fetching task:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching task',
      error: error.message
    });
  }
};

// Create new task
export const createTask = async (req, res) => {
  try {
    const { task_type, description, platform_id, story_id, fields } = req.body;

    if (!task_type || !fields || !Array.isArray(fields)) {
      return res.status(400).json({
        success: false,
        message: 'Task type and fields array are required'
      });
    }

    const task = await TaskMaster.create({
      task_type,
      description,
      platform_id,
      story_id,
      fields
    });

    await invalidatePlatformTaskRecommendationCache();

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task
    });
  } catch (error) {
    Logger.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating task',
      error: error.message
    });
  }
};

// Update task
export const updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { task_type, description, platform_id, story_id, fields, is_active } = req.body;

    const task = await TaskMaster.findOne({
      where: { taskId, is_deleted: 0 }
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    await task.update({
      task_type: task_type || task.task_type,
      description: description !== undefined ? description : task.description,
      platform_id: platform_id !== undefined ? platform_id : task.platform_id,
      story_id: story_id !== undefined ? story_id : task.story_id,
      fields: fields || task.fields,
      is_active: is_active !== undefined ? is_active : task.is_active
    });

    await invalidatePlatformTaskRecommendationCache();
    res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      data: task
    });
  } catch (error) {
    Logger.error('Error updating task:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating task',
      error: error.message
    });
  }
};

// Delete task (soft delete)
export const deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await TaskMaster.findOne({
      where: { taskId, is_deleted: 0 }
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    await task.update({ is_deleted: 1 });

    await invalidatePlatformTaskRecommendationCache();
    res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    Logger.error('Error deleting task:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting task',
      error: error.message
    });
  }
};

// Create task widget mapping
export const createTaskWidget = async (req, res) => {
  try {
    const {
      name,
      widgetKey,
      entityType,
      entityId,
      taskType,
      platform,
      displayPath
    } = req.body;
    // Validate required fields
    if (!name || !widgetKey || !entityType || !entityId || !taskType) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: name, widgetKey, entityType, entityId, taskType'
      });
    }

    // Check if task exists
    const task = await TaskMaster.findOne({
      where: { taskId: entityId, is_deleted: 0 }
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check if widget mapping already exists for this task
    const existingMapping = await WidgetMapping.findOne({
      where: { 
        entity_type: entityType,
        entity_id: entityId 
      }
    });

    // Find or create the base widget
    let baseWidget = await Widgets.findOne({
      where: { widgetKey: widgetKey }
    });

    if (!baseWidget) {
      // Create the base widget if it doesn't exist
      baseWidget = await Widgets.create({
        widgetName: taskType === "medication" ? "Medication Tasks" : "Appointment Tasks",
        widgetDescription: `Widget for ${taskType} tasks`,
        widgetKey: widgetKey,
        platforms: [platform], // Use the selected platform
        isActive: true
      });
    }

    let widgetMapping;
    let wasUpdated = false;

    if (existingMapping) {
      // Update existing mapping instead of creating a new one
      await existingMapping.update({
        name: name,
        widget_id: baseWidget.id,
        entity_type: entityType,
        entity_id: entityId,
        display_path: displayPath || {},
        is_active: true
      });
      widgetMapping = existingMapping;
      wasUpdated = true;
    } else {
      // Create new widget mapping
      widgetMapping = await WidgetMapping.create({
        name: name,
        widget_id: baseWidget.id,
        entity_type: entityType,
        entity_id: entityId,
        display_path: displayPath || {},
        is_active: true
      });
    }

    res.status(wasUpdated ? 200 : 201).json({
      success: true,
      message: wasUpdated ? 'Task widget updated successfully' : 'Task widget created successfully',
      data: {
        widgetMappingId: widgetMapping.id,
        widgetId: baseWidget.id,
        taskId: entityId,
        taskType: taskType,
        widgetName: name
      }
    });

  } catch (error) {
    Logger.error('Error creating task widget:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating task widget',
      error: error.message
    });
  }
};

// Get widget mappings for tasks
export const getTaskWidgetMappings = async (req, res) => {
  try {
    const { taskIds } = req.query;
    
    if (!taskIds) {
      return res.status(400).json({
        success: false,
        message: 'taskIds query parameter is required'
      });
    }

    // Parse taskIds if it's a string
    const taskIdArray = typeof taskIds === 'string' ? taskIds.split(',') : taskIds;

    // Get widget mappings for the specified tasks
    const widgetMappings = await WidgetMapping.findAll({
      where: {
        entity_type: 'Plan',
        entity_id: taskIdArray,
        is_active: true
      }
    });

    // Get widget details for each mapping
    const formattedMappings = await Promise.all(
      widgetMappings.map(async (mapping) => {
        const widget = await Widgets.findByPk(mapping.widget_id);
        return {
          id: mapping.id,
          name: mapping.name,
          entityId: mapping.entity_id,
          displayPath: mapping.display_path,
          widget: widget ? {
            id: widget.id,
            widgetName: widget.widgetName,
            widgetKey: widget.widgetKey,
            platforms: widget.platforms
          } : null,
          createdAt: mapping.created_at,
          updatedAt: mapping.updated_at
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'Widget mappings fetched successfully',
      data: formattedMappings
    });

  } catch (error) {
    Logger.error('Error fetching task widget mappings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching task widget mappings',
      error: error.message
    });
  }
};

// Update task widget mapping
export const updateTaskWidget = async (req, res) => {
  try {
    const { mappingId } = req.params;
    const {
      name,
      widgetKey,
      entityType,
      entityId,
      displayPath,
      taskType,
      platform
    } = req.body;

    // Validate required fields
    if (!name || !widgetKey || !entityType || !entityId || !taskType || !platform) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: name, widgetKey, entityType, entityId, taskType, platform'
      });
    }

    // Check if widget mapping exists
    const existingMapping = await WidgetMapping.findByPk(mappingId);
    if (!existingMapping) {
      return res.status(404).json({
        success: false,
        message: 'Widget mapping not found'
      });
    }

    // Check if task exists
    const task = await TaskMaster.findOne({
      where: { taskId: entityId, is_deleted: 0 }
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Find or create the base widget
    let baseWidget = await Widgets.findOne({
      where: { widgetKey: widgetKey }
    });

    if (!baseWidget) {
      // Create the base widget if it doesn't exist
      baseWidget = await Widgets.create({
        widgetName: taskType === "medication" ? "Medication Tasks" : "Appointment Tasks",
        widgetDescription: `Widget for ${taskType} tasks`,
        widgetKey: widgetKey,
        platforms: [platform], // Use the selected platform
        isActive: true
      });
    }

    // Update widget mapping
    await existingMapping.update({
      name: name,
      widget_id: baseWidget.id,
      entity_type: entityType,
      entity_id: entityId,
      display_path: displayPath,
      is_active: true
    });

    res.status(200).json({
      success: true,
      message: 'Task widget updated successfully',
      data: {
        widgetMappingId: existingMapping.id,
        widgetId: baseWidget.id,
        taskId: entityId,
        taskType: taskType,
        widgetName: name
      }
    });

  } catch (error) {
    Logger.error('Error updating task widget:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating task widget',
      error: error.message
    });
  }
};

// Delete task widget mapping
export const deleteTaskWidget = async (req, res) => {
  try {
    const { mappingId } = req.params;

    // Check if widget mapping exists
    const existingMapping = await WidgetMapping.findByPk(mappingId);
    if (!existingMapping) {
      return res.status(404).json({
        success: false,
        message: 'Widget mapping not found'
      });
    }

    // Soft delete by setting is_active to false
    await existingMapping.update({ is_active: false });

    res.status(200).json({
      success: true,
      message: 'Task widget deleted successfully',
      data: {
        widgetMappingId: existingMapping.id,
        taskId: existingMapping.entity_id
      }
    });

  } catch (error) {
    Logger.error('Error deleting task widget:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting task widget',
      error: error.message
    });
  }
};

 