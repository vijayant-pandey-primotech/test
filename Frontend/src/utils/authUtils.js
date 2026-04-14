import Cookies from 'js-cookie';
import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.REACT_APP_ENCRYPTION_KEY;

export const encryptPassword = (password) => {
  return CryptoJS.AES.encrypt(password, SECRET_KEY).toString();
};

export const encryptEmail = (email) => {
  return CryptoJS.AES.encrypt(email, SECRET_KEY).toString();
};

export const setAuthTokens = (token, refreshToken) => {
  // Set tokens in cookies with expiration
  Cookies.set('adminToken', token, { expires: 7 }); // 7 days
  if (refreshToken) {
    Cookies.set('refreshToken', refreshToken, { expires: 7 });
  }
  
  // Also store token in localStorage for redundancy
  localStorage.setItem('adminToken', token);
};

export const clearAuthTokens = () => {
  // Remove cookies
  Cookies.remove('adminToken');
  Cookies.remove('refreshToken');
  
  // Clear localStorage
  localStorage.removeItem('adminToken');
  localStorage.removeItem('userEmail');
  localStorage.clear();
};

export const getAuthToken = () => {
  return Cookies.get('adminToken') || localStorage.getItem('adminToken');
}; 