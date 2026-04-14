import React, { useCallback } from 'react';
import { Toast as ReactstrapToast } from 'reactstrap';

const Toast = ({ 
  isOpen, 
  message, 
  type = "success", 
  position = "top", 
  onClose,
  autoHide = true,
  autoHideDelay = 2000 
}) => {
  // Memoize the onClose function to prevent stale closures
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // Auto hide functionality
  React.useEffect(() => {
    if (isOpen && autoHide && onClose) {
      const timer = setTimeout(() => {
        handleClose();
      }, autoHideDelay);
      
      return () => {
        clearTimeout(timer);
      };
    }
  }, [isOpen, autoHide, autoHideDelay, handleClose]);

  // Position styles
  const getPositionStyles = () => {
    const baseStyles = {
      position: "fixed",
      zIndex: 10000,
      minWidth: "350px",
      maxWidth: "450px",
    };

    switch (position) {
      case "top":
        return {
          ...baseStyles,
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
        };
      case "top-right":
        return {
          ...baseStyles,
          top: "20px",
          right: "20px",
        };
      case "top-left":
        return {
          ...baseStyles,
          top: "20px",
          left: "20px",
        };
      case "bottom":
        return {
          ...baseStyles,
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
        };
      case "bottom-right":
        return {
          ...baseStyles,
          bottom: "20px",
          right: "20px",
        };
      case "bottom-left":
        return {
          ...baseStyles,
          bottom: "20px",
          left: "20px",
        };
      default:
        return {
          ...baseStyles,
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
        };
    }
  };

  // Get icon based on type
  const getIcon = () => {
    switch (type) {
      case "success":
        return "ni-check-bold";
      case "error":
      case "danger":
        return "ni-alert-circle";
      case "warning":
        return "ni-alert-circle";
      case "info":
        return "ni-info";
      default:
        return "ni-check-bold";
    }
  };

  // Get color based on type
  const getColor = () => {
    switch (type) {
      case "success":
        return "#2dce89";
      case "error":
      case "danger":
        return "#f5365c";
      case "warning":
        return "#fb6340";
      case "info":
        return "#11cdef";
      default:
        return "#2dce89";
    }
  };

  if (!isOpen) return null;

  return (
    <div style={getPositionStyles()}>
      <ReactstrapToast
        isOpen={isOpen}
        className="bg-white shadow-lg border-0"
        style={{
          borderLeft: `4px solid ${getColor()}`,
          borderRadius: "0.375rem",
          boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.15)",
        }}
      >
        <div className="d-flex align-items-center p-3">
          <div className="mr-3">
            <i
              className={`ni ${getIcon()}`}
              style={{
                color: getColor(),
                fontSize: "1.5rem",
              }}
            />
          </div>
          <div className="flex-grow-1">
            <p
              className="mb-0 font-weight-bold"
              style={{
                color: getColor(),
                fontSize: "1rem",
                lineHeight: "1.5",
              }}
            >
              {message}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              className="close ml-3"
              onClick={handleClose}
              style={{
                fontSize: "1.25rem",
                color: "#8898aa",
                background: "none",
                border: "none",
                padding: "0",
                cursor: "pointer",
              }}
            >
              <span aria-hidden="true">&times;</span>
            </button>
          )}
        </div>
      </ReactstrapToast>
    </div>
  );
};

export default Toast;