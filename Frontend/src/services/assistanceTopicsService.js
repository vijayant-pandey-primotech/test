import axiosInstance from '../utils/axiosConfig';
import { getAuthToken } from '../utils/authUtils';
import api from '../utils/axiosConfig';

const API_URL = process.env.REACT_APP_ASS_API_URL;

const assistanceTopicsService = {
  // Get all assistance topics
  getAllTopics: async () => {
    try {
      const token = getAuthToken();
    //   console.log(token,'khaksjhkashkashksahkj')
      const response = await axiosInstance.get(`${API_URL}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('response:', response);
      console.log('response.data:', response.data);
      console.log('response.data.body:', response?.data?.body);
      console.log('response.data.body.data:', response?.data?.body?.data);
      // Return only the array of topics
      return response?.data?.body?.data || response?.data?.data || [];
    } catch (error) {
      throw error;
    }
  },

  // Get a single topic by ID
  getTopicById: async (id) => {
    try {
      const token = getAuthToken();
      const response = await axiosInstance.get(`${API_URL}/assistance-topics/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create a new topic
  createTopic: async (topicData) => {
    try {
      const token = getAuthToken();
      const response = await axiosInstance.post(`${API_URL}`, topicData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('Create topic response:', response);
      return response.data;
    } catch (error) {
      console.error('Error creating topic:', error);
      throw error;
    }
  },

  // Update an existing topic
  updateTopic: async (id, topicData) => {
    try {
      const token = getAuthToken();
      const response = await axiosInstance.put(`${API_URL}/${id}`, topicData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('Update topic response:', response);
      return response.data;
    } catch (error) {
      console.error('Error updating topic:', error);
      throw error;
    }
  },

  // Delete a topic
  deleteTopic: async (id) => {
    try {
      const token = getAuthToken();
      const response = await api.delete(`${API_URL}/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export default assistanceTopicsService; 