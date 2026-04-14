import axios from 'axios';
import { clearAuthTokens } from './authUtils';

// Create axios instance
const axiosInstance = axios.create();

// Add response interceptor
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
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

export default axiosInstance; 