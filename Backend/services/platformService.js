import PlatformCategoryMapping from "../model/platformMapping.js";
import {
  resolveItemMappings,
  resolveChapterMappings,
  createStory,
  createChapter,
  transformPlatform,
} from "../helpers/platformMappingHelper.js";
import {
  getPlatforms as fetchPlatforms,
  removePlatforms,
  createPlatforms,
} from "../helpers/platformMappingHelper.js";
import Sequelize from "sequelize";
import Platform from "../model/platform.js";
import Stories from "../model/storiesMasters.js";
import ChapterMaster from "../model/chapterMaster.js";
import ItemMaster from "../model/itemMaster.js";
import Questions from "../model/itemQuestions.js";
import Policy from "../model/policy.js";
import ExcelJS from "exceljs";
import XLSX from "xlsx";
import { Readable } from "stream";
import sequelize from "../config/db.js";
import StoriesSubCategory from "../model/storiesSubCategory.js";
const { Op } = Sequelize;
const createPlatform = async (platform) => {
  const platforms = await createPlatforms(platform);
  return {
    message: "Platform created successfully",
    status: 200,
    body: platforms,
  };
};

const getAllPlatforms = async () => {
  const platforms = await fetchPlatforms();
  return {
    message: "Platforms fetched successfully",
    status: 200,
    body: platforms,
  };
};

const removePlatform = async (id) => {
  const platforms = await removePlatforms(id);
  if (platforms.length > 0) {
    return {
      message: "Platform removed successfully",
      status: 200,
      body: null,
    };
  }
};

const updatePlatform = async (id, updateData) => {
  try {
    const platform = await Platform.findByPk(id);
    
    if (!platform) {
      return {
        message: "Platform not found",
        status: 404,
        body: null,
      };
    }
    
    // Only update allowed fields (name, description, onboardingMessage)
    // Explicitly ignore any goals field if sent
    const allowedFields = ['name', 'description', 'onboardingMessage'];
    const filteredData = {};
    
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }
    
    await platform.update(filteredData);
    
    return {
      message: "Platform updated successfully",
      status: 200,
      body: platform,
    };
  } catch (error) {
    console.error("Error updating platform:", error);
    return {
      message: "Failed to update platform",
      status: 500,
      body: null,
    };
  }
};
const createMappings = async ({
  platformId,
  itemIds = [],
  chapterIds = [],
}) => {
  if (!platformId || (itemIds.length === 0 && chapterIds.length === 0)) {
    throw {
      status: 400,
      message:
        "platformId and at least one of itemIds[] or chapterIds[] is required",
    };
  }

  // Resolve full mapping objects from input
  const itemMappings = await resolveItemMappings(platformId, itemIds);
  const chapterMappings = await resolveChapterMappings(platformId, chapterIds);
  const allMappings = [...itemMappings, ...chapterMappings];

  if (allMappings.length === 0) {
    throw {
      status: 404,
      message: "No valid mappings found to insert or update",
    };
  }

  // Check existing mappings in DB for this platform
  const existing = await PlatformCategoryMapping.findAll({
    where: { platformId },
  });

  const updated = [];
  const toInsert = [];
  const incomingKeySet = new Set();

  // Collect keys of incoming mappings (for comparison & filtering)
  for (const m of allMappings) {
    const key = `${m.storyId}-${m.chapterId}-${m.itemId ?? "null"}`;
    incomingKeySet.add(key);
  }

  // Process existing mappings:
  const toDelete = [];
  for (const record of existing) {
    const key = `${record.storyId}-${record.chapterId}-${record.itemId ?? "null"
      }`;
    if (incomingKeySet.has(key)) {
      // this record matches, check if needs activation
      if (!record.isActive) {
        record.isActive = true;
        await record.save();
        updated.push(record);
      }
    } else {
      // this record is NOT present in the incoming body — mark for deletion
      toDelete.push(record.id);
    }
  }

  // Check what's new (not in DB yet)
  for (const m of allMappings) {
    const exists = existing.some(
      (e) =>
        e.storyId === m.storyId &&
        e.chapterId === m.chapterId &&
        (e.itemId ?? null) === (m.itemId ?? null)
    );
    if (!exists) {
      toInsert.push(m);
    }
  }

  // Perform removals (DELETE ✂️)
  if (toDelete.length > 0) {
    await PlatformCategoryMapping.destroy({
      where: { id: toDelete },
    });
  }

  // Perform inserts (CREATE ➕)
  const created = await PlatformCategoryMapping.bulkCreate(toInsert);

  return {
    message: `Mappings synced successfully`,
    status: 200,
    body: {
      inserted: created.length,
      updated: updated.length,
      deleted: toDelete.length,
    },
  };
};

const getMappings = async (filters) => {
  // Compose where clause based on provided filters
  const where = {};
  if (filters.platformId) where.platformId = filters.platformId;
  if (filters.storyId) where.storyId = filters.storyId;
  if (filters.chapterId) where.chapterId = filters.chapterId;
  if (filters.itemId) where.itemId = filters.itemId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  const mappings = await PlatformCategoryMapping.findAll({ where });
  return {
    message: "Platform mappings fetched successfully",
    status: 200,
    body: mappings,
  };
};

