import React, { useState, useEffect, useMemo } from "react";
import { Toast, useToast } from "components/Toast";
import {
  Card,
  CardHeader,
  CardBody,
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
  Spinner,
  Pagination,
  PaginationItem,
  PaginationLink,
  CardFooter,
  Alert,
} from "reactstrap";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { FaGripVertical } from "react-icons/fa";
import platformService from "services/platformService";

const Activities = () => {
  const { toast, showSuccess, showError, hideToast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [activities, setActivities] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const recordsPerPage = 10;
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    activityName: "",
    description: "",
    platforms: [],
    status: "Active",
    activityLabel: "",
    labelInfo: "",
  });
  const [formLoading, setFormLoading] = useState(false);
  const [isSequenceMode, setIsSequenceMode] = useState(false);
  const [reorderedActivities, setReorderedActivities] = useState(null);
  const [isSavingSequence, setIsSavingSequence] = useState(false);

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

  // Fetch platforms
  useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        const response = await platformService.getAllPlatforms();
        if (response.status === 200) {
          setPlatforms(response.body || []);
        }
      } catch (error) {
        console.error("Error fetching platforms:", error);
      }
    };
    fetchPlatforms();
  }, []);

  // Fetch activities
  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      try {
        const platformId = selectedPlatform !== "all" ? selectedPlatform : null;
        const response = await platformService.getActivities(platformId);
        if (response.status === 200) {
          setActivities(response.body || []);
        } else {
          setError("Failed to load activities");
        }
      } catch (err) {
        setError("Failed to load activities");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchActivities();
  }, [selectedPlatform]);

  const handleCreateClick = () => {
    setFormData({
      activityName: "",
      description: "",
      platforms: selectedPlatform !== "all" ? [selectedPlatform] : [],
      status: "Active",
      activityLabel: "",
      labelInfo: "",
    });
    setEditingItem(null);
    setCreateModalOpen(true);
  };

  const handleEditClick = (item) => {
    setEditingItem(item);
    setFormData({
      activityName: item.activityName || "",
      description: item.description || "",
      platforms: Array.isArray(item.platforms) && item.platforms.length > 0 ? [String(item.platforms[0])] : [],
      status: item.status || "Active",
      activityLabel: item.activityLabel || "",
      labelInfo: item.labelInfo || "",
    });
    setEditModalOpen(true);
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      const response = await platformService.deleteActivity(itemToDelete.id);
      if (response.status === 200) {
        setActivities((prev) =>
          prev.filter((item) => item.id !== itemToDelete.id)
        );
        showSuccess(response.message || "Activity deleted successfully!");
        setDeleteModalOpen(false);
        setItemToDelete(null);
      } else {
        showError(response.message || "Failed to delete activity");
      }
    } catch (error) {
      console.error("Error deleting activity:", error);
      showError(
        error.response?.data?.message || "Failed to delete activity"
      );
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const handleFormSubmit = async () => {
    if (!formData.activityName.trim()) {
      showError("Activity name is required");
      return;
    }
    if (!formData.platforms || formData.platforms.length === 0) {
      showError("At least one platform is required");
      return;
    }

    setFormLoading(true);
    try {
      const payload = {
        activityName: formData.activityName.trim(),
        description: formData.description.trim() || null,
        platforms: formData.platforms.map(p => parseInt(p)),
        status: formData.status,
        activityLabel: formData.activityLabel.trim() || null,
        labelInfo: formData.labelInfo.trim() || null,
      };

      let response;
      if (editingItem) {
        response = await platformService.updateActivity(editingItem.id, payload);
      } else {
        response = await platformService.createActivity(payload);
      }

      if (response.status === 200 || response.status === 201) {
        showSuccess(
          response.message ||
            `Activity ${editingItem ? "updated" : "created"} successfully!`
        );
        // Refresh the list
        const platformId = selectedPlatform !== "all" ? selectedPlatform : null;
        const refreshResponse = await platformService.getActivities(platformId);
        if (refreshResponse.status === 200) {
          setActivities(refreshResponse.body || []);
        }
        handleFormCancel();
      } else {
        showError(response.message || "Failed to save activity");
      }
    } catch (error) {
      console.error("Error saving activity:", error);
      showError(
        error.response?.data?.message || "Failed to save activity"
      );
    } finally {
      setFormLoading(false);
    }
  };

  const handleFormCancel = () => {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    setEditingItem(null);
    setFormData({
      activityName: "",
      description: "",
      platforms: [],
      status: "Active",
      activityLabel: "",
      labelInfo: "",
    });
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePlatformChange = (e) => {
    const platformId = e.target.value;
    setFormData((prev) => ({
      ...prev,
      platforms: platformId ? [platformId] : [],
    }));
  };

  // Filter
  const filteredItems = activities.filter((item) => {
    const matchesSearch =
      !searchTerm ||
      Object.values(item).some(
        (value) =>
          value &&
          value.toString().toLowerCase().includes(searchTerm.toLowerCase())
      );
    return matchesSearch;
  });

  // Sort sequence-wise: when a platform is selected backend already returns sorted; when "all", sort by platform then sequence
  const sortedFilteredItems = useMemo(() => {
    const list = [...filteredItems];
    list.sort((a, b) => {
      const platformA = Array.isArray(a.platforms) && a.platforms[0] != null ? String(a.platforms[0]) : "";
      const platformB = Array.isArray(b.platforms) && b.platforms[0] != null ? String(b.platforms[0]) : "";
      if (platformA !== platformB) return platformA.localeCompare(platformB);
      const seqA = a.sequence != null ? a.sequence : 999999;
      const seqB = b.sequence != null ? b.sequence : 999999;
      return seqA - seqB;
    });
    return list;
  }, [filteredItems]);

  const totalPages = Math.ceil(sortedFilteredItems.length / recordsPerPage);
  const paginatedItems = useMemo(() => {
    if (isSequenceMode) return sortedFilteredItems;
    return sortedFilteredItems.slice(
      (currentPage - 1) * recordsPerPage,
      currentPage * recordsPerPage
    );
  }, [sortedFilteredItems, isSequenceMode, currentPage, recordsPerPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedPlatform]);

  // Drag-and-drop for sequence (platform-wise)
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    const items = Array.from(sortedFilteredItems);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setReorderedActivities(items);
    setActivities(items);
  };

  const handleSaveSequence = async () => {
    if (!reorderedActivities || reorderedActivities.length === 0 || selectedPlatform === "all") {
      showError("No activities to save or platform not selected");
      return;
    }
    setIsSavingSequence(true);
    try {
      const payload = reorderedActivities.map((item) => ({ id: item.id }));
      const response = await platformService.updateActivityOrder(selectedPlatform, payload);
      if (response.status === 200) {
        showSuccess(response.message || "Activity order saved successfully!");
        setIsSequenceMode(false);
        setReorderedActivities(null);
        const platformId = selectedPlatform !== "all" ? selectedPlatform : null;
        const refreshResponse = await platformService.getActivities(platformId);
        if (refreshResponse.status === 200) {
          setActivities(refreshResponse.body || []);
        }
      } else {
        showError(response.error || response.message || "Failed to save order");
      }
    } catch (error) {
      console.error("Error saving activity order:", error);
      showError(
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message ||
          "Error saving activity order"
      );
      const platformId = selectedPlatform !== "all" ? selectedPlatform : null;
      const refreshResponse = await platformService.getActivities(platformId);
      if (refreshResponse.status === 200) {
        setActivities(refreshResponse.body || []);
      }
    } finally {
      setIsSavingSequence(false);
    }
  };

  const handleCancelSequence = () => {
    setIsSequenceMode(false);
    setReorderedActivities(null);
    const platformId = selectedPlatform !== "all" ? selectedPlatform : null;
    platformService.getActivities(platformId).then((response) => {
      if (response.status === 200) {
        setActivities(response.body || []);
      }
    });
  };

  useEffect(() => {
    if (selectedPlatform === "all" && isSequenceMode) {
      setIsSequenceMode(false);
      setReorderedActivities(null);
    }
  }, [selectedPlatform, isSequenceMode]);

  const getPlatformNames = (platformIds) => {
    if (!Array.isArray(platformIds)) return "-";
    return platformIds
      .map((id) => {
        const platform = platforms.find((p) => p.id.toString() === String(id));
        return platform ? platform.name : null;
      })
      .filter(Boolean)
      .join(", ") || "-";
  };

  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <Col>
            <Card className="shadow">
              <CardBody className="text-center py-5">
                <Spinner color="primary" />
                <p className="mt-3">Loading activities...</p>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <>
      <Container fluid className="pt-6">
        <Row>
          <Col>
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              Activities
            </h3>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="align-items-center">
                  <Col md="4">
                    <InputGroup>
                      <InputGroupText>
                        <i className="fas fa-search" />
                      </InputGroupText>
                      <Input
                        type="text"
                        placeholder="Search activities..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </InputGroup>
                  </Col>
                  <Col md="4">
                    <Input
                      type="select"
                      value={selectedPlatform}
                      onChange={(e) => setSelectedPlatform(e.target.value)}
                    >
                      <option value="all">All Platforms</option>
                      {platforms.map((platform) => (
                        <option key={platform.id} value={platform.id}>
                          {platform.name}
                        </option>
                      ))}
                    </Input>
                  </Col>
                  <Col md="4" className="text-right">
                    {isSequenceMode ? (
                      <>
                        <Button
                          color="primary"
                          onClick={handleSaveSequence}
                          disabled={isSavingSequence || !reorderedActivities}
                          className="mr-2"
                        >
                          {isSavingSequence ? (
                            <>
                              <Spinner size="sm" className="mr-2" />
                              Saving...
                            </>
                          ) : (
                            "Save Sequence"
                          )}
                        </Button>
                        <Button
                          color="secondary"
                          onClick={handleCancelSequence}
                          disabled={isSavingSequence}
                        >
                          <i className="fas fa-times mr-2" />
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        {activities.length > 0 && (
                          <Button
                            color="primary"
                            onClick={() => {
                              setIsSequenceMode(true);
                              setReorderedActivities(sortedFilteredItems);
                            }}
                            className={`mr-2 ${selectedPlatform === "all" ? "d-none" : ""}`}
                            title={selectedPlatform === "all" ? "Select a platform to reorder activities" : "Reorder activities for this platform"}
                          >
                            Change Sequence
                          </Button>
                        )}
                        <Button
                          color="primary"
                          onClick={handleCreateClick}
                          className="btn-custom-primary"
                        >
                          <i className="fas fa-plus mr-2" />
                          Create New
                        </Button>
                      </>
                    )}
                  </Col>
                </Row>
              </CardHeader>
              <CardBody className="px-0">
                {error ? (
                  <Alert color="danger" className="m-3">
                    {error}
                  </Alert>
                ) : selectedPlatform === "all" && isSequenceMode ? (
                  <Alert color="warning" className="m-3">
                    <i className="fas fa-exclamation-triangle mr-2" />
                    Please select a specific platform to reorder activities. Sequence is per platform.
                  </Alert>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-muted">No activities found</p>
                  </div>
                ) : (
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Table className="align-items-center table-flush" style={tableStyles.table}>
                      <thead className="thead-light">
                        <tr>
                          {isSequenceMode && (
                            <th style={{ ...tableStyles.th, width: "5%" }}>DRAG</th>
                          )}
                          <th style={{ ...tableStyles.th, width: "8%" }}>SEQUENCE</th>
                          <th style={{ ...tableStyles.th, width: "10%" }}>ID</th>
                          <th style={{ ...tableStyles.th, width: "20%" }}>NAME</th>
                          <th style={{ ...tableStyles.th, width: "25%" }}>DESCRIPTION</th>
                          <th style={{ ...tableStyles.th, width: "15%" }}>PLATFORMS</th>
                          <th style={{ ...tableStyles.th, width: "10%" }}>STATUS</th>
                          {!isSequenceMode && (
                            <th style={{ ...tableStyles.th, width: "20%" }}>ACTIONS</th>
                          )}
                        </tr>
                      </thead>
                      <Droppable droppableId="activities">
                        {(provided) => (
                          <tbody {...provided.droppableProps} ref={provided.innerRef}>
                            {paginatedItems.map((item, index) => (
                              <Draggable
                                key={item.id}
                                draggableId={String(item.id)}
                                index={index}
                                isDragDisabled={!isSequenceMode}
                              >
                                {(providedDraggable, snapshot) => (
                                  <tr
                                    ref={providedDraggable.innerRef}
                                    {...providedDraggable.draggableProps}
                                    style={{
                                      ...providedDraggable.draggableProps.style,
                                      backgroundColor: snapshot.isDragging ? "#f8f9fa" : "transparent",
                                    }}
                                  >
                                    {isSequenceMode && (
                                      <td style={tableStyles.td}>
                                        <div {...providedDraggable.dragHandleProps}>
                                          <FaGripVertical className="text-muted" />
                                        </div>
                                      </td>
                                    )}
                                    <td style={tableStyles.td}>
                                      <Badge color="info" className="font-weight-bold">
                                        {isSequenceMode ? index + 1 : (item.sequence != null ? item.sequence : "—")}
                                      </Badge>
                                    </td>
                                    <td style={tableStyles.td}>{item.id}</td>
                                    <td style={tableStyles.td}>{item.activityName}</td>
                                    <td style={tableStyles.td}>
                                      {item.description || "-"}
                                    </td>
                                    <td style={tableStyles.td}>
                                      {getPlatformNames(item.platforms)}
                                    </td>
                                    <td style={tableStyles.td}>
                                      <Badge color={item.status === "Active" ? "success" : "secondary"}>
                                        {item.status}
                                      </Badge>
                                    </td>
                                    {!isSequenceMode && (
                                      <td style={tableStyles.td}>
                                        <Button
                                          color="link"
                                          size="sm"
                                          onClick={() => handleEditClick(item)}
                                          className="mr-2"
                                        >
                                          <i className="fas fa-edit text-warning" />
                                        </Button>
                                        <Button
                                          color="link"
                                          size="sm"
                                          onClick={() => handleDeleteClick(item)}
                                        >
                                          <i className="fas fa-trash text-danger" />
                                        </Button>
                                      </td>
                                    )}
                                  </tr>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </tbody>
                        )}
                      </Droppable>
                    </Table>
                  </DragDropContext>
                )}
              </CardBody>
              {totalPages > 1 && !isSequenceMode && (
                <CardFooter className="py-4">
                  <nav aria-label="...">
                    <Pagination
                      className="pagination justify-content-end mb-0"
                      listClassName="justify-content-end mb-0"
                    >
                      <PaginationItem disabled={currentPage === 1}>
                        <PaginationLink
                          href="#pablo"
                          onClick={(e) => {
                            e.preventDefault();
                            handlePageChange(currentPage - 1);
                          }}
                        >
                          <i className="fas fa-angle-left" />
                        </PaginationLink>
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (page) => (
                          <PaginationItem key={page} active={currentPage === page}>
                            <PaginationLink
                              href="#pablo"
                              onClick={(e) => {
                                e.preventDefault();
                                handlePageChange(page);
                              }}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      )}
                      <PaginationItem disabled={currentPage === totalPages}>
                        <PaginationLink
                          href="#pablo"
                          onClick={(e) => {
                            e.preventDefault();
                            handlePageChange(currentPage + 1);
                          }}
                        >
                          <i className="fas fa-angle-right" />
                        </PaginationLink>
                      </PaginationItem>
                    </Pagination>
                  </nav>
                </CardFooter>
              )}
            </Card>
          </Col>
        </Row>
      </Container>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={createModalOpen || editModalOpen}
        toggle={handleFormCancel}
        centered
        size="lg"
      >
        <ModalHeader toggle={handleFormCancel}>
          {editingItem ? "Edit Activity" : "Create Activity"}
        </ModalHeader>
        <ModalBody style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <Form onSubmit={(e) => { e.preventDefault(); handleFormSubmit(); }}>
            <FormGroup>
              <Label>Activity Name *</Label>
              <Input
                type="text"
                value={formData.activityName}
                onChange={(e) => handleInputChange("activityName", e.target.value)}
                placeholder="Enter activity name"
              />
            </FormGroup>
            <FormGroup>
              <Label>Description</Label>
              <Input
                type="textarea"
                rows="3"
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                placeholder="Enter description"
              />
            </FormGroup>
            <FormGroup>
              <Label>Platform *</Label>
              <Input
                type="select"
                value={formData.platforms.length > 0 ? formData.platforms[0] : ""}
                onChange={handlePlatformChange}
              >
                <option value="">Select Platform</option>
                {platforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name}
                  </option>
                ))}
              </Input>
              {formData.platforms.length === 0 && (
                <small className="text-danger">A platform is required</small>
              )}
            </FormGroup>
            {/* <FormGroup>
              <Label>Status *</Label>
              <Input
                type="select"
                value={formData.status}
                onChange={(e) => handleInputChange("status", e.target.value)}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </Input>
            </FormGroup> */}
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button type="button" color="secondary" onClick={handleFormCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            color="primary"
            onClick={handleFormSubmit}
            disabled={formLoading || !formData.activityName.trim() || formData.platforms.length === 0}
          >
            {formLoading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : editingItem ? (
              "Update"
            ) : (
              "Create"
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} toggle={handleDeleteCancel} centered>
        <ModalHeader toggle={handleDeleteCancel}>
          Delete Activity?
        </ModalHeader>
        <ModalBody>
          <p>
            Are you sure you want to delete "{itemToDelete?.activityName}"? This action
            cannot be undone.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={handleDeleteCancel}>
            Cancel
          </Button>
          <Button color="danger" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </ModalFooter>
      </Modal>

      {/* Toast */}
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        position={toast.position}
        onClose={hideToast}
      />
    </>
  );
};

export default Activities;
