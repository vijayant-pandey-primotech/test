import axiosInstance from 'utils/axiosConfig';
import { getAuthToken } from 'utils/authUtils';
const API_URL = process.env.REACT_APP_API_URL;

const assistantService = {

  getAssistantsList: async (platformId = null) => {
    // If no platform ID or "all" is selected, get all assistants
    if (!platformId || platformId === "all") {
      try {
        const response = await axiosInstance.get(`${API_URL}/assistants`, {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`
          }
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    } else {
      // If specific platform ID is provided, get assistants for that platform
      try {
        
        const response = await axiosInstance.get(`${API_URL}/assistant-by-platform/${platformId}`,{
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`
          }
        });
        return response.data;
      } catch (error) {
        throw error;
      }
    }
  },
  getArticlesList: async () => {
    try {
      const response = await axiosInstance.get(`${API_URL}/articles`,{
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      console.log(response.data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  getAssistantById: async (id) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/assistants/${id}`);
      return response;
    } catch (error) {
      throw error;
    }
  },
  getArticleById: async (id) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/article/${id}`,{
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      console.log('getArticleById response:', response);
      return response;
    } catch (error) {
      throw error;
    }
  },
  createAssistant: async (data) => {
    try {
      const response = await axiosInstance.post(`${API_URL}/assistant`, data,{
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  updateAssistantById: async (id, data) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/update/assistant/${id}`, data,{
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  updateArticleById: async (id, data) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/update/article/${id}`, data,{
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  createArticle: async (data) => {
    try {
      const response = await axiosInstance.post(`${API_URL}/article`, data,{
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  getPolicies: async (id) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/policies-list/${id}`,{
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response.data.body[0];
    } catch (error) {
      throw error;
    }
  },
  deleteAssistantById: async (id) => {
    try {
      const response = await axiosInstance.delete(`${API_URL}/assistant/${id}`,{
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  deleteArticleById: async (id) => {
    try {
      const response = await axiosInstance.delete(`${API_URL}/article/${id}`,{
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  getStoriesList: async () => {
    try {
      const response = await axiosInstance.get(`${API_URL}/story-list`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  getChaptersList: async (storyId) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/chapters-list/${storyId}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  getAssistantbyPlatform: async (platformIds) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/assistant-by-platform`, {
        params: {
          platformIds: platformIds
        },
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  updateAssistantSequence: async (assistants) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/update-assistant-sequence`, {
        assistants: assistants
      }, {
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
  updateAssistant: async (id, data) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/update/assistant/${id}`, data, {
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
  updateAssistantDependencies: async (id, prerequisite_agents) => {
    try {
      const response = await axiosInstance.put(`${API_URL}/assistant/${id}/dependencies`, {
        prerequisite_agents: prerequisite_agents
      }, {
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
  getActivitiesByPlatformId: async (platformId) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/${platformId}/activities`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export default assistantService; 