const getMappingByPlatformId = async (platformId) => {
  const mappings = await PlatformCategoryMapping.findAll({
    where: { platformId },
    include: [
      { model: Platform },
      { model: Stories },
      { model: ChapterMaster },
      { model: ItemMaster },
    ],
  });

  if (!mappings || mappings.length === 0) {
    return {
      message: "No mapping found for this platform",
      status: 404,
      body: null,
    };
  }

  const platformData = mappings[0].Platform;
  const groupedStories = {};

  // track which chapterIds have been fully mapped already
  const fullyMappedChapters = new Set();

  for (const mapping of mappings) {
    const story = mapping.stories_master;
    const chapter = mapping.chapter_master;
    const item = mapping.items_master;

    if (!story || !chapter) continue;

    // Prepare story group
    if (!groupedStories[story.storyId]) {
      groupedStories[story.storyId] = {
        storyId: story.storyId,
        storyName: story.storyName,
        chapters: {},
      };
    }

    const storyGroup = groupedStories[story.storyId];

    // Prepare chapter group
    if (!storyGroup.chapters[chapter.chapterId]) {
      storyGroup.chapters[chapter.chapterId] = {
        chapterId: chapter.chapterId,
        chapterName: chapter.chapterName,
        items: [],
      };
    }

    const chapterGroup = storyGroup.chapters[chapter.chapterId];

    // 👉 itemId = null => fetch all items under this chapter
    if (
      mapping.itemId === null &&
      !fullyMappedChapters.has(chapter.chapterId)
    ) {
      // fetch all items for this chapter
      const allItems = await ItemMaster.findAll({
        where: { chapterId: chapter.chapterId, is_deleted: 0 },
      });

      chapterGroup.items.push(
        ...allItems.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName,
        }))
      );

      fullyMappedChapters.add(chapter.chapterId); // so we don't fetch again for duplicate mappings
    }

    // 👉 itemId is mapped specifically
    if (
      item &&
      mapping.itemId !== null &&
      !chapterGroup.items.some((i) => i.itemId === item.itemId)
    ) {
      chapterGroup.items.push({
        itemId: item.itemId,
        itemName: item.itemName,
      });
    }
  }

  const result = {
    platformId: platformData.id,
    platformName: platformData.name,
    stories: Object.values(groupedStories).map((story) => ({
      storyId: story.storyId,
      storyName: story.storyName,
      chapters: Object.values(story.chapters),
    })),
  };

  return {
    message: "Platform mappings fetched successfully",
    status: 200,
    body: result,
  };
};

const createPlatFormStory = async (story) => {
  const { data, error } = await createStory(story);
  if (error) {
    return {
      message: error,
      status: 400, // Or 500 if it's a server error
      body: null,
    };
  }

  return {
    message: "Story created successfully",
    status: 201,
    body: data,
  };
};

const createPlatFormChapter = async (chapter) => {
  const { data, error } = await createChapter(chapter);

  if (error) {
    return {
      message: error,
      status: 400, // Or 500 if it's a server error
      body: null,
    };
  }

  return {
    message: "Chapter created successfully",
    status: 201,
    body: data,
  };
};

const filterPlatforms = async (filters) => {
  const { Op } = Sequelize;

  const where = {};
  const include = [
    { model: Platform },
    { model: Stories },
    { model: ChapterMaster },
    {
      model: ItemMaster,
      include: [{
        model: Questions,
        attributes: ['questionId', 'group', 'question', 'itemId', 'createdAt', 'updatedAt']
      }], // Assuming your Question model is defined
    },
  ];

  // Partial match for platform name
  if (filters.platformName) {
    include[0].where = { name: { [Op.like]: `%${filters.platformName}%` } };
  }
  // Partial match for story name
  if (filters.storyName) {
    include[1].where = { storyName: { [Op.like]: `%${filters.storyName}%` } };
  }
  // Partial match for chapter name
  if (filters.chapterName) {
    include[2].where = {
      chapterName: { [Op.like]: `%${filters.chapterName}%` },
    };
  }
  if (filters.platformType) where.platformType = filters.platformType;
  if (filters.platformStatus) where.platformStatus = filters.platformStatus;
  if (filters.platformIsActive !== undefined)
    where.platformIsActive = filters.platformIsActive;
  if (filters.platformIsDeleted !== undefined)
    where.platformIsDeleted = filters.platformIsDeleted;

  const platforms = await PlatformCategoryMapping.findAll({
    include,
    where,
  });

  if (platforms.length === 0) {
    return {
      message: "No platforms found",
      status: 404,
      body: null,
    };
  }

  const transformedPlatforms = platforms.map(transformPlatform);
  return {
    message: "Platforms fetched successfully",
    status: 200,
    body: transformedPlatforms,
  };
};

