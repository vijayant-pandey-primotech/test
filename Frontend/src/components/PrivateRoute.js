import React from 'react';
import { Navigate } from 'react-router-dom';

const PrivateRoute = ({ children }) => {
  // Check if user is authenticated
  const isAuthenticated = localStorage.getItem('adminToken'); // or however you store your auth token

  if (!isAuthenticated) {
    // Redirect to login if not authenticated
    return <Navigate to="/auth/login" replace />;
  }

  return children;
};

export default PrivateRoute; 