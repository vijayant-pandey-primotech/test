import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Container,
  Row,
  Col,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Toast,
  Badge,
  Alert,
  Input,
  Label,
  FormGroup,
  Table,
  Form,
  FormText
} from 'reactstrap';
import { useNavigate } from 'react-router-dom';
import dynamicFunctionsService from 'services/dynamicFunctionsService';

// Custom styles with consistent theme UI
const styles = `
  /* Typography System */
  :root {
    --font-family-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --font-size-xs: 0.75rem;      /* 12px */
    --font-size-sm: 0.875rem;     /* 14px */
    --font-size-base: 1rem;       /* 16px */
    --font-size-lg: 1.125rem;     /* 18px */
    --font-size-xl: 1.25rem;      /* 20px */
    --font-size-2xl: 1.5rem;      /* 24px */
    --font-size-3xl: 1.875rem;    /* 30px */
    --font-size-4xl: 2.25rem;     /* 36px */
    
    --font-weight-normal: 400;
    --font-weight-medium: 500;
    --font-weight-semibold: 600;
    --font-weight-bold: 700;
    
    --color-text-primary: #2d3748;
    --color-text-secondary: #4a5568;
    --color-text-muted: #718096;
    --color-text-light: #a0aec0;
    --color-text-white: #ffffff;
    --color-text-success: #2dce89;
    --color-text-error: #f5365c;
    --color-text-warning: #fb6340;
    --color-text-info: #3A6D8C;
    
    --color-bg-primary: #3A6D8C;
    --color-bg-secondary: #f8f9fa;
    --color-bg-success: #2dce89;
    --color-bg-warning: #fb6340;
    --color-bg-danger: #f5365c;
    --color-bg-info: #11cdef;
    
    --border-radius-sm: 8px;
    --border-radius-md: 12px;
    --border-radius-lg: 16px;
    --border-radius-xl: 20px;
    
    --shadow-sm: 0 2px 10px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 15px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 12px 30px rgba(0, 0, 0, 0.15);
  }

  /* Base Typography */
  .text-xs { font-size: var(--font-size-xs); }
  .text-sm { font-size: var(--font-size-sm); }
  .text-base { font-size: var(--font-size-base); }
  .text-lg { font-size: var(--font-size-lg); }
  .text-xl { font-size: var(--font-size-xl); }
  .text-2xl { font-size: var(--font-size-2xl); }
  .text-3xl { font-size: var(--font-size-3xl); }
  .text-4xl { font-size: var(--font-size-4xl); }

  .font-normal { font-weight: var(--font-weight-normal); }
  .font-medium { font-weight: var(--font-weight-medium); }
  .font-semibold { font-weight: var(--font-weight-semibold); }
  .font-bold { font-weight: var(--font-weight-bold); }

  .text-primary { color: var(--color-text-primary); }
  .text-secondary { color: var(--color-text-secondary); }
  .text-muted { color: var(--color-text-muted); }
  .text-light { color: var(--color-text-light); }
  .text-white { color: var(--color-text-white); }
  .text-success { color: var(--color-text-success); }
  .text-error { color: var(--color-text-error); }
  .text-warning { color: var(--color-text-warning); }
  .text-info { color: var(--color-text-info); }

  /* Layout Components */
  .page-container {
    padding-top: 1.5rem;
  }

  .page-title {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-white);
    font-family: var(--font-family-primary);
    margin-bottom: 1.5rem;
  }

  .section-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    font-family: var(--font-family-primary);
    margin-bottom: 1rem;
  }

  .card-title {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    font-family: var(--font-family-primary);
  }

  /* Card Components */
  .theme-card {
    border: 1px solid #e9ecef;
    border-radius: var(--border-radius-lg);
    overflow: hidden;
    transition: all 0.3s ease;
    background: white;
    box-shadow: var(--shadow-sm);
    margin-bottom: 1.5rem;
  }

  .theme-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
    border-color: var(--color-bg-primary);
  }

  .theme-card-header {
    background: linear-gradient(135deg, var(--color-bg-primary) 0%, #2d5670 100%);
    color: var(--color-text-white);
    padding: 1.25rem 1.5rem;
    border-bottom: none;
  }

  .theme-card-body {
    padding: 1.5rem;
    background: var(--color-bg-secondary);
  }

  /* Button Components */
  .btn-theme-primary {
    background-color: var(--color-bg-primary);
    border-color: var(--color-bg-primary);
    color: var(--color-text-white);
    border-radius: var(--border-radius-sm);
    padding: 0.75rem 1.5rem;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-base);
    font-family: var(--font-family-primary);
    transition: all 0.3s ease;
  }

  .btn-theme-primary:hover {
    background-color: #2d5670;
    border-color: #2d5670;
    color: var(--color-text-white);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(58, 109, 140, 0.3);
  }

  .btn-theme-success {
    background-color: var(--color-bg-success);
    border-color: var(--color-bg-success);
    color: var(--color-text-white);
    border-radius: var(--border-radius-sm);
    padding: 0.75rem 1.5rem;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-base);
    font-family: var(--font-family-primary);
    transition: all 0.3s ease;
  }

  .btn-theme-success:hover {
    background-color: #24a46b;
    border-color: #24a46b;
    color: var(--color-text-white);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(45, 206, 137, 0.3);
  }

  .btn-theme-secondary {
    background-color: #6c757d;
    border-color: #6c757d;
    color: var(--color-text-white);
    border-radius: var(--border-radius-sm);
    padding: 0.75rem 1.5rem;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-base);
    font-family: var(--font-family-primary);
    transition: all 0.3s ease;
  }

  .btn-theme-secondary:hover {
    background-color: #5a6268;
    border-color: #5a6268;
    color: var(--color-text-white);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(108, 117, 125, 0.3);
  }

  .btn-theme-warning {
    background-color: var(--color-bg-warning);
    border-color: var(--color-bg-warning);
    color: var(--color-text-white);
    border-radius: var(--border-radius-sm);
    padding: 0.75rem 1.5rem;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-base);
    font-family: var(--font-family-primary);
    transition: all 0.3s ease;
  }

  .btn-theme-warning:hover {
    background-color: #e55a2b;
    border-color: #e55a2b;
    color: var(--color-text-white);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(251, 99, 64, 0.3);
  }

  /* Form Components */
  .form-label {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    font-family: var(--font-family-primary);
    margin-bottom: 0.5rem;
  }

  .form-input {
    border-radius: var(--border-radius-md);
    border: 2px solid #e9ecef;
    padding: 0.75rem 1rem;
    font-size: var(--font-size-base);
    font-family: var(--font-family-primary);
    transition: all 0.3s ease;
  }

  .form-input:focus {
    border-color: var(--color-bg-primary);
    box-shadow: 0 0 0 0.2rem rgba(58, 109, 140, 0.25);
  }

  .form-input::placeholder {
    color: var(--color-text-light);
    font-family: var(--font-family-primary);
  }

  /* Form validation styles */
  .form-control.is-invalid {
    border-color: #f5365c !important;
    box-shadow: 0 0 0 0.2rem rgba(245, 54, 92, 0.25) !important;
  }
  
  .invalid-feedback {
    display: block !important;
    color: #f5365c;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  .text-warning {
    color: #fb6340 !important;
  }

  .text-danger {
    color: #f5365c !important;
  }

  /* Field requirement indicators */
  .field-required {
    color: #f5365c;
    font-weight: 600;
  }

  .field-optional {
    color: #8898aa;
    font-style: italic;
  }

  /* Form section styling */
  .form-section {
    margin-bottom: 2rem;
  }

  .section-divider {
    border-top: 1px solid #e9ecef;
    margin: 2rem 0;
    opacity: 0.5;
  }

  .form-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    font-family: var(--font-family-primary);
  }

  /* Alert Components */
  .alert-theme {
    border-radius: var(--border-radius-md);
    border: none;
    padding: 1rem 1.5rem;
    font-family: var(--font-family-primary);
  }

  .alert-theme-primary {
    background: linear-gradient(135deg, var(--color-bg-primary) 0%, #2d5670 100%);
    color: var(--color-text-white);
  }

  .alert-theme-success {
    background: linear-gradient(135deg, var(--color-bg-success) 0%, #24a46b 100%);
    color: var(--color-text-white);
  }

  .alert-theme-warning {
    background: linear-gradient(135deg, var(--color-bg-warning) 0%, #e55a2b 100%);
    color: var(--color-text-white);
  }

  .alert-theme-danger {
    background: linear-gradient(135deg, var(--color-bg-danger) 0%, #d92550 100%);
    color: var(--color-text-white);
  }

  /* Table Components */
  .table-theme {
    font-family: var(--font-family-primary);
  }

  .table-theme th {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    border-top: none;
    background-color: var(--color-bg-secondary);
  }

  .table-theme td {
    color: var(--color-text-secondary);
    vertical-align: middle;
  }

  /* Badge Components */
  .badge-theme {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    font-family: var(--font-family-primary);
    border-radius: var(--border-radius-xl);
    padding: 0.25rem 0.75rem;
  }

  /* Modal Components */
  .modal-theme .modal-header {
    background: linear-gradient(135deg, var(--color-bg-primary) 0%, #2d5670 100%);
    color: var(--color-text-white);
    border-bottom: none;
  }

  .modal-theme .modal-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-white);
    font-family: var(--font-family-primary);
  }

  .modal-theme .modal-body {
    font-family: var(--font-family-primary);
  }

  .modal-theme .modal-footer {
    border-top: 1px solid #e9ecef;
  }

  /* Toast Components */
  .toast-theme {
    font-family: var(--font-family-primary);
  }

  .toast-icon {
    font-size: var(--font-size-2xl);
  }

  .toast-message {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    line-height: 1.5;
    font-family: var(--font-family-primary);
  }

  .toast-close {
    font-size: var(--font-size-xl);
    color: var(--color-text-light);
  }

  /* Utility Classes */
  .text-center { text-align: center; }
  .text-left { text-align: left; }
  .text-right { text-align: right; }

  .mb-0 { margin-bottom: 0; }
  .mb-1 { margin-bottom: 0.25rem; }
  .mb-2 { margin-bottom: 0.5rem; }
  .mb-3 { margin-bottom: 1rem; }
  .mb-4 { margin-bottom: 1.5rem; }

  .mt-0 { margin-top: 0; }
  .mt-1 { margin-top: 0.25rem; }
  .mt-2 { margin-top: 0.5rem; }
  .mt-3 { margin-top: 1rem; }
  .mt-4 { margin-top: 1.5rem; }

  .p-0 { padding: 0; }
  .p-1 { padding: 0.25rem; }
  .p-2 { padding: 0.5rem; }
  .p-3 { padding: 1rem; }
  .p-4 { padding: 1.5rem; }

  /* Loading States */
  .loading-spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid currentColor;
    border-radius: 50%;
    border-top-color: transparent;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Empty States */
  .empty-state {
    text-align: center;
    padding: 3rem 2rem;
    color: var(--color-text-muted);
    font-family: var(--font-family-primary);
  }

  .empty-state i {
    font-size: var(--font-size-4xl);
    margin-bottom: 1rem;
    opacity: 0.3;
  }

  .empty-state h5 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    margin-bottom: 0.5rem;
    color: var(--color-text-primary);
  }

  .empty-state p {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-normal);
    opacity: 0.7;
    color: var(--color-text-secondary);
  }

  /* Responsive Grid */
  .grid-responsive {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-top: 1.5rem;
  }

  /* Status Indicators */
  .status-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 0.5rem;
  }

  .status-active {
    background-color: var(--color-bg-success);
  }

  .status-inactive {
    background-color: var(--color-text-muted);
  }

  .status-pending {
    background-color: var(--color-bg-warning);
  }

  .status-error {
    background-color: var(--color-bg-danger);
  }
`;