const getStoriesByPlatforms = async ({
  platforms,
  includeInactive = false,
}) => {
  try {
    // If no platforms provided, return empty result
    if (!platforms || platforms.length === 0) {
      return {
        message: "No platforms specified",
        status: 200,
        body: [],
      };
    }

    // Fetch platform-mapped stories only
    const platformStories = await fetchStoriesForPlatforms(
      platforms,
      includeInactive
    );

    // Apply intersection logic - only return stories that appear in ALL selected platforms
    const intersectionStories = getIntersectionStories(platformStories, platforms);

    return {
      message: "Stories intersection fetched successfully",
      status: 200,
      body: intersectionStories,
    };
  } catch (error) {
    console.error("Error in getStoriesByPlatforms:", error);
    throw {
      status: 500,
      message: error.message || "Failed to fetch stories by platforms",
    };
  }
};
// Helper function to fetch stories for specific platforms
const fetchStoriesForPlatforms = async (
  platformIds,
  includeInactive = false
) => {
  // Convert platform IDs to integers and filter out invalid ones
  const numericPlatformIds = platformIds
    .map((id) => parseInt(id))
    .filter((id) => !isNaN(id) && id > 0);

  if (numericPlatformIds.length === 0) {
    throw {
      status: 400,
      message: "No valid platform IDs provided",
    };
  }

  // Validate platform IDs exist and are active
  const validPlatforms = await Platform.findAll({
    where: {
      id: { [Op.in]: numericPlatformIds },
      isDeleted: { [Op.ne]: 1 },
    },
    attributes: ["id", "name"], // Only fetch needed attributes
    raw: true, // Better performance
  });

  if (validPlatforms.length === 0) {
    throw {
      status: 404,
      message: "No valid platforms found",
    };
  }

  // Log warning if some platforms were not found
  if (validPlatforms.length < numericPlatformIds.length) {
    const foundIds = validPlatforms.map((p) => p.id);
    const missingIds = numericPlatformIds.filter(
      (id) => !foundIds.includes(id)
    );
    console.warn(
      `Some platform IDs were not found or inactive: ${missingIds.join(", ")}`
    );
  }

  const validPlatformIds = validPlatforms.map((p) => p.id);

  // Get stories mapped to these platforms
  const mappings = await PlatformCategoryMapping.findAll({
    where: {
      platformId: { [Op.in]: validPlatformIds },
      isActive: true,
    },
    include: [
      {
        model: Platform,
        where: { isDeleted: { [Op.ne]: 1 } },
      },
      {
        model: Stories,
        where: includeInactive ? {} : { isDeleted: 0 },
      },
    ],
  });

  // Group stories by platform and transform
  const storiesMap = new Map();

  mappings.forEach((mapping) => {
    const story = mapping.stories_master;
    const platform = mapping.Platform;

    if (!story || !platform) return;

    const storyKey = story.storyId;

    if (!storiesMap.has(storyKey)) {
      storiesMap.set(storyKey, {
        storyId: story.storyId,
        storyName: story.storyName,
        description: story.description,
        isDeleted: story.isDeleted,
        isPublished: story.isPublished,
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
        source: "platform",
        platforms: [],
      });
    }

    const storyData = storiesMap.get(storyKey);
    if (!storyData.platforms.includes(platform.id.toString())) {
      storyData.platforms.push(platform.id.toString());
    }
  });

  return Array.from(storiesMap.values());
};

// Helper function to get intersection of stories across all platforms
const getIntersectionStories = (allStories, selectedPlatforms) => {
  // Convert selected platforms to strings for comparison
  const selectedPlatformIds = selectedPlatforms.map(id => id.toString());

  // Group stories by storyId to see which platforms each story appears in
  const storiesMap = new Map();

  allStories.forEach((story) => {
    const storyKey = story.storyId;

    if (!storiesMap.has(storyKey)) {
      // First occurrence of this story
      storiesMap.set(storyKey, {
        storyId: story.storyId,
        storyName: story.storyName,
        description: story.description,
        isDeleted: story.isDeleted,
        isPublished: story.isPublished,
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
        source: story.source,
        platforms: [...story.platforms],
      });
    } else {
      // Story already exists, merge platform information
      const existingStory = storiesMap.get(storyKey);

      // Merge platforms arrays and remove duplicates
      const mergedPlatforms = [
        ...new Set([...existingStory.platforms, ...story.platforms]),
      ];
      existingStory.platforms = mergedPlatforms;
    }
  });

  // Filter to only include stories that appear in ALL selected platforms
  const intersectionStories = Array.from(storiesMap.values()).filter(story => {
    // Check if this story appears in all selected platforms
    const storyPlatformIds = story.platforms.map(id => id.toString());
    return selectedPlatformIds.every(platformId =>
      storyPlatformIds.includes(platformId)
    );
  });

  // Sort by storyId descending
  return intersectionStories.sort((a, b) => b.storyId - a.storyId);
};

