import sequelize from "../config/db.js";
import Stories from "../model/storiesMasters.js";
import ChapterMaster from "../model/chapterMaster.js";
import ItemMaster from "../model/itemMaster.js";
import Policy from "../model/policy.js";
import Questions from "../model/itemQuestions.js";
import { Op } from "sequelize";

const storyCopyService = {
  // Copy entire story with all chapters and items
  copyStoryFull: async (sourceStoryId, newStoryData) => {
    const transaction = await sequelize.transaction();

    try {
      // 1. Get source story
      const sourceStory = await Stories.findByPk(sourceStoryId);

      if (!sourceStory) {
        throw new Error("Source story not found");
      }

      // Get chapters for the source story
      const sourceChapters = await ChapterMaster.findAll({
        where: {
          storyId: sourceStoryId,
          isDeleted: 0,
        },
      });

      // 2. Create new story
      const newStory = await Stories.create(
        {
          storyName: newStoryData.storyName,
          description: newStoryData.description || sourceStory.description,
          color: sourceStory.color,
          isCustom: 0, // Mark as custom since it's a copy
          domain: sourceStory.domain,
          isDeleted: 0,
          isPublished: 0,
        },
        { transaction }
      );

      let copiedChapters = 0;
      let copiedItems = 0;

      // 3. Copy chapters and items
      for (const chapter of sourceChapters) {
        const newChapter = await ChapterMaster.create(
          {
            storyId: newStory.storyId,
            chapterName: chapter.chapterName,
            description: chapter.description,
            sequence: chapter.sequence,
            isCustom: 0,
            icon: chapter.icon,
            domain: chapter.domain,
            isDeleted: 0,
            isPublished: 0,
          },
          { transaction }
        );

        copiedChapters++;

        // Get items for this chapter
        const chapterItems = await ItemMaster.findAll({
          where: {
            chapterId: chapter.chapterId,
            is_deleted: 0,
          },
        });

        // Copy items for this chapter
        for (const item of chapterItems) {
          const newItem = await ItemMaster.create(
            {
              storyId: newStory.storyId,
              chapterId: newChapter.chapterId,
              itemName: item.itemName,
              suggestions: item.suggestions,
              sample_conversation: item.sample_conversation,
              sequence: item.sequence,
              isCustom: 0,
              is_deleted: 0,
            },
            { transaction }
          );

          copiedItems++;

          // Copy questions from the questions table
          const questions = await Questions.findAll({
            where: { itemId: item.itemId },
          });

          for (const question of questions) {
            await Questions.create(
              {
                group: question.group,
                question: question.question,
                itemId: newItem.itemId,
              },
              { transaction }
            );
          }
          console.log("questions", questions);
          // Copy policies if they exist
          const policies = await Policy.findAll({
            where: { itemId: item.itemId },
          });

          for (const policy of policies) {
            await Policy.create(
              {
                itemId: newItem.itemId,
                storyId: newStory.storyId,
                chapterId: newChapter.chapterId,
                policies: policy.policies || [],
              },
              { transaction }
            );
          }
        }
      }

      await transaction.commit();

      return {
        status: 201,
        body: {
          story: newStory,
          copiedChapters,
          copiedItems,
        },
      };
    } catch (error) {
      await transaction.rollback();
      console.error("Error copying story:", error);
      return {
        status: 500,
        message: error.message || "Failed to copy story",
      };
    }
  },

  // Copy specific chapters from one story to another
  copyChaptersToStory: async (
    targetStoryId,
    sourceStoryId,
    chapterIds,
    copyItems = true
  ) => {
    const transaction = await sequelize.transaction();

    try {
      // Get source chapters
      const sourceChapters = await ChapterMaster.findAll({
        where: {
          storyId: sourceStoryId,
          chapterId: chapterIds,
        },
      });

      if (sourceChapters.length === 0) {
        throw new Error("No chapters found to copy");
      }

      const copiedChapters = [];
      let copiedItems = 0;

      // Get the highest sequence number in target story
      const maxSequence =
        (await ChapterMaster.max("sequence", {
          where: { storyId: targetStoryId },
        })) || 0;

      for (let i = 0; i < sourceChapters.length; i++) {
        const chapter = sourceChapters[i];

        const newChapter = await ChapterMaster.create(
          {
            storyId: targetStoryId,
            chapterName: chapter.chapterName,
            description: chapter.description,
            sequence: maxSequence + i + 1,
            isCustom: 0,
            icon: chapter.icon,
            domain: chapter.domain,
            isDeleted: 0,
            isPublished: 0,
          },
          { transaction }
        );

        copiedChapters.push(newChapter);

        // Copy items if requested
        if (copyItems) {
          const chapterItems = await ItemMaster.findAll({
            where: {
              chapterId: chapter.chapterId,
              is_deleted: 0,
            },
          });

          for (const item of chapterItems) {
            const newItem = await ItemMaster.create(
              {
                storyId: targetStoryId,
                chapterId: newChapter.chapterId,
                itemName: item.itemName,
                suggestions: item.suggestions,
                sample_conversation: item.sample_conversation,
                sequence: item.sequence,
                isCustom: 0,
                is_deleted: 0,
              },
              { transaction }
            );

            copiedItems++;

            // Copy questions from the questions table
            const questions = await Questions.findAll({
              where: { itemId: item.itemId },
            });

            for (const question of questions) {
              await Questions.create(
                {
                  group: question.group,
                  question: question.question,
                  itemId: newItem.itemId,
                },
                { transaction }
              );
            }

            // Copy policies
            const policies = await Policy.findAll({
              where: { itemId: item.itemId },
            });

            for (const policy of policies) {
              await Policy.create(
                {
                  itemId: newItem.itemId,
                  storyId: targetStoryId,
                  chapterId: newChapter.chapterId,
                  policies: policy.policies || [],
                },
                { transaction }
              );
            }
          }
        }
      }

      await transaction.commit();

      return {
        status: 201,
        body: {
          copiedChapters,
          copiedItems,
        },
      };
    } catch (error) {
      await transaction.rollback();
      console.error("Error copying chapters:", error);
      return {
        status: 500,
        message: error.message || "Failed to copy chapters",
      };
    }
  },

  // Get stories available for template selection
  getStoriesForTemplate: async () => {
    try {
      const stories = await Stories.findAll({
        where: {
          isDeleted: 0,
        },
      });

      const storiesWithCounts = [];

      for (const story of stories) {
        const chaptersCount = await ChapterMaster.count({
          where: {
            storyId: story.storyId,
            isDeleted: 0,
          },
        });

        const itemsCount = await ItemMaster.count({
          where: {
            storyId: story.storyId,
            is_deleted: 0,
          },
        });

        storiesWithCounts.push({
          storyId: story.storyId,
          storyName: story.storyName,
          description: story.description,
          chaptersCount: chaptersCount,
          itemsCount: itemsCount,
        });
      }

      return {
        status: 200,
        body: storiesWithCounts,
      };
    } catch (error) {
      console.error("Error fetching stories for template:", error);
      return {
        status: 500,
        message: "Failed to fetch stories",
      };
    }
  },

  // Get chapters from other stories for selection
  getChaptersFromOtherStories: async (currentStoryId) => {
    try {
      // First get all stories except the current one
      const stories = await Stories.findAll({
        where: {
          storyId: { [Op.ne]: currentStoryId },
          isDeleted: 0,
          isCustom: 0,
        },
      });

      // Then get chapters for each story
      const storiesWithChapters = [];

      for (const story of stories) {
        const chapters = await ChapterMaster.findAll({
          where: {
            storyId: story.storyId,
            isDeleted: 0,
          },
        });

        if (chapters.length > 0) {
          const chaptersWithItemCount = [];

          // Get item count for each chapter
          for (const chapter of chapters) {
            const itemCount = await ItemMaster.count({
              where: {
                chapterId: chapter.chapterId,
                is_deleted: 0,
              },
            });

            chaptersWithItemCount.push({
              chapterId: chapter.chapterId,
              chapterName: chapter.chapterName,
              description: chapter.description,
              itemsCount: itemCount,
            });
          }

          storiesWithChapters.push({
            storyId: story.storyId,
            storyName: story.storyName,
            chapters: chaptersWithItemCount,
          });
        }
      }

      return {
        status: 200,
        body: storiesWithChapters,
      };
    } catch (error) {
      console.error("Error fetching chapters from other stories:", error);
      return {
        status: 500,
        message: "Failed to fetch chapters",
      };
    }
  },

  getItemsFromOtherStories: async (itemRegEx, options = {}) => {
    try {
      const { onboardingOnly } = options;
      const onboardingClause = onboardingOnly
        ? "AND LOWER(TRIM(cm.chapterName)) = 'onboarding'"
        : "";
      // Use raw query to get items with their questions for better search results display
      const items = await sequelize.query(
        `
        SELECT 
            i.itemId,
            i.itemName,
            i.suggestions,
            i.sample_conversation,
            i.storyId,
            i.chapterId,
            i.createdAt,
            i.updatedAt,
            q.question,
            sm.storyName,
            cm.chapterName
        FROM items_masters i
        LEFT JOIN questions q ON i.itemId = q.itemId
        LEFT JOIN stories_masters sm on i.storyId=sm.storyId
        LEFT JOIN chapter_masters cm on i.chapterId=cm.chapterId
        WHERE i.itemName LIKE :itemRegEx
        AND i.is_deleted = 0
        AND i.isCustom = 0
        ${onboardingClause}
        ORDER BY i.itemName ASC
        LIMIT 20
        `,
        {
          replacements: { itemRegEx: `%${itemRegEx}%` },
          type: sequelize.QueryTypes.SELECT,
        }
      );

      return {
        status: 200,
        body: items,
      };
    } catch (error) {
      console.error("Error fetching items from other stories:", error);
      return {
        status: 500,
        message: "Failed to fetch items",
      };
    }
  },
};

export default storyCopyService;
