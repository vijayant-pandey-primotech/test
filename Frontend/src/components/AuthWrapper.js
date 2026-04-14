import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from 'utils/authUtils';

const AuthWrapper = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    // Small delay to ensure all auth checks are complete
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return null; // or a loading spinner if you prefer
  }

  // If trying to access admin routes without auth
  if (location.pathname.startsWith('/admin') && !isAuthenticated()) {
    return <Navigate to="/auth/login" replace />;
  }

  // If authenticated and trying to access auth routes
  if (location.pathname.startsWith('/auth') && isAuthenticated()) {
    return <Navigate to="/admin/user-details" replace />;
  }

  return children;
};

export default AuthWrapper; 