const importExcelData = async (fileBuffer, fileName) => {
  let workbook = null;
  let rows = [];

  try {
    if (!fileName) throw new Error("File name is required for format detection");

    const fileExtension = fileName.split(".").pop().toLowerCase();

    // 🧩 Load workbook depending on file type
    if (fileExtension === "xlsx") {
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer);
    } else if (fileExtension === "csv") {
      workbook = new ExcelJS.Workbook();
      const bufferStream = Readable.from(fileBuffer);
      await workbook.csv.read(bufferStream, { sheetName: "Sheet1" });
    } else if (fileExtension === "xls") {
      const wb = XLSX.read(fileBuffer, { type: "buffer" });
      const firstSheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      rows = rawRows.slice(1).map((row) => ({
        A: (row[0] ?? "").toString().trim(),
        B: (row[1] ?? "").toString().trim(),
        C: (row[2] ?? "").toString().trim(),
        D: (row[3] ?? "").toString().trim(),
        E: (row[4] ?? "").toString().trim(),
        F: (row[5] ?? "").toString().trim(),
        G: (row[6] ?? "").toString().trim(),
        H: (row[6] ?? "").toString().trim(),
      }));
    } else {
      return {
        message: "Unsupported file format",
        status: 400,
        body: { error: "Only .xlsx, .xls, and .csv formats are supported." },
      };
    }

    // 🧩 Handle XLSX/CSV with ExcelJS
    if (fileExtension !== "xls") {
      const sheet = workbook.worksheets[0]; // auto-detect first sheet
      if (!sheet) {
        return {
          message: "Sheet not found",
          status: 400,
          body: { error: 'No worksheet found (expected first sheet).' },
        };
      }

      rows = [];
      sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const rowData = {
          A: row.getCell("A").value?.toString().trim() || "",
          B: row.getCell("B").value?.toString().trim() || "",
          C: row.getCell("C").value?.toString().trim() || "",
          D: row.getCell("D").value?.toString().trim() || "",
          E: row.getCell("E").value?.toString().trim() || "",
          F: row.getCell("F").value?.toString().trim() || "",
          G: row.getCell("G").value?.toString().trim() || "", 
          H: row.getCell("H").value?.toString().trim() || "", 
        };

        if (Object.values(rowData).some((v) => v)) {
          rows.push(rowData);
        }
      });
    }

    // 🧩 Initialize result summary
    const result = {
      stories: { created: 0, skipped: 0, errors: [] },
      chapters: { created: 0, errors: [] },
      items: { created: 0, errors: [] },
      policies: { created: 0, errors: [] },
      questions: { created: 0, errors: [] },
    };

    const t = await sequelize.transaction();

    try {
      let currentItemId = null;
      let policiesForItem = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 2;

        const storyName = row.A;
        const chapterName = row.B;
        const itemName = row.C;
        const sampleConversation = row.D;
        const itemQuestion = row.E;
        const policy = row.F;
        const policyQuestion = row.G;
        const subCategoryString = row.H || "";

        if (!storyName || !chapterName || !itemName) {
          result.stories.errors.push(
            `Row ${rowNumber}: Missing required fields (Story, Chapter, Item)`
          );
          continue;
        }

        try {
          // 1️⃣ Story
          let story = await Stories.findOne({
            where: { storyName },
            transaction: t,
          });

          if (!story) {
            story = await Stories.create(
              {
                storyName,
                description: "",
                color: "#000000",
                domain: ["none"],
                isCustom: 0,
                isDeleted: 0,
                isPublished: 0,
              },
              { transaction: t }
            );
            result.stories.created++;
          } else {
            result.stories.skipped++;
          }

          // 2️⃣ Subcategories (comma-separated)
          if (subCategoryString.trim()) {
            const subCategories = subCategoryString
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean);

            for (const subCatName of subCategories) {
              const existingSubCat = await StoriesSubCategory.findOne({
                where: {
                  storyId: story.storyId,
                  subCategoryName: subCatName,
                },
                transaction: t,
              });

              if (!existingSubCat) {
                await StoriesSubCategory.create(
                  {
                    storyId: story.storyId,
                    subCategoryName: subCatName,
                    isDeleted: 0,
                  },
                  { transaction: t }
                );
              }
            }
          }

          // 3️⃣ Chapter
          let chapter = await ChapterMaster.findOne({
            where: { storyId: story.storyId, chapterName },
            transaction: t,
          });

          if (!chapter) {
            const maxSeq = await ChapterMaster.max("sequence", {
              where: { storyId: story.storyId },
              transaction: t,
            });
            const newSeq = isNaN(maxSeq) ? 1 : maxSeq + 1;

            chapter = await ChapterMaster.create(
              {
                storyId: story.storyId,
                chapterName,
                sequence: newSeq,
                description: "",
                icon: "",
                domain: ["none"],
                isCustom: 0,
                isDeleted: 0,
                isPublished: 0,
              },
              { transaction: t }
            );
            result.chapters.created++;
          }

          // 4️⃣ Item
          let item = await ItemMaster.findOne({
            where: {
              storyId: story.storyId,
              chapterId: chapter.chapterId,
              itemName,
            },
            transaction: t,
          });

          if (!item) {
            const maxSeq = await ItemMaster.max("sequence", {
              where: { chapterId: chapter.chapterId },
              transaction: t,
            });
            const newSeq = isNaN(maxSeq) ? 1 : maxSeq + 1;

            item = await ItemMaster.create(
              {
                storyId: story.storyId,
                chapterId: chapter.chapterId,
                itemName,
                sample_conversation: sampleConversation,
                sequence: newSeq,
                domain: ["none"],
                isCustom: 0,
                is_deleted: 0,
              },
              { transaction: t }
            );
            result.items.created++;
          }else{
            if (item.sample_conversation !== sampleConversation) {
              await item.update({ sample_conversation: sampleConversation }, { transaction: t });
            }

          }
          // 5️⃣ Item Question
          let question = await Questions.findOne({
            where: {
               itemId: item.itemId,
            },
            transaction: t,
          });

          if (!question) {
            await Questions.create(
              {
                itemId: item.itemId,
                question: itemQuestion,
              },
              { transaction: t }
            );
            result.questions.created++;
          } else {
            // 🔄 Update existing question if different
            if (question.question !== itemQuestion) {
              await question.update({ question: itemQuestion }, { transaction: t });
            }
          }

          // 6️⃣ Policies
          if (policy && policyQuestion) {

            if (currentItemId !== item.itemId && policiesForItem.length > 0) {
              await savePoliciesForItem(currentItemId, policiesForItem, t);
              result.policies.created++;
              policiesForItem = [];
            }

            policiesForItem.push({
              type: "text",
              policy,
              status: "active",
              question: policyQuestion || "",
              sequence: policiesForItem.length + 1,
            });

            currentItemId = item.itemId;
          }
        } catch (rowErr) {
          result.stories.errors.push(`Row ${rowNumber}: ${rowErr.message}`);
        }
      }

      // 🔚 Save remaining policies
      if (policiesForItem.length > 0 && currentItemId) {
        await savePoliciesForItem(currentItemId, policiesForItem, t);
        result.policies.created++;
      }

      await t.commit();
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }

    return {
      message: "Excel data processed successfully",
      status: 200,
      body: result,
    };
  } catch (error) {
    console.error("Excel import error:", error);
    return {
      message: "Error importing Excel data",
      status: 500,
      body: { error: error.message },
    };
  }
};

