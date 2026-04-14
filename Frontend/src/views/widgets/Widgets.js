import React, { useState, useEffect } from "react";
import { Toast, useToast } from "components/Toast";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Container,
  Row,
  Col,
  Table,
  Button,
  Input,
  InputGroup,
  InputGroupText,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Form,
  FormGroup,
  Label,
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Spinner,
  Alert,
  Pagination,
  PaginationItem,
  PaginationLink,
  CardFooter,
} from "reactstrap";
import { useNavigate } from "react-router-dom";
import widgetService from "services/widgetService";
import platformService from "services/platformService";
import { IoClose, IoAdd, IoPencil, IoTrash, IoEye } from "react-icons/io5";
import assistantService from "services/assistantService";
// Display path options for hierarchical selection
const DISPLAY_PATH_OPTIONS = {
  "Home Screen": {
    "Left Panel": [],
    "Right Panel": [],
  }
};

const Widgets = () => {
  const navigate = useNavigate();
  const { toast, showSuccess, showError, showWarning, showInfo, hideToast } = useToast();
  const [widgets, setWidgets] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState(null);
  const [formData, setFormData] = useState({
    widgetName: "",
    widgetDescription: "",
    widgetKey: ""
  });
  const [filters, setFilters] = useState({
    widgetName: "",
    widgetKey: "",
    isActive: "",
    platform: "",
  });
  const [statusConfirmModal, setStatusConfirmModal] = useState({
    isOpen: false,
    widget: null,
    newStatus: null
  });

  // Initialize data
  const initializeData = async () => {
    try {
      await fetchPlatforms();
      await fetchWidgets();
    } catch (error) {
      console.error("Error initializing data:", error);
    }
  };
  
  // Fetch widgets and platforms on component mount
  useEffect(() => {
    initializeData();
  }, []);

  const fetchWidgets = async () => {
    try {
      setLoading(true);
      const response = await widgetService.getAllWidgets(filters);
      setWidgets(response.body?.data || response.body || []);
    } catch (error) {
      console.error("Error fetching widgets:", error);
      showError("Error fetching widgets");
    } finally {
      setLoading(false);
    }
  };

  const fetchPlatforms = async () => {  
    try {
      const response = await platformService.getAllPlatforms();
      const platformsData = response.body?.data || response.body || [];
      console.log("Fetched platforms:", platformsData);
      setPlatforms(platformsData);
    } catch (error) {
      console.error("Error fetching platforms:", error);
      showError("Error fetching platforms");
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle platform selection (multiselect)
  const handlePlatformChange = (selectedPlatforms) => {
    console.log("Platform selection changed:", selectedPlatforms);
    setFormData((prev) => ({
      ...prev,
      platforms: selectedPlatforms,
    }));
  };

  // Helper function to safely get selected platforms array
  const getSelectedPlatforms = () => {
    return Array.isArray(formData.platforms) ? formData.platforms : [];
  };


  // Open modal for creating new widget
  const openCreateModal = () => {
    setEditingWidget(null);
    setFormData({
      widgetName: "",
      widgetDescription: "",
      widgetKey: "",
      platforms: []
    });
    setModalOpen(true);
  };

  // Open modal for editing widget
  const openEditModal = (widget) => {
    setEditingWidget(widget);
    setFormData({
      widgetName: widget.widgetName,
      widgetDescription: widget.widgetDescription || "",
      widgetKey: widget.widgetKey,
      platforms: widget.platforms || []
    });
    setModalOpen(true);
  };

  // Handle form submission
  const handleSubmit = async () => {
    try {
      setLoading(true);
      
      if (editingWidget) {
        await widgetService.updateWidget(editingWidget.id, formData);
        showSuccess("Widget updated successfully");
      } else {
        await widgetService.createWidget(formData);
        showSuccess("Widget created successfully");
      }
      
      setModalOpen(false);
      fetchWidgets(); // Refresh the list
    } catch (error) {
      console.error("Error saving widget:", error);
      showError(error.response?.data?.message || "Error saving widget");
    } finally {
      setLoading(false);
    }
  };

  // Handle widget deletion
  const handleDelete = async (widgetId) => {
    if (window.confirm("Are you sure you want to delete this widget?")) {
      try {
        setLoading(true);
        await widgetService.deleteWidget(widgetId);
        showSuccess("Widget deleted successfully");
        fetchWidgets(); // Refresh the list
      } catch (error) {
        console.error("Error deleting widget:", error);
        showError("Error deleting widget");
      } finally {
        setLoading(false);
      }
    }
  };

  // Handle widget status toggle
  const handleToggleStatus = (widget) => {
    const newStatus = !widget.isActive;
    
    // If making widget inactive, show confirmation modal
    if (!newStatus) {
      setStatusConfirmModal({
        isOpen: true,
        widget: widget,
        newStatus: newStatus
      });
    } else {
      // If making widget active, proceed directly
      confirmStatusChange(widget.id, newStatus);
    }
  };

  // Confirm status change
  const confirmStatusChange = async (widgetId, newStatus) => {
    try {
      setLoading(true);
      await widgetService.toggleWidgetStatus(widgetId);
      const statusText = newStatus ? "activated" : "deactivated";
      showSuccess(`Widget ${statusText} successfully`);
      fetchWidgets(); // Refresh the list
    } catch (error) {
      console.error("Error toggling widget status:", error);
      showError("Error updating widget status");
    } finally {
      setLoading(false);
      setStatusConfirmModal({ isOpen: false, widget: null, newStatus: null });
    }
  };

  // Close status confirmation modal
  const closeStatusConfirmModal = () => {
    setStatusConfirmModal({ isOpen: false, widget: null, newStatus: null });
  };

  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Apply filters
  const applyFilters = () => {
    fetchWidgets();
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      widgetName: "",
      widgetKey: "",
      isActive: "",
      platform: "",
    });
  };

  return (
    <>
      <Container fluid className="pt-6">
          <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              WIDGETS
            </h3>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="mt-3">
                  <Col md="6">
                    <InputGroup className="mb-3 d-none">
                      <InputGroupText>
                        <i className="fas fa-search"></i>
                      </InputGroupText>
                      <Input
                        placeholder="Search widgets..."
                        value={filters.widgetName}
                        onChange={(e) =>
                          setFilters((prev) => ({
                            ...prev,
                            widgetName: e.target.value,
                          }))
                        }
                        onKeyPress={(e) => e.key === "Enter" && applyFilters()}
                        className="form-control-alternative"
                      />
                    <Button
                      color="primary"
                        onClick={applyFilters}
                        className="btn-icon-only"
                    >
                        <i className="fas fa-search"></i>
                    </Button>
                    </InputGroup>
                    </Col>
                  <Col md="6" className="text-right">
                    <Button color="primary" size="sm" onClick={openCreateModal}>
                      <i className="fas fa-plus mr-1"></i>
                      Add New Widget
                        </Button>
                    </Col>
                  </Row>
              </CardHeader>

              <CardBody className="px-0 pt-0 pb-2">
                <div className="table-responsive">
                  <Table
                    className="align-items-center table-flush mb-0"
                    style={{ position: "relative" }}
                  >
                    <thead className="thead-light">
                      <tr>
                        <th
                          style={{
                            whiteSpace: "normal",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            textTransform: "uppercase",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            height: "40px",
                            lineHeight: "24px",
                            verticalAlign: "middle",
                            width: "10%",
                          }}
                        >
                          ID
                        </th>
                        <th
                          style={{
                            whiteSpace: "normal",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            textTransform: "uppercase",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            height: "40px",
                            lineHeight: "24px",
                            verticalAlign: "middle",
                            width: "15%",
                          }}
                        >
                          Widget Name
                        </th>
                        <th
                          style={{
                            whiteSpace: "normal",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            textTransform: "uppercase",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            height: "40px",
                            lineHeight: "24px",
                            verticalAlign: "middle",
                            width: "25%",
                          }}
                        >
                          Description
                        </th>
                        <th
                          style={{
                            whiteSpace: "normal",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            textTransform: "uppercase",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            height: "40px",
                            lineHeight: "24px",
                            verticalAlign: "middle",
                            width: "15%",
                          }}
                        >
                          Key
                        </th>
                        <th
                          style={{
                            whiteSpace: "normal",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            textTransform: "uppercase",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            height: "40px",
                            lineHeight: "24px",
                            verticalAlign: "middle",
                            width: "15%",
                          }}
                        >
                          Platforms
                        </th>
                        <th
                          style={{
                            whiteSpace: "normal",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            textTransform: "uppercase",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            height: "40px",
                            lineHeight: "24px",
                            verticalAlign: "middle",
                            width: "10%",
                          }}
                        >
                          Status
                        </th>
                        <th
                          style={{
                            whiteSpace: "normal",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            textTransform: "uppercase",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            height: "40px",
                            lineHeight: "24px",
                            verticalAlign: "middle",
                            width: "15%",
                          }}
                        >
                          Actions
                        </th>
                        </tr>
                      </thead>
                      <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan="7" className="text-center py-4">
                            <Spinner color="primary" />
                          </td>
                        </tr>
                      ) : widgets.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="text-center">
                              No widgets found
                            </td>
                          </tr>
                        ) : (
                        widgets.map((widget, index) => (
                            <tr key={widget.id}>
                            <td
                              style={{
                                whiteSpace: "normal",
                                padding: "8px 4px",
                                textAlign: "center",
                                fontSize: "0.875rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                minHeight: "32px",
                                lineHeight: "24px",
                                verticalAlign: "middle",
                                wordBreak: "break-word",
                                width: "10%",
                              }}
                            >
                              <strong>{index + 1}</strong>
                            </td>
                            <td
                              style={{
                                whiteSpace: "normal",
                                padding: "8px 4px",
                                textAlign: "center",
                                fontSize: "0.875rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                minHeight: "32px",
                                lineHeight: "24px",
                                verticalAlign: "middle",
                                wordBreak: "break-word",
                                width: "15%",
                              }}
                            >
                              {widget.widgetName}
                            </td>
                            <td
                              style={{
                                whiteSpace: "normal",
                                padding: "8px 4px",
                                textAlign: "center",
                                fontSize: "0.875rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                minHeight: "32px",
                                lineHeight: "24px",
                                verticalAlign: "middle",
                                wordBreak: "break-word",
                                width: "25%",
                              }}
                            >
                              <div style={{ maxWidth: "400px" }}>
                                {widget.widgetDescription &&
                                widget.widgetDescription.length > 100
                                  ? `${widget.widgetDescription.substring(
                                      0,
                                      100
                                    )}...`
                                  : widget.widgetDescription || "-"}
                              </div>
                              </td>
                            <td
                              style={{
                                whiteSpace: "normal",
                                padding: "8px 4px",
                                textAlign: "center",
                                fontSize: "0.875rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                minHeight: "32px",
                                lineHeight: "24px",
                                verticalAlign: "middle",
                                wordBreak: "break-word",
                                width: "15%",
                              }}
                            >
                              <Badge color="primary">{widget.widgetKey}</Badge>
                              </td>
                            <td
                              style={{
                                whiteSpace: "normal",
                                padding: "8px 4px",
                                textAlign: "center",
                                fontSize: "0.875rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                minHeight: "32px",
                                lineHeight: "24px",
                                verticalAlign: "middle",
                                wordBreak: "break-word",
                                width: "15%",
                              }}
                            >
                              <div className="d-flex flex-wrap gap-1 justify-content-center">
                                {widget.platforms &&
                                  widget.platforms.map((platformId) => {
                                    const platform = platforms.find(
                                      (p) =>
                                        p.id.toString() ===
                                        platformId.toString()
                                    );
                                    return platform ? (
                                      <Badge
                                        key={platformId}
                                        color="primary"
                                        className="small"
                                      >
                                        {platform.name}
                                      </Badge>
                                    ) : null;
                                  })}
                                </div>
                              </td>
                            <td
                              style={{
                                whiteSpace: "normal",
                                padding: "8px 4px",
                                textAlign: "center",
                                fontSize: "0.875rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                minHeight: "32px",
                                lineHeight: "24px",
                                verticalAlign: "middle",
                                wordBreak: "break-word",
                                width: "10%",
                              }}
                            >
                                <Badge
                                color={
                                  widget.isActive ? "success" : "danger"
                                }
                                  style={{ cursor: "pointer" }}
                                  onClick={() => handleToggleStatus(widget)}
                                >
                                  {widget.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </td>
                            <td
                              style={{
                                whiteSpace: "normal",
                                padding: "8px 4px",
                                textAlign: "center",
                                fontSize: "0.875rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                minHeight: "32px",
                                lineHeight: "24px",
                                verticalAlign: "middle",
                                wordBreak: "break-word",
                                width: "15%",
                                position: "relative",
                              }}
                            >
                              <div className="d-flex justify-content-center gap-2">
                                  <Button
                                  color="primary"
                                    size="sm"
                                  className="btn-icon-only rounded-circle"
                                    onClick={() => openEditModal(widget)}
                                  title="Edit Widget"
                                  >
                                  <i
                                    className="fas fa-edit"
                                    style={{ fontSize: "12px" }}
                                  />
                                  </Button>
                                  {/* <Button
                                    color="danger"
                                    size="sm"
                                  className="btn-icon-only rounded-circle"
                                    onClick={() => handleDelete(widget.id)}
                                  title="Delete Widget"
                                  >
                                  <i
                                    className="fas fa-trash"
                                    style={{ fontSize: "12px" }}
                                  />
                                  </Button> */}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </Table>
                </div>
                </CardBody>
              </Card>
          </div>
          </Row>
        </Container>

      {/* Widget Form Modal */}
      <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)} size="lg">
        <ModalHeader toggle={() => setModalOpen(false)}>
          {editingWidget ? "Edit Widget" : "Create New Widget"}
        </ModalHeader>
        <ModalBody>
          <Form>
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>
                    Widget Name <span className="text-danger">*</span>
                  </Label>
                  <Input
                    type="text"
                    name="widgetName"
                    value={formData.widgetName}
                    onChange={handleInputChange}
                    placeholder="Enter widget name"
                    required
                  />
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label data-toggle="tooltip" data-placement="top" title="This is the widget key that will be used to identify the widget in the frontend">
                    Widget Key <span className="text-danger">*</span>
                  </Label>
                  <Input
                    type="text"
                    name="widgetKey"
                    data-toggle="tooltip" data-placement="top" title=" This key will be used to identify the widget in the frontend"
                    value={formData.widgetKey}
                    onChange={handleInputChange}
                    placeholder="Enter unique widget key"
                    required
                  />
                </FormGroup>
              </Col>
            </Row>

            <FormGroup>
              <Label>Widget Description</Label>
              <Input
                type="textarea"
                name="widgetDescription"
                value={formData.widgetDescription}
                onChange={handleInputChange}
                placeholder="Enter widget description"
                rows="3"
              />
            </FormGroup>

            <FormGroup>
              <Label>
                Platforms <span className="text-danger">*</span>
              </Label>

              {/* Selected Platforms Display */}
              {getSelectedPlatforms().length > 0 && (
                <div className="mb-3">
                  <div className="d-flex flex-wrap gap-2">
                    {getSelectedPlatforms().map((platformId) => {
                      const platform = platforms.find(
                        (p) => p.id.toString() === platformId.toString()
                      );
                      return platform ? (
                        <Badge
                          key={platformId}
                          color="primary"
                          className="d-flex align-items-center"
                          style={{
                            fontSize: "0.775rem",
                            padding: "0.4rem 0.75rem",
                            margin: "2px",
                          }}
                        >
                          {platform.name}
                          <IoClose
                            className="ms-2"
                            style={{
                              cursor: "pointer",
                              fontSize: "1.1rem",
                            }}
                            onClick={() => {
                              const newPlatforms =
                                getSelectedPlatforms().filter(
                                  (id) =>
                                    id.toString() !== platformId.toString()
                                );
                              handlePlatformChange(newPlatforms);
                            }}
                          />
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* Platform Selection Dropdown */}
              <Input
                type="select"
                onChange={(e) => {
                  const selectedId = e.target.value;
                  console.log("Platform dropdown changed:", selectedId);
                  console.log("Current selected platforms:", getSelectedPlatforms());
                  if (
                    selectedId &&
                    !getSelectedPlatforms().includes(selectedId)
                  ) {
                    const newPlatforms = [
                      ...getSelectedPlatforms(),
                      selectedId,
                    ];
                    console.log("Adding platform, new list:", newPlatforms);
                    handlePlatformChange(newPlatforms);
                  }
                  e.target.value = ""; // Reset dropdown
                }}
              >
                <option value="">Select platform...</option>
                {platforms
                  .filter(
                    (platform) =>
                      !getSelectedPlatforms().includes(platform.id.toString())
                  )
                  .map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.name}
                    </option>
                  ))}
              </Input>
              <small className="text-muted">
                Select one or more platform where this widget will be displayed
              </small>
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button
            color="primary"
            onClick={handleSubmit}
            disabled={
              loading ||
              !formData.widgetName ||
              !formData.widgetKey ||
              getSelectedPlatforms().length === 0
            }
          >
            {loading ? (
              <Spinner size="sm" />
            ) : editingWidget ? (
              "Update"
            ) : (
              "Create"
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Status Change Confirmation Modal */}
      <Modal isOpen={statusConfirmModal.isOpen} toggle={closeStatusConfirmModal} centered>
        <ModalHeader toggle={closeStatusConfirmModal}>
          Confirm Widget Deactivation
        </ModalHeader>
        <ModalBody style={{paddingTop: "5px"}}>
          <p>
            Are you sure you want to deactivate the widget <strong>"{statusConfirmModal.widget?.widgetName}"</strong>?
          </p>
          <p >
            This action will affect all assistant widgets that are assigned to the <strong>"{statusConfirmModal.widget?.widgetKey}"</strong> category.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={closeStatusConfirmModal}>
            Cancel
          </Button>
          <Button 
            color="primary" 
            onClick={() => confirmStatusChange(statusConfirmModal.widget.id, statusConfirmModal.newStatus)}
            disabled={loading}
          >
            {loading ? <Spinner size="sm" /> : "Yes, Deactivate Widget"}
          </Button>
        </ModalFooter>
      </Modal>

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        position={toast.position}
        onClose={hideToast}
        autoHide={true}
        autoHideDelay={2000}
      />
    </>
  );
};

export default Widgets;
