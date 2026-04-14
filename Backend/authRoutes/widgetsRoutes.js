import express from "express";
import widgetsController from "../authControllers/widgetsController.js";
import { authorize } from "../middleware/adminAuthMiddleware.js";

const router = express.Router();

// Get all widgets
router
  .route("/widgets")
  .get(authorize("read:widgets"), widgetsController.getAllWidgets);

// Create new widget
router
  .route("/widgets")
  .post(authorize("write:widgets"), widgetsController.createWidget);

// Get widget by ID
router
  .route("/widgets/:id")
  .get(authorize("read:widgets"), widgetsController.getWidgetById);

// Update widget
router
  .route("/widgets/:id")
  .put(authorize("write:widgets"), widgetsController.updateWidget);

router
  .route("/widgets/:id")
  .delete(authorize("delete:widgets"), widgetsController.deleteWidget);

// Toggle widget status (active/inactive)
router
  .route("/widgets/:id/toggle-status")
  .patch(authorize("write:widgets"), widgetsController.toggleWidgetStatus);

export default router;