// 🧩 Helper: Save policies for an item
async function savePoliciesForItem(itemId, policiesForItem, transaction) {
  let policyRow = await Policy.findOne({
    where: { itemId },
    transaction,
  });

  if (policyRow) {
    await Policy.update(
      { policies: policiesForItem },
      { where: { policyId: policyRow.policyId }, transaction }
    );
  } else {
    const itemData = await ItemMaster.findOne({
      where: { itemId },
      transaction,
    });

    await Policy.create(
      {
        storyId: itemData.storyId,
        chapterId: itemData.chapterId,
        itemId,
        policies: policiesForItem,
        isDeleted: 0,
      },
      { transaction }
    );
  }
}



// Helper function to fetch chapters for specific platforms
const fetchChaptersForPlatforms = async (
  storyIds,
  platformIds,
  includeInactive = false
) => {
  const { Op } = Sequelize;

  // Convert platform IDs to integers and filter out invalid ones
  const numericPlatformIds = platformIds
    .map((id) => parseInt(id))
    .filter((id) => !isNaN(id) && id > 0);

  if (numericPlatformIds.length === 0) {
    throw {
      status: 400,
      message: "No valid platform IDs provided",
    };
  }

  // Validate platform IDs exist and are active
  const validPlatforms = await Platform.findAll({
    where: {
      id: { [Op.in]: numericPlatformIds },
      isDeleted: { [Op.ne]: 1 },
    },
    attributes: ["id", "name"],
    raw: true,
  });

  if (validPlatforms.length === 0) {
    throw {
      status: 404,
      message: "No valid platforms found",
    };
  }

  const validPlatformIds = validPlatforms.map((p) => p.id);

  // Get chapters mapped to these platforms and stories
  const mappings = await PlatformCategoryMapping.findAll({
    where: {
      platformId: { [Op.in]: validPlatformIds },
      storyId: { [Op.in]: storyIds },
      isActive: true,
    },
    include: [
      {
        model: Platform,
        where: { isDeleted: { [Op.ne]: 1 } },
      },
      {
        model: Stories,
        where: includeInactive ? {} : { isDeleted: 0 },
      },
      {
        model: ChapterMaster,
        where: includeInactive ? {} : { isDeleted: 0 },
      },
    ],
  });

  // Group chapters by chapter ID and transform
  const chaptersMap = new Map();

  mappings.forEach((mapping) => {
    const chapter = mapping.chapter_master;
    const story = mapping.stories_master;
    const platform = mapping.Platform;

    if (!chapter || !story || !platform) return;

    const chapterKey = chapter.chapterId;

    if (!chaptersMap.has(chapterKey)) {
      chaptersMap.set(chapterKey, {
        chapterId: chapter.chapterId,
        storyId: chapter.storyId,
        chapterName: chapter.chapterName,
        description: chapter.description,
        sequence: chapter.sequence,
        isDeleted: chapter.isDeleted,
        isPublished: chapter.isPublished,
        createdAt: chapter.createdAt,
        updatedAt: chapter.updatedAt,
        storyName: story.storyName,
        source: "platform",
        platforms: [],
      });
    }

    const chapterData = chaptersMap.get(chapterKey);
    if (!chapterData.platforms.includes(platform.id.toString())) {
      chapterData.platforms.push(platform.id.toString());
    }
  });

  return Array.from(chaptersMap.values());
};