const CreateDynamicFunction = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    functionName: "",
    // language: "",
    // inputSchema: "",
    // outputSchema: "",
    functionDescription: "",
    requestedBy: localStorage.getItem("adminName"),
    status: "REQUESTED"
  });
  const isViewer = localStorage.getItem("userRole") === "viewer";
  const [previewModal, setPreviewModal] = useState(false);
  const [errors, setErrors] = useState({
    functionName: "",
    // language: "",
    functionDescription: "",
    // inputSchema: "",
    // outputSchema: ""
  });
  const [toast, setToast] = useState({
    isOpen: false,
    message: "",
    type: "success",
    position: "top",
  });

  // Show toast function
  const showToast = (message, type = "success", position = "top") => {
    setToast({
      isOpen: true,
      message,
      type,
      position,
    });
    setTimeout(() => {
      setToast({
        isOpen: false,
        message: "",
        type: "success",
        position: "top",
      });
    }, 5000);
  };
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  // Validation function
  const validateForm = () => {
    const newErrors = {};

    // Function name validation
    if (!formData.functionName.trim()) {
      newErrors.functionName = "Function name is required";
    }

    // Language validation
    // if (!formData.language.trim()) {
    //   newErrors.language = "Language is required";
    // }

    // Function description validation
    if (!formData.functionDescription.trim()) {
      newErrors.functionDescription = "Function description is required";
    } else if (formData.functionDescription.trim().length > 500) {
      newErrors.functionDescription = "Function description cannot exceed 500 characters";
    }

    // // Input schema validation
    // if (formData.inputSchema && formData.inputSchema.trim() !== '') {
    //   try {
    //     JSON.parse(formData.inputSchema);
    //   } catch (error) {
    //     newErrors.inputSchema = "Invalid JSON format for input schema";
    //   }
    // }

    // // Output schema validation
    // if (formData.outputSchema && formData.outputSchema.trim() !== '') {
    //   try {
    //     JSON.parse(formData.outputSchema);
    //   } catch (error) {
    //     newErrors.outputSchema = "Invalid JSON format for output schema";
    //   }
    // }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleRequest = async () => {
    try {
      // Validate form
      if (!validateForm()) {
        showToast("Please fix the validation errors before submitting", "error");
        return;
      }

      const response = await dynamicFunctionsService.requestDynamicFunction(formData);
      console.log(response, "=============================response");
      
      if (response.data.status === 200) {
        // Reset form
        setFormData({
          functionName: "",
          // language: "",
          // inputSchema: "",
          // outputSchema: "",
          functionDescription: "",
          requestedBy: localStorage.getItem("adminName"),
          status: "REQUESTED"
        });
        
        // Navigate back to agent actions list after showing toast
        setTimeout(() => {
          navigate("/admin/dynamic-functions", {
            state: {
              message: response.data.message,
              type: "success"
            }
          });
        }, 500);
      } else {
        showToast(response.data.message || "Error submitting request", "error");
      }
    } catch (error) {
      console.error("Error requesting dynamic function:", error);
      const errorMessage = error.response?.data?.message || "Error submitting request. Please try again.";
      showToast(errorMessage, "error");
    }
  }
  return (
    <>
      <style>{styles}</style>
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>REQUEST NEW ACTION</h3>
            
            {/* Main Content */}
            <Card className="theme-card">
            <CardHeader className="border-0">
          <Row className="align-items-center">
          </Row>
          <Row>
            <Col>
              <Form>
                <FormGroup>
                  <Label>Action Name <span className="text-danger">*</span></Label>
                  <Input 
                    type="text" 
                    name="functionName" 
                    className={`form-control ${errors.functionName ? "is-invalid" : ""}`}
                    value={formData.functionName} 
                    onChange={handleChange}
                    placeholder="e.g., Fetch User Dependents"
                  />
                  {errors.functionName && (
                    <div className="invalid-feedback d-block">
                      {errors.functionName}
                    </div>
                  )}
                </FormGroup>
                
                {/* <FormGroup>
                  <Label>Language <span className="text-danger">*</span></Label>
                  <Input 
                    type="text" 
                    name="language" 
                    className={`form-control ${errors.language ? "is-invalid" : ""}`}
                    value={formData.language} 
                    onChange={handleChange}
                    placeholder="e.g., JavaScript, Python, Node.js"
                  />
                  {errors.language && (
                    <div className="invalid-feedback d-block">
                      {errors.language}
                    </div>
                  )}
                </FormGroup> */}
                
                <FormGroup>
                  <Label>Action Description <span className="text-danger">*</span></Label>
                  <Input 
                    type="textarea" 
                    name="functionDescription" 
                    className={`form-control ${errors.functionDescription ? "is-invalid" : ""}`}
                    value={formData.functionDescription} 
                    onChange={handleChange}
                    placeholder="Describe what this function does and how it will be used..."
                    rows={3}
                    maxLength={500}
                  />
                  {errors.functionDescription && (
                    <div className="invalid-feedback d-block">
                      {errors.functionDescription}
                    </div>
                  )}
                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <small className="form-text text-muted">
                      Maximum 500 characters allowed
                    </small>
                    <small className={`form-text ${
                      formData.functionDescription.length > 450 
                        ? formData.functionDescription.length > 500 
                          ? "text-danger" 
                          : "text-warning"
                        : "text-muted"
                    }`}>
                      {formData.functionDescription.length}/500
                    </small>
                  </div>
                </FormGroup>
              </Form>
            </Col>
          </Row>
          <Row>
            <Col>
              <Button color="primary" className="btn-theme-primary float-right" onClick={handleRequest}>Request</Button>
            </Col>
          </Row>
        </CardHeader>
            </Card>
          </div>
        </Row>

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
            className="bg-white shadow-lg border-0 toast-theme"
            style={{
              borderLeft: `4px solid ${
                toast.type === "success" ? "#2dce89" : toast.type === "error" ? "#f5365c" : "#3A6D8C"
              }`,
              borderRadius: "0.375rem",
              boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.15)",
            }}
          >
            <div className="d-flex align-items-center p-3">
              <div className="mr-3">
                <i
                  className={`ni ni-${
                    toast.type === "success" ? "check-bold" : toast.type === "error" ? "alert-circle" : "info"
                  } toast-icon`}
                  style={{
                    color: toast.type === "success" ? "#2dce89" : toast.type === "error" ? "#f5365c" : "#3A6D8C",
                  }}
                />
              </div>
              <div className="flex-grow-1">
                <p className="mb-0 toast-message" style={{
                  color: toast.type === "success" ? "#2dce89" : toast.type === "error" ? "#f5365c" : "#3A6D8C",
                }}>
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                className="close ml-3 toast-close"
                onClick={() => setToast((prev) => ({ ...prev, isOpen: false }))}
                style={{
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
      </Container>
    </>
  );
};

export default CreateDynamicFunction;
