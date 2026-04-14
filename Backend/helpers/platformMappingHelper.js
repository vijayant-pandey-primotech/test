import Item from '../model/itemMaster.js';
import Chapter from '../model/chapterMaster.js';
import Story from '../model/storiesMasters.js';
import Platform from '../model/platform.js';
import StoriesSubCategory from '../model/storiesSubCategory.js';
import sequelize from '../config/db.js';


export const createPlatforms = async (platform) => {
  return await Platform.create(platform);
};

export const getPlatforms = async () => {
  return await Platform.findAll({
    where: { isDeleted: 0 },
    order: [['id', 'DESC']],
  });
};



export const createStory = async (story) => {
  const { storyName, subcategoryName,description } = story;

  let transaction; 
  try {
   
    transaction = await sequelize.transaction();
    
    const storyData = await Story.create({
      storyName,
      description
    }, { transaction });
    
    if (!storyData.storyId) {
      throw new Error("Failed to create story (missing storyId)");
    }

    const subcategory = await StoriesSubCategory.create({
      subCategoryName: subcategoryName ? subcategoryName : storyName,
      storyId: storyData.storyId,
    }, { transaction });

    if (!subcategory.subCategoryId) { // Assuming casing from your code
      throw new Error("Failed to create subcategory (missing subCategoryId)");
    }
    // Commit transaction if used
    await transaction.commit();

    return {
      data: {
        story: storyData,
        subCategory: subcategory, // Consistent naming
      },
      error: null,
    };
  } catch (err) {
    // Rollback transaction if used
    if (transaction) await transaction.rollback();
    console.error("Error creating story:", err); // Log for debugging
    return { data: null, error: err.message || "Not able to create story this time, please try again later" };
  }
};

export const createChapter = async (chapter) => {
  const { chapterName, storyId, description, isDynamic, icon } = chapter;
  const sequence = await Chapter.max('sequence', { where: { storyId: storyId } });
  // console.log(sequence,'=========================================== sequence');
  const chapterData = await Chapter.create({
    chapterName,
    storyId,
    description: description || "",
    isDynamic: isDynamic ? 1 : 0,
    icon: icon || null, // Include icon if provided
    sequence: sequence + 1
  });

  if (!chapterData.chapterId) {
    throw new Error("Failed to create chapter (missing chapterId)");
  }

  return {
    data: chapterData,
    error: null,
  };
};


export const removePlatforms = async (id) => {
    return await Platform.update({isDeleted: 1}, {where: {id: id}});
  };


  export const transformPlatform = (platform) => {
    const item = platform.items_master;
    // Take the first question, if present
    const question = item?.question;

    return {
      platformId: platform.platformId,
      platformName: platform.Platform.name,
      itemId: item?.itemId,
      itemName: item?.itemName,
      suggestions: item?.suggestions,
      sequence: item?.sequence,
      isCustom: item?.isCustom,
      is_deleted: item?.is_deleted,
      createdAt: item?.createdAt,
      updatedAt: item?.updatedAt,
      sample_conversation: item?.sample_conversation,
      storyId: platform.stories_master?.storyId,
      storyName: platform.stories_master?.storyName,
      chapterId: platform.chapter_master?.chapterId,
      chapterName: platform.chapter_master?.chapterName,
      question: question?.question || null,
      questionId: question?.questionId || null
    };
  };
  

//  For item-based mappings
export const resolveItemMappings = async (platformId, itemIds) => {
    if (!itemIds || itemIds.length === 0) return [];
  
    const items = await Item.findAll({
      where: { itemId: itemIds },
      include: {
        model: Chapter,
        include: {
          model: Story
        }
      }
    });
  
    return items
      .filter((item) => item.chapter_master && item.chapter_master.stories_master)
      .map((item) => ({
        platformId,
        storyId: item.chapter_master.stories_master.storyId,
        chapterId: item.chapter_master.chapterId,
        itemId: item.itemId,
        isActive: true
      }));
  };
  

//  For full-chapter mappings
export const resolveChapterMappings = async (platformId, chapterIds) => {
    if (!chapterIds || chapterIds.length === 0) return [];
  
    const chapters = await Chapter.findAll({
      where: { chapterId: chapterIds },
      include: {
        model: Story
      }
    });
  
    return chapters
      .filter((ch) => ch.stories_master)
      .map((ch) => ({
        platformId,
        storyId: ch.stories_master.storyId,
        chapterId: ch.chapterId,
        itemId: null,
        isActive: true
      }));
  };
  