// Helper function to get intersection of chapters across all platforms
const getIntersectionChapters = (allChapters, selectedPlatforms) => {
  // Convert selected platforms to strings for comparison
  const selectedPlatformIds = selectedPlatforms.map(id => id.toString());

  // Group chapters by chapterId to see which platforms each chapter appears in
  const chaptersMap = new Map();

  allChapters.forEach((chapter) => {
    const chapterKey = chapter.chapterId;

    if (!chaptersMap.has(chapterKey)) {
      // First occurrence of this chapter
      chaptersMap.set(chapterKey, {
        chapterId: chapter.chapterId,
        storyId: chapter.storyId,
        chapterName: chapter.chapterName,
        description: chapter.description,
        sequence: chapter.sequence,
        isDeleted: chapter.isDeleted,
        isPublished: chapter.isPublished,
        createdAt: chapter.createdAt,
        updatedAt: chapter.updatedAt,
        storyName: chapter.storyName,
        source: chapter.source,
        platforms: [...(chapter.platforms || [])],
      });
    } else {
      // Chapter already exists, merge platform information
      const existingChapter = chaptersMap.get(chapterKey);

      // Merge platforms arrays and remove duplicates
      const mergedPlatforms = [
        ...new Set([
          ...existingChapter.platforms,
          ...(chapter.platforms || []),
        ]),
      ];
      existingChapter.platforms = mergedPlatforms;
    }
  });

  // Filter to only include chapters that appear in ALL selected platforms
  const intersectionChapters = Array.from(chaptersMap.values()).filter(chapter => {
    // Check if this chapter appears in all selected platforms
    const chapterPlatformIds = chapter.platforms.map(id => id.toString());
    return selectedPlatformIds.every(platformId =>
      chapterPlatformIds.includes(platformId)
    );
  });

  // Sort by storyId and sequence
  return intersectionChapters.sort((a, b) => {
    if (a.storyId !== b.storyId) {
      return a.storyId - b.storyId;
    }
    return a.sequence - b.sequence;
  });
};

// Helper function to fetch items for specific platforms
const fetchItemsForPlatforms = async (
  chapterIds,
  platformIds,
  includeInactive = false
) => {
  const { Op } = Sequelize;

  // Convert platform IDs to integers and filter out invalid ones
  const numericPlatformIds = platformIds
    .map((id) => parseInt(id))
    .filter((id) => !isNaN(id) && id > 0);

  if (numericPlatformIds.length === 0) {
    throw {
      status: 400,
      message: "No valid platform IDs provided",
    };
  }

  // Validate platform IDs exist and are active
  const validPlatforms = await Platform.findAll({
    where: {
      id: { [Op.in]: numericPlatformIds },
      isDeleted: { [Op.ne]: 1 },
    },
    attributes: ["id", "name"],
    raw: true,
  });

  if (validPlatforms.length === 0) {
    throw {
      status: 404,
      message: "No valid platforms found",
    };
  }

  const validPlatformIds = validPlatforms.map((p) => p.id);

  // Get items mapped to these platforms and chapters
  const mappings = await PlatformCategoryMapping.findAll({
    where: {
      platformId: { [Op.in]: validPlatformIds },
      chapterId: { [Op.in]: chapterIds },
      isActive: true,
    },
    include: [
      {
        model: Platform,
        where: { isDeleted: { [Op.ne]: 1 } },
      },
      {
        model: Stories,
        where: includeInactive ? {} : { isDeleted: 0 },
      },
      {
        model: ChapterMaster,
        where: includeInactive ? {} : { isDeleted: 0 },
      },
      {
        model: ItemMaster,
        where: includeInactive ? {} : { is_deleted: 0 },
        include: [
          {
            model: Questions,
            required: false, // LEFT JOIN to include items even without questions
            attributes: ['questionId', 'group', 'question', 'itemId', 'createdAt', 'updatedAt']
          }
        ],
      },
    ],
  });

  // Group items by item ID and transform
  const itemsMap = new Map();

  mappings.forEach((mapping) => {
    const item = mapping.items_master;
    const chapter = mapping.chapter_master;
    const story = mapping.stories_master;
    const platform = mapping.Platform;

    if (!item || !chapter || !story || !platform) return;

    const itemKey = item.itemId;

    if (!itemsMap.has(itemKey)) {
      itemsMap.set(itemKey, {
        itemId: item.itemId,
        chapterId: item.chapterId,
        storyId: item.storyId,
        itemName: item.itemName,
        description: item.description || "",
        sequence: item.sequence,
        sample_conversation: item.sample_conversation || "",
        is_deleted: item.is_deleted,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        chapterName: chapter.chapterName,
        storyName: story.storyName,
        source: "platform",
        platforms: [],
        question: "", // Initialize empty question string
      });
    }

    const itemData = itemsMap.get(itemKey);

    // Add platform if not already added
    if (!itemData.platforms.includes(platform.id.toString())) {
      itemData.platforms.push(platform.id.toString());
    }
    // console.log(item);
    // Add question if it exists and isn't already set
    if (item.question && !itemData.question) {
      itemData.question = item.question.question;
    }
    // console.log(itemData.question);
  });

  return Array.from(itemsMap.values());
};

