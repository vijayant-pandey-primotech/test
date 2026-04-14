import axiosInstance from 'utils/axiosConfig';
import { getAuthToken } from 'utils/authUtils';

const API_URL = process.env.REACT_APP_API_URL;

const userService = {
  getUsers: async () => {
    try {
      const token = getAuthToken();
      const response = await axiosInstance.get(`${API_URL}/users-list`, {
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

export default userService; 