import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  Container,
  Row,
  Form,
  FormGroup,
  Input,
  Button,
  Label,
  Col,
  CardBody,
  Badge,
  Alert,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Table,
  Toast,
  ToastHeader,
  ToastBody,
} from "reactstrap";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { IoClose } from "react-icons/io5";
import { FaGripVertical, FaTrash } from "react-icons/fa";
import { IoCheckmarkCircle } from "react-icons/io5";
import { BsArrowRight } from "react-icons/bs";
import axiosInstance from "utils/axiosConfig";
import { getAuthToken } from "utils/authUtils";
import assistantService from "../../services/assistantService";
import { useNavigate, useParams, useLocation } from "react-router-dom";

// Custom styles for consistent UI
const styles = `
  /* Form control styles */
  .form-control-alternative {
    color: #000000 !important;
  }
  .form-control-alternative::placeholder {
    color: #8898aa !important;
  }
  .form-control-alternative:focus {
    color: #000000 !important;
  }

  /* Custom button styles */
  .btn-custom-primary {
    background-color: #3A6D8C !important;
    border-color: #3A6D8C !important;
    color: white !important;
  }
  .btn-custom-primary:hover {
    background-color: #2d5670 !important;
    border-color: #2d5670 !important;
    color: white !important;
  }
  .btn-custom-primary:disabled {
    background-color: #3A6D8C !important;
    border-color: #3A6D8C !important;
    opacity: 0.65 !important;
  }

  /* Selection styles */
  .selection-container {
    border: 1px solid #e9ecef;
    border-radius: 0.25rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .selected-item {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 0.25rem;
    padding: 0.5rem;
    margin: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .drag-handle {
    cursor: grab;
    color: #8898aa;
    margin-right: 0.5rem;
  }

  .remove-button {
    color: #dc3545;
    cursor: pointer;
    padding: 0.25rem;
  }

  .preview-section {
    background: #f8f9fa;
    border-radius: 0.25rem;
    padding: 1rem;
    margin-top: 1rem;
  }

  /* Updated selection styles */
  .selection-box {
    border: 1px solid #e9ecef;
    border-radius: 0.5rem;
    padding: 1.25rem;
    margin-bottom: 1rem;
    background: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    height: 400px;
    display: flex;
    flex-direction: column;
  }

  .selection-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e9ecef;
    flex-shrink: 0;
  }

  .selection-title {
    font-size: 1rem;
    font-weight: 600;
    color: #32325d;
    margin: 0;
  }

  .selection-count {
    background: #e9ecef;
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.875rem;
    color: #525f7f;
  }

  .selection-search {
    margin-bottom: 1rem;
    flex-shrink: 0;
  }

  .selection-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0.75rem 0.5rem 0.5rem;
    position: relative;
  }

  .selection-item {
    display: flex;
    align-items: flex-start;
    padding: 0.75rem;
    border-radius: 0.25rem;
    margin-bottom: 0.5rem;
    transition: background-color 0.2s;
    word-break: break-word;
    background: white;
  }

  .selection-item:hover {
    background-color: #f8f9fa;
  }

  .selection-item input[type="checkbox"] {
    margin: 0;
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin-top: 0.25rem;
    margin-right: 12px; /* Fixed margin for checkbox */
  }

  .selection-item-content {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    padding-right: 0.5rem;
    display: flex;
    margin-left: 20px;
    flex-direction: column;
  }

  .selection-item label {
    margin: 0;
    cursor: pointer;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 0.5rem;
  }

  .chapter-story-name {
    font-size: 0.75rem;
    color: #8898aa;
    margin-top: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: 0.5rem;
  }

  .selection-empty {
    text-align: center;
    padding: 1rem;
    color: #8898aa;
    font-style: italic;
  }

  /* Row styles to ensure equal height columns */
  .selection-row {
    display: flex;
    flex-wrap: wrap;
    margin: 0 -0.75rem;
  }

  .selection-col {
    padding: 0 0.75rem;
    margin-bottom: 1rem;
  }

  /* Custom scrollbar - moved to the right */
  .selection-list::-webkit-scrollbar {
    width: 8px;
  }

  .selection-list::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
    margin: 0.5rem 0;
  }

  .selection-list::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
    border: 2px solid #f1f1f1;
  }

  .selection-list::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }

  /* Form validation styles */
  .form-control-alternative.is-invalid {
    border-color: #f5365c !important;
    box-shadow: 0 0 0 0.2rem rgba(245, 54, 92, 0.25) !important;
  }
  
  .invalid-feedback {
    display: block !important;
    color: #f5365c;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  /* Image selection styles */
  .image-selection-container {
    margin-top: 1rem;
  }

  .image-option {
    position: relative;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .image-option.selected {
    transform: scale(1.02);
  }

  .selected-overlay {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .custom-image-upload {
    transition: all 0.3s ease;
  }

  .custom-image-upload:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
  }

  .dimension-requirement {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #f8f9fa;
    border-radius: 0.375rem;
    border: 1px solid #e9ecef;
    margin-bottom: 1rem;
  }

  .dimension-requirement i {
    color: #3A6D8C;
    font-size: 1.1rem;
  }

  .dimension-requirement span {
    font-weight: 500;
    color: #32325d;
  }

  .dimension-requirement small {
    color: #8898aa;
  }
`;

