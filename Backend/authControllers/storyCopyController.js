import storyCopyService from '../services/storyCopyService.js';
import { invalidateChaptersCache, invalidateItemsCache } from '../config/redisAdminCache.js';

// Copy entire story
export const copyStory = async (req, res) => {
  try {
    const { sourceStoryId, newStoryName, description, copyMode } = req.body;

    if (!sourceStoryId || !newStoryName) {
      return res.status(400).json({
        status: 400,
        message: 'Source story ID and new story name are required'
      });
    }

    const result = await storyCopyService.copyStoryFull(sourceStoryId, {
      storyName: newStoryName,
      description
    });

    if (result.status === 200 || result.status === 201) {
      await invalidateChaptersCache();
      await invalidateItemsCache();
    }
    res.status(result.status).json(result);

  } catch (error) {
    console.error('Error in copyStory controller:', error);
    res.status(500).json({
      status: 500,
      message: 'Internal server error'
    });
  }
};

// Get stories for template selection
export const getStoriesForTemplate = async (req, res) => {
  try {
    const result = await storyCopyService.getStoriesForTemplate();
    res.status(result.status).json(result);

  } catch (error) {
    console.error('Error in getStoriesForTemplate controller:', error);
    res.status(500).json({
      status: 500,
      message: 'Internal server error'
    });
  }
};

// Copy chapters to existing story
export const copyChaptersToStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { sourceStoryId, chapterIds, copyItems = true } = req.body;

    if (!sourceStoryId || !chapterIds || !Array.isArray(chapterIds)) {
      return res.status(400).json({
        status: 400,
        message: 'Source story ID and chapter IDs array are required'
      });
    }

    const result = await storyCopyService.copyChaptersToStory(
      parseInt(storyId),
      sourceStoryId,
      chapterIds,
      copyItems
    );

    if (result.status === 200 || result.status === 201) {
      await invalidateChaptersCache();
      await invalidateItemsCache();
    }
    res.status(result.status).json(result);

  } catch (error) {
    console.error('Error in copyChaptersToStory controller:', error);
    res.status(500).json({
      status: 500,
      message: 'Internal server error'
    });
  }
};

// Get chapters from other stories
export const getChaptersFromOtherStories = async (req, res) => {
  try {
    const { storyId } = req.params;

    const result = await storyCopyService.getChaptersFromOtherStories(parseInt(storyId));
    res.status(result.status).json(result);

  } catch (error) {
    console.error('Error in getChaptersFromOtherStories controller:', error);
    res.status(500).json({
      status: 500,
      message: 'Internal server error'
    });
  }
};

export const getItemsFromOtherStories = async (req, res) => {
  try {
    const { itemRegEx, onboardingOnly } = req.query;
    
    if (!itemRegEx) {
      return res.status(400).json({
        status: 400,
        message: 'itemRegEx parameter is required'
      });
    }

    const result = await storyCopyService.getItemsFromOtherStories(itemRegEx, {
      onboardingOnly: onboardingOnly === 'true' || onboardingOnly === '1',
    });
    
    res.status(result.status).json(result);
  } catch (error) {
    console.error('Error in getItemsFromOtherStories controller:', error);
    res.status(500).json({
      status: 500,
      message: 'Internal server error'
    });
  }
};