import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Form,
  FormGroup,
  Label,
  Input,
  Row,
  Col,
  Alert,
  Spinner,
} from "reactstrap";
import { Message } from "rsuite";
import { IoWarningOutline } from "react-icons/io5";
import { SiTicktick } from "react-icons/si";
import "rsuite/dist/rsuite.min.css";
import taskService from "services/taskService";
import platformService from "services/platformService";

const CreateTaskWidgetModal = ({ isOpen, toggle, task, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: "",
    widgetKey: "",
    entityType: "Plan",
    entityId: "",
    taskType: "",
    platform: "",
    mappingId: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiMessage, setApiMessage] = useState({ content: "", type: "" });
  const [platforms, setPlatforms] = useState([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);

  // Available widget types for tasks
  const widgetTypes = [
    { value: "task_summary", label: "Task Summary", description: "Shows a summary of task details and progress" },
    { value: "vitals", label: "Vitals", description: "Displays vital signs and health metrics" },
  ];

  // Display path options
  const displayPathOptions = {
    "Home Screen": {
      "Left Panel": [],
      "Right Panel": [],
      "Middle Panel": [],
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPlatforms();
      if (task) {
        const isEditMode = task.existingWidget;
        setFormData({
          name: isEditMode ? task.existingWidget.name : `${task.task_type} Widget`,
          widgetKey: isEditMode ? task.existingWidget.widget?.widgetKey : "",
          entityType: "Plan",
          entityId: task.taskId,
          taskType: task.task_type,
          platform: task.platform_name || "",
          mappingId: isEditMode ? task.existingWidget.id : null
        });
      }
    }
  }, [isOpen, task]);

  const fetchPlatforms = async () => {
    try {
      setPlatformsLoading(true);
      const response = await platformService.getAllPlatforms();
      setPlatforms(response.body || []);
    } catch (err) {
      console.error("Error fetching platforms:", err);
    } finally {
      setPlatformsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleWidgetTypeChange = (e) => {
    const selectedWidgetType = e.target.value;
    const widgetType = widgetTypes.find(wt => wt.value === selectedWidgetType);
    
    setFormData(prev => ({
      ...prev,
      widgetKey: selectedWidgetType,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.widgetKey) {
      setError("Please fill in all required fields");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const widgetData = {
        ...formData,
        displayPath: {
          page: "Home Screen",
          section: "Middle Panel"
        }
      };

      const isEditMode = formData.mappingId;
      
      if (isEditMode) {
        // Update existing widget
        await taskService.updateTaskWidget(formData.mappingId, widgetData);
        setApiMessage({
          content: `Widget "${formData.name}" updated successfully!`,
          type: "success",
        });
      } else {
        // Create new widget
        await taskService.createTaskWidget(widgetData);
        setApiMessage({
          content: `Widget "${formData.name}" created successfully!`,
          type: "success",
        });
      }

      // Auto-hide message after 3 seconds and close modal
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
        if (onSuccess) {
          onSuccess();
        }
        toggle();
      }, 3000);

    } catch (err) {
      console.error("Error saving widget:", err);
      setError(err.response?.data?.message || "Error saving widget");
      
      setApiMessage({
        content: err.response?.data?.message || "Error saving widget",
        type: "error",
      });

      // Auto-hide error message after 5 seconds
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      widgetKey: "",
      entityType: "Plan",
      entityId: "",
      taskType: "",
      platform: "",
      mappingId: null
    });
    setError(null);
    setApiMessage({ content: "", type: "" });
    toggle();
  };

  return (
    <>
      <Modal isOpen={isOpen} toggle={handleClose} size="lg">
        <ModalHeader toggle={handleClose}>
          {task?.existingWidget ? 'Edit Widget for' : 'Create Widget for'} {task?.task_type || 'Task'}
        </ModalHeader>
        <ModalBody>
          <Form onSubmit={handleSubmit}>
            {error && (
              <Alert color="danger" className="mb-3">
                {error}
              </Alert>
            )}

            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>
                    Widget Name <span className="text-danger">*</span>
                  </Label>
                  <Input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Enter widget name"
                    required
                  />
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label>
                    Widget Type <span className="text-danger">*</span>
                  </Label>
                  <Input
                    type="select"
                    name="widgetKey"
                    value={formData.widgetKey}
                    onChange={handleWidgetTypeChange}
                    required
                  >
                    <option value="">Select widget type</option>
                    {widgetTypes.map(widgetType => (
                      <option key={widgetType.value} value={widgetType.value}>
                        {widgetType.label}
                      </option>
                    ))}
                  </Input>
                  {formData.widgetKey && (
                    <small className="text-muted">
                      {widgetTypes.find(wt => wt.value === formData.widgetKey)?.description}
                    </small>
                  )}
                </FormGroup>
              </Col>
            </Row>

            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>Platform</Label>
                  <Input
                    type="text"
                    value={formData.platform}
                    disabled
                    className="bg-light"
                  />
                  <small className="text-muted">Platform is automatically set to match the task's platform</small>
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label>Task Type</Label>
                  <Input
                    type="text"
                    value={formData.taskType}
                    disabled
                    className="bg-light"
                  />
                </FormGroup>
              </Col>
            </Row>

            {/* <Row>
              <Col md="6">
                <FormGroup>
                  <Label>Entity Type</Label>
                  <Input
                    type="text"
                    value={formData.entityType}
                    disabled
                    className="bg-light"
                  />
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label>Entity ID</Label>
                  <Input
                    type="text"
                    value={formData.entityId}
                    disabled
                    className="bg-light"
                  />
                </FormGroup>
              </Col>
            </Row> */}

            <div className="mt-3">
              <h6>Display Configuration</h6>
              <div className="bg-light p-3 rounded">
                <Row>
                  <Col md="6">
                    <strong>Page:</strong> Home Screen
                  </Col>
                  <Col md="6">
                    <strong>Section:</strong> Middle Panel
                  </Col>
                </Row>
              </div>
            </div>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button color="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {task?.existingWidget ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              task?.existingWidget ? 'Update Widget' : 'Create Widget'
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Message Notification */}
      {apiMessage.content && (
        <Message
          closable
          key={apiMessage.content}
          type={apiMessage.type}
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            width: "auto",
            minWidth: "200px",
            maxWidth: "40%",
            backgroundColor:
              apiMessage.type === "success" ? "#d4edda" : "#f8d7da",
            top: "20px",
            zIndex: 9999,
            fontSize: "0.875rem",
            padding: "8px 16px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            transition: "none",
            animation: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              justifyContent: "center",
              width: "100%",
            }}
          >
            {apiMessage.type === "error" ? (
              <IoWarningOutline size={16} color="#c40d0d" />
            ) : (
              <SiTicktick size={16} color="#183e17" />
            )}
            <span style={{ textAlign: "center" }}>{apiMessage.content}</span>
          </div>
        </Message>
      )}
    </>
  );
};

export default CreateTaskWidgetModal;
