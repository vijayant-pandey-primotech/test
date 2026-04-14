import axiosInstance from "utils/axiosConfig";
import { getAuthToken } from "utils/authUtils";
const API_URL = process.env.REACT_APP_API_URL;
const API_PLATFORM_URL = process.env.REACT_APP_PLATFORM_API_URL;

const storyService = {
  // Get all stories
  getStoriesList: async () => {
    try {
      const response = await axiosInstance.get(`${API_URL}/story-list`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get story by ID
  getStoryById: async (storyId) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/story/${storyId}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create new story
  createStory: async (storyData) => {
    try {
      const response = await axiosInstance.post(
        `${API_PLATFORM_URL}/add-platform-stories`,
        storyData,
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update story
  updateStory: async (storyId, storyData) => {
    try {
      const response = await axiosInstance.put(
        `${API_URL}/story/${storyId}`,
        storyData,
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete story
  deleteStory: async (storyId) => {
    try {
      const response = await axiosInstance.delete(
        `${API_URL}/story/${storyId}`,
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Copy story
  copyStory: async (sourceStoryId, newStoryName, description) => {
    try {
      const response = await axiosInstance.post(
        `${API_URL}/story/copy`,
        {
          sourceStoryId,
          newStoryName,
          description,
          copyMode: 'full'
        },
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get stories for template selection
  getStoriesForTemplate: async () => {
    try {
      const response = await axiosInstance.get(
        `${API_URL}/stories/templates`,
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Copy chapters to existing story
  copyChaptersToStory: async (storyId, sourceStoryId, chapterIds, copyItems = true) => {
    try {
      const response = await axiosInstance.post(
        `${API_URL}/story/${storyId}/copy-chapters`,
        {
          sourceStoryId,
          chapterIds,
          copyItems
        },
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get chapters from other stories
  getChaptersFromOtherStories: async (storyId) => {
    try {
      const response = await axiosInstance.get(
        `${API_URL}/chapters/from-other-stories/${storyId}`,
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

export default storyService;
