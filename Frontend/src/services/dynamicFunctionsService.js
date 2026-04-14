import axiosInstance from 'utils/axiosConfig';
import { getAuthToken } from 'utils/authUtils';
const API_URL = process.env.REACT_APP_API_URL;

const dynamicFunctionsService = {
  getDynamicFunctions: async () => {
    try {
      const response = await axiosInstance.get(`${API_URL}/get-dynamic-functions`,{
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  requestDynamicFunction: async (data) => {
    try {
      const response = await axiosInstance.post(`${API_URL}/request-dynamic-function`, data, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  getDynamicFunctionById: async (id) => {
    try {
      const response = await axiosInstance.get(`${API_URL}/get-dynamic-function/${id}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  },
  deleteDynamicFunction: async (id) => {
    try {
      const response = await axiosInstance.delete(`${API_URL}/delete-dynamic-function/${id}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      return response;
    } catch (error) {
      throw error;
    }
  }
};

export default dynamicFunctionsService; 