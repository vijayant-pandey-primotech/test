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
import platformService, {
  platformAxiosInstance,
} from "services/platformService";
import storyService from "services/storyService";
import { useLocation } from "react-router-dom";

const Platforms = () => {
  const location = useLocation();
  const { toast, showSuccess, showError, showWarning, showInfo, hideToast } =
    useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [platformToDelete, setPlatformToDelete] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newPlatform, setNewPlatform] = useState({ 
    name: "", 
    description: "",
    onboardingMessage: ""
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  // Story management state
  const [stories, setStories] = useState([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [storyEditModal, setStoryEditModal] = useState(false);
  const [storyEditForm, setStoryEditForm] = useState({
    storyName: "",
    description: "",
    isDefault: "yes",
  });
  const [editingStory, setEditingStory] = useState(null);
  const [storyEditLoading, setStoryEditLoading] = useState(false);

  const navigate = useNavigate();
  // Table styles
  const tableStyles = {
    table: {
      width: "100%",
      tableLayout: "fixed",
    },
    th: {
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
    },
    td: {
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
    },
  };

  // Add effect to handle location state messages
  useEffect(() => {
    console.log("Location state changed:", location.state);
    if (location.state?.message) {
      console.log(
        "Showing toast message:",
        location.state.message,
        location.state.type
      );

      // Use custom toast methods based on type
      const message = location.state.message;
      const type = location.state.type;

      switch (type) {
        case "success":
          showSuccess(message);
          break;
        case "error":
        case "danger":
          showError(message);
          break;
        case "warning":
          showWarning(message);
          break;
        case "info":
          showInfo(message);
          break;
        default:
          showSuccess(message); // Default to success
      }

      // Clear the location state after showing the message
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    setLoading(true);
    platformService
      .getAllPlatforms()
      .then((data) => {
        setPlatforms(data.body || []);
        console.log(data.body);
      })
      .catch((err) => {
        setError("Failed to load platforms");
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);
  const handleManageTrainingData = (platform) => {
    navigate(`/admin/platform/edit-platform-data/${platform.id}`);
    // Navigate to training data management page or open modal
    // You can implement navigation or modal here
    // alert(`Manage training data for ${platform.name}`);
  };

  const handleDelete = async (platform) => {
    setPlatformToDelete(platform);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!platformToDelete) return;

    // Simulate API delay
    setTimeout(() => {
      setPlatforms((prevPlatforms) =>
        prevPlatforms.filter((platform) => platform.id !== platformToDelete.id)
      );
              showSuccess("Platform deleted successfully!");
      setDeleteModalOpen(false);
      setPlatformToDelete(null);
    }, 500);
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setPlatformToDelete(null);
  };

  const handleCreatePlatform = () => {
    setCreateModalOpen(true);
  };

  const handleCreateCancel = () => {
    setCreateModalOpen(false);
    setNewPlatform({ 
      name: "", 
      description: "",
      onboardingMessage: ""
    });
  };

  const handleEditPlatform = (platform) => {
    setEditingPlatform(platform);
    setNewPlatform({
      name: platform.name || "",
      description: platform.description || "",
     onboardingMessage: platform.onboardingMessage || ""
    });
    setEditModalOpen(true);
  };

  const handleEditCancel = () => {
    setEditModalOpen(false);
    setEditingPlatform(null);
    setNewPlatform({ 
      name: "", 
      description: "",
      onboardingMessage: ""
    });
  };

  const handleEditConfirm = async () => {
    if (!newPlatform.name.trim()) {
      showError("Platform name is required");
      return;
    }

    setEditLoading(true);
    try {
      const response = await platformService.updatePlatform(editingPlatform.id, newPlatform);

      if (response.status === 200) {
        setPlatforms((prevPlatforms) =>
          prevPlatforms.map((p) =>
            p.id === editingPlatform.id ? { ...p, ...newPlatform } : p
          )
        );
        showSuccess(response.message || "Platform updated successfully!");
        handleEditCancel();
      } else {
        showError(response.message || "Failed to update platform");
      }
    } catch (error) {
      console.error("Error updating platform:", error);
      showError(error.response?.data?.message || "Failed to update platform");
    } finally {
      setEditLoading(false);
    }
  };

  const handleCreateConfirm = async () => {
    if (!newPlatform.name.trim()) {
      showError("Platform name is required");
      return;
    }

    setCreateLoading(true);
    try {
      const response = await platformService.createPlatform(newPlatform);

      // Check if response status is 200 (success)
      if (response.status === 200 && response.body) {
        // Add the new platform to the list
        setPlatforms((prevPlatforms) => [...prevPlatforms, response.body]);
        showSuccess(response.message || "Platform created successfully!");
        handleCreateCancel();
      } else {
        showError(response.message || "Failed to create platform");
      }
    } catch (error) {
      console.error("Error creating platform:", error);

      // Handle different error scenarios
      if (error.response && error.response.data) {
        showError(error.response.data.message || "Failed to create platform");
      } else if (error.message) {
        showError(error.message);
      } else {
        showError("Failed to create platform. Please try again.");
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setNewPlatform((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleStoryEditSubmit = async () => {
    if (!storyEditForm.storyName.trim()) {
      showError("Story name is required");
      return;
    }

    setStoryEditLoading(true);
    try {
      const response = await storyService.updateStory(editingStory.storyId, {
        storyName: storyEditForm.storyName.trim(),
        description: storyEditForm.description.trim() || "",
        isDefault: storyEditForm.isDefault === "yes" ? true : false,
      });

      if (response.status === 200) {
        showSuccess("Story updated successfully!");
        setStoryEditModal(false);
        setEditingStory(null);
        setStoryEditForm({
          storyName: "",
          description: "",
          isDefault: "yes",
        });
        // Optionally refresh stories list if you have one
      } else {
        showError(response.message || "Failed to update story");
      }
    } catch (error) {
      console.error("Error updating story:", error);
      showError("Failed to update story");
    } finally {
      setStoryEditLoading(false);
    }
  };

  const handleStoryEditCancel = () => {
    setStoryEditModal(false);
    setEditingStory(null);
    setStoryEditForm({
      storyName: "",
      description: "",
      isDefault: "yes",
    });
  };

  // Pagination logic
  // Update filteredPlatforms to include all platforms (no isDeleted filter)
  const filteredPlatforms = Array.isArray(platforms)
    ? platforms.filter((platform) =>
        Object.values(platform).some(
          (value) =>
            value &&
            value.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : [];

  const totalPages = Math.ceil(filteredPlatforms.length / recordsPerPage);
  const paginatedPlatforms = filteredPlatforms.slice(
    (currentPage - 1) * recordsPerPage,
    currentPage * recordsPerPage
  );

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Reset to first page on search/filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, platforms]);

  // Pagination helpers
  const getVisiblePages = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) {
      return [1, 2, 3, 4, 5];
    }
    if (currentPage >= totalPages - 2) {
      return [
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    }
    return [
      currentPage - 2,
      currentPage - 1,
      currentPage,
      currentPage + 1,
      currentPage + 2,
    ];
  };

  const shouldShowLeftArrow = () => currentPage > 1;
  const shouldShowRightArrow = () => currentPage < totalPages;

  const getEntryRange = () => {
    const start = (currentPage - 1) * recordsPerPage + 1;
    const end = Math.min(
      currentPage * recordsPerPage,
      filteredPlatforms.length
    );
    return { start, end };
  };

  // Show loading state
  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              PLATFORMS
            </h3>
            <Card className="shadow">
              <CardBody className="text-center py-5">
                <Spinner color="primary" />
                <p className="mt-3 text-muted">Loading platforms...</p>
              </CardBody>
            </Card>
          </div>
        </Row>
      </Container>
    );
  }

  // Show error state
  if (error) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              PLATFORMS
            </h3>
            <Alert color="danger">
              <h4 className="alert-heading">Error Loading Platforms</h4>
              <p>{error}</p>
              <hr />
              <Button color="danger">Try Again</Button>
            </Alert>
          </div>
        </Row>
      </Container>
    );
  }
  const renderPlatformFormFields = () => (
    <>
      <FormGroup>
        <Label for="platformName">Platform Name *</Label>
        <Input
          type="text"
          id="platformName"
          placeholder="Enter platform name"
          value={newPlatform.name}
          onChange={(e) => handleInputChange("name", e.target.value)}
          className="form-control-alternative"
        />
      </FormGroup>
      <FormGroup>
        <Label for="platformDescription">Description</Label>
        <Input
          type="textarea"
          id="platformDescription"
          placeholder="Enter platform description"
          value={newPlatform.description}
          onChange={(e) => handleInputChange("description", e.target.value)}
          className="form-control-alternative"
          rows="2"
        />
      </FormGroup>
      <FormGroup>
        <Label for="onboardingMessage">Onboarding Message</Label>
        <Input
          type="textarea"
          id="onboardingMessage"
          placeholder="Enter onboarding message"
          value={newPlatform.onboardingMessage}
          onChange={(e) => handleInputChange("onboardingMessage", e.target.value)}
          className="form-control-alternative"
          rows="3"
        />
      </FormGroup>
    </>
  );

  const renderCreatePlatformModal = () => {
    return (
      <Modal isOpen={createModalOpen} toggle={handleCreateCancel} centered size="lg">
        <ModalHeader className="border-0 pb-0" toggle={handleCreateCancel}>
          Create New Platform
        </ModalHeader>
        <ModalBody className="pt-0" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <Form>
            {renderPlatformFormFields()}
          </Form>
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button
              color="secondary"
              onClick={handleCreateCancel}
              disabled={createLoading}
            >
              Cancel
            </Button>
            <Button
              color="primary"
              onClick={handleCreateConfirm}
              disabled={createLoading || !newPlatform.name.trim()}
            >
              {createLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                "Create Platform"
              )}
            </Button>
          </div>
        </ModalBody>
      </Modal>
    );
  };

  const renderEditPlatformModal = () => {
    return (
      <Modal isOpen={editModalOpen} toggle={handleEditCancel} centered size="lg">
        <ModalHeader className="border-0 pb-0" toggle={handleEditCancel}>
          Edit Platform
        </ModalHeader>
        <ModalBody className="pt-0" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <Form>
            {renderPlatformFormFields()}
          </Form>
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button
              color="secondary"
              onClick={handleEditCancel}
              disabled={editLoading}
            >
              Cancel
            </Button>
            <Button
              color="primary"
              onClick={handleEditConfirm}
              disabled={editLoading || !newPlatform.name.trim()}
            >
              {editLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Updating...
                </>
              ) : (
                "Update Platform"
              )}
            </Button>
          </div>
        </ModalBody>
      </Modal>
    );
  };

  return (
    <>
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              PLATFORMS
            </h3>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="mt-3">
                  <Col md="6">
                    <InputGroup>
                      <InputGroupText>
                        <i className="fas fa-search"></i>
                      </InputGroupText>
                      <Input
                        placeholder="Search platforms..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-control-alternative"
                      />
                    </InputGroup>
                  </Col>
                  <Col md="6" className="text-right">
                    <Button
                      color="primary"
                      size="sm"
                      onClick={handleCreatePlatform}
                    >
                      <i className="fas fa-plus mr-1"></i>
                      Add New Platform
                    </Button>
                  </Col>
                </Row>
              </CardHeader>
              <CardBody className="px-0 pt-0 pb-2">
                <div className="table-responsive">
                  <Table
                    className="align-items-center table-flush mb-0"
                    style={{ ...tableStyles.table, position: "relative" }}
                  >
                    <thead className="thead-light">
                      <tr>
                        <th style={{ ...tableStyles.th, width: "10%" }}>ID</th>
                        <th style={{ ...tableStyles.th, width: "25%" }}>
                          Name
                        </th>
                        <th style={{ ...tableStyles.th, width: "45%" }}>
                          Description
                        </th>
                        <th style={{ ...tableStyles.th, width: "20%" }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPlatforms.map((platform, index) => (
                        <tr key={platform.id}>
                          <td style={{ ...tableStyles.td, width: "10%" }}>
                            <strong>
                              {(currentPage - 1) * recordsPerPage + index + 1}
                            </strong>
                          </td>
                          <td style={{ ...tableStyles.td, width: "25%" }}>
                            {platform.name}
                            {platform.isDeleted && (
                              <Badge color="danger" className="ml-2">
                                Deleted
                              </Badge>
                            )}
                          </td>
                          <td style={{ ...tableStyles.td, width: "45%" }}>
                            <div style={{ maxWidth: "400px" }}>
                              {platform.description &&
                              platform.description.length > 150
                                ? `${platform.description.substring(0, 150)}...`
                                : platform.description || "-"}
                            </div>
                          </td>
                          <td
                            style={{
                              ...tableStyles.td,
                              width: "20%",
                              position: "relative",
                            }}
                          >
                            <div className="d-flex justify-content-center gap-2">
                              {/* Manage Training Data Button */}
                              <Button
                                color="primary"
                                size="sm"
                                className="btn-icon-only rounded-circle"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleManageTrainingData(platform);
                                }}
                                title="Manage Training Data"
                              >
                                <i
                                  className="fas fa-database"
                                  style={{ fontSize: "12px" }}
                                />
                              </Button>

                              {/* Edit Button */}
                              <Button
                                color="warning"
                                size="sm"
                                className="btn-icon-only rounded-circle"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleEditPlatform(platform);
                                }}
                                title="Edit Platform"
                                // style={{ display: 'none' }}
                              >
                                <i
                                  className="fas fa-edit"
                                  style={{ fontSize: "12px" }}
                                />
                              </Button>

                              {/* Delete Button */}
                              {/* <Button
                                color="danger"
                                size="sm"
                                className="btn-icon-only rounded-circle"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDelete(platform);
                                }}
                                title="Delete Platform"
                              >
                                <i
                                  className="fas fa-trash"
                                  style={{ fontSize: "12px" }}
                                />
                              </Button> */}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                {/* Pagination Controls */}
                <CardFooter className="py-4">
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="text-muted">
                      {filteredPlatforms.length > 0
                        ? `Showing ${getEntryRange().start} to ${
                            getEntryRange().end
                          } of ${filteredPlatforms.length} entries`
                        : "No entries found"}
                    </div>
                    {totalPages > 1 && (
                      <nav aria-label="...">
                        <Pagination
                          className="pagination justify-content-end mb-0"
                          listClassName="justify-content-end mb-0"
                        >
                          {/* First Page */}
                          <PaginationItem disabled={currentPage === 1}>
                            <PaginationLink
                              href="#pablo"
                              onClick={(e) => {
                                e.preventDefault();
                                handlePageChange(1);
                              }}
                            >
                              <i className="fas fa-angle-double-left" />
                              <span className="sr-only">First</span>
                            </PaginationLink>
                          </PaginationItem>
                          {/* Previous Page */}
                          {shouldShowLeftArrow() && (
                            <PaginationItem>
                              <PaginationLink
                                href="#pablo"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handlePageChange(currentPage - 1);
                                }}
                              >
                                <i className="fas fa-angle-left" />
                                <span className="sr-only">Previous</span>
                              </PaginationLink>
                            </PaginationItem>
                          )}
                          {/* Page Numbers */}
                          {getVisiblePages().map((pageNum) => (
                            <PaginationItem
                              key={pageNum}
                              className={
                                currentPage === pageNum ? "active" : ""
                              }
                            >
                              <PaginationLink
                                href="#pablo"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handlePageChange(pageNum);
                                }}
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          ))}
                          {/* Next Page */}
                          {shouldShowRightArrow() && (
                            <PaginationItem>
                              <PaginationLink
                                href="#pablo"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handlePageChange(currentPage + 1);
                                }}
                              >
                                <i className="fas fa-angle-right" />
                                <span className="sr-only">Next</span>
                              </PaginationLink>
                            </PaginationItem>
                          )}
                          {/* Last Page */}
                          <PaginationItem disabled={currentPage === totalPages}>
                            <PaginationLink
                              href="#pablo"
                              onClick={(e) => {
                                e.preventDefault();
                                handlePageChange(totalPages);
                              }}
                            >
                              <i className="fas fa-angle-double-right" />
                              <span className="sr-only">Last</span>
                            </PaginationLink>
                          </PaginationItem>
                        </Pagination>
                      </nav>
                    )}
                  </div>
                </CardFooter>

                {filteredPlatforms.length === 0 && (
                  <div className="text-center py-4">
                    <i className="fas fa-inbox fa-3x text-muted mb-3"></i>
                    <h5 className="text-muted">No platforms found</h5>
                    <p className="text-muted">
                      Try adjusting your search criteria
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </Row>
      </Container>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} toggle={handleDeleteCancel} centered>
        <ModalHeader className="border-0 pb-0" toggle={handleDeleteCancel}>
          Delete Platform?
        </ModalHeader>
        <ModalBody className="pt-0">
          <p className="text-left mb-4">
            Are you sure you want to delete this platform?
          </p>
          <div className="d-flex justify-content-end gap-3">
            <Button color="secondary" onClick={handleDeleteCancel}>
              Cancel
            </Button>
            <Button color="danger" onClick={handleDeleteConfirm}>
              Confirm
            </Button>
          </div>
        </ModalBody>
      </Modal>

      {/* Create Platform Modal */}
      {renderCreatePlatformModal()}

      {/* Edit Platform Modal */}
      {renderEditPlatformModal()}

      {/* Story Edit Modal */}
      <Modal isOpen={storyEditModal} toggle={handleStoryEditCancel} centered>
        <ModalHeader toggle={handleStoryEditCancel}>
          Edit Story Details
        </ModalHeader>
        <ModalBody>
          <Form>
            <FormGroup>
              <Label for="editStoryName">
                Story Name <span className="text-danger">*</span>
              </Label>
              <Input
                type="text"
                id="editStoryName"
                placeholder="Enter story name"
                value={storyEditForm.storyName}
                onChange={(e) =>
                  setStoryEditForm((prev) => ({
                    ...prev,
                    storyName: e.target.value,
                  }))
                }
                className="form-control-alternative"
              />
            </FormGroup>
            <FormGroup tag="fieldset">
              <Label>Default for Main</Label>
              <div className="d-flex gap-3">
                <FormGroup check>
                  <Input
                    name="editIsDefault"
                    type="radio"
                    value="yes"
                    checked={storyEditForm.isDefault === "yes"}
                    onChange={(e) =>
                      setStoryEditForm((prev) => ({
                        ...prev,
                        isDefault: e.target.value,
                      }))
                    }
                  />
                  <Label check>Yes</Label>
                </FormGroup>
                <FormGroup check className="ml-3">
                  <Input
                    name="editIsDefault"
                    type="radio"
                    value="no"
                    checked={storyEditForm.isDefault === "no"}
                    onChange={(e) =>
                      setStoryEditForm((prev) => ({
                        ...prev,
                        isDefault: e.target.value,
                      }))
                    }
                  />
                  <Label check>No</Label>
                </FormGroup>
              </div>
            </FormGroup>
            <FormGroup>
              <Label for="editDescription">Description</Label>
              <Input
                type="textarea"
                id="editDescription"
                placeholder="Enter story description"
                value={storyEditForm.description}
                onChange={(e) =>
                  setStoryEditForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="form-control-alternative"
                rows="4"
              />
            </FormGroup>
          </Form>
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button
              color="secondary"
              onClick={handleStoryEditCancel}
              disabled={storyEditLoading}
            >
              Cancel
            </Button>
            <Button
              style={{
                backgroundColor: "#3A6D8C",
                borderColor: "#3A6D8C",
                color: "white",
              }}
              onClick={handleStoryEditSubmit}
              disabled={storyEditLoading || !storyEditForm.storyName.trim()}
            >
              {storyEditLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Updating...
                </>
              ) : (
                "Update Story"
              )}
            </Button>
          </div>
        </ModalBody>
      </Modal>

      {/* Custom Toast Component */}
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

export default Platforms;
