import {
  UserMaster,
  adminMaster,
  adminRoles,
  Stories,
  ChapterMaster,
  ItemMaster,
  Policy,
  Widgets,
  WidgetMapping,
  Questions,
  RecommendationMaster,
  Activity,
} from "../model/index.js";
import { v4 as uuidv4 } from "uuid";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../helpers/messages.js";
import bcrypt from "bcrypt";
import { Sequelize, Op } from "sequelize";
import sequelize from "../config/db.js";
import {
  decryptPassword,
  generateToken,
  generateAccessToken,
  verifyToken,
} from "../helpers/authHelper.js";
import { uploadFileToGCS, deleteImageFromGCS } from "../helpers/fileUpload.js";
import { db } from "../config/firebaseDb.js";
import { updatePolicyCacheForItem } from "../config/redisPolicyCache.js";
import {
  invalidateAdminAssistantsCache,
  invalidateAdminArticlesCache,
  invalidateChaptersCache,
  invalidateItemsCache,
  invalidateActivitiesAndAssistantsCache,
} from "../config/redisAdminCache.js";
import Logger from "../logger/logger.js";
import {
  getPromptTypesService,
  listAllPromptsService,
  listPromptVersionsByPromptIdService,
  listStoryPromptsService,
  createPromptService,
  createStoryPromptService,
  updatePromptService,
  updatePromptPublishStatusService,
  deletePromptService,
} from "../services/promptService.js";
import {
  listPromptTypeLookupService,
  createPromptTypeLookupService,
  updatePromptTypeLookupService,
} from "../services/promptTypeLookupService.js";

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    // console.log("Login - Input:", { email, password });

    let [results, metadata] = await sequelize.query(
      `SELECT *  FROM adminMaster left join adminRoles on adminMaster.roleId=adminRoles.id where adminMaster.emailAddress="${email}"`
    );
    const user = results[0];
    // console.log(user,"=============================user adminControllers");
    if (!user) {
      return res.status(404).json({
        status: 404,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS,
      });
    }
    // console.log(user.roleName,"=============================user.role adminControllers");
    if (
      !user.roleName ||
      !["admin", "viewer", "editor"].includes(user.roleName.toLowerCase())
    ) {
      // console.log("=====failed here");
      return res
        .status(401)
        .json({ message: "You are not authorized to access this page" });
    }

    const decryptedPassword = await decryptPassword(password);
    // console.log("Login - Decrypted Password:", decryptedPassword);
    // console.log("Login - Stored Hash:", user.password);

    if (!user.password) {
      return res.status(400).json({
        status: 400,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS,
      });
    }

    // Compare the decrypted password with the stored hash
    const isMatch = await bcrypt.compare(decryptedPassword, user.password);
    // console.log("Login - Password Match:", isMatch);

    if (!isMatch) {
      return res.status(400).json({
        status: 400,
        message: ERROR_MESSAGES.INVALID_CREDENTIALS,
      });
    }

    const payload = {
      id: user.adminId,
      email: user.emailAddress,
      userName: user.firstName,
    };
    const refreshToken = generateToken(payload);
    const token = generateAccessToken(payload);
    const adminId = user.adminId;

    await adminMaster.update(
      { token: refreshToken },
      { where: { adminId: adminId } }
    );

    return res.status(200).json({
      status: 200,
      message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
      body: {
        ...user,
        token: refreshToken,
        refreshToken: token,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
//users actions
export const allUsersList = async (req, res) => {
  try {
    const users = await sequelize.query(
      `SELECT 
         um.*, 
         last_session.last_active_time,
         p.name AS platformName
       FROM usermaster um
       LEFT JOIN (
         SELECT user_id, MAX(login_time) AS last_active_time
         FROM user_session
         GROUP BY user_id
       ) last_session ON um.userId = last_session.user_id
       LEFT JOIN user_platforms up ON up.userId = um.userId
       LEFT JOIN platforms p ON up.platformId = p.id
       WHERE um.is_deleted = 0
       ORDER BY um.createdAt DESC`,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return res.status(200).json({
      status: 200,
      message: SUCCESS_MESSAGES.USERS_FETCHED,
      body: users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const updateUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: 400,
        message: "User ID is required",
      });
    }

    const user = await UserMaster.findByPk(id);
    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
      });
    }

    // Destructure all updatable fields from req.body
    const {
      userType,
      emailAddress,
      mailAddress,
      dateOfBirth,
      maritalStatus,
      phone,
      firstName,
      lastName,
      password,
      is_active,
      is_deleted,
      is_two_fa_enabled,
      state,
      city,
      country,
      zipcode,  
      userImage,
      token,
      isAuthenticated,
      isMarried,
      isDivorced,
      servedMilitary,
      isMigrated,
      platformName,
    } = req.body;

    // Build update object
    const updateFields = {
      userType,
      emailAddress,
      mailAddress,
      dateOfBirth,
      maritalStatus,
      phone,
      firstName,
      lastName,
      password,
      is_active,
      is_deleted,
      is_two_fa_enabled,
      state,
      city,
      country,
      zipcode,
      userImage,
      token,
      isAuthenticated,
      isMarried,
      isDivorced,
      servedMilitary,
      isMigrated,
      platformName,
      updatedAt: new Date(), // Optional, Sequelize may handle this automatically
    };

    // Remove undefined fields (e.g., if some fields are not provided in the request)
    Object.keys(updateFields).forEach(
      (key) => updateFields[key] === undefined && delete updateFields[key]
    );

    await UserMaster.update(updateFields, { where: { userId: id } });

    return res.status(200).json({
      status: 200,
      message: SUCCESS_MESSAGES.USER_UPDATED,
      body: { userId: id, ...updateFields },
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const deleteUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await UserMaster.findByPk(id);
    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
      });
    }
    await UserMaster.update(
      { is_deleted: 1, updatedAt: new Date() },
      { where: { userId: id } }
    );
    return res.status(200).json({
      status: 200,
      message: SUCCESS_MESSAGES.USER_DELETED,
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
//story actions
export const allStoryList = async (req, res) => {
  try {
    const stories = await Stories.findAll({
      where: { isCustom: 0, isDeleted: 0, storyName: { [Op.ne]: "Journal" } },
    });
    return res.status(200).json({
      status: 200,
      message: SUCCESS_MESSAGES.STORIES_FETCHED,
      body: stories.sort((a, b) => a.storyName.localeCompare(b.createdAt)),
    });
  } catch (error) {
    console.error("Error fetching stories:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getStoriesWithImages = async (req, res) => {
  try {
    const stories = await sequelize.query(
      `SELECT ssc.* 
        FROM story_sub_categories ssc
        INNER JOIN stories_masters sm ON ssc.storyId = sm.storyId
        WHERE ssc.isCustom = 0 
          AND ssc.subCategoryName != 'Journal'
          AND sm.isDeleted = 0; `,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );
    // console.log(stories,"=============================stories");
    return res.status(200).json({
      status: 200,
      message: SUCCESS_MESSAGES.STORIES_FETCHED,
      body: stories,
    });
  } catch (error) {
    console.error("Error fetching stories:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const uploadStoryImage = async (req, res) => {
  try {
    const { subCategoryId } = req.params;
    const image = req.file;
    // Check if file exists
    if (!image) {
      return res.status(400).json({
        status: 400,
        message: "No image file provided",
      });
    }
    // Check if subCategoryId is provided
    if (!subCategoryId) {
      return res.status(400).json({
        status: 400,
        message: "SubCategoryId is required",
      });
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
    ];
    if (!allowedTypes.includes(image.mimetype)) {
      return res.status(400).json({
        status: 400,
        message:
          "Invalid file type. Only JPEG, PNG, WebP, and SVG are allowed.",
      });
    }

    // Validate file size (max 5MB)
    // const maxSize = 5 * 1024 * 1024; // 5MB
    // if (image.size > maxSize) {
    //   return res.status(400).json({
    //     status: 400,
    //     message: "File size too large. Maximum size is 5MB.",
    //   });
    // }

    // Note: For SVG files, we skip dimension validation as they are scalable
    if (image.mimetype !== "image/svg+xml") {
      // Basic validation - check if image buffer exists and has content
      if (!image.buffer || image.buffer.length === 0) {
        return res.status(400).json({
          status: 400,
          message:
            "Invalid image file. Please ensure the image is 325×358 pixels.",
        });
      }
    }

    const fileUrl = `story/${subCategoryId}/${image.originalname}`;
    const imageUrl = await uploadFileToGCS(image, fileUrl);

    // console.log(image,"=============================image");
    // console.log(subCategoryId,"=============================subCategoryId");
    // console.log(imageUrl,"=============================imageUrl");

    // Use parameterized query to prevent SQL injection
    const story = await sequelize.query(
      `UPDATE story_sub_categories SET icon = ? WHERE subCategoryId = ?`,
      {
        replacements: [imageUrl, subCategoryId],
        type: sequelize.QueryTypes.UPDATE,
      }
    );
    // console.log(story,"=============================story update result");
    // Check if any rows were affected
    if (story[1] === 0) {
      return res.status(404).json({
        status: 404,
        message: "Story not found with the provided subCategoryId",
      });
    }

    return res.status(200).json({
      status: 200,
      message: SUCCESS_MESSAGES.STORY_UPDATED,
      body: { icon: imageUrl },
    });
  } catch (error) {
    console.error("Error uploading story image:", error);
    return res.status(500).json({
      status: 500,
      message: "Failed to upload image",
      error: error.message,
    });
  }
};
export const updateStory = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({
      status: 400,
      message: "Story ID is required",
    });
  }
  const { name, description, isPublished } = req.body;

  if (!name) {
    return res.status(400).json({
      status: 400,
      message: "Story name is required",
    });
  } else if (parseInt(isPublished) > 2 || parseInt(isPublished) < 0) {
    return res.status(400).json({
      status: 400,
      message:
        "Story is not published or isPublished is required and should be 0 or 1",
    });
  }
  const story = await Stories.findByPk(id);
  if (!story) {
    return res.status(404).json({
      status: 404,
      message: "Story not found",
    });
  }
  await Stories.update(
    { storyName: name, description, isPublished },
    { where: { storyId: id } }
  );
  return res.status(200).json({
    status: 200,
    message: SUCCESS_MESSAGES.STORY_UPDATED,
    body: story,
  });
};
export const deleteStory = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({
      status: 400,
      message: "Story ID is required",
    });
  }
  const story = await Stories.findByPk(id);
  if (!story) {
    return res.status(404).json({
      status: 404,
      message: "Story not found",
    });
  }
  await Stories.update(
    { isDeleted: 1, updatedAt: new Date() },
    { where: { storyId: id } }
  );
  return res.status(200).json({
    status: 200,
    message: "Story deleted successfully",
  });
};

// -----------------------------
// Prompt CRUD/Publish endpoints
// -----------------------------

/**
 * GET /prompts
 * Lists prompts: default published only; includeUnpublished=true for all;
 * unpublished_only=true for drafts only (is_published=0).
 */
export const listAllPrompts = async (req, res) => {
  try {
    const result = await listAllPromptsService({ query: req.query });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error listing prompts:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /prompts/:id/versions
 * All prompts sharing the same pattern (story, chapter, prompt_type, platform scope), incl. drafts.
 */
export const listPromptVersionsByPromptId = async (req, res) => {
  try {
    const result = await listPromptVersionsByPromptIdService({ id: req.params.id });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error listing prompt versions:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * POST /prompts
 * Creates a prompt; requires story_id in body.
 */
export const createPrompt = async (req, res) => {
  try {
    const result = await createPromptService({ storyId: undefined, body: req.body });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error creating prompt:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /prompt-types
 * Lists prompt_function_name values (for dropdown selection).
 */
export const getPromptTypes = async (req, res) => {
  try {
    const result = await getPromptTypesService();
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error fetching prompt types:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /prompt-type-lookup — full rows (id, prompt_function_name, display) for admin CRUD.
 */
export const listPromptTypeLookup = async (req, res) => {
  try {
    const result = await listPromptTypeLookupService();
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error listing prompt type lookup:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * POST /prompt-type-lookup — create lookup row.
 */
export const createPromptTypeLookup = async (req, res) => {
  try {
    const result = await createPromptTypeLookupService({ body: req.body });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error creating prompt type lookup:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * PUT /prompt-type-lookup/:id — update display and/or prompt_function_name (prompts_master rows keep FK `prompt_type_id`).
 */
export const updatePromptTypeLookup = async (req, res) => {
  try {
    const result = await updatePromptTypeLookupService({ id: req.params.id, body: req.body });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error updating prompt type lookup:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /story/:storyId/prompts
 * Lists prompts for a story with optional filters:
 * - prompt_type (query)
 * - chapter_id (query; optional, supports null)
 * - includeUnpublished (query; if true includes drafts)
 */
export const listStoryPrompts = async (req, res) => {
  try {
    const result = await listStoryPromptsService({
      storyId: req.params.storyId,
      query: req.query,
    });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error listing story prompts:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * POST /story/:storyId/prompts
 * Creates a new prompt row (draft by default).
 */
export const createStoryPrompt = async (req, res) => {
  try {
    const result = await createStoryPromptService({
      storyId: req.params.storyId,
      body: req.body,
    });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error creating story prompt:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * PUT /prompts/:id
 * Updates prompt_text / chapter_id / prompt_type / platform scope.
 * If the row is published, creates a new unpublished row with the edits and leaves the published row unchanged.
 */
export const updatePrompt = async (req, res) => {
  try {
    const result = await updatePromptService({
      id: req.params.id,
      body: req.body,
    });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error updating prompt:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * POST /prompts/:id/publish-status
 * Toggles publish status using `is_published` in request body.
 * - 1 => publish (assigns next version in scope)
 * - 0 => unpublish
 */
export const updatePromptPublishStatus = async (req, res) => {
  try {
    const result = await updatePromptPublishStatusService({
      id: req.params.id,
      body: req.body,
    });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error updating prompt publish status:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * DELETE /prompts/:id
 * Soft deletes a prompt row: `is_deleted = 1`.
 */
export const deletePrompt = async (req, res) => {
  try {
    const result = await deletePromptService({ id: req.params.id });
    return res.status(result.status).json(result);
  } catch (error) {
    console.error("Error deleting prompt:", error);
    if (error?.expose && error?.status) {
      return res.status(error.status).json({ status: error.status, message: error.message });
    }
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

//chapter actions
export const allChaptersList = async (req, res) => {
  const { storyId } = req.params;
  if (!storyId) {
    return res.status(400).json({
      status: 400,
      message: "Story ID is required",
    });
  }
  const chapters = await ChapterMaster.findAll({
    where: { storyId: storyId, isDeleted: 0 },
  });
  if (chapters.length === 0) {
    return res.status(404).json({
      status: 404,
      message: "No chapters found for this story or story not found",
    });
  }
  return res.status(200).json({
    status: 200,
    message: SUCCESS_MESSAGES.CHAPTERS_FETCHED,
    body: chapters,
  });
};

export const updateChapter = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({
      status: 400,
      message: "Chapter ID is required",
    });
  }
  const { name, description, firstMessage, isDynamic } = req.body;
  if (!name) {
    return res.status(400).json({
      status: 400,
      message: "Chapter name is required",
    });
  }
  const chapter = await ChapterMaster.findByPk(id);
  if (!chapter) {
    return res.status(404).json({
      status: 404,
      message: "Chapter not found",
    });
  }
  await ChapterMaster.update(
    { chapterName: name, description, firstMessage, isDynamic: isDynamic ? 1 : 0 },
    { where: { chapterId: id } }
  );
  await invalidateChaptersCache();
  await invalidateItemsCache();
  return res.status(200).json({
    status: 200,
    message: SUCCESS_MESSAGES.CHAPTER_UPDATED,
    body: chapter,
  });
};

export const deleteChapter = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({
      status: 400,
      message: "Chapter ID is required",
    });
  }
  const chapter = await ChapterMaster.findByPk(id);
  if (!chapter) {
    return res.status(404).json({
      status: 404,
      message: "Chapter not found",
    });
  }
  await ChapterMaster.update(
    { isDeleted: 1, updatedAt: new Date() },
    { where: { chapterId: id } }
  );
  await invalidateChaptersCache();
  await invalidateItemsCache();
  return res.status(200).json({
    status: 200,
    message: "Chapter deleted successfully",
  });
};

export const allChaptersListForPersonal = async (req, res) => {
  const chapters = await sequelize.query(
    `SELECT cm.*
     FROM chapter_masters cm
     INNER JOIN (
       SELECT MIN(chapterId) as chapterId
       FROM chapter_masters 
        where  isDeleted = 0 AND isCustom = 0
       GROUP BY chapterName
     ) grouped ON cm.chapterId = grouped.chapterId
     WHERE  cm.isDeleted = 0 AND cm.isCustom = 0`,
    {
      type: sequelize.QueryTypes.SELECT,
      model: ChapterMaster,
      mapToModel: true // Converts to Sequelize model instances
    }
  );
  return res.status(200).json({
    status: 200,
    message: SUCCESS_MESSAGES.CHAPTERS_FETCHED,
    body: chapters.sort((a, b) => a.chapterName.localeCompare(b.createdAt)),
  });
};
// export const createChapter = async (req, res) => {
//   const {name,storyId} = req.body;
//   if(!name || !storyId){
//     return res.status(400).json({
//       status:400,
//       message:"All fields are required",
//     });
//   }
//   const chapter = await ChapterMaster.create({chapterName:name,description,storyId:storyId});
//   if(!chapter){
//     return res.status(400).json({
//       status:400,
//       message:"Failed to create chapter",
//     });
//   }
//   return res.status(200).json({
//     status:200,
//     message:SUCCESS_MESSAGES.CHAPTER_CREATED,
//     body: chapter,
//   });
// // }
// export const updateChapter = async (req, res) => {
//   const {id} = req.params;
//   const {name,description,storyId} = req.body;
//   if(!id || !name || !description || !storyId){
//     return res.status(400).json({
//       status:400,
//       message:"All fields are required",
//     });
//   }
//   const chapter = await ChapterMaster.findByPk(id);
//   if(!chapter){
//     return res.status(404).json({
//       status:404,
//       message:"Chapter not found",
//     });
//   }
//   await ChapterMaster.update({chapterName:name,chapterDescription:description,storyId:storyId},{where:{chapterId:id}});
//   return res.status(200).json({
//     status:200,
//     message:SUCCESS_MESSAGES.CHAPTER_UPDATED,
//     body: chapter,
//   });
// }
// export const deleteChapter = async (req, res) => {
//   const {id} = req.params;
//   const chapter = await ChapterMaster.findByPk(id);
//   if(!chapter){
//     return res.status(404).json({
//       status:404,
//       message:"Chapter not found",
//     });
//   }
//   await ChapterMaster.destroy({where:{chapterId:id}});
//   return res.status(200).json({
//     status:200,
//     message:"chapter deleted successfully",
//   });
// }
//item actions
export const allItemsList = async (req, res) => {
  try {
    const items = await sequelize.query(
      `
          SELECT 
              i.itemId,
              i.itemName,
              i.suggestions,
              CAST(i.sequence AS UNSIGNED) as sequence,
              i.isCustom,
              i.is_deleted,
              i.createdAt,
              i.updatedAt,
              i.sample_conversation,
              i.isHidden,
              s.storyId,
              s.storyName,
              c.chapterId,
              c.chapterName,
              q.question,
              q.questionId,
              pcm.platformId,
              p.name as platformName
          FROM items_masters i
          LEFT JOIN questions q ON i.itemId = q.itemId
          LEFT JOIN stories_masters s ON i.storyId = s.storyId
          LEFT JOIN chapter_masters c ON i.chapterId = c.chapterId
          LEFT JOIN platform_category_mapping pcm ON i.itemId = pcm.itemId
          LEFT JOIN platforms p ON pcm.platformId = p.id
          WHERE i.isCustom = 0 AND i.is_deleted = 0 AND s.isPublished = 1
          ORDER BY CAST(i.sequence AS UNSIGNED) ASC
      `,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (items.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No items found for this chapter or chapter not found",
      });
    }
    return res.status(200).json({
      status: 200,
      message: "All items fetched successfully",
      body: items,
    });
  } catch (error) {
    console.error("Error fetching items:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const allItemsListByChapterId = async (req, res) => {
  const { chapterId } = req.params;
  try {
    if (!chapterId) {
      return res.status(400).json({
        status: 400,
        message: "Chapter ID is required",
      });
    }
    // const items = await ItemMaster.findAll({ where: { chapterId: chapterId } });
    const items = await sequelize.query(
      `
        SELECT 
            i.itemId,
            i.itemName,
            i.suggestions,
            CAST(i.sequence AS UNSIGNED) as sequence,
            i.isCustom,
            i.is_deleted,
            i.createdAt,
            i.updatedAt,
            i.sample_conversation,
            i.isHidden,
            s.storyId,
            s.storyName,
            c.chapterId,
            c.chapterName,
            q.question,
            q.questionId
        FROM items_masters i
        LEFT JOIN questions q ON i.itemId = q.itemId
        LEFT JOIN stories_masters s ON i.storyId = s.storyId
        LEFT JOIN chapter_masters c ON i.chapterId = c.chapterId
        WHERE i.chapterId = :chapterId
        AND i.isCustom = 0
        ORDER BY CAST(i.sequence AS UNSIGNED) ASC
    `,
      {
        replacements: { chapterId: chapterId },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    if (items.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No items found for this chapter or chapter not found",
      });
    }
    return res.status(200).json({
      status: 200,
      message: "All items fetched successfully",
      body: items,
    });
  } catch (error) {
    console.error("Error fetching items:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const allItemsListByChapterIds = async (req, res) => {
  try {
    const { chapterIds } = req.body;

    if (!chapterIds || !Array.isArray(chapterIds) || chapterIds.length === 0) {
      return res.status(400).json({
        status: 400,
        message: "Chapter IDs array is required",
      });
    }

    const items = await sequelize.query(
      `
        SELECT 
            i.itemId,
            i.itemName,
            i.suggestions,
            CAST(i.sequence AS UNSIGNED) as sequence,
            i.isCustom,
            i.is_deleted,
            i.createdAt,
            i.updatedAt,
            i.sample_conversation,
            i.isHidden,
            s.storyId,
            s.storyName,
            c.chapterId,
            c.chapterName,
            q.question,
            q.questionId
        FROM items_masters i
        LEFT JOIN questions q ON i.itemId = q.itemId
        LEFT JOIN stories_masters s ON i.storyId = s.storyId
        LEFT JOIN chapter_masters c ON i.chapterId = c.chapterId
        WHERE i.chapterId IN (:chapterIds)
        AND i.isCustom = 0 
        ORDER BY CAST(i.sequence AS UNSIGNED) ASC
      `,
      {
        replacements: { chapterIds: chapterIds },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (items.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No items found for the selected chapters",
      });
    }

    return res.status(200).json({
      status: 200,
      message: "All items fetched successfully",
      body: items,
    });
  } catch (error) {
    console.error("Error fetching items:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const updateChapterImages = async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { chapterName, storyId } = req.body;
    console.log(req.body, "=============================req.body");
    const image = req.file;
    // console.log(req.file,"=============================req.file");

    // Check if file exists
    if (!image) {
      return res.status(400).json({
        status: 400,
        message: "No image file provided",
      });
    }

    // Check if chapterId is provided
    if (!chapterId) {
      return res.status(400).json({
        status: 400,
        message: "Chapter ID is required",
      });
    }

    // Optional: Validate that the chapter belongs to the specified story
    if (storyId) {
      const chapter = await ChapterMaster.findOne({
        where: {
          chapterId: chapterId,
        },
      });

      if (!chapter) {
        return res.status(404).json({
          status: 404,
          message:
            "Chapter not found or does not belong to the specified story",
        });
      }
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
    ];
    if (!allowedTypes.includes(image.mimetype)) {
      return res.status(400).json({
        status: 400,
        message:
          "Invalid file type. Only JPEG, PNG, WebP, and SVG are allowed.",
      });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (image.size > maxSize) {
      return res.status(400).json({
        status: 400,
        message: "File size too large. Maximum size is 5MB.",
      });
    }

    // Note: For SVG files, we skip dimension validation as they are scalable
    if (image.mimetype !== "image/svg+xml") {
      // Basic validation - check if image buffer exists and has content
      if (!image.buffer || image.buffer.length === 0) {
        return res.status(400).json({
          status: 400,
          message:
            "Invalid image file. Please ensure the image is 325×358 pixels.",
        });
      }
    }

    const fileUrl = `chapterImages/${storyId}/${chapterName}/${image.originalname}`;
    const imageUrl = await uploadFileToGCS(image, fileUrl);

    // console.log(image,"=============================chapter image");
    // console.log(chapterId,"=============================chapterId");
    // console.log(imageUrl,"=============================chapter imageUrl");
    // console.log(storyId,"=============================storyId");

    // Use parameterized query to prevent SQL injection
    const chapter = await sequelize.query(
      `UPDATE chapter_masters SET icon = ? WHERE chapterName = ?`,
      {
        replacements: [imageUrl, chapterName],
        type: sequelize.QueryTypes.UPDATE,
      }
    );

    console.log(chapter, "=============================chapter update result");

    // Check if any rows were affected
    if (chapter[1] === 0) {
      return res.status(404).json({
        status: 404,
        message: "Chapter not found with the provided chapterId",
      });
    }

    await invalidateChaptersCache();
    await invalidateItemsCache();
    return res.status(200).json({
      status: 200,
      message: "Chapter image updated successfully",
      body: { icon: imageUrl },
    });
  } catch (error) {
    console.error("Error uploading chapter image:", error);
    return res.status(500).json({
      status: 500,
      message: "Failed to upload image",
      error: error.message,
    });
  }
};
export const updateItem = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json({ status: 400, message: "Item ID is required" });
  }

  const itemId = parseInt(id);
  if (isNaN(itemId)) {
    return res
      .status(400)
      .json({ status: 400, message: "Invalid Item ID format" });
  }

  const { itemName, sample_conversation, mainQuestion, policies, isHidden } = req.body;

  console.log("UpdateItem - Received data:", {
    itemId,
    itemName,
    sample_conversation,
    mainQuestion,
    policies,
    isHidden,
    fullBody: req.body,
  });

  if (!itemName && !sample_conversation && !mainQuestion && isHidden === undefined) {
    return res.status(400).json({
      status: 400,
      message: "At least one field must be provided to update",
    });
  }

  const item = await ItemMaster.findByPk(itemId);
  if (!item) {
    return res.status(404).json({ status: 404, message: "Item not found" });
  }

  // Check for duplicate itemName if it's being updated
  if (itemName) {
    console.log("UpdateItem - Checking for duplicate itemName:", itemName);
    const existingItems = await sequelize.query(
      `SELECT itemId, itemName, chapterId, storyId 
         FROM items_masters 
         WHERE itemName = :itemName 
         AND chapterId = :chapterId 
         AND storyId = :storyId 
         AND itemId != :itemId 
         AND is_deleted = 0`,
      {
        replacements: {
          itemName,
          chapterId: item.chapterId,
          storyId: item.storyId,
          itemId,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    console.log("UpdateItem - Existing items with same name:", existingItems);

    if (existingItems && existingItems.length > 0) {
      return res.status(409).json({
        status: 409,
        message:
          "An item with the same name already exists in this chapter and story",
        body: {
          existingItem: existingItems[0],
          requestedItem: {
            itemName,
            chapterId: item.chapterId,
            storyId: item.storyId,
          },
        },
      });
    }
  }

  const t = await sequelize.transaction();
  try {
    const updateData = {};
    const updatedAt = new Date();

    if (itemName) updateData.itemName = itemName;
    if (sample_conversation) {
      updateData.sample_conversation = sample_conversation;
      console.log("Updating sample_conversation:", sample_conversation);
    }
    if (isHidden !== undefined) {
      updateData.isHidden = isHidden;
      console.log("Updating isHidden:", isHidden);
    }
    updateData.updatedAt = updatedAt;

    console.log("UpdateData to be saved:", updateData);

    if (Object.keys(updateData).length > 0) {
      const updateResult = await ItemMaster.update(updateData, {
        where: { itemId },
        transaction: t,
      });
      console.log("Update result:", updateResult);
    }
    console.log("mainQuestion======================", mainQuestion);
    if (mainQuestion) {
      const [question, created] = await Questions.findOrCreate({
          where: { itemId: item.itemId },
          defaults: { question: mainQuestion, updatedAt,itemId: item.itemId },
          transaction: t
      });

      if (!created) {
        // If it already exists, update it
        await question.update({ question: mainQuestion, updatedAt }, { transaction: t });
      }
    }

    if (policies && policies.length > 0) {
      await Policy.update(
        { policies: policies, updatedAt },
        { where: { itemId }, transaction: t }
      );
      
      // Update Redis cache after policy update
      await updatePolicyCacheForItem(itemId).catch((err) => {
        Logger.error(`Failed to update policy cache for itemId ${itemId}:`, err);
        // Don't throw - cache update failure shouldn't break the main operation
      });
    }

    await t.commit();

    await invalidateChaptersCache();
    await invalidateItemsCache();

    const updatedItem = await ItemMaster.findByPk(itemId);
    console.log(
      "Updated item sample_conversation:",
      updatedItem.sample_conversation
    );

    return res.status(200).json({
      status: 200,
      message: "Item updated successfully",
      body: {
        ...updatedItem.toJSON(),
        updatedAt,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error("Error updating item:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error while updating item",
      error: error.message,
    });
  }
};

export const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        status: 400,
        message: "Item ID is required",
      });
    }
    const itemId = parseInt(id);
    if (isNaN(itemId)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid Item ID format" });
    }
    const item = await ItemMaster.findByPk(id);
    if (!item) {
      return res.status(404).json({
        status: 404,
        message: "Item not found",
      });
    }
    await ItemMaster.update(
      {
        is_deleted: 1,
        sequence: 0,
        updatedAt: new Date(),
      },
      { where: { itemId: id } }
    );
    await invalidateChaptersCache();
    await invalidateItemsCache();
    return res.status(200).json({
      status: 200,
      message: "Item deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting item:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const createItem = async (req, res) => {
  const {
    itemName,
    chapterId,
    storyId,
    question,
    suggestions,
    sample_conversation,
    isHidden,
  } = req.body;

  const policies = Array.isArray(req.body?.policies) ? req.body.policies : [];

  if (!itemName || !chapterId || !storyId) {
    return res.status(400).json({
      status: 400,
      message: "Item name, chapter ID, and story ID are required",
    });
  }

  try {
    // Check for duplicate item
    const existingItems = await sequelize.query(
      `SELECT itemId FROM items_masters WHERE itemName = :itemName AND chapterId = :chapterId AND storyId = :storyId AND is_deleted = 0`,
      {
        replacements: { itemName, chapterId, storyId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (existingItems.length > 0) {
      return res.status(409).json({
        status: 409,
        message:
          "An item with the same name already exists in this chapter and story",
      });
    }


    const chapter = await ChapterMaster.findOne({
      where: { chapterId },
      attributes: ["chapterName"],
      raw:true
    });

    if (!chapter) {
      return res.status(404).json({
        status: 404,
        message: "Chapter not found",
      });
    }


    if (chapter.chapterName?.toLowerCase() === "documents") {
      const defaultPolicy =    {
        type: "text",
        policy: "Location",
        status: "active",
        question: "Where is this document located?",
        sequence: 1
      }
      
      // Only add if user didn't already provide similar
      const alreadyHas = policies?.some(
        (p) => p.policy === defaultPolicy.policy
      );

      if (!alreadyHas) {
        policies.push(defaultPolicy);
      }
    }


    const transaction = await sequelize.transaction();
    try {
      // Determine the next sequence
      const maxSequence =
        (await ItemMaster.max("sequence", {
          where: { chapterId, storyId },
          transaction,
        })) || 0;

      // Create item
      const item = await ItemMaster.create(
        {
          itemName,
          chapterId,
          storyId,
          suggestions: suggestions || null,
          sample_conversation: sample_conversation || null,
          sequence: maxSequence + 1,
          isCustom: 0,
          is_deleted: 0,
          isHidden: isHidden || 0,
        },
        { transaction }
      );

      // Insert question if provided
      if (question) {
        await Questions.create(
          {
            itemId: item.itemId,
            question,
          },
          { transaction }
        );
      }

      // Insert policies
      if (Array.isArray(policies)) {
        if (policies.length > 0 && typeof policies[0] === "object") {
          // JSON array format
          await Policy.create(
            {
              itemId: item.itemId,
              storyId,
              chapterId,
              policies,
            },
            { transaction }
          );
        } else {
          // Legacy array of strings
          for (const policyText of policies) {
            if (policyText && policyText.trim()) {
              await Policy.create(
                {
                  itemId: item.itemId,
                  storyId,
                  chapterId,
                  policies: policyText.trim(),
                },
                { transaction }
              );
            }
          }
        }
      }

      await transaction.commit();
      
      // Update Redis cache after creating policies (if any were created)
      if (Array.isArray(policies) && policies.length > 0) {
        await updatePolicyCacheForItem(item.itemId).catch((err) => {
          Logger.error(`Failed to update policy cache for itemId ${item.itemId} after item creation:`, err);
          // Don't throw - cache update failure shouldn't break the main operation
        });
      }

      await invalidateChaptersCache();
      await invalidateItemsCache();

      return res.status(201).json({
        status: 201,
        message: "Item created successfully",
        body: item,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction error in createItem:", err);
      return res.status(500).json({
        status: 500,
        message: "Failed to create item",
        error: err.message,
      });
    }
  } catch (error) {
    console.error("Error in createItem controller:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    if (!itemId) {
      return res.status(400).json({
        status: 400,
        message: "Item ID is required",
      });
    }

    console.log("Fetching item with ID:", itemId);

    // Debug: Check if questions table exists and has data for this item
    try {
      const questionCheck = await sequelize.query(
        `SELECT COUNT(*) as count FROM questions WHERE itemId = :itemId`,
        {
          replacements: { itemId },
          type: sequelize.QueryTypes.SELECT,
        }
      );
      console.log(
        "Questions table check - count for itemId:",
        questionCheck[0]?.count
      );
    } catch (tableError) {
      console.error("Error checking questions table:", tableError.message);
    }

    // Get item details
    const item = await sequelize.query(
      `
          SELECT 
              i.itemId,
              i.itemName,
              i.suggestions,
              CAST(i.sequence AS UNSIGNED) as sequence,
              i.isCustom,
              i.is_deleted,
              i.createdAt,
              i.updatedAt,
              i.sample_conversation,
              i.isHidden,
              s.storyId,
              s.storyName,
              c.chapterId,
              c.chapterName,
              q.question,
              q.questionId
          FROM items_masters i
          LEFT JOIN questions q ON i.itemId = q.itemId
          LEFT JOIN stories_masters s ON i.storyId = s.storyId
          LEFT JOIN chapter_masters c ON i.chapterId = c.chapterId
          WHERE i.itemId = :itemId
        `,
      {
        replacements: { itemId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    console.log("Raw query result:", item);

    if (!item || item.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "Item not found",
      });
    }

    // Debug: Check if question data exists
    console.log("Question data from JOIN:", {
      question: item[0]?.question,
      questionId: item[0]?.questionId,
      hasQuestion: !!item[0]?.question,
    });

    // If no question found in JOIN, try separate query
    let questions = [];
    if (!item[0]?.question) {
      console.log("No question found in JOIN, trying separate query...");
      try {
        const questionResult = await sequelize.query(
          `SELECT question, questionId FROM questions WHERE itemId = :itemId`,
          {
            replacements: { itemId },
            type: sequelize.QueryTypes.SELECT,
          }
        );
        console.log("Separate question query result:", questionResult);
        questions = questionResult;
      } catch (questionError) {
        console.error("Error fetching questions separately:", questionError);
      }
    } else {
      // Use questions from JOIN
      questions = item
        .filter((i) => i.question)
        .map((i) => ({
          question: i.question,
          questionId: i.questionId,
        }));
    }

    // Get policies for this item
    const policies = await sequelize.query(
      `
          SELECT 
              p.policyId,
              p.itemId,
              p.storyId,
              p.chapterId,
              p.policies as policy,
              p.createdAt,
              p.updatedAt
          FROM policy p
          WHERE p.itemId = :itemId
          ORDER BY p.policyId ASC
          `,
      {
        replacements: { itemId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // Parse and flatten policies
    let flattenedPolicies = [];
    policies.forEach((policyRow) => {
      try {
        let parsedPolicies = [];
        if (typeof policyRow.policy === "string") {
          parsedPolicies = JSON.parse(policyRow.policy);
        } else if (Array.isArray(policyRow.policy)) {
          parsedPolicies = policyRow.policy;
        }

        if (Array.isArray(parsedPolicies)) {
          parsedPolicies.forEach((p, index) => {
            flattenedPolicies.push({
              id: `${policyRow.policyId}_${index}`,
              policy: p.policy || "",
              question: p.question || "",
              status: p.status || "active",
              sequence: p.sequence || index + 1,
              type: p.type || "text",
            });
          });
        }
      } catch (error) {
        console.error("Error parsing policy JSON:", error);
        flattenedPolicies.push({
          id: policyRow.policyId,
          policy: String(policyRow.policy || ""),
          question: "",
          status: "active",
          sequence: 1,
          type: "text",
        });
      }
    });

    const result = {
      item: item[0],
      questions: questions,
      policies: [
        {
          policyId: itemId,
          policies: flattenedPolicies,
        },
      ],
    };

    console.log("Final result being sent:", {
      itemId: result.item?.itemId,
      itemName: result.item?.itemName,
      questionsCount: result.questions?.length,
      questions: result.questions,
      policiesCount: result.policies?.[0]?.policies?.length,
    });

    return res.status(200).json({
      status: 200,
      message: "Item fetched successfully",
      body: result,
    });
  } catch (error) {
    console.error("Error fetching item:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

//policy actions

export const allPoliciesList = async (req, res) => {
  try {
    const policies = await Policy.findAll();
    return res.status(200).json({
      status: 200,
      message: "All policies fetched successfully",
      body: policies,
    });
  } catch (error) {
    console.error("Error fetching policies:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const allPoliciesListByItemId = async (req, res) => {
  try {
    const { itemId } = req.params;
    const id = parseInt(itemId);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid Item ID format" });
    }
    if (!itemId) {
      return res.status(400).json({
        status: 400,
        message: "Item ID is required",
      });
    }
    const policies = await sequelize.query(
      `
      SELECT 
        p.*,
        i.itemName,
        s.storyName,
        c.chapterName,
        q.question,
        q.questionId
      FROM policy p
      LEFT JOIN items_masters i ON p.itemId = i.itemId
      LEFT JOIN stories_masters s ON p.storyId = s.storyId
      LEFT JOIN chapter_masters c ON p.chapterId = c.chapterId
      LEFT JOIN questions q ON p.itemId = q.itemId
      WHERE p.itemId = :itemId
      
    `,
      {
        replacements: { itemId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (policies.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No policies found for this item",
      });
    }
    return res.status(200).json({
      status: 200,
      message: "All policies fetched successfully",
      body: policies,
    });
  } catch (error) {
    console.error("Error fetching policies:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const updatePolicy = async (req, res) => {
  try {
    const { policyId, policyIndex } = req.params;

    if (!policyId || !policyIndex) {
      return res.status(400).json({
        status: 400,
        message: "Policy ID and index are required",
      });
    }

    const id = parseInt(policyId);
    const index = parseInt(policyIndex);

    if (isNaN(id) || isNaN(index)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid Policy ID or Index format",
      });
    }

    const { policyName, isMandatory, question } = req.body;

    // Fetch policy row
    const rows = await sequelize.query(
      `SELECT * FROM policy WHERE policyId = :policyId`,
      {
        replacements: { policyId: id },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const item = rows[0];
    if (!item) {
      return res.status(404).json({
        status: 404,
        message: "Policy not found",
      });
    }

    // Handle policies parsing
    let policies = [];
    try {
      if (typeof item.policies === "string") {
        policies = JSON.parse(item.policies);
      } else if (Array.isArray(item.policies)) {
        policies = item.policies;
      } else if (item.policies) {
        policies = [item.policies];
      }

      if (!Array.isArray(policies)) {
        policies = [];
      }
    } catch (error) {
      console.error("Error parsing policies:", error);
      policies = [];
    }

    if (!Array.isArray(policies) || !policies[index]) {
      return res.status(404).json({
        status: 404,
        message: "Policy index not found",
      });
    }

    // Update the policy object
    if (policyName) policies[index].policy = policyName;
    if (question) policies[index].question = question;
    if (isMandatory !== undefined) item.isMandatory = isMandatory;

    const updatedAt = new Date();
    // Save changes back with updatedAt timestamp
    const updatedPolicies = JSON.stringify(policies);

    await sequelize.query(
      `UPDATE policy SET policies = :policies, isMandatory = :isMandatory, updatedAt = :updatedAt WHERE policyId = :policyId`,
      {
        replacements: {
          policies: updatedPolicies,
          isMandatory: item.isMandatory,
          policyId: id,
          updatedAt,
        },
        type: sequelize.QueryTypes.UPDATE,
      }
    );

    // Update Redis cache after policy update
    // Handle both camelCase and snake_case column names from raw query
    const itemIdToUpdate = item.itemId || item.item_id;
    
    if (!itemIdToUpdate) {
      Logger.error(`❌ Cannot update cache: itemId not found in policy item. Policy ID: ${id}, Item keys: ${Object.keys(item).join(', ')}`);
    } else {
      Logger.info(`🔄 Attempting to update cache for itemId: ${itemIdToUpdate} (from policyId: ${id})`);
      await updatePolicyCacheForItem(itemIdToUpdate).catch((err) => {
        Logger.error(`❌ Failed to update policy cache for itemId ${itemIdToUpdate}:`, err);
        // Don't throw - cache update failure shouldn't break the main operation
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Policy updated successfully",
      body: {
        ...item,
        policies,
        updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating policy:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error while updating policy",
      error: error.message,
    });
  }
};
export const createUpdatePolicies = async (req, res) => {
  try {
    const { policies, itemId, storyId, chapterId } = req.body;
    // console.log("req.body======================",req.body);
    const { policyId } = req.params;
    // console.log("policyId======================",policyId);
    const policy = await Policy.findByPk(policyId);
    // console.log("policy======================",policy);
    if (!policy) {
      console.log("policy not found======================");
      const newPolicy = await Policy.create({
        policies: policies,
        itemId: itemId,
        storyId: storyId,
        chapterId: chapterId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      // Update Redis cache after creating new policy
      await updatePolicyCacheForItem(itemId).catch((err) => {
        Logger.error(`Failed to update policy cache for itemId ${itemId}:`, err);
      });
      
      return res.status(200).json({
        status: 200,
        message: "Policies created successfully",
        body: newPolicy,
      });
    }
    const updatedPolicies = policies;
    await Policy.update(
      { policies: updatedPolicies },
      { where: { policyId: policyId } }
    );
    
    // Update Redis cache after policy update
    await updatePolicyCacheForItem(itemId).catch((err) => {
      Logger.error(`Failed to update policy cache for itemId ${itemId}:`, err);
    });
    
    return res.status(200).json({
      status: 200,
      message: "Policies updated successfully",
    });
  } catch (error) {
    console.error("Error updating policies:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error while updating policies",
      error: error.message,
    });
  }
};
export const deletePolicy = async (req, res) => {
  try {
    const { policyId, policyIndex } = req.params;
    let policyData;
    let item;

    console.log(
      policyId,
      policyIndex,
      "=============================policyId, policyIndex"
    );

    if (!policyId) {
      return res.status(400).json({
        status: 400,
        message: "Policy ID is required",
      });
    }

    console.log("policyId======================", policyId);
    const id = parseInt(policyId);
    if (isNaN(id)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid Policy ID format",
      });
    }

    // Fetch policy row
    const rows = await sequelize.query(
      `SELECT * FROM policy WHERE policyId = :policyId`,
      {
        replacements: { policyId: id },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    item = rows[0];
    console.log("item======================", item);

    if (!item) {
      return res.status(404).json({
        status: 404,
        message: "Policy not found",
      });
    }

    // console.log("Found policy item:", item);

    // Get the policies array
    policyData = item.policies;
    console.log("policyData======================", policyData);

    // Handle different policy data formats
    if (typeof policyData === "string") {
      policyData = JSON.parse(policyData);
    }

    // Check if policyData is an array
    if (!Array.isArray(policyData)) {
      return res.status(400).json({
        status: 400,
        message: "Policy data is not in expected array format",
      });
    }

    // If policyIndex is provided, deactivate specific policy
    if (policyIndex !== undefined) {
      const index = parseInt(policyIndex);
      if (isNaN(index) || index < 0 || index >= policyData.length) {
        return res.status(400).json({
          status: 400,
          message: "Invalid policy index",
        });
      }
      policyData[index].status = "inactive";
    } else {
      // If no policyIndex provided, deactivate all policies
      policyData.forEach((policy) => {
        policy.status = "inactive";
      });
    }

    // Save changes back
    const updatedPolicyData = JSON.stringify(policyData);

    await sequelize.query(
      `UPDATE policy SET policies = :policies WHERE policyId = :policyId`,
      {
        replacements: {
          policies: updatedPolicyData,
          policyId: id,
        },
        type: sequelize.QueryTypes.UPDATE,
      }
    );

    console.log("updatedPolicyData======================", updatedPolicyData);

    // Update Redis cache after policy deletion/deactivation
    await updatePolicyCacheForItem(item.itemId).catch((err) => {
      Logger.error(`Failed to update policy cache for itemId ${item.itemId}:`, err);
    });

    return res.status(200).json({
      status: 200,
      message: "Policy deleted successfully",
      body: { ...item, policies: policyData },
    });
  } catch (error) {
    console.error("Error deleting policy:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error while deleting policy",
      error: error.message,
    });
  }
};
export const mainQuestionByItemId = async (req, res) => {
  try {
    const { itemId } = req.params;
    const id = parseInt(itemId);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid Item ID format" });
    }
    const mainQuestion = await sequelize.query(
      `select question from questions where itemId = :itemId`,
      {
        replacements: { itemId },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    if (mainQuestion.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No main question found for this item",
      });
    }
    return res.status(200).json({
      status: 200,
      message: "Main question fetched successfully",
      body: mainQuestion,
    });
  } catch (error) {
    console.error("Error fetching main question:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const questionListByPolicyId = async (req, res) => {
  try {
    const { policyId } = req.params;
    const id = parseInt(policyId);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid Policy ID format" });
    }
    if (!policyId) {
      return res.status(400).json({
        status: 400,
        message: "Item ID is required",
      });
    }
    const questions = await sequelize.query(
      `Select policies from policy where policyId = :policyId`,
      {
        replacements: { policyId },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    if (questions.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No questions found for this policy",
      });
    }
    return res.status(200).json({
      status: 200,
      message: "Questions fetched successfully",
      body: questions,
    });
  } catch (error) {
    console.error("Error fetching questions:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const suggestionsListByItemId = async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!itemId) {
      return res.status(400).json({
        status: 400,
        message: "Item ID is required",
      });
    }
    const id = parseInt(itemId);
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid Item ID format" });
    }
    const suggestions = await sequelize.query(
      `select suggestions from items_masters where itemId = :itemId`,
      {
        replacements: { itemId },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    console.log(suggestions, "=============================suggestions");

    if (suggestions.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No suggestions found for this item",
      });
    }

    // Check if suggestions field is empty, null, or undefined
    const suggestionsData = suggestions[0].suggestions;
    if (
      !suggestionsData ||
      suggestionsData === "" ||
      suggestionsData === "null"
    ) {
      return res.status(200).json({
        status: 200,
        message: "Suggestions fetched successfully",
        body: [],
      });
    }

    let parsedSuggestions;
    try {
      parsedSuggestions = JSON.parse(suggestionsData);
      // Ensure parsedSuggestions is an array
      if (!Array.isArray(parsedSuggestions)) {
        parsedSuggestions = [];
      }
    } catch (parseError) {
      console.error("Error parsing suggestions JSON:", parseError);
      return res.status(200).json({
        status: 200,
        message: "Suggestions fetched successfully",
        body: [],
      });
    }

    console.log(
      parsedSuggestions,
      "=============================parsedSuggestions"
    );
    return res.status(200).json({
      status: 200,
      message: "Suggestions fetched successfully",
      body: parsedSuggestions,
    });
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const updateSuggestion = async (req, res) => {
  try {
    const { itemId, suggestionId } = req.params;
    const { suggestion } = req.body;

    if (!itemId || !suggestionId) {
      return res.status(400).json({
        status: 400,
        message: "Item ID and Suggestion ID are required",
      });
    }

    const id = parseInt(suggestionId);
    const itemId2 = parseInt(itemId);
    if (isNaN(id) || isNaN(itemId2)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid Suggestion ID format" });
    }

    // First get the current suggestions
    const [currentItem] = await sequelize.query(
      `SELECT suggestions, updatedAt FROM items_masters WHERE itemId = :itemId`,
      {
        replacements: { itemId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (!currentItem) {
      return res.status(404).json({
        status: 404,
        message: "Item not found",
      });
    }

    // Parse the current suggestions
    let suggestions = [];
    try {
      suggestions = JSON.parse(currentItem.suggestions || "[]");
    } catch (error) {
      console.error("Error parsing suggestions:", error);
      suggestions = [];
    }

    // Find and update the specific suggestion
    const suggestionIndex = suggestions.findIndex((s) => s.id === id);
    if (suggestionIndex === -1) {
      return res.status(404).json({
        status: 404,
        message: "Suggestion not found",
      });
    }

    // Update the suggestion
    suggestions[suggestionIndex].suggestion = suggestion;

    const updatedAt = new Date();
    // Save the updated suggestions back with updatedAt timestamp
    await sequelize.query(
      `UPDATE items_masters SET suggestions = :suggestions, updatedAt = :updatedAt WHERE itemId = :itemId`,
      {
        replacements: {
          suggestions: JSON.stringify(suggestions),
          itemId,
          updatedAt,
        },
        type: sequelize.QueryTypes.UPDATE,
      }
    );

    return res.status(200).json({
      status: 200,
      message: "Suggestion updated successfully",
      body: {
        ...suggestions[suggestionIndex],
        updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating suggestion:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error while updating suggestion",
      error: error.message,
    });
  }
};
export const deleteSuggestion = async (req, res) => {
  try {
    const { itemId, suggestionId } = req.params;
    console.log(
      itemId,
      suggestionId,
      "=============================deleteSuggestion"
    );
    if (!itemId || !suggestionId) {
      return res.status(400).json({
        status: 400,
        message: "Item ID and Suggestion ID are required",
      });
    }

    const id = parseInt(suggestionId);
    const itemId2 = parseInt(itemId);
    if (isNaN(id) || isNaN(itemId2)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid Suggestion ID format" });
    }

    // First get the current suggestions
    const [currentItem] = await sequelize.query(
      `SELECT suggestions, updatedAt FROM items_masters WHERE itemId = :itemId`,
      {
        replacements: { itemId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (!currentItem) {
      return res.status(404).json({
        status: 404,
        message: "Item not found",
      });
    }

    // Parse the current suggestions
    let suggestions = [];
    try {
      suggestions = JSON.parse(currentItem.suggestions || "[]");
    } catch (error) {
      console.error("Error parsing suggestions:", error);
      suggestions = [];
    }

    // Find the suggestion to delete
    const suggestionIndex = suggestions.findIndex((s) => s.id === id);
    if (suggestionIndex === -1) {
      return res.status(404).json({
        status: 404,
        message: "Suggestion not found",
      });
    }

    // Instead of removing the suggestion, mark it as inactive
    suggestions[suggestionIndex].status = "inactive";

    const updatedAt = new Date();
    // Save the updated suggestions back with updatedAt timestamp
    await sequelize.query(
      `UPDATE items_masters SET suggestions = :suggestions, updatedAt = :updatedAt WHERE itemId = :itemId`,
      {
        replacements: {
          suggestions: JSON.stringify(suggestions),
          itemId,
          updatedAt,
        },
        type: sequelize.QueryTypes.UPDATE,
      }
    );

    return res.status(200).json({
      status: 200,
      message: "Suggestion deleted successfully",
      body: {
        ...suggestions[suggestionIndex],
        updatedAt,
      },
    });
  } catch (error) {
    console.error("Error deleting suggestion:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error while deleting suggestion",
      error: error.message,
    });
  }
};

export const token = async (req, res) => {
  try {
    const { refreshToken } = req.query;
    console.log("=======================refreshToken", refreshToken);

    if (!refreshToken) {
      return res.status(404).json({
        success: false,
        message: ERROR_MESSAGES.INVALID_REFRESH_TOKEN,
      });
    }

    const verifytoken = verifyToken(refreshToken);
    if (!verifytoken) {
      return res.status(404).json({
        success: false,
        message: ERROR_MESSAGES.UNAUTHORIZED,
      });
    }

    const { exp, iat, ...payload } = verifytoken;
    const newAccessToken = generateAccessToken(payload);

    return res.status(200).json({
      success: true,
      message: SUCCESS_MESSAGES.TOKEN_GENERATED,
      token: newAccessToken,
    });
  } catch (error) {
    console.error("Error in token:", error);
    return res.status(500).json({
      success: false,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
    });
  }
};
// admin signup
// export const adminSignup = async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     console.log("Signup - Input:", { email, password });

//     // Validate required fields
//     if (!email || !password) {
//       return res.status(400).json({
//         status: 400,
//         message: "Email and password are required",
//       });
//     }

//     // Check if admin already exists
//     let admin = await adminMaster.findOne({
//       where: {
//         emailAddress: email,
//       }
//     });

//     if (admin) {
//       return res.status(400).json({
//         status: 400,
//         message: "Admin with this email already exists",
//       });
//     }

//     const salt = await bcrypt.genSalt(10);
//     const hashPassword = await bcrypt.hash(password, salt);
//     console.log("Signup - Hashed Password:", hashPassword);

//     // Create new admin user
//     admin = await adminMaster.create({
//       emailAddress: email,
//       password: hashPassword,
//       firstName: "Admin",
//       lastName: "User",
//       is_active: 1,
//     });

//     console.log("Signup - Created Admin:", admin.toJSON());

//     // Generate tokens
//     const payload = {
//       id: admin.adminId,
//       email: admin.emailAddress,
//       userName: admin.firstName,
//     };
//     const refreshToken = generateToken(payload);
//     const token = generateAccessToken(payload);

//     // Update admin with token
//     await adminMaster.update(
//       { token: refreshToken },
//       { where: { adminId: admin.adminId } }
//     );

//     return res.status(201).json({
//       status: 201,
//       message: "Admin created successfully",
//       body: {
//         ...admin.toJSON(),
//         token: refreshToken,
//         refreshToken: token,
//       },
//     });

//   } catch (error) {
//     console.error("Error in admin signup:", error);
//     return res.status(500).json({
//       status: 500,
//       message: "Internal Server Error",
//       error: error.message,
//     });
//   }
// };

export const createClustorTest = async (req, res) => {
  try {
    const {
      assistantName,
      targetType,
      expiryDate,
      description,
      image,
      clusteredItems,
      callToAction,
      firstMessage,
      platforms,
      widgetName,
      createAsWidget,
      widgetDisplayPath,
      isLoop,
      activityId,
    } = req.body;
    // console.log(req.body, "=============================createClustorTest");

    let parsedPlatforms = platforms;
    if (typeof platforms === 'string') {
      try {
        parsedPlatforms = JSON.parse(platforms);
      } catch (error) {
        console.error('Error parsing platforms:', error);
        parsedPlatforms = [];
      }
    }

    // Handle image upload if present
    let finalImage = image;
    const assistantImage = req.file;

    if (assistantImage) {
      const fileUrl = `assistant/${assistantName}/${assistantImage.originalname}`;
      finalImage = await uploadFileToGCS(assistantImage, fileUrl);
    }

    // Check if assistant already exists
    const [assistant] = await sequelize.query(
      `SELECT * FROM recommendation_master WHERE assistantName = :assistantName`,
      {
        replacements: { assistantName },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (assistant) {
      return res.status(400).json({
        status: 400,
        message: "Assistant already exists with this name",
      });
    }
    // Determine next sequence number for assistants
    const maxSeqRows = await sequelize.query(
      `SELECT COALESCE(MAX(sequence), 0) AS maxSequence FROM recommendation_master WHERE targetType = 'Assistant'`,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );
    // console.log(maxSeqRows, "=============================sequence");

    const nextSequence = (maxSeqRows?.[0]?.maxSequence || 0) + 1;
    // Insert new assistant
    const [result] = await sequelize.query(
      `INSERT INTO recommendation_master 
        (assistantName, targetType, targetValue, image, expireDate, description, callToAction, firstMessage, platforms, sequence, isLoop, publishStatus, activityId) 
        VALUES (:assistantName, :targetType, :targetValue, :image, :expireDate, :description, :callToAction, :firstMessage, :platforms, :sequence, :isLoop, :publishStatus, :activityId)`,
      {
        replacements: {
          assistantName,
          targetType,
          targetValue: clusteredItems,
          image: finalImage,
          expireDate: expiryDate || null,
          description: description || null,
          callToAction: callToAction || null,
          firstMessage: firstMessage || null,
          platforms: JSON.stringify(parsedPlatforms || []),
          sequence: nextSequence,
          isLoop: isLoop === 'true' || isLoop === true ? 1 : 0,
          publishStatus: 'Draft',
          activityId: activityId || null,
        },
        type: sequelize.QueryTypes.INSERT,
      }
    );

    // console.log('Insert result:', result);
    // Raw INSERT queries return the ID directly as a number
    const assistantId = typeof result === 'number' ? result : (result.insertId || result[0]?.insertId);
    console.log('Assistant ID:', assistantId);
    
    if (!assistantId) {
      return res.status(500).json({
        status: 500,
        message: "Failed to create assistant - no ID returned",
        error: "Insert operation did not return a valid ID"
      });
    }
    
    let widgetMappingId = null;
    let widgetMapping = null;

    if(createAsWidget === 'true' && widgetName){
      // First, create or find the base widget
      let baseWidget = await Widgets.findOne({
        where: { widgetKey: "assistant_progress" }
      });
      
      // Check if mapping already exists for this assistant
      const existingMapping = await WidgetMapping.findOne({
        where: { 
          entity_type: 'Assistant',
          entity_id: assistantId 
        }
      });
      
      if (existingMapping) {
        return res.status(400).json({
          status: 400,
          message: "Widget mapping already exists for this assistant.",
        });
      }
      // Create widget mapping
      const parsedWidgetDisplayPath = JSON.parse(widgetDisplayPath);
      widgetMapping = await WidgetMapping.create({
        widget_id: baseWidget.id,
        name: widgetName,
        entity_type: 'Assistant',
        entity_id: assistantId,
        display_path: parsedWidgetDisplayPath,
        is_active: true,
      });
      widgetMappingId = widgetMapping.id;
    }
    await invalidateAdminAssistantsCache();
    await invalidateActivitiesAndAssistantsCache();
    // console.log(widgetMapping, "=============================widgetMapping");
    return res.status(200).json({
      status: 200,
      message: "Assistant created successfully",
      body: {
        assistantId: assistantId,
        widgetMappingId: widgetMappingId,
        assistantName,
        image: finalImage,
        createAsWidget: createAsWidget === 'true',
        widgetName: widgetName || null,
      },
    });
  } catch (error) {
    console.error("Error creating clustor test:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const createArticle = async (req, res) => {
  try {
    const {
      articleName,
      targetType,
      expiryDate,
      description,
      callToAction,
      clusteredItems,
      image,
    } = req.body;

    const existingItem = await sequelize.query(
      `SELECT * FROM recommendation_master WHERE assistantName = :articleName`,
      {
        replacements: { articleName },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    if (existingItem.length > 0) {
      return res.status(400).json({
        status: 400,
        message: "Article already exists",
      });
    }

    // Handle image upload if present
    let finalImage =
      image ||
      "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png";
    const articleImage = req.file;
    if (articleImage) {
      const fileUrl = `article/${articleName}/${articleImage.originalname}`;
      finalImage = await uploadFileToGCS(articleImage, fileUrl);
    }

    const article = await sequelize.query(
      `INSERT INTO recommendation_master 
        (assistantName, targetType, targetValue, image, description, callToAction, publishStatus) 
         VALUES (:assistantName, :targetType, :targetValue, :image, :description, :callToAction, :publishStatus)`,
      {
        replacements: {
          assistantName: articleName,
          targetType: "Article",
          targetValue: clusteredItems, // If it's an array/object
          image: finalImage,
          description: description,
          callToAction: callToAction,
          publishStatus: 'Draft',
        },
        type: sequelize.QueryTypes.INSERT,
      }
    );

    await invalidateAdminArticlesCache();
    return res.status(200).json({
      status: 200,
      message: "Article created successfully",
      body: req.body,
    });
  } catch (error) {
    console.error("Error creating article:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const deleteAssistantById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Use Sequelize model to enable cascade delete
    const assistant = await RecommendationMaster.findByPk(id);
    
    if (!assistant) {
      return res.status(404).json({
        status: 404,
        message: "Assistant not found",
      });
    }
    
    // Delete the assistant - this will trigger cascade delete for WidgetMapping
    await assistant.destroy();
    await invalidateAdminAssistantsCache();
    await invalidateActivitiesAndAssistantsCache();
    return res.status(200).json({
      status: 200,
      message: "Assistant deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting assistant:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const getAssistantById = async (req, res) => {
  try {
    const { id } = req.params;
    // Fetch assistant with widget mapping
    const assistant = await RecommendationMaster.findByPk(id);
    
    // Fetch widget mapping separately
    const widgetMapping = await WidgetMapping.findOne({
      where: { 
        entity_type: 'Assistant',
        entity_id: id 
      },
      include: [{
        model: Widgets,
        as: 'Widget'
      }]
    });
    
    // Combine the data
    const assistantWithWidget = {
      ...assistant.toJSON(),
      WidgetMapping: widgetMapping
    };
    // console.log(assistant, "=============================assistant");
    return res.status(200).json({
      status: 200,
      message: "Assistant fetched successfully",
      body: assistantWithWidget,
    });
  } catch (error) {
    console.error("Error fetching assistant:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const updateAssistantById = async (req, res) => {
  try {
    const { id } = req.params;
    let {
      assistantName,
      expiryDate,
      description,
      image,
      clusteredItems,
      callToAction,
      firstMessage,
      platforms,
      dependsOn,
      createAsWidget,
      widgetName,
      widgetDisplayPath,
      isLoop,
      publishStatus,
      activityId,
    } = req.body;
    
    const assistant = await RecommendationMaster.findByPk(id,{raw: true});
    if (!assistant) {
        return res.status(404).json({
            status: 404,
            message: `Assistant with ID ${id} not found.`
        });
    }
    // Parse platforms if it's a string
    let parsedPlatforms = platforms;
    if (typeof platforms === 'string') {
      try {
        parsedPlatforms = JSON.parse(platforms);
      } catch (error) {
        console.error('Error parsing platforms:', error);
        parsedPlatforms = [];
      }
    }
    if(!dependsOn || dependsOn === null){
      dependsOn = assistant.prerequisite_agents;
      console.log(dependsOn, "=============================dependsOn");
    }
    // Normalize expiryDate: if it's empty string or not valid, set to null
    expiryDate = expiryDate && expiryDate.trim() !== "" ? expiryDate : null;
    // Handle image upload if present
    let finalImage = image || assistant.image;  // Fall back to existing image if not provided
    const assistantImage = req.file;
    if (assistantImage) {
      const fileUrl = `assistant/${assistantName}/${assistantImage.originalname}`;
      finalImage = await uploadFileToGCS(assistantImage, fileUrl);
    }

    const [result] = await sequelize.query(
      `UPDATE recommendation_master 
         SET assistantName = :assistantName, 
             expireDate = :expiryDate, 
             description = :description, 
             image = :image, 
             targetValue = :targetValue,
             callToAction = :callToAction,
             firstMessage = :firstMessage,
             platforms = :platforms,
             prerequisite_agents = :prerequisite_agents,
             isLoop = :isLoop,
             publishStatus = :publishStatus,
             activityId = :activityId
         WHERE id = :id`,
      {
        replacements: {
          assistantName: assistantName || assistant.assistantName,
          expiryDate: expiryDate !== undefined ? expiryDate : assistant.expireDate,
          description: description !== undefined ? description : assistant.description,
          image: finalImage,
          targetValue: clusteredItems || assistant.targetValue,
          callToAction: callToAction !== undefined ? callToAction : assistant.callToAction,
          firstMessage: firstMessage !== undefined ? firstMessage : assistant.firstMessage,
          platforms: parsedPlatforms ? JSON.stringify(parsedPlatforms) : (assistant.platforms ? JSON.stringify(assistant.platforms) : '[]'),
          prerequisite_agents: JSON.stringify(dependsOn || null),
          isLoop: isLoop !== undefined ? (isLoop === 'true' || isLoop === true ? 1 : 0) : assistant.isLoop,
          publishStatus: publishStatus || assistant.publishStatus || 'Draft',
          activityId: activityId !== undefined ? activityId : assistant.activityId,
          id,
        },
        type: sequelize.QueryTypes.UPDATE,
      }
    );
    
    let widgetMappingId = null;
    
    // Handle widget deletion if createAsWidget is false
    if(createAsWidget === 'false' || createAsWidget === false){
      const existingMapping = await WidgetMapping.findOne({
        where: { 
          entity_type: 'Assistant',
          entity_id: id 
        }
      });
      
      if (existingMapping) {
        await existingMapping.destroy();
        console.log(`Widget mapping deleted for assistant ${id}`);
      }
    }
    
    if(createAsWidget === 'true' && widgetName){
      try {
        const existingMapping = await WidgetMapping.findOne({
          where: { 
            entity_type: 'Assistant',
            entity_id: id 
          }
        });
        
        let baseWidget = await Widgets.findOne({
          where: { widgetKey: "assistant_progress" }
        });
        
        const parsedWidgetDisplayPath = JSON.parse(widgetDisplayPath);
        
        if (existingMapping) {
          await existingMapping.update({
            widget_id: baseWidget.id,
            name: widgetName,
            display_path: parsedWidgetDisplayPath,
            is_active: true,
          });
          widgetMappingId = existingMapping.id;
        } else {
          const widgetMapping = await WidgetMapping.create({
            widget_id: baseWidget.id,
            name: widgetName,
            entity_type: 'Assistant',
            entity_id: id,
            display_path: parsedWidgetDisplayPath,
            is_active: true,
          });
          widgetMappingId = widgetMapping.id;
        }
      } catch (error) {
        console.error("Error creating widget mapping:", error);
        return res.status(500).json({
          status: 500,
          message: "Internal Server Error",
          error: error.message,
        });
      }
    }

    // Fetch the updated assistant
    const [updatedAssistant] = await sequelize.query(
      `SELECT * FROM recommendation_master WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    await invalidateAdminAssistantsCache();
    await invalidateActivitiesAndAssistantsCache();
    return res.status(200).json({
      status: 200,
      message: "Assistant updated successfully",
      body: updatedAssistant,
    });
  } catch (error) {
    console.error("Error updating assistant:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const getAssistantsList = async (req, res) => {
  try {
    const [assistants, metadata] = await sequelize.query(`
      SELECT 
        recommendation_master.*,
        activity.activityName
      FROM recommendation_master
      LEFT JOIN activity 
        ON recommendation_master.activityId = activity.id
      WHERE recommendation_master.targetType = 'Assistant'
      ORDER BY recommendation_master.sequence ASC
    `);
    
    return res.status(200).json({
      status: 200,
      message: "Assistants fetched successfully",
      body: assistants,
    });
  } catch (error) {
    console.error("Error fetching assistants:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const  getAssistantbyPlatform = async (req, res) => {
  try {
    const { platformIds } = req.query;
    console.log(platformIds, "=============================platformIds");
    
    // Handle single platform ID or multiple platform IDs
    let platformArray;
    if (Array.isArray(platformIds)) {
      platformArray = platformIds;
    } else if (typeof platformIds === 'string') {
      // If it's a comma-separated string, split it
      platformArray = platformIds.includes(',') ? platformIds.split(',') : [platformIds];
    } else {
      platformArray = [platformIds];
    }
    
    // Clean up the array (remove empty strings and trim)
    platformArray = platformArray.filter(id => id && id.toString().trim()).map(id => id.toString().trim());
    
    if (platformArray.length === 0) {
      return res.status(400).json({
        status: 400,
        message: "No valid platform IDs provided",
        body: [],
      });
    }
    
    // Use raw SQL query to check that platforms contains ALL requested platform IDs
    let whereConditions = [];
    let replacements = {};
    
    // Build individual JSON_CONTAINS conditions for each platform ID
    platformArray.forEach((platformId, index) => {
      whereConditions.push(`JSON_CONTAINS(platforms, :platform${index})`);
      replacements[`platform${index}`] = `"${platformId}"`;
    });
    
    const whereClause = whereConditions.join(' AND ');
    
    const assistants = await sequelize.query(
      `SELECT * FROM recommendation_master 
       WHERE ${whereClause} 
       AND targetType = 'Assistant'`,
      {
        replacements: replacements,
        type: sequelize.QueryTypes.SELECT,
      }
    );
    
    return res.status(200).json({
      status: 200,
      message: "Assistants fetched successfully",
      body: assistants,
    });
  }catch(error){
    console.error("Error fetching assistants by platform:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const getAssistantbyPlatformId = async (req, res) => {
  try {
    const { id: platformId } = req.params;

    const assistants = await sequelize.query(
      `
        SELECT 
          rm.*, 
          a.activityName
        FROM recommendation_master rm
        LEFT JOIN activity a 
          ON rm.activityId = a.id
        WHERE rm.targetType = 'Assistant'
          AND JSON_CONTAINS(rm.platforms, :platformIdJson)
        ORDER BY rm.sequence ASC
      `,
      {
        replacements: { platformIdJson: `"${platformId}"` }, // JSON_CONTAINS requires quotes
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return res.status(200).json({
      status: 200,
      message: "Assistants fetched successfully",
      body: assistants,
    });
  } catch (error) {
    console.error("Error fetching assistants by platform:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getArticleById = async (req, res) => {
  try {
    const { id } = req.params;
    const articles = await sequelize.query(
      `SELECT * FROM recommendation_master WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const article = articles[0]; // Get the first (and only) article

    if (!article) {
      return res.status(404).json({
        status: 404,
        message: "Article not found",
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Article fetched successfully",
      body: article,
    });
  } catch (error) {
    console.error("Error fetching article:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const getArticlesList = async (req, res) => {
  try {
    const [articles, metadata] = await sequelize.query(
      `SELECT * FROM recommendation_master where targetType = 'Article'`
    );

    return res.status(200).json({
      status: 200,
      message: "Articles fetched successfully",
      body: articles,
    });
  } catch (error) {
    console.error("Error fetching articles:", error);
  }
};
export const deleteArticleById = async (req, res) => {
  try {
    const { id } = req.params;
    const article = await sequelize.query(
      `DELETE FROM recommendation_master WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE,
      }
    );
    return res.status(200).json({
      status: 200,
      message: "Article deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting article:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const updateArticleById = async (req, res) => {
  try {
    // console.log(req.body, "=============================updateArticleById");
    const { id } = req.params;
    const { articleName, description, clusteredItems, image, callToAction, publishStatus } =
      req.body;

    // Fetch existing article to use as fallback values
    const existingArticle = await RecommendationMaster.findByPk(id, { raw: true });
    if (!existingArticle) {
      return res.status(404).json({
        status: 404,
        message: `Article with ID ${id} not found.`
      });
    }

    // Handle image upload if present
    let finalImage = image || existingArticle.image;
    const articleImage = req.file;
    if (articleImage) {
      const fileUrl = `article/${articleName || existingArticle.assistantName}/${articleImage.originalname}`;
      finalImage = await uploadFileToGCS(articleImage, fileUrl);
    }

    const article = await sequelize.query(
      `UPDATE recommendation_master 
         SET assistantName = :articleName, 
             description = :description, 
             image = :image,
             targetValue = :targetValue,
             callToAction = :callToAction,
             publishStatus = :publishStatus
         WHERE id = :id`,
      {
        replacements: {
          articleName: articleName || existingArticle.assistantName,
          description: description !== undefined ? description : existingArticle.description,
          image: finalImage,
          targetValue: clusteredItems || existingArticle.targetValue,
          callToAction: callToAction !== undefined ? callToAction : existingArticle.callToAction,
          publishStatus: publishStatus || existingArticle.publishStatus || 'Draft',
          id,
        },
        type: sequelize.QueryTypes.UPDATE,
      }
    );
    await invalidateAdminArticlesCache();
    return res.status(200).json({
      status: 200,
      message: "Article updated successfully",
      body: article,
    });
  } catch (error) {
    console.error("Error updating article:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
// update item sequence
export const updateItemSequence = async (req, res) => {
  try {
    const { storyId, chapterId, items } = req.body;

    // Input validation
    if (!storyId || !chapterId || !items || !Array.isArray(items)) {
      return res.status(400).json({
        error: "Missing required fields: storyId, chapterId, and items array",
        status: 400,
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        error: "Items array cannot be empty",
        status: 400,
      });
    }

    // Validate items structure
    const invalidItems = items.filter(
      (item) =>
        !item.itemId || typeof item.sequence !== "number" || item.sequence < 0
    );

    if (invalidItems.length > 0) {
      return res.status(400).json({
        error:
          "Invalid items format. Each item must have itemId and valid sequence number",
        invalidItems,
        status: 400,
      });
    }

    // Get existing items from database
    const existingItems = await ItemMaster.findAll({
      where: {
        storyId,
        chapterId,
      },
      attributes: ["itemId", "sequence"],
      raw: true,
    });

    if (existingItems.length === 0) {
      return res.status(404).json({
        error: "No items found for the specified story and chapter",
        status: 404,
      });
    }

    // Create maps for efficient lookup
    const existingItemsMap = new Map(
      existingItems.map((item) => [item.itemId, item])
    );

    // Validate that all items to update exist in database
    const invalidItemIds = items
      .filter((item) => !existingItemsMap.has(item.itemId))
      .map((item) => item.itemId);

    if (invalidItemIds.length > 0) {
      return res.status(404).json({
        error: "Some items not found in database",
        invalidItemIds,
        status: 404,
      });
    }

    // Check for duplicate sequences
    const sequences = items.map((item) => item.sequence);
    const duplicateSequences = sequences.filter(
      (seq, index) => sequences.indexOf(seq) !== index
    );

    if (duplicateSequences.length > 0) {
      return res.status(400).json({
        error: "Duplicate sequences found",
        duplicateSequences: [...new Set(duplicateSequences)],
        status: 400,
      });
    }

    // Prepare bulk update operations
    const updateOperations = [];
    const changedItems = [];

    items.forEach((updateItem) => {
      const existingItem = existingItemsMap.get(updateItem.itemId);

      // Only update if sequence has actually changed
      if (existingItem.sequence !== updateItem.sequence) {
        updateOperations.push({
          itemId: updateItem.itemId,
          sequence: updateItem.sequence,
        });

        changedItems.push({
          itemId: updateItem.itemId,
          oldSequence: existingItem.sequence,
          newSequence: updateItem.sequence,
        });
      }
    });

    // If no changes needed
    if (updateOperations.length === 0) {
      return res.status(200).json({
        message: "No sequence changes detected",
        status: 200,
        data: {
          totalItems: items.length,
          changedItems: 0,
          storyId,
          chapterId,
        },
      });
    }

    // Perform bulk update using transaction for data integrity
    const transaction = await ItemMaster.sequelize.transaction();

    try {
      // Method 1: Individual updates in transaction (more reliable)
      const updatePromises = updateOperations.map((operation) =>
        ItemMaster.update(
          { sequence: operation.sequence },
          {
            where: {
              itemId: operation.itemId,
              storyId,
              chapterId,
            },
            transaction,
          }
        )
      );

      await Promise.all(updatePromises);

      // Commit transaction
      await transaction.commit();

      // Return success response
      return res.status(200).json({
        message: "Item sequences updated successfully",
        status: 200,
        data: {
          totalItems: items.length,
          changedItems: changedItems.length,
          storyId,
          chapterId,
          changedItemDetails: changedItems,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (updateError) {
      // Rollback transaction on error
      await transaction.rollback();
      throw updateError;
    }
  } catch (error) {
    console.error("Error updating item sequences:", error);

    return res.status(500).json({
      error: "Internal server error while updating item sequences",
      status: 500,
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const updateAssistantSequence = async (req, res) => {
  try {
    const { assistants } = req.body;
    console.log(req.body, "=============================updateAssistantSequence");
    // Validate input
    if (!assistants || !Array.isArray(assistants)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid input: assistants must be an array",
        error: "Bad Request"
      });
    }

    // Validate each assistant object
    const invalidAssistants = assistants.filter(
      (assistant) => !assistant.id || typeof assistant.sequence !== "number" || assistant.sequence < 1
    );

    if (invalidAssistants.length > 0) {
      return res.status(400).json({
        status: 400,
        message: "Invalid assistant data: each assistant must have id and valid sequence number",
        error: "Bad Request",
        invalidAssistants
      });
    }

    const transaction = await RecommendationMaster.sequelize.transaction();
    try {
      const updatePromises = assistants.map((assistant) =>
        RecommendationMaster.update({ sequence: assistant.sequence }, { where: { id: assistant.id }, transaction })
      );
      await Promise.all(updatePromises);
      await transaction.commit();
      await invalidateAdminAssistantsCache();
      await invalidateActivitiesAndAssistantsCache();
      return res.status(200).json({
        message: "Assistant sequences updated successfully",
        status: 200,
        data: assistants,
      });
    } catch (updateError) {
      await transaction.rollback();
      throw updateError;
    }
  } catch (error) {
    console.error("Error updating assistant sequences:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getDynamicFunctions = async (req, res) => {
  try {
    const [dynamicFunctions, metadata] = await sequelize.query(
      `SELECT * FROM dynamic_functions`
    );
    console.log(
      dynamicFunctions,
      "=============================dynamicFunctions"
    );
    return res.status(200).json({
      status: 200,
      message: "Agent actions fetched successfully",
      body: dynamicFunctions,
    });
  } catch (error) {
    console.error("Error fetching agent actions:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const requestDynamicFunction = async (req, res) => {
  try {
    const language = "Python";
    const {
      functionName,
      inputSchema,
      outputSchema,
      functionDescription,
      requestedBy,
    } = req.body;
    console.log(req.body, "=============================req.body");

    // Validate required fields
    // if (!functionName || !language) {
    //   return res.status(400).json({
    //     status: 400,
    //     message: "Function name and language are required",
    //   });
    // }

    const uuid = uuidv4();
    const [dynamicFunction] = await sequelize.query(
      `INSERT INTO dynamic_functions (uuid, name, description, language, status, requested_by, created_at, updated_at) 
         VALUES (:uuid, :functionName, :functionDescription, :language, :status, :requested_by, :created_at, :updated_at)`,
      {
        replacements: {
          uuid,
          functionName,
          language,
          functionDescription: functionDescription || null,
          status: "REQUESTED",
          requested_by: requestedBy || "Admin User",
          created_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    console.log(
      dynamicFunction,
      "=============================dynamicFunction"
    );
    return res.status(200).json({
      status: 200,
      message: "Dynamic function requested successfully",
      body: {
        uuid,
        functionName,
        language,
        functionDescription,
        status: "REQUESTED",
        requestedBy: requestedBy || "Admin User",
      },
    });
  } catch (error) {
    console.error("Error requesting dynamic function:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const getDynamicFunctionById = async (req, res) => {
  try {
    const { id } = req.params;
    const dynamicFunction = await sequelize.query(
      `SELECT * FROM dynamic_functions WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    // console.log(dynamicFunction,"=============================dynamicFunction");
    return res.status(200).json({
      status: 200,
      message: "Dynamic function fetched successfully",
      body: dynamicFunction,
    });
  } catch (error) {
    console.error("Error fetching dynamic function by id:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const deleteDynamicFunction = async (req, res) => {
  try {
    const { id } = req.params;
    const dynamicFunction = await sequelize.query(
      `DELETE FROM dynamic_functions WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE,
      }
    );
    console.log(
      dynamicFunction,
      "=============================dynamicFunction"
    );
    return res.status(200).json({
      status: 200,
      message: "Dynamic function deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting dynamic function:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
export const getApiLogsByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({
        status: 400,
        message: "Email is required",
      });
    }

    // First, find the user by email to get the userId
    const userRef = db.collection("users");
    const userSnapshot = await userRef.where("emailAddress", "==", email).get();
    
    if (userSnapshot.empty) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
      });
    }

    const userDoc = userSnapshot.docs[0];
    const userId = userDoc.data().userId || userDoc.data().id;

    if (!userId) {
      return res.status(404).json({
        status: 404,
        message: "User ID not found for this email",
      });
    }

    console.log(`Looking for API logs for user ID: ${userId} (email: ${email})`);

    // Now get the API logs for this user
    const apiLogRef = db.collection("apiLogs");
    const snapshot = await apiLogRef.where("userId", "==", userId).get();
    
    // Sort in memory after fetching
    const apiLogs = snapshot.docs
      .map((doc) => doc.data())
      .sort((a, b) => {
        const timestampA = a.timestamp?._seconds || a.timestamp || 0;
        const timestampB = b.timestamp?._seconds || b.timestamp || 0;
        return timestampB - timestampA; // Descending order
      });

    console.log(`Found ${apiLogs.length} API logs for user ID: ${userId}`);

    return res.status(200).json({
      status: 200,
      message: "Api logs fetched successfully",
      body: apiLogs,
    });
  } catch (error) {
    console.error("Error fetching api logs by email:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const getApiLogsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(
      Math.max(parseInt(req.query?.limit, 10) || 100, 1),
      500
    );
    const days = Math.min(
      Math.max(parseInt(req.query?.days ?? req.query?.timeRange, 10) || 14, 1),
      90
    );

    if (!userId) {
      return res.status(400).json({
        status: 400,
        message: "User ID is required",
      });
    }

    const numericUserId = parseInt(userId, 10);
    if (isNaN(numericUserId)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid user ID format",
      });
    }

    const { getActivityLogsWithProgress } = await import(
      "../services/activityLogService.js"
    );
    const { activities, progress, nextStep } = await getActivityLogsWithProgress(
      numericUserId,
      limit,
      { days }
    );

    // Fetch platform name for this user from user_platforms and platforms tables
    let platformName = null;
    try {
      const [userPlatformRow] = await sequelize.query(
        `
          SELECT p.name AS platformName
          FROM user_platforms up
          JOIN platforms p ON up.platformId = p.id
          WHERE up.userId = :userId
          ORDER BY up.createdAt DESC
          LIMIT 1
        `,
        {
          replacements: { userId: numericUserId },
          type: sequelize.QueryTypes.SELECT,
        }
      );
      if (userPlatformRow && userPlatformRow.platformName) {
        platformName = userPlatformRow.platformName;
      }
    } catch (e) {
      console.error("Error fetching platform name for user:", e.message);
    }

    return res.status(200).json({
      status: 200,
      message: "Activity logs fetched successfully",
      body: {
        activities,
        progress,
        nextStep,
        platformName,
      },
    });
  } catch (error) {
    console.error("Error fetching api logs by userId:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const updateAssistantDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    const { prerequisite_agents } = req.body;
    
    console.log(`Updating dependencies for assistant ${id}:`, prerequisite_agents);
    
    if (!id) {
      return res.status(400).json({
        status: 400,
        message: "Assistant ID is required",
      });
    }

    // Update only the prerequisite_agents field
    const [result] = await sequelize.query(
      `UPDATE recommendation_master SET prerequisite_agents = :prerequisite_agents WHERE id = :id`,
      {
        replacements: {
          prerequisite_agents: prerequisite_agents || null,
          id: id,
        },
        type: sequelize.QueryTypes.UPDATE,
      }
    );

    await invalidateAdminAssistantsCache();
    await invalidateActivitiesAndAssistantsCache();
    res.status(200).json({
      status: 200,
      message: "Assistant dependencies updated successfully",
      data: {
        id: id,
        prerequisite_agents: prerequisite_agents
      }
    });
  } catch (error) {
    console.error("Error updating assistant dependencies:", error);
    res.status(500).json({
      status: 500,
      message: "Error updating assistant dependencies",
      error: error.message,
    });
  }
};

// Check if activity.platforms array contains platformId (handles number or string in array)
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

export const getActivitiesByPlatformId = async (req, res) => {
  try {
    const { platformId } = req.params;
    if (!platformId) {
      return res.status(400).json({
        status: 400,
        message: "platformId is required",
      });
    }

    let activities = await Activity.findAll({
      where: { status: 'Active' },
      order: [['sequence', 'ASC']],
      raw: true,
    });

    activities = activities.filter(activity => activityBelongsToPlatform(activity, platformId));

    return res.status(200).json({
      status: 200,
      message: "Activities fetched successfully",
      body: activities,
    });
  } catch (error) {
    console.error("Error fetching activities by platform:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
