import axiosInstance from 'utils/axiosConfig';
import { getAuthToken } from '../utils/authUtils';
const API_URL = process.env.REACT_APP_API_URL;

const apiLogsService = {
  // User activity (timeline, progress, next step). If your backend uses get-api-logs for this shape, use: get-api-logs/${userId}
  getUserActivity: async (userId) => {
    try {
      const url = `${API_URL}/get-api-logs/${userId}`;
      const response = await axiosInstance.get(url, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  getApiLogsByUserId: async (userId, filters = {}) => {
    try {
      const { startDate, endDate, timeRange } = filters;
      const params = new URLSearchParams();
      
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (timeRange) params.append('timeRange', timeRange);
      
      const queryString = params.toString();
      const url = `${API_URL}/get-api-logs/${userId}${queryString ? `?${queryString}` : ''}`;
      
      const response = await axiosInstance.get(url, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      return response;
    } catch (error) {
      throw error;
    }
  }
};

export default apiLogsService;
