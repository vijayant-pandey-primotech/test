import axiosInstance from 'utils/axiosConfig';
import { getAuthToken } from 'utils/authUtils';
const API_URL = process.env.REACT_APP_API_URL;
const token = getAuthToken();
const storyImageService = {
  getStoriesWithImages: async () => {
    try {
      const response = await axiosInstance.get(`${API_URL}/stories-with-images`,{
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  uploadStoryImage: async (formData, subCategoryId) => {
    try {
      console.log(formData, "=============================formData");
      console.log(subCategoryId, "=============================subCategoryId");
      const response = await axiosInstance.put(`${API_URL}/upload-story-image/${subCategoryId}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  uploadChapterImage: async (formData, chapterId, storyId,chapterName) => {
    try {
      console.log(formData, "=============================chapter formData");
      console.log(chapterId, "=============================chapterId");
      console.log(storyId, "=============================storyId");
      console.log(chapterName, "=============================chapterName");
      // Add storyId to FormData if provided
      if (storyId && chapterName) {
        formData.append('storyId', storyId);
        formData.append('chapterName', chapterName);
      }
      
      const response = await axiosInstance.put(`${API_URL}/upload-chapter-image/${chapterId}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  getChaptersListForPersonal: async () => {
    try {
      const response = await axiosInstance.get(`${API_URL}/chapters-list-for-personal`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export default storyImageService; 