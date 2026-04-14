import { getAuthToken, clearAuthTokens } from "utils/authUtils";
import axios from "axios";
import axiosInstance from "utils/axiosConfig";

const API_URL_PLATFORM = process.env.REACT_APP_PLATFORM_API_URL;
// console.log("API_URL_PLATFORM:", API_URL_PLATFORM); // Add this for debugging

// Method 3: Create a separate axios instance for platform API
const platformAxiosInstance = axios.create({
  baseURL: API_URL_PLATFORM,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor for platform instance
platformAxiosInstance.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor for 401 handling
platformAxiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear all auth data
      clearAuthTokens();
      
      // Store session expired message in localStorage
      localStorage.setItem('sessionExpiredMessage', 'Session expired! Please login again.');
      
      // Redirect to login page
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  }
);

const platformService = {
  // Get all platforms using dedicated platformAxiosInstance
  getAllPlatforms: async () => {
    try {
      const response = await platformAxiosInstance.get("/platforms");
      return response.data;
    } catch (error) {
      console.error("Error fetching platforms:", error);
      throw error;
    }
  },

  // Save platform mappings using dedicated platformAxiosInstance
  savePlatformMappings: async (payload) => {
    try {
      const response = await platformAxiosInstance.post(
        "/platform-category-mapping/bulk",
        payload
      );
      return response.data;
    } catch (error) {
      console.error("Error saving platform mappings:", error);
      throw error;
    }
  },

  // Get existing platform mappings by platform ID
  getPlatformMappings: async (platformId) => {
    try {
      console.log(`Fetching platform mappings for platform ID: ${platformId}`);
      const response = await platformAxiosInstance.get(
        `/platform-category-mapping/${platformId}`
      );
      console.log("Platform mappings response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Error fetching platform mappings:", error);
      throw error;
    }
  },

  // Get platform by ID using dedicated platformAxiosInstance
  getPlatformById: async (platformId) => {
    try {
      const response = await platformAxiosInstance.get(
        `/platforms/${platformId}`
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching platform by ID:", error);
      throw error;
    }
  },

  // Create new platform using dedicated platformAxiosInstance
  createPlatform: async (platformData) => {
    try {
      const response = await platformAxiosInstance.post(
        "/add-platforms",
        platformData
      );
      return response.data;
    } catch (error) {
      console.error("Error creating platform:", error);
      throw error;
    }
  },

  // Update platform using dedicated platformAxiosInstance
  updatePlatform: async (id, platformData) => {
    try {
      const response = await platformAxiosInstance.put(
        `/platforms/${id}`,
        platformData
      );
      return response.data;
    } catch (error) {
      console.error("Error updating platform:", error);
      throw error;
    }
  },

  // Filter items by platform using dedicated platformAxiosInstance
  filterItemsByPlatform: async (platformId) => {
    try {
      const response = await platformAxiosInstance.post("/filter-platforms", {
        platformId,
      });
      return response.data;
    } catch (error) {
      console.error("Error filtering items by platform:", error);
      throw error;
    }
  },

  // Get stories by platforms using dedicated platformAxiosInstance
  getStoriesByPlatforms: async (platforms, includeInactive = false) => {
    try {
      const response = await platformAxiosInstance.post(
        "/stories-by-platforms",
        { platforms, includeInactive }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching stories by platforms:", error);
      throw error;
    }
  },
  getChaptersByPlatform: async(storyIds, platforms)=>{
    try {
      const response = await platformAxiosInstance.post(
        "/chapters-by-platform-stories",
        { storyIds, platforms }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching chapters by platform stories:", error);
      throw error;
    }
  },
  getItemsByPlatform: async(chapterIds, platforms)=>{
    try {
      const response = await platformAxiosInstance.post(
        "/items-by-platform-chapters",
        { chapterIds, platforms }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching items by platform chapters:", error);
      throw error;
    }
  },
  getItemsByPlatformChapters:async(chapterIds,platforms)=>{
    try {
      const response = await platformAxiosInstance.post(
        "/items-by-platform-chapters",
        { chapterIds, platforms }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching chapters by platform stories:", error);
      throw error;
    }
  },
  // Import Excel data using axiosInstance
  importExcelData: async (file) => {
    try {
      const formData = new FormData();
      formData.append("excelFile", file);

      const response = await axiosInstance.post(
        `${API_URL_PLATFORM}/import-excel`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${getAuthToken()}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  ExportStoryData: async (storyId) => {
    try {
      const response = await platformAxiosInstance.post(`/export-stories`, { storyIds: [storyId] },{ responseType: 'blob' });
      return response;
    } catch (error) {
      console.error("Error exporting story:", error);
      throw error;
    }
  },

  // ============================================
  // Activities CRUD Operations
  // ============================================
  getActivities: async (platformId = null) => {
    try {
      const params = platformId ? { platformId } : {};
      const response = await platformAxiosInstance.get("/activities", { params });
      return response.data;
    } catch (error) {
      console.error("Error fetching activities:", error);
      throw error;
    }
  },

  createActivity: async (activityData) => {
    try {
      const response = await platformAxiosInstance.post("/activities", activityData);
      return response.data;
    } catch (error) {
      console.error("Error creating activity:", error);
      throw error;
    }
  },

  updateActivity: async (id, activityData) => {
    try {
      const response = await platformAxiosInstance.put(`/activities/${id}`, activityData);
      return response.data;
    } catch (error) {
      console.error("Error updating activity:", error);
      throw error;
    }
  },

  deleteActivity: async (id) => {
    try {
      const response = await platformAxiosInstance.delete(`/activities/${id}`);
      return response.data;
    } catch (error) {
      console.error("Error deleting activity:", error);
      throw error;
    }
  },

  updateActivityOrder: async (platformId, activities) => {
    try {
      const response = await platformAxiosInstance.put("/activities/update-order", {
        platformId,
        activities,
      });
      return response.data;
    } catch (error) {
      console.error("Error updating activity order:", error);
      throw error;
    }
  },

  // ============================================
  // Platform Tasks CRUD Operations
  // ============================================
  getPlatformTasks: async (platformId = null, ActivityId = null) => {
    try {
      const params = platformId ? { platformId } : {};
      if (ActivityId) {
        params.ActivityId = ActivityId;
      }
      const response = await platformAxiosInstance.get("/platform-tasks", { params});
      return response.data;
    } catch (error) {
      console.error("Error fetching platform tasks:", error);
      throw error;
    }
  },

  createPlatformTask: async (taskData) => {
    try {
      const response = await platformAxiosInstance.post("/platform-tasks", taskData);
      return response.data;
    } catch (error) {
      console.error("Error creating platform task:", error);
      throw error;
    }
  },

  updatePlatformTask: async (id, taskData) => {
    try {
      const response = await platformAxiosInstance.put(`/platform-tasks/${id}`, taskData);
      return response.data;
    } catch (error) {
      console.error("Error updating platform task:", error);
      throw error;
    }
  },

  deletePlatformTask: async (id) => {
    try {
      const response = await platformAxiosInstance.delete(`/platform-tasks/${id}`);
      return response.data;
    } catch (error) {
      console.error("Error deleting platform task:", error);
      throw error;
    }
  },

  updatePlatformTaskOrder: async (tasks) => {
    try {
      const response = await platformAxiosInstance.put("/platform-tasks/update-order", { tasks });
      return response.data;
    } catch (error) {
      console.error("Error updating platform task order:", error);
      throw error;
    }
  },
};

export default platformService;
