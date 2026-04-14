import express from "express";
import platformMappingController from "../authControllers/platformsControllers.js";
import { authorize } from "../middleware/adminAuthMiddleware.js";
import {
  validatePlatform,
  validateStory,
  validateChapter,
  validateStoriesByPlatforms,
} from "../helpers/validation.js";
import uploadExcel from "../helpers/uploadExcel.js";
import { ERROR_MESSAGES } from "../helpers/messages.js";

const router = express.Router();

router
  .route("/platforms")
  .get(authorize("read:platforms"), platformMappingController.getPlatforms);
router
  .route("/platforms/:id")
  .put(
    authorize("write:platforms"),
    platformMappingController.updatePlatform
  );
router
  .route("/add-platforms")
  .post(
    validatePlatform,
    authorize("write:platforms"),
    platformMappingController.createPlatforms
  );
router
  .route("/remove-platforms")
  .delete(
    authorize("write:platforms"),
    platformMappingController.removePlatforms
  );
router
  .route("/platform-category-mapping/bulk")
  .post(
    authorize("write:platforms"),
    platformMappingController.createPlatformMappings
  );
router
  .route("/platform-category-mapping/:id")
  .get(
    authorize("read:platforms"),
    platformMappingController.getPlatformMappingById
  );
router
  .route("/platform-category-mapping")
  .get(
    authorize("read:platforms"),
    platformMappingController.getPlatformMappings
  );
router
  .route("/add-platform-stories")
  .post(
    validateStory,
    authorize("write:platforms"),
    platformMappingController.createPlatFormStories
  );
router
  .route("/add-platform-chapters")
  .post(
    validateChapter,
    authorize("write:platforms"),
    platformMappingController.createPlatFormChapters
  );
router
  .route("/filter-platforms")
  .post(authorize("read:platforms"), platformMappingController.filterPlatforms);
router
  .route("/stories-by-platforms")
  .post(
    validateStoriesByPlatforms,
    authorize("read:platforms"),
    platformMappingController.getStoriesByPlatforms
  );
  router
  .route("/chapters-by-platform-stories")
  .post(
    authorize("read:platforms"),
    platformMappingController.getChaptersByPlatformStories
  );
  router
  .route("/items-by-platform-chapters")
  .post(
    authorize("read:platforms"),
    platformMappingController.getItemsByPlatformChapters
  );
  
  router.post(
    "/import-excel",
    authorize("write:platforms"),
    (req, res, next) => {
      uploadExcel.single("excelFile")(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res
              .status(400)
              .json({
                status: 400,
                message: ERROR_MESSAGES.FILE_SIZE_EXCEEDS_LIMIT_10MB,
              });
          }
          // Improve error message for type issues
          return res
            .status(400)
            .json({ status: 400, message: err.message || ERROR_MESSAGES.INVALID_FILE_TYPE });
        }
        next();
      });
    },
    platformMappingController.importExcelData
  );

router.post(
  "/export-stories",
  authorize("read:platforms"), 
  platformMappingController.exportExcelData
);

// ============================================
// Platform Tasks Routes
// ============================================
router
  .route("/platform-tasks")
  .get(authorize("read:platforms"), platformMappingController.getPlatformTasks)
  .post(authorize("write:platforms"), platformMappingController.createPlatformTask);

// IMPORTANT: This route must come BEFORE /platform-tasks/:id to avoid route conflict
router
  .route("/platform-tasks/update-order")
  .put(authorize("write:platforms"), platformMappingController.updatePlatformTaskOrder);

router
  .route("/platform-tasks/:id")
  .put(authorize("write:platforms"), platformMappingController.updatePlatformTask)
  .delete(authorize("write:platforms"), platformMappingController.deletePlatformTask);

router
  .route("/onboarding-tasks")
  .get(authorize("read:platforms"), platformMappingController.getOnboardingTasks);

// ============================================
// Activities Routes
// ============================================
router
  .route("/activities")
  .get(authorize("read:platforms"), platformMappingController.getActivities)
  .post(authorize("write:platforms"), platformMappingController.createActivity);

router
  .route("/activities/update-order")
  .put(authorize("write:platforms"), platformMappingController.updateActivityOrder);

router
  .route("/activities/:id")
  .put(authorize("write:platforms"), platformMappingController.updateActivity)
  .delete(authorize("write:platforms"), platformMappingController.deleteActivity);

export default router;
