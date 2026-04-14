import axiosInstance from 'utils/axiosConfig';
import { getAuthToken } from 'utils/authUtils';

const API_URL = process.env.REACT_APP_API_URL;

const contextConfigService = {
  getContextConfig: async () => {
    try {
      const response = await axiosInstance.get(`${API_URL}/context-config`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  saveContextConfig: async (seedData) => {
    try {
      const response = await axiosInstance.post(
        `${API_URL}/context-config`,
        { seed_data: seedData },
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

export default contextConfigService;