// Helper function to get intersection of items across all platforms
const getIntersectionItems = (allItems, selectedPlatforms) => {
  // Convert selected platforms to strings for comparison
  const selectedPlatformIds = selectedPlatforms.map(id => id.toString());

  // Group items by itemId to see which platforms each item appears in
  const itemsMap = new Map();

  allItems.forEach((item) => {
    const itemKey = item.itemId;

    if (!itemsMap.has(itemKey)) {
      // First occurrence of this item
      itemsMap.set(itemKey, {
        itemId: item.itemId,
        chapterId: item.chapterId,
        storyId: item.storyId,
        itemName: item.itemName,
        description: item.description,
        sequence: item.sequence,
        sample_conversation: item.sample_conversation,
        is_deleted: item.is_deleted,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        chapterName: item.chapterName,
        storyName: item.storyName,
        source: "platform",
        platforms: [...item.platforms],
        question: item.question || "",
      });
    } else {
      // Item already exists, merge platform information
      const existingItem = itemsMap.get(itemKey);

      // Merge platforms arrays and remove duplicates
      const mergedPlatforms = [
        ...new Set([...existingItem.platforms, ...item.platforms]),
      ];
      existingItem.platforms = mergedPlatforms;

      // Keep the first non-empty question if it exists
      if (!existingItem.question && item.question) {
        existingItem.question = item.question;
      }
    }
  });

  // Filter to only include items that appear in ALL selected platforms
  const intersectionItems = Array.from(itemsMap.values()).filter(item => {
    // Check if this item appears in all selected platforms
    const itemPlatformIds = item.platforms.map(id => id.toString());
    return selectedPlatformIds.every(platformId =>
      itemPlatformIds.includes(platformId)
    );
  });

  // Sort by storyId, chapterId, and sequence
  return intersectionItems.sort((a, b) => {
    if (a.storyId !== b.storyId) {
      return a.storyId - b.storyId;
    }
    if (a.chapterId !== b.chapterId) {
      return a.chapterId - b.chapterId;
    }
    return a.sequence - b.sequence;
  });
};

const getItemsByPlatformChapters = async ({
  chapterIds,
  platforms,
  includeInactive = false,
}) => {
  try {
    // Validate chapterIds
    if (!chapterIds || chapterIds.length === 0) {
      return {
        message: "No chapter IDs provided",
        status: 400,
        body: [],
      };
    }

    // Validate platforms
    if (!platforms || platforms.length === 0) {
      return {
        message: "No platforms specified",
        status: 400,
        body: [],
      };
    }

    // Convert chapterIds to integers
    const numericChapterIds = chapterIds
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id) && id > 0);

    if (numericChapterIds.length === 0) {
      return {
        message: "No valid chapter IDs provided",
        status: 400,
        body: [],
      };
    }

    // Fetch platform-mapped items only
    const platformItems = await fetchItemsForPlatforms(
      numericChapterIds,
      platforms,
      includeInactive
    );

    // Apply intersection logic - only return items that appear in ALL selected platforms
    const intersectionItems = getIntersectionItems(platformItems, platforms);

    return {
      message: "Items intersection fetched successfully",
      status: 200,
      body: intersectionItems,
    };
  } catch (error) {
    console.error("Error in getItemsByPlatformChapters:", error);
    return {
      message: error.message || "Failed to fetch items by platform chapters",
      status: 500,
      body: [],
    };
  }
};

const getChaptersByPlatformStories = async ({
  storyIds,
  platforms,
  includeInactive = false,
}) => {
  try {
    // Validate storyIds
    if (!storyIds || storyIds.length === 0) {
      return {
        message: "No story IDs provided",
        status: 400,
        body: [],
      };
    }

    // Validate platforms
    if (!platforms || platforms.length === 0) {
      return {
        message: "No platforms specified",
        status: 400,
        body: [],
      };
    }

    // Convert storyIds to integers
    const numericStoryIds = storyIds
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id) && id > 0);

    if (numericStoryIds.length === 0) {
      return {
        message: "No valid story IDs provided",
        status: 400,
        body: [],
      };
    }

    // Fetch platform-mapped chapters only
    const platformChapters = await fetchChaptersForPlatforms(
      numericStoryIds,
      platforms,
      includeInactive
    );

    // Apply intersection logic - only return chapters that appear in ALL selected platforms
    const intersectionChapters = getIntersectionChapters(platformChapters, platforms);

    return {
      message: "Chapters intersection fetched successfully",
      status: 200,
      body: intersectionChapters,
    };
  } catch (error) {
    console.error("Error in getChaptersByPlatformStories:", error);
    return {
      message: error.message || "Failed to fetch chapters by platform stories",
      status: 500,
      body: [],
    };
  }
};