const ArticleForm = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // Get article ID from URL if in edit mode
  const location = useLocation();
  const isEditMode = Boolean(id);
  const isViewer = localStorage.getItem("userRole") === "viewer";

  const [formData, setFormData] = useState({
    articleName: "",
    articleLink: "",
    displayPath: "Home_Recommendation",
    articleDescription: "",
    callToAction: "",
    selectedImage:
      "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
    customImage: null,
    isCustomImage: false, // Add flag to track if current image is custom
    publishStatus: "Draft", // Draft or Published
  });

  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const token = getAuthToken();
  const [previewModal, setPreviewModal] = useState(false);
  const [toast, setToast] = useState({
    isOpen: false,
    message: "",
    type: "success",
    position: "top",
  });
  const [errors, setErrors] = useState({
    expiryDate: "",
    articleLink: "",
    articleDescription: "",
    callToAction: "",
  });
  const [initialLoading, setInitialLoading] = useState(isEditMode);

  // Add loading state for image validation
  const [imageValidationLoading, setImageValidationLoading] = useState(false);

  // Debug: Log form data changes
  useEffect(() => {
    console.log("Form data updated:", formData);
  }, [formData]);

  // Fetch article data if in edit mode
  useEffect(() => {
    const fetchArticleData = async () => {
      if (!isEditMode) return;

      try {
        setInitialLoading(true);
        console.log("Fetching article with ID:", id); // Debug log
        const response = await assistantService.getArticleById(id);
        console.log("Service response:", response); // Debug log

        if (response.status === 200) {
          const articleData = response.data.body;
          console.log("Fetched article data:", articleData); // Debug log

          // Parse the targetValue to extract article details
          let targetValue = {};
          try {
            if (articleData.targetValue) {
              console.log("Raw targetValue:", articleData.targetValue); // Debug the raw value
              console.log(
                "Raw targetValue type:",
                typeof articleData.targetValue
              ); // Debug the type

              let parsedValue;

              // If it's already an object, use it directly
              if (typeof articleData.targetValue === "object") {
                parsedValue = articleData.targetValue;
              } else if (typeof articleData.targetValue === "string") {
                // Try to parse as JSON
                try {
                  parsedValue = JSON.parse(articleData.targetValue);
                  console.log("First parse result:", parsedValue); // Debug first parse

                  // If the result is still a string, try parsing again
                  if (typeof parsedValue === "string") {
                    targetValue = JSON.parse(parsedValue);
                    console.log("Second parse result:", targetValue); // Debug second parse
                  } else {
                    targetValue = parsedValue;
                  }
                } catch (parseErr) {
                  console.warn(
                    "Failed to parse targetValue as JSON:",
                    parseErr
                  );
                  // If parsing fails, treat it as a direct URL
                  targetValue = { url: articleData.targetValue };
                }
              }

              console.log("Final parsed targetValue:", targetValue); // Debug final parse
            }
          } catch (err) {
            console.warn("Error parsing targetValue:", err);
            // If parsing fails, try to use the raw targetValue as a fallback
            if (typeof articleData.targetValue === "string") {
              targetValue = { url: articleData.targetValue };
            }
          }

          const newFormData = {
            articleName: articleData.assistantName || "",
            articleLink:
              targetValue.url && typeof targetValue.url === "string"
                ? targetValue.url
                : "",
            displayPath:
              targetValue.displayPath &&
              typeof targetValue.displayPath === "string"
                ? targetValue.displayPath
                : "Home_Recommendation",
            articleDescription: articleData.description || "",
            callToAction: articleData.callToAction || "",
            selectedImage:
              articleData.image ||
              "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
            customImage: null,
            isCustomImage: false,
            publishStatus: articleData.publishStatus?.toLowerCase() === 'published' ? 'Published' : 'Draft',
          };

          // Additional validation to prevent setting objects as strings
          if (typeof newFormData.articleLink === "object") {
            console.warn("articleLink is an object, setting to empty string");
            newFormData.articleLink = "";
          }

          console.log("TargetValue details:", {
            targetValue,
            url: targetValue.url,
            displayPath: targetValue.displayPath,
            hasUrl: !!targetValue.url,
            hasDisplayPath: !!targetValue.displayPath,
          });
          console.log("Setting form data:", newFormData); // Debug log
          setFormData(newFormData);

          // Validate the loaded URL
          if (targetValue.url) {
            const urlValidationError = validateURL(targetValue.url);
            setErrors((prev) => ({
              ...prev,
              articleLink: urlValidationError,
            }));
          }
        } else {
          console.error("Response status not 200:", response.status); // Debug log
          setError("Failed to fetch article data");
        }
      } catch (err) {
        console.error("Error fetching article:", err);
        setError("Error fetching article data");
      } finally {
        setInitialLoading(false);
      }
    };

    fetchArticleData();
  }, [id, isEditMode]);

  const showToast = (message, type = "success", position = "top") => {
    setToast({
      isOpen: true,
      message,
      type,
      position,
    });
    // Auto hide after 5 seconds
    setTimeout(() => {
      setToast({
        isOpen: false,
        message: "",
        type: "success",
        position: "top",
      });
    }, 5000);
  };

  // Image handling functions
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        showToast("Please upload an image file", "error");
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showToast("Image size should be less than 5MB", "error");
        return;
      }

      // Show loading state during validation
      setImageValidationLoading(true);

      // Validate image dimensions
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url); // Clean up the URL
        setImageValidationLoading(false);

        const requiredWidth = 325;
        const requiredHeight = 358;

        if (img.width !== requiredWidth || img.height !== requiredHeight) {
          showToast(
            `Image dimensions must be exactly ${requiredWidth}x${requiredHeight} pixels. Current dimensions: ${img.width}x${img.height}`,
            "error"
          );
          return;
        }

        // If dimensions are correct, proceed with the upload
        const reader = new FileReader();
        reader.onload = (e) => {
          setFormData((prev) => ({
            ...prev,
            selectedImage: e.target.result,
            customImage: file,
            isCustomImage: true, // Mark as custom image
          }));
          showToast("Custom image uploaded successfully", "success");
        };
        reader.readAsDataURL(file);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        setImageValidationLoading(false);
        showToast("Error loading image. Please try again.", "error");
      };

      img.src = url;
    }
  };

  const handleImageSelect = (imageUrl) => {
    setFormData((prev) => ({
      ...prev,
      selectedImage: imageUrl,
      isCustomImage: false, // Mark as default image
      // Note: We don't clear customImage here to allow re-uploading
    }));
    showToast("Default image selected", "success");
  };

  // Add function to handle custom image removal
  const handleRemoveCustomImage = () => {
    setFormData((prev) => ({
      ...prev,
      selectedImage:
        "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
      customImage: null,
      isCustomImage: false,
    }));
    showToast("Custom image removed", "success");
  };

  // Add function to re-upload custom image
  const handleReuploadCustomImage = () => {
    // Trigger the file input click
    document.getElementById("custom-image-upload").click();
  };

  // Add function to restore previously uploaded custom image
  const handleRestoreCustomImage = () => {
    if (formData.customImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData((prev) => ({
          ...prev,
          selectedImage: e.target.result,
          isCustomImage: true,
        }));
        showToast("Custom image restored", "success");
      };
      reader.readAsDataURL(formData.customImage);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate URL before proceeding
    const urlValidationError = validateURL(formData.articleLink);
    if (urlValidationError) {
      setErrors((prev) => ({
        ...prev,
        articleLink: urlValidationError,
      }));
      showToast(
        "Please fix the URL validation errors before proceeding",
        "error"
      );
      return;
    }

    setPreviewModal(true);
  };

  // Add new function to check if article form is valid
  const isArticleFormValid = () => {
    return (
      formData.articleName.trim() !== "" &&
      formData.articleLink.trim() !== "" &&
      formData.displayPath.trim() !== "" &&
      formData.callToAction.trim() !== "" &&
      formData.selectedImage && // Ensure an image is selected
      errors.articleLink === "" && // No URL validation errors
      errors.articleDescription === "" && // No description validation errors
      errors.callToAction === "" // No call to action validation errors
    );
  };

  // Enhanced URL validation function
  const validateURL = (url) => {
    if (!url || typeof url !== "string") {
      return "URL is required";
    }

    try {
      const urlObj = new URL(url.trim());

      // Only allow http or https
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        return "URL must start with http:// or https://";
      }

      // Hostname should be present and valid
      if (!urlObj.hostname || urlObj.hostname.length < 4) {
        return "Please enter a valid URL with a domain name";
      }

      // Optional: block localhost or internal IPs
      const invalidHosts = ["localhost", "127.0.0.1"];
      if (invalidHosts.includes(urlObj.hostname)) {
        return "Localhost URLs are not allowed";
      }

      // Optional: check minimum length
      if (url.length < 10) {
        return "URL seems too short";
      }

      return ""; // No error
    } catch (err) {
      return "Please enter a valid URL (e.g., https://example.com)";
    }
  };

  // Handle article link change with validation
  const handleArticleLinkChange = (e) => {
    const value = e.target.value;
    const validationError = validateURL(value);

    setFormData((prev) => ({
      ...prev,
      articleLink: value,
    }));

    setErrors((prev) => ({
      ...prev,
      articleLink: validationError,
    }));
  };

  // Handle article description change with validation
  const handleArticleDescriptionChange = (e) => {
    const value = e.target.value;
    let validationError = "";

    if (value.length > 500) {
      validationError = "Description cannot exceed 500 characters";
    }

    setFormData((prev) => ({
      ...prev,
      articleDescription: value,
    }));

    setErrors((prev) => ({
      ...prev,
      articleDescription: validationError,
    }));
  };
  const handleCallToActionChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({
      ...prev,
      callToAction: value,
    }));
  };
  // Modify handleConfirmSubmit to handle both create and edit
  const handleConfirmSubmit = async () => {
    try {
      setLoading(true);

      // Create FormData for the request
      const formDataToSend = new FormData();

      // Add all the article data
      formDataToSend.append("articleName", formData.articleName);
      formDataToSend.append("callToAction", formData.callToAction);
      formDataToSend.append("targetType", "Article");
      formDataToSend.append("description", formData.articleDescription || "");
      formDataToSend.append("publishStatus", formData.publishStatus || "Draft");

      // Add the clustered items data
      const clusteredItemsData = {
        url: formData.articleLink,
        displayPath: formData.displayPath,
        clusteredItems: {},
      };
      formDataToSend.append(
        "clusteredItems",
        JSON.stringify(clusteredItemsData)
      );

      // Add the image
      if (formData.isCustomImage && formData.customImage) {
        // If it's a custom uploaded image and currently selected, append the file
        formDataToSend.append("articleImage", formData.customImage);
      } else {
        // If it's a predefined image or custom image is not currently selected, append the URL
        formDataToSend.append("image", formData.selectedImage);
      }

      let response;
      if (isEditMode) {
        // Update existing article
        response = await assistantService.updateArticleById(id, formDataToSend);
      } else {
        // Create new article
        response = await assistantService.createArticle(formDataToSend);
      }

      if (response.data.status === 200) {
        setPreviewModal(false);
        const successMessage = isEditMode
          ? "Article updated successfully"
          : "Article created successfully";
        showToast(response.data.message || successMessage, "success");

        if (!isEditMode) {
          // Reset form data only for create mode
          setFormData({
            articleName: "",
            displayPath: "Home_Recommendation",
            articleLink: "",
            articleDescription: "",
            callToAction: "",
            selectedImage:
              "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
            customImage: null,
            isCustomImage: false,
          });
        }

        // Add delay before navigation to show the success toast
        setTimeout(() => {
          navigate("/admin/action-intelligence", {
            state: {
              message: response.data.message || successMessage,
              type: "success",
            },
          });
        }, 1000);
      } else {
        const errorMessage = isEditMode
          ? "Failed to update article"
          : "Failed to create article";
        showToast(response.data.message || errorMessage, "error");
      }
    } catch (error) {
      const errorMessage = isEditMode
        ? "Failed to update article"
        : "Failed to create article";
      showToast(error.response?.data?.message || errorMessage, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <style>
        {`
          ${styles}
          .stepper {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 2rem;
            padding: 1rem;
            background: white;
            border-radius: 0.5rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          }
          .step {
            display: flex;
            align-items: center;
            padding: 0.5rem 1rem;
            border-radius: 2rem;
            background: #f8f9fa;
            margin: 0 1rem;
            cursor: pointer;
            transition: all 0.3s;
          }
          .step.active {
            background: #3A6D8C;
            color: white;
          }
          .step.completed {
            background: #2dce89;
            color: white;
          }
          .step-number {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: rgba(255,255,255,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 0.5rem;
            font-weight: 600;
          }
          .step-title {
            font-weight: 600;
          }
          .step-connector {
            width: 40px;
            height: 2px;
            background: #e9ecef;
            position: relative;
          }
          .step-connector.active {
            background: #3A6D8C;
          }
          .step-connector.completed {
            background: #2dce89;
          }
          .form-step {
            display: none;
          }
          .form-step.active {
            display: block;
          }
          .step-actions {
            display: flex;
            justify-content: space-between;
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid #e9ecef;
          }
          .selected-item {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            padding: 1rem;
            margin-bottom: 0.75rem;
            background: white;
            border: 1px solid #e9ecef;
            border-radius: 0.5rem;
          }
          .selected-item-content {
            flex: 1;
            min-width: 0;
            padding-right: 1rem;
          }
          .item-header {
            display: flex;
            align-items: center;
            margin-bottom: 0.5rem;
          }
          .item-title {
            font-weight: 600;
            color: #32325d;
            margin-right: 12px;
          }
          .item-badges {
            display: flex;
            gap: 8px;
            align-items: center;
          }
          .item-hierarchy {
            display: flex;
            align-items: center;
            margin-bottom: 0.5rem;
            color: #8898aa;
            font-size: 0.875rem;
          }
          .item-hierarchy-separator {
            margin: 0 0.5rem;
            color: #32325d;
            font-weight: 500;
          }
          .item-question {
            background: #f8f9fa;
            padding: 0.75rem;
            border-radius: 0.375rem;
            margin-top: 0.5rem;
            color: #525f7f;
            font-size: 0.875rem;
            line-height: 1.5;
          }
          .action-buttons {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-left: auto;
            padding-left: 16px;
          }
          .delete-button {
            color: #dc3545;
            cursor: pointer;
            padding: 8px;
            border-radius: 4px;
            background: rgba(220, 53, 69, 0.1);
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .delete-button:hover {
            background: rgba(220, 53, 69, 0.2);
          }
          .edit-button {
            color: #3A6D8C;
            cursor: pointer;
            padding: 8px;
            border-radius: 4px;
            background: rgba(58, 109, 140, 0.1);
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .edit-button:hover {
            background: rgba(58, 109, 140, 0.2);
          }
        `}
      </style>

      <Container fluid className="pt-6">
        {/* Toast Notifications */}
        <div
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            minWidth: "350px",
            maxWidth: "450px",
          }}
        >
          <Toast
            isOpen={toast.isOpen}
            className="bg-white shadow-lg border-0"
            style={{
              borderLeft: `4px solid ${
                toast.type === "success" ? "#2dce89" : "#f5365c"
              }`,
              borderRadius: "0.375rem",
              boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.15)",
            }}
          >
            <div className="d-flex align-items-center p-3">
              <div className="mr-3">
                <i
                  className={`ni ni-${
                    toast.type === "success" ? "check-bold" : "alert-circle"
                  }`}
                  style={{
                    color: toast.type === "success" ? "#2dce89" : "#f5365c",
                    fontSize: "1.5rem",
                  }}
                />
              </div>
              <div className="flex-grow-1">
                <p
                  className="mb-0 font-weight-bold"
                  style={{
                    color: toast.type === "success" ? "#2dce89" : "#f5365c",
                    fontSize: "1rem",
                    lineHeight: "1.5",
                  }}
                >
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                className="close ml-3"
                onClick={() => setToast((prev) => ({ ...prev, isOpen: false }))}
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
            </div>
          </Toast>
        </div>

        <Row>
          <div className="col">
            <h3 className="mb-2 text-white" style={{ fontSize: "1.25rem" }}>
              {isEditMode ? "EDIT ARTICLE" : "CREATE ARTICLE"}
            </h3>
            <nav aria-label="breadcrumb">
              <ol
                className="breadcrumb bg-transparent mb-4"
                style={{ padding: "0" }}
              >
                <li
                  className="breadcrumb-item active text-white"
                  aria-current="page"
                ></li>
              </ol>
            </nav>

            {initialLoading ? (
              <Card className="shadow">
                <CardBody className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-3 mb-0">Loading article data...</p>
                </CardBody>
              </Card>
            ) : error ? (
              <Card className="shadow">
                <CardBody className="text-center py-5">
                  <Alert color="danger">{error}</Alert>
                </CardBody>
              </Card>
            ) : (
              <Card className="shadow">
                <CardHeader className="border-0">
                  <Form onSubmit={handleSubmit}>
                    {/* Step 1: Basic Details */}
                    <div>
                      <FormGroup>
                        <Label for="articleName">
                          Article Name <span className="text-danger">*</span>
                        </Label>
                        <Input
                          className="form-control-alternative"
                          type="text"
                          name="articleName"
                          id="articleName"
                          value={formData.articleName}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              articleName: e.target.value,
                            }))
                          }
                          placeholder="Enter Article Name"
                          required
                        />
                      </FormGroup>
                      <FormGroup>
                        <Label for="articleLink">
                          Article Link <span className="text-danger">*</span>
                        </Label>
                        <Input
                          className={`form-control-alternative ${
                            errors.articleLink ? "is-invalid" : ""
                          }`}
                          type="url"
                          name="articleLink"
                          id="articleLink"
                          value={formData.articleLink}
                          onChange={handleArticleLinkChange}
                          placeholder="Enter Article URL (e.g., https://example.com)"
                          required
                        />
                        {errors.articleLink && (
                          <div className="invalid-feedback d-block">
                            {errors.articleLink}
                          </div>
                        )}
                        {!errors.articleLink && formData.articleLink && (
                          <small className="form-text text-muted">
                            ✓ Valid URL format
                          </small>
                        )}
                      </FormGroup>
                      <FormGroup>
                        <Label>
                          Display Path <span className="text-danger">*</span>
                        </Label>
                        <div className="mt-2">
                          <FormGroup check>
                            <Label check>
                              <Input
                                type="radio"
                                name="displayPath"
                                value="Home_Recommendation"
                                checked={
                                  formData.displayPath === "Home_Recommendation"
                                }
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    displayPath: e.target.value,
                                  }))
                                }
                                key={`displayPath-${formData.displayPath}`}
                              />
                              Home Recommendations
                            </Label>
                          </FormGroup>
                        </div>
                      </FormGroup>
                                
                      {/* Article Image Selection */}
                      <FormGroup>
                        <Label>
                          Article Image <span className="text-danger">*</span>
                        </Label>
                        <div className="mb-2">
                          <div className="dimension-requirement">
                            <i className="ni ni-image"></i>
                            <span>
                              Required dimensions:{" "}
                              <strong>325 × 358 pixels</strong>
                            </span>
                            <small className="text-muted ml-2">
                              (Images with different dimensions will be
                              rejected)
                            </small>
                          </div>
                        </div>
                        <div className="image-selection-container">
                          <div className="row">
                            {/* Custom Image Upload */}
                            <div className="col-md-2 col-sm-4 mb-3">
                              <div className="image-option">
                                <label
                                  htmlFor="custom-image-upload"
                                  className="custom-image-upload"
                                  style={{
                                    width: "100%",
                                    height: "100px",
                                    border: formData.isCustomImage
                                      ? "3px solid #3A6D8C"
                                      : "2px dashed #3A6D8C",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    backgroundColor: formData.isCustomImage
                                      ? "#f8f9fa"
                                      : "#f8f9fa",
                                    transition: "all 0.3s ease",
                                    position: "relative",
                                  }}
                                >
                                  <input
                                    type="file"
                                    id="custom-image-upload"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    disabled={imageValidationLoading}
                                    style={{ display: "none" }}
                                  />
                                  {formData.isCustomImage ? (
                                    <>
                                      <i
                                        className="ni ni-image"
                                        style={{
                                          fontSize: "20px",
                                          color: "#3A6D8C",
                                        }}
                                      />
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          color: "#3A6D8C",
                                          marginTop: "4px",
                                          textAlign: "center",
                                        }}
                                      >
                                        Re-upload
                                      </span>
                                    </>
                                  ) : formData.customImage ? (
                                    <>
                                      <i
                                        className="ni ni-image"
                                        style={{
                                          fontSize: "20px",
                                          color: "#3A6D8C",
                                        }}
                                      />
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          color: "#3A6D8C",
                                          marginTop: "4px",
                                          textAlign: "center",
                                        }}
                                      >
                                        Restore Custom
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      {imageValidationLoading ? (
                                        <>
                                          <Spinner size="sm" color="primary" />
                                          <span
                                            style={{
                                              fontSize: "10px",
                                              color: "#3A6D8C",
                                              marginTop: "4px",
                                              textAlign: "center",
                                            }}
                                          >
                                            Validating...
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <i
                                            className="ni ni-image"
                                            style={{
                                              fontSize: "24px",
                                              color: "#3A6D8C",
                                            }}
                                          />
                                          <span
                                            style={{
                                              fontSize: "12px",
                                              color: "#3A6D8C",
                                              marginTop: "8px",
                                            }}
                                          >
                                            Upload Custom Image
                                          </span>
                                        </>
                                      )}
                                    </>
                                  )}
                                  {formData.isCustomImage && (
                                    <div className="selected-overlay">
                                      <IoCheckmarkCircle
                                        size={20}
                                        color="#3A6D8C"
                                      />
                                    </div>
                                  )}
                                </label>
                                {/* Show restore button when custom image exists but not selected */}
                                {formData.customImage &&
                                  !formData.isCustomImage && (
                                    <button
                                      type="button"
                                      onClick={handleRestoreCustomImage}
                                      className="restore-button"
                                      style={{
                                        width: "100%",
                                        marginTop: "4px",
                                        padding: "4px 8px",
                                        background: "#3A6D8C",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "4px",
                                        fontSize: "10px",
                                        cursor: "pointer",
                                        transition: "all 0.2s ease",
                                      }}
                                      title="Restore previously uploaded custom image"
                                    >
                                      Restore
                                    </button>
                                  )}
                              </div>
                            </div>

                            {/* Show existing custom image from database or newly uploaded custom image */}
                            {formData.isCustomImage &&
                              formData.selectedImage && (
                                <div className="col-md-2 col-sm-4 mb-3">
                                  <div
                                    className="image-option selected"
                                    style={{ position: "relative" }}
                                  >
                                    <img
                                      src={formData.selectedImage}
                                      alt="Custom Image"
                                      className="img-fluid rounded"
                                      style={{
                                        width: "100%",
                                        height: "100px",
                                        objectFit: "cover",
                                        border: "3px solid #3A6D8C",
                                        borderRadius: "8px",
                                      }}
                                      onError={(e) => {
                                        console.error(
                                          "Error loading image:",
                                          formData.selectedImage
                                        );
                                        e.target.src =
                                          "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png";
                                      }}
                                    />
                                    <div className="selected-overlay">
                                      <IoCheckmarkCircle
                                        size={24}
                                        color="#3A6D8C"
                                      />
                                    </div>
                                    <div
                                      className="mt-1 text-muted small text-center"
                                      style={{
                                        fontSize: "11px",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {formData.customImage
                                        ? formData.customImage.name
                                        : "Custom Image"}
                                    </div>
                                    {/* Add remove button for custom images */}
                                    <button
                                      type="button"
                                      onClick={handleRemoveCustomImage}
                                      style={{
                                        position: "absolute",
                                        top: "-2px",
                                        right: "1px",
                                        background: "#dc3545",
                                        color: "white",
                                        border: "2px solid white",
                                        borderRadius: "50%",
                                        width: "28px",
                                        height: "28px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: "pointer",
                                        fontSize: "16px",
                                        fontWeight: "bold",
                                        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                                        transition: "all 0.2s ease",
                                        zIndex: 10,
                                      }}
                                      title="Remove custom image"
                                      onMouseEnter={(e) => {
                                        e.target.style.background = "#c82333";
                                        e.target.style.transform = "scale(1.1)";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.target.style.background = "#dc3545";
                                        e.target.style.transform = "scale(1)";
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              )}

                            {/* Predefined Images */}
                            {[
                              {
                                id: 1,
                                src: "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
                                alt: "Article 1",
                              },
                              {
                                id: 2,
                                src: "https://storage.googleapis.com/rejara-wallpaper/chapters/insurance/1744382346101_Insurance_1744382346101.png",
                                alt: "Article 2",
                              },
                              {
                                id: 3,
                                src: "https://storage.googleapis.com/rejara-wallpaper/chapters/expenses/1744382346958_Expenses_1744382346958.png",
                                alt: "Article 3",
                              },
                            ].map((image) => (
                              <div
                                key={image.id}
                                className="col-md-2 col-sm-4 mb-3"
                              >
                                <div
                                  className={`image-option ${
                                    formData.selectedImage === image.src &&
                                    !formData.isCustomImage
                                      ? "selected"
                                      : ""
                                  }`}
                                  onClick={() => handleImageSelect(image.src)}
                                >
                                  <img
                                    src={image.src}
                                    alt={image.alt}
                                    className="img-fluid rounded"
                                    style={{
                                      width: "100%",
                                      height: "100px",
                                      objectFit: "cover",
                                      cursor: "pointer",
                                      border:
                                        formData.selectedImage === image.src &&
                                        !formData.isCustomImage
                                          ? "3px solid #3A6D8C"
                                          : "1px solid #e9ecef",
                                      borderRadius: "8px",
                                      transition: "all 0.3s ease",
                                    }}
                                  />
                                  {formData.selectedImage === image.src &&
                                    !formData.isCustomImage && (
                                      <div className="selected-overlay">
                                        <IoCheckmarkCircle
                                          size={24}
                                          color="#3A6D8C"
                                        />
                                      </div>
                                    )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {!formData.selectedImage && (
                          <div className="text-danger mt-1">
                            Please select an article image
                          </div>
                        )}
                      </FormGroup>
                      <FormGroup>
                        <Label for="callToAction">
                          Call To Action <span className="text-danger">*</span>
                        </Label>
                        <Input
                          className={`form-control-alternative ${
                            errors.callToAction ? "is-invalid" : ""
                          }`}
                          type="textarea"
                          name="callToAction"
                          id="callToAction"
                          value={formData.callToAction}
                          onChange={handleCallToActionChange}
                          placeholder="Enter Call To Action"
                          maxLength={100}
                        />
                        {errors.callToAction && (
                          <div className="invalid-feedback d-block">
                            {errors.callToAction}
                          </div>  
                        )}
                        <div className="d-flex justify-content-between align-items-center mt-1">
                          <small className="form-text text-muted">
                            Maximum 100 characters allowed
                          </small>
                          <small className={`form-text ${
                            formData.callToAction.length > 90 
                              ? formData.callToAction.length > 100 
                                ? "text-danger" 
                                : "text-warning"
                              : "text-muted"
                          }`}>
                            {formData.callToAction.length}/100
                          </small>
                        </div>
                      </FormGroup>
                      <FormGroup>
                        <Label for="articleDescription">
                          Article Description (Optional)
                        </Label>
                        <Input
                          className={`form-control-alternative ${
                            errors.articleDescription ? "is-invalid" : ""
                          }`}
                          type="textarea"
                          name="articleDescription"
                          id="articleDescription"
                          value={formData.articleDescription}
                          onChange={handleArticleDescriptionChange}
                          placeholder="Enter Article Description"
                          maxLength={500}
                        />
                        {errors.articleDescription && (
                          <div className="invalid-feedback d-block">
                            {errors.articleDescription}
                          </div>
                        )}
                        <div className="d-flex justify-content-between align-items-center mt-1">
                          <small className="form-text text-muted">
                            Maximum 500 characters allowed
                          </small>
                          <small className={`form-text ${
                            formData.articleDescription.length > 450 
                              ? formData.articleDescription.length > 500 
                                ? "text-danger" 
                                : "text-warning"
                              : "text-muted"
                          }`}>
                            {formData.articleDescription.length}/500
                          </small>
                        </div>
                      </FormGroup>

                      {/* Publish Status Section */}
                      <FormGroup>
                        <Label className="d-flex align-items-center mb-3">
                          
                          <span className="">Publish Status</span>
                        </Label>
                        <div className="d-flex gap-4">
                          <FormGroup check inline>
                            <Input
                              type="radio"
                              name="publishStatus"
                              value="Draft"
                              id="publishStatusDraft"
                              checked={formData.publishStatus === "Draft"}
                              onChange={() => setFormData(prev => ({ ...prev, publishStatus: "Draft" }))}
                              style={{
                                width: "18px",
                                height: "18px",
                                marginTop: "2px"
                              }}
                            />
                            <Label 
                              check 
                              className="font-weight-medium text-dark ml-2"
                              htmlFor="publishStatusDraft"
                              style={{ cursor: "pointer" }}
                            >
                              <Badge color="warning" className="mr-1">Draft</Badge>
                            </Label>
                          </FormGroup>

                          <FormGroup check inline>
                            <Input
                              type="radio"
                              name="publishStatus"
                              value="Published"
                              id="publishStatusPublished"
                              checked={formData.publishStatus === "Published"}
                              onChange={() => setFormData(prev => ({ ...prev, publishStatus: "Published" }))}
                              style={{
                                width: "18px",
                                height: "18px",
                                marginTop: "2px"
                              }}
                            />
                            <Label 
                              check 
                              className="font-weight-medium text-dark ml-2"
                              htmlFor="publishStatusPublished"
                              style={{ cursor: "pointer" }}
                            >
                              <Badge color="success" className="mr-1">Published</Badge>
                            </Label>
                          </FormGroup>
                        </div>
                        <small className="text-muted mt-2 d-block">
                          Draft articles are not visible to users. Publish when ready.
                        </small>
                      </FormGroup>
                      
                      <div className="step-actions">
                        <div></div>
                        {!isViewer && (
                          <Button
                            color="primary"
                            onClick={handleSubmit}
                            className="d-flex align-items-center"
                            disabled={!isArticleFormValid()}
                          >
                            Preview & Submit
                          </Button>
                        )}
                      </div>
                    </div>
                  </Form>
                </CardHeader>
              </Card>
            )}

            {/* Preview Modal */}
            <Modal
              isOpen={previewModal}
              toggle={() => setPreviewModal(false)}
              size="lg"
            >
              <ModalHeader toggle={() => setPreviewModal(false)}>
                Preview Article
              </ModalHeader>
              <ModalBody>
                <div className="mb-4">
                  <div className="font-bold text-black text-base">
                    Form Details
                  </div>
                  <Table bordered>
                    <tbody>
                      <tr>
                        <th width="30%">Article Name</th>
                        <td>{formData.articleName}</td>
                      </tr>
                      <tr>
                        <th>Display Path</th>
                        <td>{formData.displayPath}</td>
                      </tr>                      
                      <tr>
                        <th>Call To Action</th>
                        <td>{formData.callToAction}</td>
                      </tr>
                      <tr>
                        <th>Article Link</th>
                        <td>{formData.articleLink}</td>
                      </tr>
                      <tr>
                        <th>Article Image</th>
                        <td>
                          <img
                            src={formData.selectedImage}
                            alt="Article Preview"
                            style={{
                              width: "100px",
                              height: "110px",
                              objectFit: "cover",
                              borderRadius: "8px",
                              border: "1px solid #e9ecef",
                            }}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="secondary"
                  onClick={() => setPreviewModal(false)}
                >
                  Cancel
                </Button>
                {!isViewer && (
                  <Button
                    color="primary"
                    onClick={handleConfirmSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Submitting...
                      </>
                    ) : (
                      "Confirm & Submit"
                    )}
                  </Button>
                )}
              </ModalFooter>
            </Modal>
          </div>
        </Row>
      </Container>
    </>
  );
};

export default ArticleForm;
