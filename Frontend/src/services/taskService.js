import axiosInstance from '../utils/axiosConfig';
import { getAuthToken } from '../utils/authUtils';

const API_URL = process.env.REACT_APP_API_URL;

const taskService = {
  // Task template operations
  getAllTasks: async () => {
    try {
      const response = await axiosInstance.get(`${API_URL}/tasks/tasks`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getTaskById: async (taskId) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/tasks/task/${taskId}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  createTask: async (taskData) => {
    try {
      const response = await axiosInstance.post(`${API_URL}/tasks/task`, taskData, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateTask: async (taskId, taskData) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/tasks/task/${taskId}`, taskData, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteTask: async (taskId) => {
    try {
      const response = await axiosInstance.delete(`${API_URL}/tasks/task/${taskId}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Widget operations for tasks
  createTaskWidget: async (widgetData) => {
    try {
      const response = await axiosInstance.post(`${API_URL}/tasks/task-widget`, widgetData, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getTaskWidgetMappings: async (taskIds) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/tasks/widget-mappings`, {
        params: { taskIds: Array.isArray(taskIds) ? taskIds.join(',') : taskIds },
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateTaskWidget: async (mappingId, widgetData) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/tasks/task-widget/${mappingId}`, widgetData, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteTaskWidget: async (mappingId) => {
    try {
      const response = await axiosInstance.delete(`${API_URL}/tasks/task-widget/${mappingId}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

};

export default taskService; 