import axiosInstance from 'utils/axiosConfig';
import { getAuthToken } from 'utils/authUtils';
const API_PLATFORM_URL = process.env.REACT_APP_PLATFORM_API_URL;
const API_URL = process.env.REACT_APP_API_URL;

const chapterService = {
  // Get chapters by story ID
  getChaptersList: async (storyId) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/chapters-list/${storyId}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get chapter by ID
  getChapterById: async (chapterId) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/chapter/${chapterId}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create new chapter
  createChapter: async (chapterData) => {
    try {
      const response = await axiosInstance.post(`${API_PLATFORM_URL}/add-platform-chapters`, chapterData, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update chapter
  updateChapter: async (chapterId, chapterData) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/chapter-edit/${chapterId}`, chapterData, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete chapter
  deleteChapter: async (chapterId) => {
    try {
      const response = await axiosInstance.delete(`${API_URL}/chapter-delete/${chapterId}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update chapter sequence
  updateChapterSequence: async (chapterId, sequence) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/chapter/${chapterId}/sequence`, 
        { sequence }, 
        {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Bulk update chapter sequences
  updateChapterSequences: async (chapters) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/chapters/sequences`, 
        { chapters }, 
        {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export default chapterService;