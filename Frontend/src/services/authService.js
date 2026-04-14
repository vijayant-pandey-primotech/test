import axiosInstance from 'utils/axiosConfig';

const API_URL = process.env.REACT_APP_API_URL;

const authService = {
  login: async (credentials) => {
    try {
      const response = await axiosInstance.post(`${API_URL}/login`, credentials);
      return response;
    } catch (error) {
      throw error;
    }
  }
};

export default authService; 