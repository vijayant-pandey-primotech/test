import { useState } from 'react';

const useToast = () => {
  const [toast, setToast] = useState({
    isOpen: false,
    message: "",
    type: "success",
    position: "top",
  });

  const showToast = (message, type = "success", position = "top") => {
    setToast({
      isOpen: true,
      message,
      type,
      position,
    });
  };

  const hideToast = () => {
    setToast(prev => ({
      ...prev,
      isOpen: false,
      message: "",
    }));
  };

  const showSuccess = (message, position = "top") => {
    showToast(message, "success", position);
  };

  const showError = (message, position = "top") => {
    showToast(message, "error", position);
  };

  const showWarning = (message, position = "top") => {
    showToast(message, "warning", position);
  };

  const showInfo = (message, position = "top") => {
    showToast(message, "info", position);
  };

  return {
    toast,
    showToast,
    hideToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
};

export default useToast;