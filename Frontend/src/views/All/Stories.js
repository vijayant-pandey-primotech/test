import React, { useState, useEffect } from "react";
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
import { useNavigate, useLocation } from "react-router-dom";
import storyService from "services/storyService";
import platformService from "services/platformService";
import { Toast, useToast } from "components/Toast";


const Stories = () => {
  const { toast, showSuccess, showError, showWarning, showInfo, hideToast } =
  useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [stories, setStories] = useState([]);
  const [storiesWithStatus, setStoriesWithStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [storyEditModal, setStoryEditModal] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState(null);
  const [storyForm, setStoryForm] = useState({
    storyName: "",
    description: "",
    isPublished: 0,
  });
  const [saving, setSaving] = useState(false);

  const [importLoading, setImportLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Table styles matching the existing theme
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

  useEffect(() => {
    fetchStories();
  }, []);

  // Handle navigation state messages
  useEffect(() => {
    if (location.state?.message) {
      showSuccess(location.state.message);
      // Clear the navigation state to prevent re-showing the message
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location.state]);



  // Refresh stories when returning from wizard
  useEffect(() => {
    const handleFocus = () => {
      fetchStories();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const fetchStories = async () => {
    try {
      setLoading(true);
      // Call real API
      const response = await storyService.getStoriesList();
      console.log("API Response:", response);

      // Extract stories from API response
      const storiesData =
        response.body || response.data?.body || response || [];

      // Filter out deleted stories and add mock status for demo
      const activeStories = Array.isArray(storiesData)
        ? storiesData
            .filter((story) => !story.isDeleted && story.status !== "deleted")
            .map((story, index) => ({
              ...story,
            }))
        : [];

      setStories(activeStories);
      setStoriesWithStatus(activeStories);
    } catch (err) {
      setError("Failed to load stories");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleManageChapters = (story) => {
    navigate(`/admin/stories/${story.storyId}/chapters`, {
      state: { storyName: story.storyName },
    });
  };

  const handleExportStory = async (story) => {
    try {
      const response = await platformService.ExportStoryData(story.storyId);
  
      if (response && (response.status === 201 || response.status === 200)) {
        
        const blob = new Blob([response.data], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
  
        const url = window.URL.createObjectURL(blob);
  
        const link = document.createElement('a');
        link.href = url;
        
        link.setAttribute('download', `${story.name || 'export'}.xlsx`); 
  
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
        showSuccess("Story exported successfully!");
  
      } else {
        showError(response.message || "Failed to export story");
      }
    } catch (error) {
      console.error("Error exporting story:", error);
      showError("Failed to export story");
    }
  };
  const handleDelete = (story) => {
    setStoryToDelete(story);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!storyToDelete) return;
    try {
      const response = await storyService.deleteStory(storyToDelete.storyId);
      if (response && (response.status === 201 || response.status === 200)) {
        showSuccess("Story deleted successfully!");
        await fetchStories();
      } else {
        showError(response.message || "Failed to delete story");
      }
    } catch (error) {
      console.error("Error deleting story:", error);
      showError("Failed to delete story");
    } finally {
      setDeleteModalOpen(false);
      setStoryToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setStoryToDelete(null);
  };

  const handleCopyStory = (story) => {
    // Navigate to CreateStoryWizard with the story as template
    navigate(`/admin/create-story-wizard?templateStoryId=${story.storyId}&templateStoryName=${encodeURIComponent(story.storyName)}`);
  };

  const handleCreateStory = () => {
    navigate("/admin/create-story-wizard");
  };

  // Handle sample download
  const handleSampleDownload = () => {
    const link = document.createElement('a');
    link.href = '/story_structure_sample.xlsx';
    link.download = 'story_structure_sample.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess('Sample file downloaded successfully');
  };

  // Handle import file click
  const handleImportFileClick = () => {
    console.log('=== handleImportFileClick called ===');
    
    // Use a label-based approach which is more reliable
    const label = document.createElement('label');
    label.style.cssText = 'position: absolute; left: -9999px; top: -9999px; opacity: 0; pointer-events: none;';
    label.innerHTML = 'Import File';
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls';
    fileInput.style.cssText = 'position: absolute; left: -9999px; top: -9999px; opacity: 0; pointer-events: none;';
    
    // Add event listener
    fileInput.onchange = (event) => {
      console.log('=== File input change event triggered ===');
      handleFileUpload(event);
      // Clean up
      if (document.body.contains(label)) {
        document.body.removeChild(label);
      }
    };
    
    // Append input to label, then label to body
    label.appendChild(fileInput);
    document.body.appendChild(label);
    
    // Trigger click on the label instead of the input
    label.click();
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    
    const file = event.target.files[0];

    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      showError('Please select a valid Excel file (.xlsx, .xls)');
      return;
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      showError('File size exceeds 10MB limit');
      return;
    }

    setImportLoading(true);
    try {
      const response = await platformService.importExcelData(file);
      showSuccess('File imported successfully');
      // Refresh the data after successful import
      await fetchStories();
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Error importing file';
      showError(errorMessage);
    } finally {
      setImportLoading(false);
      // Reset file input safely
      try {
        if (event.target && event.target.value !== undefined) {
          event.target.value = '';
        }
      } catch (error) {
        console.log('Could not reset file input value:', error);
      }
    }
  };

  const handleEditStory = (story) => {
    setStoryForm({
      storyId: story.storyId,
      storyName: story.storyName || '',
      description: story.description || '',
      isPublished: story.isPublished === 1 ? 1 : 0,
    });
    setStoryEditModal(true);
  };

  const handleStorySubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        name: storyForm.storyName,
        description: storyForm.description,
        isPublished: (storyForm.isPublished === 1 ? 1 : 0),
      };
      const response = await storyService.updateStory(storyForm.storyId, payload);
      if (response && (response.status === 201 || response.status === 200)) {
        showSuccess("Story updated successfully!");
        await fetchStories();
        setStoryEditModal(false);
      } else {
        showError(response.message || "Failed to update story");
      }
    } catch (error) {
      console.error("Error updating story:", error);
      showError("Failed to update story");
    } finally {
      setSaving(false);
    }
  };

  // Pagination logic - use storiesWithStatus if available, otherwise fallback to stories
  const dataToUse = storiesWithStatus.length > 0 ? storiesWithStatus : stories;
  const filteredStories = Array.isArray(dataToUse)
    ? dataToUse.filter((story) =>
        Object.values(story).some(
          (value) =>
            value &&
            value.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : [];

  const totalPages = Math.ceil(filteredStories.length / recordsPerPage);
  const paginatedStories = filteredStories.slice(
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
  }, [searchTerm, stories]);

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

  const getEntryRange = () => {
    const start = (currentPage - 1) * recordsPerPage + 1;
    const end = Math.min(currentPage * recordsPerPage, filteredStories.length);
    return { start, end };
  };

  // Show loading state
  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              STORIES MANAGEMENT
            </h3>
            <Card className="shadow">
              <CardBody className="text-center py-5">
                <Spinner color="primary" />
                <p className="mt-3 text-muted">Loading stories...</p>
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
              STORIES MANAGEMENT
            </h3>
            <Alert color="danger">
              <h4 className="alert-heading">Error Loading Stories</h4>
              <p>{error}</p>
              <hr />
              <Button color="danger" onClick={fetchStories}>
                Try Again
              </Button>
            </Alert>
          </div>
        </Row>
      </Container>
    );
  }

  return (
    <>
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              STORIES MANAGEMENT
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
                        placeholder="Search stories..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-control-alternative"
                      />
                    </InputGroup>
                  </Col>
                                     <Col md="6" className="text-right">
                     <div className="d-flex gap-2 justify-content-end">
                       <Button
                         style={{
                           backgroundColor: "#6c757d",
                           borderColor: "#6c757d",
                           color: "white",
                         }}
                         size="sm"
                         onClick={handleSampleDownload}
                         disabled={importLoading}
                       >
                         <i className="fas fa-download mr-1" />
                         Sample Story Format Download
                       </Button>
                                               <Button
                          style={{
                            backgroundColor: "#17a2b8",
                            borderColor: "#17a2b8",
                            color: "white",
                          }}
                          size="sm"
                          onClick={handleImportFileClick}
                          disabled={importLoading}
                        >
                          <i className="fas fa-upload mr-1" />
                          {importLoading ? 'Importing...' : 'Import New Unpublished Stories'}
                        </Button>
                       <Button
                         style={{
                           backgroundColor: "#3A6D8C",
                           borderColor: "#3A6D8C",
                           color: "white",
                         }}
                         size="sm"
                         onClick={handleCreateStory}
                         disabled={importLoading}
                       >
                         <i className="fas fa-plus mr-1"></i>
                         Add New Story
                       </Button>
                     </div>
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
                        <th style={{ ...tableStyles.th, width: "8%" }}>ID</th>
                        <th style={{ ...tableStyles.th, width: "20%" }}>
                          Name
                        </th>
                        {/* <th style={{ ...tableStyles.th, width: "25%" }}>
                          Description
                        </th> */}
                        <th style={{ ...tableStyles.th, width: "15%" }}>
                          Is Published
                        </th>
                        {/* <th style={{ ...tableStyles.th, width: "12%" }}>
                          Progress
                        </th> */}
                        <th style={{ ...tableStyles.th, width: "10%" }}>
                          Created
                        </th>
                        <th style={{ ...tableStyles.th, width: "10%" }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStories.map((story, index) => (
                        <tr key={story.storyId}>
                          <td style={{ ...tableStyles.td, width: "8%" }}>
                            
                              {(currentPage - 1) * recordsPerPage + index + 1}
                            
                          </td>
                          <td style={{ ...tableStyles.td, width: "20%" }}>
                           {story.storyName}
                          </td>
                          <td style={{ ...tableStyles.td, width: "15%" }}>
                            {story.isPublished === 1 ? "Published" : "Draft"}
                          </td>
                          {/* <td style={{ ...tableStyles.td, width: "25%" }}>
                            <div style={{ maxWidth: "200px" }}>
                              {story.description &&
                              story.description.length > 80
                                ? `${story.description.substring(0, 80)}...`
                                : story.description || "-"}
                            </div>
                          </td> */}
                          {/* <td style={{ ...tableStyles.td, width: "15%" }}>
                            {statusLoading ? (
                              <Spinner size="sm" />
                            ) : (
                              <Badge color={story.statusColor || "secondary"}>
                                {story.statusText || "Loading..."}
                              </Badge>
                            )}
                          </td> */}
                          {/* <td style={{ ...tableStyles.td, width: "12%" }}>
                            {statusLoading ? (
                              <span className="text-muted">...</span>
                            ) : (
                              <div className="text-center">
                                <small className="text-muted d-block">
                                  {story.chaptersCount || 0} chapters
                                </small>
                                <small className="text-muted d-block">
                                  {story.itemsCount || 0} items
                                </small>
                              </div>
                            )}
                          </td> */}
                          <td style={{ ...tableStyles.td, width: "10%" }}>
                            {story.createdAt
                              ? new Date(story.createdAt).toLocaleDateString(
                                  "en-US"
                                )
                              : "-"}
                          </td>
                          <td style={{ ...tableStyles.td, width: "10%" }}>
                            <UncontrolledDropdown>
                              <DropdownToggle
                                className="btn btn-sm btn-outline-secondary"
                                href="#pablo"
                                role="button"
                                size="sm"
                                onClick={(e) => e.preventDefault()}
                              >
                                <i className="fas fa-ellipsis-v" />
                              </DropdownToggle>
                              <DropdownMenu
                                className="dropdown-menu-arrow"
                                right
                                container="body"
                                style={{
                                  minWidth: "150px",
                                  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                                  border: "1px solid #e9ecef",
                                  zIndex: 9999,
                                  backgroundColor: "white",
                                }}
                              >
                                <DropdownItem
                                  href="#pablo"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleEditStory(story);
                                  }}
                                  style={{
                                    padding: "8px 16px",
                                    fontSize: "14px",
                                    color: "#495057",
                                  }}
                                >
                                  <i
                                    className="fas fa-edit mr-2"
                                    style={{ color: "#3A6D8C" }}
                                  />
                                  Edit Story
                                </DropdownItem>
                                <DropdownItem
                                  href="#pablo"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleManageChapters(story);
                                  }}
                                  style={{
                                    padding: "8px 16px",
                                    fontSize: "14px",
                                    color: "#495057",
                                  }}
                                >
                                  <i
                                    className="fas fa-list mr-2"
                                    style={{ color: "#3A6D8C" }}
                                  />
                                  Manage Chapters
                                </DropdownItem>
                                {/* <DropdownItem
                                  href="#pablo"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleManagePrompts(story);
                                  }}
                                  style={{
                                    padding: "8px 16px",
                                    fontSize: "14px",
                                    color: "#495057",
                                  }}
                                >
                                  <i
                                    className="fas fa-terminal mr-2"
                                    style={{ color: "#3A6D8C" }}
                                  />
                                  Edit/Add Prompts
                                </DropdownItem> */}
                                
                                <DropdownItem
                                  href="#pablo"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleCopyStory(story);
                                  }}
                                  style={{
                                    padding: "8px 16px",
                                    fontSize: "14px",
                                    color: "#495057",
                                  }}
                                >
                                  <i
                                    className="fas fa-copy mr-2"
                                      style={{ color: "#3A6D8C" }}
                                  />
                                  Copy this story
                                </DropdownItem>
                                <DropdownItem
                                  href="#pablo"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleExportStory(story);
                                  }}
                                  style={{
                                    padding: "8px 16px",
                                    fontSize: "14px",
                                    color: "#495057",
                                  }}
                                >
                                  <i
                                    className="fa-solid fa-file-export mr-2"
                                      style={{ color: "#3A6D8C" }}
                                  />
                                  Export this story
                                </DropdownItem>
                                <DropdownItem
                                  href="#pablo"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleDelete(story);
                                  }}
                                  style={{
                                    padding: "8px 16px",
                                    fontSize: "14px",
                                    color: "#dc3545",
                                  }}
                                >
                                  <i
                                    className="fas fa-trash mr-2"
                                    style={{ color: "#dc3545" }}
                                  />
                                  Delete
                                </DropdownItem>
                              </DropdownMenu>
                            </UncontrolledDropdown>
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
                      {filteredStories.length > 0
                        ? `Showing ${getEntryRange().start} to ${
                            getEntryRange().end
                          } of ${filteredStories.length} entries`
                        : "No entries found"}
                    </div>
                    {totalPages > 1 && (
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
                                handlePageChange(1);
                              }}
                            >
                              <i className="fas fa-angle-double-left" />
                            </PaginationLink>
                          </PaginationItem>
                          {currentPage > 1 && (
                            <PaginationItem>
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
                          )}
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
                          {currentPage < totalPages && (
                            <PaginationItem>
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
                          )}
                          <PaginationItem disabled={currentPage === totalPages}>
                            <PaginationLink
                              href="#pablo"
                              onClick={(e) => {
                                e.preventDefault();
                                handlePageChange(totalPages);
                              }}
                            >
                              <i className="fas fa-angle-double-right" />
                            </PaginationLink>
                          </PaginationItem>
                        </Pagination>
                      </nav>
                    )}
                  </div>
                </CardFooter>

                {filteredStories.length === 0 && (
                  <div className="text-center py-4">
                    <i className="fas fa-book fa-3x text-muted mb-3"></i>
                    <h5 className="text-muted">No stories found</h5>
                    <p className="text-muted">
                      Try adjusting your search criteria or create a new story
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
          Delete Story?
        </ModalHeader>
        <ModalBody className="pt-0">
          <p className="text-left mb-4">
            Are you sure you want to delete this story? This action cannot be undone.
          </p>
          <div className="d-flex justify-content-end gap-3">
            <Button color="secondary" onClick={handleDeleteCancel}>
              Cancel
            </Button>
            <Button color="danger" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </ModalBody>
      </Modal>
      {/* Chapter Modal */}
      <Modal
        isOpen={storyEditModal}
        toggle={() => setStoryEditModal(false)}
        centered
      >
        <ModalHeader toggle={() => setStoryEditModal(false)}>
          Edit Story Details
        </ModalHeader>
        <ModalBody>
          <Form>
            <FormGroup>
              <Label for="chapterName">Story Name <span className="text-danger">*</span></Label>
              <Input
                type="text"
                id="storyName"
                placeholder="Enter story name"
                value={storyForm.storyName}
                onChange={(e) =>
                  setStoryForm((prev) => ({
                    ...prev,
                    storyName: e.target.value,
                  }))
                }
                style={{ color: "black" }}
                className="form-control-alternative text-black"
              />
            </FormGroup>
            <FormGroup>
              <Label>Status</Label>
              <div className="d-flex gap-3">
                <FormGroup check>
                  <Input
                    type="radio"
                    name="isPublished"
                    id="status-draft"
                    value={0}
                    checked={storyForm.isPublished === 0}
                    onChange={() =>
                      setStoryForm((prev) => ({
                        ...prev,
                        isPublished: 0,
                      }))
                    }
                  />
                  <Label for="status-draft" check>
                    Draft
                  </Label>
                </FormGroup>
                <FormGroup check className="ml-3">
                  <Input
                    type="radio"
                    name="isPublished"
                    id="status-publish"
                    value={1}
                    checked={storyForm.isPublished === 1}
                    onChange={() =>
                      setStoryForm((prev) => ({
                        ...prev,
                        isPublished: 1,
                      }))
                    }
                  />
                  <Label for="status-publish" check>
                    Publish
                  </Label>
                </FormGroup>
              </div>
            </FormGroup>
            <FormGroup>
              <Label for="description">Description <span className="text-danger">*</span></Label>
              <Input
                type="textarea"
                id="description"
                placeholder="Enter story description"
                value={storyForm.description}
                onChange={(e) =>
                  setStoryForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="form-control-alternative "
                style={{ color: "black" }}
                
              />
            </FormGroup>
          </Form>
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button
              color="secondary"
              onClick={() => setStoryEditModal(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              style={{
                backgroundColor: "#3A6D8C",
                borderColor: "#3A6D8C",
                color: "white",
              }}
              onClick={handleStorySubmit}
              disabled={saving || !storyForm.storyName.trim()}
            >
              {saving ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
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

export default Stories;
