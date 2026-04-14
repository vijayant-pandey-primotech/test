import React from 'react';
import { Navigate } from 'react-router-dom';
import { getAuthToken } from 'utils/authUtils';

const ProtectedRoute = ({ children }) => {
  const token = getAuthToken();
  
  if (!token) {
    return <Navigate to="/auth/login" replace />;
  }

  return children;
};

export default ProtectedRoute; 