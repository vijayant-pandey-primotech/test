import axiosInstance from "utils/axiosConfig";
import { getAuthToken } from "utils/authUtils";

const API_URL = process.env.REACT_APP_API_URL;

const promptService = {
  getPromptTypes: async () => {
    try {
      const response = await axiosInstance.get(`${API_URL}/prompt-types`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getPromptTypeLookupList: async () => {
    try {
      const response = await axiosInstance.get(`${API_URL}/prompt-type-lookup`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  createPromptTypeLookup: async (payload) => {
    try {
      const response = await axiosInstance.post(`${API_URL}/prompt-type-lookup`, payload, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updatePromptTypeLookup: async (id, payload) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/prompt-type-lookup/${id}`, payload, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getAllPrompts: async (params = {}) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/prompts`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        params,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /** All versions (same pattern) for edit modal — includes unpublished. */
  getPromptVersions: async (id) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/prompts/${id}/versions`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  createPrompt: async (payload) => {
    try {
      const response = await axiosInstance.post(`${API_URL}/prompts`, payload, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updatePrompt: async (id, payload) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/prompts/${id}`, payload, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updatePromptPublishStatus: async (id, isPublished) => {
    try {
      const response = await axiosInstance.post(
        `${API_URL}/prompts/${id}/publish-status`,
        { is_published: isPublished ? 1 : 0 },
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

  deletePrompt: async (id) => {
    try {
      const response = await axiosInstance.delete(`${API_URL}/prompts/${id}`, {
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

export default promptService;