const exportExcelData = async (storyIds) => {
  try {
    if (!storyIds || !Array.isArray(storyIds) || storyIds.length === 0) {
      throw new Error('Story IDs are required as an array');
    }

    // Fetch all stories with their related data
    const stories = await Stories.findAll({
      where: {
        storyId: storyIds,
        isDeleted: 0
      },
      include: [
        {
          model: StoriesSubCategory,
          where: { isCustom: 0},
          required: false
        },
        {
          model: ChapterMaster,
          as: 'chapter_masters',
          where: { isDeleted: 0 },
          required: false,
          include: [
            {
              model: ItemMaster,
              as: 'items_masters',
              where: { is_deleted: 0 },
              required: false,
              include: [
                {
                  model: Questions,
                  as: 'question',
                  required: false,
                },
                {
                  model: Policy,
                  as: 'policies',
                  where: { isDeleted: 0 },
                  required: false,
                }
              ]
            }
          ]
        }
      ],
      order: [
        ['storyId', 'ASC'],
        [{ model: ChapterMaster, as: 'chapter_masters' }, 'sequence', 'ASC'],
        [{ model: ChapterMaster, as: 'chapter_masters' }, { model: ItemMaster, as: 'item_masters' }, 'sequence', 'ASC']
      ]
    });

    if (!stories || stories.length === 0) {
      throw new Error('No stories found with provided IDs');
    }

    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    // Define columns
    worksheet.columns = [
      { header: 'Story', key: 'story', width: 25 },
      { header: 'Chapter', key: 'chapter', width: 25 },
      { header: 'Item', key: 'item', width: 25 },
      { header: 'Sample Conversation', key: 'sampleConversation', width: 50 },
      { header: 'Item Question', key: 'itemQuestion', width: 40 },
      { header: 'Policy', key: 'policy', width: 40 },
      { header: 'Policy Question', key: 'policyQuestion', width: 40 },
      { header: 'Story Subcategory', key: 'subcategory', width: 30 } // ✅ added
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };

    // Build rows from data
    const rows = [];



for (const story of stories) {

  const subCategories =
    story.story_sub_categories?.length > 0
      ? story.story_sub_categories.sort(
        (a, b) => a.subCategoryId - b.subCategoryId
      )
      : story.story_sub_categories?.length > 0
      ? story.story_sub_categories.sort(
        (a, b) => a.subCategoryId - b.subCategoryId
      )
      : [];

  // Join all subcategories into a single string
  const subCategoryNames = subCategories.map(sc => sc.subCategoryName).join(', ');

  if (!story.chapter_masters || story.chapter_masters.length === 0) {
    rows.push({
      story: story.storyName,
      chapter: '',
      item: '',
      sampleConversation:'',
      itemQuestion: '',
      policy: '',
      policyQuestion: '',
      subcategory: subCategoryNames
    });
    continue;
  }

  for (const chapter of story.chapter_masters) {
    if (!chapter.items_masters || chapter.items_masters.length === 0) {
      rows.push({
        story: story.storyName,
        chapter: chapter.chapterName,
        item: '',
        sampleConversation:'',
        itemQuestion: '',
        policy: '',
        policyQuestion: '',
        subcategory: subCategoryNames
      });
      continue;
    }

    for (const item of chapter.items_masters) {
      const itemQuestion = item.question?.question?.trim() || '';
      const itemPolicies = item.policies || [];
      const sampleConversation = item.sample_conversation || '';
      let policiesArray = [];
      if (itemPolicies.length > 0) {
        const policyRecord = itemPolicies[0];
        policiesArray = Array.isArray(policyRecord.policies)
          ? policyRecord.policies
          : JSON.parse(policyRecord.policies || '[]');

          policiesArray = policiesArray.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).filter((p)=> p.status == 'active');
      }

      if (!itemQuestion && policiesArray.length === 0) continue;

      if (policiesArray.length === 0) {
        rows.push({
          story: story.storyName,
          chapter: chapter.chapterName,
          item: item.itemName,
          sampleConversation,
          itemQuestion,
          policy: '',
          policyQuestion: '',
          subcategory: subCategoryNames
        });
      } else {
        for (const policyObj of policiesArray) {
          rows.push({
            story: story.storyName,
            chapter: chapter.chapterName,
            item: item.itemName,
            sampleConversation,
            itemQuestion,
            policy: policyObj.policy || '',
            policyQuestion: policyObj.question || '',
            subcategory: subCategoryNames
          });
        }
      }
    }
  }
}


    // Add rows to worksheet
    rows.forEach(row => worksheet.addRow(row));

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      let maxLength = column.header.length;
      column.eachCell({ includeEmpty: false }, cell => {
        const cellLength = cell.value ? cell.value.toString().length : 0;
        if (cellLength > maxLength) maxLength = cellLength;
      });
      column.width = Math.min(maxLength + 2, 60);
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return {
      message: 'Story exported successfully',
      status: 200,
      buffer,
      filename: `stories_export_${Date.now()}.xlsx`,
    };
  } catch (error) {
    console.error('Excel export error:', error);
    throw new Error(`Failed to export Excel data: ${error.message}`);
  }
};



export default {
  createMappings,
  getMappings,
  getMappingByPlatformId,
  getAllPlatforms,
  removePlatform,
  createPlatform,
  updatePlatform,
  createPlatFormStory,
  createPlatFormChapter,
  filterPlatforms,
  importExcelData,
  getStoriesByPlatforms,
  getChaptersByPlatformStories,
  getItemsByPlatformChapters,
  exportExcelData
};
