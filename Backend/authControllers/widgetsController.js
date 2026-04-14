import Widgets from "../model/widgets.js";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../helpers/messages.js";
import { Op } from "sequelize";

// Get all widgets with optional filtering
export const getAllWidgets = async (req, res) => {
  try {
    const widgets = await Widgets.findAll({
      order: [['createdAt', 'DESC']] // Sort by latest added first
    });
    
    const response = {
      status: 200,
      message: SUCCESS_MESSAGES.WIDGETS_FETCHED || "Widgets fetched successfully",
      body: {
        data: widgets,
        total: widgets.length
      }
    };
    
    console.log('API Response:', JSON.stringify(response, null, 2));
    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching widgets:", error);
    return res.status(500).json({
      status: 500,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
      error: error.message,
    });
  }
};

// Get widget by ID
export const getWidgetById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const widget = await Widgets.findByPk(id);
    
    if (!widget) {
      return res.status(404).json({
        status: 404,
        message: "Widget not found"
      });
    }
    
    return res.status(200).json({
      status: 200,
      message: "Widget fetched successfully",
      body: widget
    });
  } catch (error) {
    console.error("Error fetching widget by ID:", error);
    return res.status(500).json({
      status: 500,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
      error: error.message,
    });
  }
};

// Create a new widget
export const createWidget = async (req, res) => {
  try {
    const {
      widgetName,
      widgetDescription,
      widgetKey,
      platforms
    } = req.body;

    // Basic validation
    if (!widgetName || !widgetKey || !platforms || !Array.isArray(platforms)) {
      return res.status(400).json({
        status: 400,
        message: "Widget name, key, and platforms array are required."
      });
    }

    // Check if widget with same name or key already exists
    const existingWidget = await Widgets.findOne({
      where: {
        [Op.or]: [
          { widgetName },
          { widgetKey }
        ]
      }
    });

    if (existingWidget) {
      return res.status(409).json({
        status: 409,
        message: "Widget with this name or key already exists."
      });
    }

    const newWidget = await Widgets.create({
      widgetName,
      widgetDescription,
      widgetKey,
      platforms,
      widgetTemplateJson: req.body.widgetTemplateJson || null,
      isActive: true
    });

    return res.status(201).json({
      status: 201,
      message: "Widget created successfully.",
      body: newWidget
    });
  } catch (error) {
    console.error("Error creating widget:", error);
    return res.status(500).json({
      status: 500,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
      error: error.message,
    });
  }
};

// Update widget
export const updateWidget = async (req, res) => {
  try {
    const { id } = req.params;
    const widgetId = parseInt(id); // Convert to integer
    const {
      widgetName,
      widgetDescription,
      widgetKey,
      platforms,
      widgetTemplateJson,
      isActive
    } = req.body;

    const widget = await Widgets.findByPk(widgetId);
    
    if (!widget) {
      return res.status(404).json({
        status: 404,
        message: "Widget not found"
      });
    }

    // Check if widget name or key already exists (excluding current widget)
    // Only check if the name or key is actually being changed
    const shouldCheckName = widgetName && widgetName !== widget.widgetName;
    const shouldCheckKey = widgetKey && widgetKey !== widget.widgetKey;
    
    if (shouldCheckName || shouldCheckKey) {
      
      const existingWidget = await Widgets.findOne({
        where: {
          [Op.and]: [
            {
              [Op.or]: [
                ...(shouldCheckName ? [{ widgetName }] : []),
                ...(shouldCheckKey ? [{ widgetKey }] : [])
              ]
            },
            { id: { [Op.ne]: widgetId } }
          ]
        }
      });

      if (existingWidget) {
        return res.status(409).json({
          status: 409,
          message: "Widget with this name or key already exists."
        });
      }
    } else {
      console.log("No duplicate check needed - name and key unchanged");
    }

    // Update only provided fields
    const updateData = {};
    if (widgetName !== undefined) updateData.widgetName = widgetName;
    if (widgetDescription !== undefined) updateData.widgetDescription = widgetDescription;
    if (widgetKey !== undefined) updateData.widgetKey = widgetKey;
    if (platforms !== undefined) updateData.platforms = platforms;
    if (widgetTemplateJson !== undefined) updateData.widgetTemplateJson = widgetTemplateJson;
    if (isActive !== undefined) updateData.isActive = isActive;
    await widget.update(updateData);

    return res.status(200).json({
      status: 200,
      message: "Widget updated successfully.",
      body: widget
    });
  } catch (error) {
    console.error("Error updating widget:", error);
    return res.status(500).json({
      status: 500,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
      error: error.message,
    });
  }
};

// Delete widget (soft delete by setting isActive to false)
export const deleteWidget = async (req, res) => {
  try {
    const { id } = req.params;
    
    const widget = await Widgets.findByPk(id);
    
    if (!widget) {
      return res.status(404).json({
        status: 404,
        message: "Widget not found"
      });
    }

    // Soft delete by setting isActive to false
    await widget.update({ isActive: false });

    return res.status(200).json({
      status: 200,
      message: "Widget deleted successfully."
    });
  } catch (error) {
    console.error("Error deleting widget:", error);
    return res.status(500).json({
      status: 500,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
      error: error.message,
    });
  }
};
// Toggle widget status (active/inactive)
export const toggleWidgetStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const widgetId = parseInt(id);
    
    const widget = await Widgets.findByPk(widgetId);
    
    if (!widget) {
      return res.status(404).json({
        status: 404,
        message: "Widget not found"
      });
    }

    // Toggle the isActive status
    const newStatus = !widget.isActive;
    await widget.update({ isActive: newStatus });

    return res.status(200).json({
      status: 200,
      message: `Widget ${newStatus ? 'activated' : 'deactivated'} successfully.`,
      body: {
        id: widget.id,
        widgetName: widget.widgetName,
        widgetKey: widget.widgetKey,
        isActive: newStatus
      }
    });
  } catch (error) {
    console.error("Error toggling widget status:", error);
    return res.status(500).json({
      status: 500,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
      error: error.message,
    });
  }
};

export default {
  getAllWidgets,
  getWidgetById,
  createWidget,
  updateWidget,
  deleteWidget,
  toggleWidgetStatus,
};
