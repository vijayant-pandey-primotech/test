import axios from "axios";
import { getAuthToken, clearAuthTokens } from "../utils/authUtils";

// Create axios instance for widget API calls
const widgetAxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:3001/api",
  timeout: 10000,
});

// Request interceptor to add auth token
widgetAxiosInstance.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
widgetAxiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("Widget API Error:", error);
    
    // Handle 401 Unauthorized - redirect to login
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

const widgetService = {
  // Get all widgets with optional filters
  getAllWidgets: async () => {
    try {
      const response = await widgetAxiosInstance.get(`/widgets`);
      return response.data;
    } catch (error) {
      console.error("Error fetching widgets:", error);
      throw error;
    }
  },

  // Get widget by ID
  getWidgetById: async (id) => {
    try {
      const response = await widgetAxiosInstance.get(`/widgets/${id}`);
      return response.data;
    } catch (error) {
      console.error("Error fetching widget by ID:", error);
      throw error;
    }
  },

  // Create new widget
  createWidget: async (widgetData) => {
    try {
      const response = await widgetAxiosInstance.post("/widgets", widgetData);
      return response.data;
    } catch (error) {
      console.error("Error creating widget:", error);
      throw error;
    }
  },

  // Update widget
  updateWidget: async (id, widgetData) => {
    try {
      const response = await widgetAxiosInstance.put(`/widgets/${id}`, widgetData);
      return response.data;
    } catch (error) {
      console.error("Error updating widget:", error);
      throw error;
    }
  },

  // Delete widget (soft delete)
  deleteWidget: async (id) => {
    try {
      const response = await widgetAxiosInstance.delete(`/widgets/${id}`);
      return response.data;
    } catch (error) {
      console.error("Error deleting widget:", error);
      throw error;
    }
  },
  // Toggle widget status (active/inactive)
  toggleWidgetStatus: async (id) => {
    try {
      const response = await widgetAxiosInstance.patch(`/widgets/${id}/toggle-status`);
      return response.data;
    } catch (error) {
      console.error("Error toggling widget status:", error);
      throw error;
    }
  }
};

export default widgetService;
