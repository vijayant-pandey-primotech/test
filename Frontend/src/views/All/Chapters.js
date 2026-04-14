import React, { useState, useEffect, useRef } from "react";
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
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { FaGripVertical } from "react-icons/fa";
import { BsEmojiSmile } from "react-icons/bs";
import chapterService from "services/chapterService";
import { Toast, useToast } from "components/Toast";
import EmojiPicker from "emoji-picker-react";
// Mock data - replace with actual services later

const Chapters = () => {
  const { toast, showSuccess, showError, hideToast } = useToast();
  const { storyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [chapters, setChapters] = useState([]);
  const [storyName, setStoryName] = useState(location.state?.storyName || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [chapterToDelete, setChapterToDelete] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [chapterToEdit, setChapterToEdit] = useState(null);
  const [formData, setFormData] = useState({
    chapterName: "",
    firstMessage: "",
    description: "",
  });
  const [formLoading, setFormLoading] = useState(false);
  const [isSequenceMode, setIsSequenceMode] = useState(false);
  const [reorderedChapters, setReorderedChapters] = useState(null);
  const [isSavingSequence, setIsSavingSequence] = useState(false);
  const [showFirstMessageEmojiPicker, setShowFirstMessageEmojiPicker] =
    useState(false);
  const firstMessageEmojiWrapperRef = useRef(null);
  const firstMessageTextareaRef = useRef(null);

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
    fetchChapters();
    if (!storyName) {
      fetchStoryName();
    }
  }, [storyId]);

  useEffect(() => {
    const handleClickOutsideEmoji = (event) => {
      if (
        firstMessageEmojiWrapperRef.current &&
        !firstMessageEmojiWrapperRef.current.contains(event.target)
      ) {
        setShowFirstMessageEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutsideEmoji);
    return () => {
      document.removeEventListener("mousedown", handleClickOutsideEmoji);
    };
  }, []);

  // fetchStoryName now just sets a fallback name; real API should be used if needed
  const fetchStoryName = () => {
    setStoryName(`Story ${storyId}`);
  };

  const fetchChapters = async () => {
    try {
      setLoading(true);
      setError(null); // Clear any previous errors

      // Use real API instead of mock data
      const chaptersRes = await chapterService.getChaptersList(storyId);

      // Handle different response scenarios
      if (chaptersRes && chaptersRes.status === 200) {
        const chaptersData = chaptersRes.body || [];
        // Filter out deleted chapters and sort by sequence
        const activeChapters = Array.isArray(chaptersData)
          ? chaptersData
              .filter(
                (chapter) => !chapter.isDeleted && chapter.status !== "deleted"
              )
              .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
          : [];
        setChapters(activeChapters);
      } else if (chaptersRes && chaptersRes.status === 404) {
        // No chapters found - this is not an error, just empty state
        setChapters([]);
      } else {
        // Only set error for actual API failures, not empty results
        const errorMessage = chaptersRes?.message || "Failed to load chapters";
        console.error("API Error:", errorMessage);
        setError(errorMessage);
      }
    } catch (err) {
      // Only set error for actual network/API failures
      console.error("Network/API Error:", err);

      // Check if it's a 404 or empty response (not a real error)
      if (err.response && err.response.status === 404) {
        setChapters([]);
        setError(null);
      } else {
        setError("Failed to load chapters. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManageItems = (chapter) => {
    navigate(`/admin/training-data-hub`, {
      state: {
        storyName: storyName,
        chapterName: chapter.chapterName,
        preFilters: {
          storyName: storyName,
          chapterName: chapter.chapterName,
        },
      },
    });
  };

  const handleDelete = (chapter) => {
    setChapterToDelete(chapter);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!chapterToDelete) return;

    try {
      const response = await chapterService.deleteChapter(chapterToDelete.chapterId);
      if (response && (response.status === 200 || response.status === 201)) {
        setChapters((prevChapters) =>
          prevChapters.filter(
            (chapter) => chapter.chapterId !== chapterToDelete.chapterId
          )
        );
        showSuccess("Chapter deleted successfully!");
      } else {
        showError(response.message || "Failed to delete chapter");
      }
    } catch (error) {
      console.error("Error deleting chapter:", error);
      showError("Failed to delete chapter");
    } finally {
      setDeleteModalOpen(false);
      setChapterToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setChapterToDelete(null);
  };

  const handleCreateChapter = () => {
    setFormData({ chapterName: "", description: "", firstMessage: "", isDynamic: "false" });
    setCreateModalOpen(true);
  };

  const handleEditChapter = (chapter) => {
    setChapterToEdit(chapter);
    setFormData({
      chapterName: chapter.chapterName || "",
      firstMessage: chapter.firstMessage || "",
      description: chapter.description || "",
      isDynamic: chapter.isDynamic ? "true" : "false",
    });
    setEditModalOpen(true);
  };

  const handleFormCancel = () => {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    setChapterToEdit(null);
    setFormData({ chapterName: "", description: "", firstMessage: "", isDynamic: "false" });
  };

  const handleFormSubmit = async () => {
    if (!formData.chapterName.trim()) {
      showError("Chapter name is required");
      return;
    }

    setFormLoading(true);
    try {
      if (chapterToEdit) {
        // Update existing chapter using real API
        const payload = {
          name: formData.chapterName,
          firstMessage: formData.firstMessage,
          description: formData.description,
          isDynamic: formData.isDynamic === "true",
        };
        const response = await chapterService.updateChapter(
          chapterToEdit.chapterId,
          payload
        );
        if (response && (response.status === 201 || response.status === 200)) {
          showSuccess("Chapter updated successfully!");
          await fetchChapters();
          handleFormCancel();
        } else {
          showError(response.message || "Failed to update chapter");
        }
      } else {
        // Create new chapter using real API
        const payload = {
          chapterName: formData.chapterName,
          firstMessage: formData.firstMessage,
          description: formData.description,
          isDynamic: formData.isDynamic === "true",
          storyId: parseInt(storyId),
        };
        const response = await chapterService.createChapter(payload);
        if (response && (response.status === 201 || response.status === 200)) {
          showSuccess("Chapter created successfully!");
          await fetchChapters();
          handleFormCancel();
        } else {
          showError(response.message || "Failed to create chapter");
        }
      }
    } catch (error) {
      console.error("Error saving chapter:", error);
      showError("Failed to save chapter");
    } finally {
      setFormLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleFirstMessageEmojiSelect = (emojiObject) => {
    const textarea = firstMessageTextareaRef.current;
    const currentText = formData.firstMessage || "";
    if (textarea) {
      const start = textarea.selectionStart ?? currentText.length;
      const end = textarea.selectionEnd ?? currentText.length;
      const updatedText =
        currentText.substring(0, start) +
        emojiObject.emoji +
        currentText.substring(end);
      handleInputChange("firstMessage", updatedText);
      const cursorPosition = start + emojiObject.emoji.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPosition, cursorPosition);
      }, 0);
    } else {
      handleInputChange("firstMessage", currentText + emojiObject.emoji);
    }
    setShowFirstMessageEmojiPicker(false);
  };

  const renderFormModal = () => {
    const isEdit = !!chapterToEdit;
    return (
      <Modal
        isOpen={createModalOpen || editModalOpen}
        toggle={handleFormCancel}
        centered
      >
        <ModalHeader className="border-0 pb-0" toggle={handleFormCancel}>
          {isEdit ? "Edit Chapter" : "Create New Chapter"}
        </ModalHeader>
        <ModalBody className="pt-0">
          <Form>
            <FormGroup>
              <Label for="chapterName">
                Chapter Name <span className="text-danger">*</span>
              </Label>
              <Input
                type="text"
                id="chapterName"
                placeholder="Enter chapter name"
                value={formData.chapterName}
                onChange={(e) =>
                  handleInputChange("chapterName", e.target.value)
                }
                className="form-control-alternative"
                style={{ color: "black" }}
              />
            </FormGroup>
            <FormGroup>
              <Label for="firstMessage">
                Chapter's First Message (Organizer Assistant)
              </Label>
              <div
                ref={firstMessageEmojiWrapperRef}
                style={{ position: "relative" }}
              >
                <Input
                  innerRef={firstMessageTextareaRef}
                  type="textarea"
                  id="firstMessage"
                  placeholder="Enter chapter message"
                  value={formData.firstMessage}
                  onChange={(e) =>
                    handleInputChange("firstMessage", e.target.value)
                  }
                  className="form-control-alternative"
                  style={{
                    color: "black",
                    minHeight: "80px",
                    resize: "vertical",
                    paddingRight: "42px",
                  }}
                  maxLength={1000}
                />
                <Button
                  type="button"
                  onClick={() =>
                    setShowFirstMessageEmojiPicker((prev) => !prev)
                  }
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    background: "transparent",
                    border: "none",
                    color: "#8898aa",
                    padding: "4px",
                    cursor: "pointer",
                    zIndex: 10,
                    boxShadow: "none",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "#3A6D8C")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "#8898aa")
                  }
                >
                  <BsEmojiSmile size={20} />
                </Button>
                {showFirstMessageEmojiPicker && (
                  <div
                    style={{
                      position: "absolute",
                      right: "0",
                      top: "calc(100% + 8px)",
                      zIndex: 1000,
                    }}
                  >
                    <EmojiPicker
                      onEmojiClick={handleFirstMessageEmojiSelect}
                      theme="light"
                    />
                  </div>
                )}
              </div>
            </FormGroup>
            <FormGroup>
              <Label for="description">
                Description
              </Label>
              <Input
                type="textarea"
                id="description"
                placeholder="Enter chapter description"
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                className="form-control-alternative"
                style={{ color: "black" }}
              />
            </FormGroup>
            <FormGroup tag="fieldset">
              <Label className="form-label">
                Is Dynamic <span className="text-danger">*</span>
              </Label>
              <div className="d-flex gap-3">
                <FormGroup check className="mr-1">
                  <Label check>
                    <Input
                      type="radio"
                      name="isDynamic"
                      value="true"
                      checked={formData.isDynamic === "true"}
                      onChange={(e) =>
                        handleInputChange("isDynamic", e.target.value)
                      }
                      className="form-control-alternative "
                      style={{ color: "black" }}
                    />
                    Yes
                  </Label>
                </FormGroup>

                <FormGroup check>
                  <Label check>
                    <Input
                      type="radio"
                      name="isDynamic"
                      value="false"
                      checked={formData.isDynamic === "false"}
                      onChange={(e) =>
                        handleInputChange("isDynamic", e.target.value)
                      }
                      className="form-control-alternative"
                      style={{ color: "black" }}
                    />
                    No
                  </Label>
                </FormGroup>
              </div>
            </FormGroup>
          </Form>
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button
              color="secondary"
              onClick={handleFormCancel}
              disabled={formLoading}
            >
              Cancel
            </Button>
            <Button
              style={{
                backgroundColor: "#3A6D8C",
                borderColor: "#3A6D8C",
                color: "white",
              }}
              onClick={handleFormSubmit}
              disabled={formLoading || !formData.chapterName.trim()}
            >
              {formLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {isEdit ? "Updating..." : "Creating..."}
                </>
              ) : isEdit ? (
                "Update Chapter"
              ) : (
                "Create Chapter"
              )}
            </Button>
          </div>
        </ModalBody>
      </Modal>
    );
  };

  // Drag and drop functionality
  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(chapters);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update sequence numbers
    const updatedItems = items.map((item, index) => ({
      ...item,
      sequence: index + 1,
    }));

    setReorderedChapters(updatedItems);
    setChapters(updatedItems);
  };

  const handleSaveSequence = () => {
    if (!reorderedChapters) return;

    setIsSavingSequence(true);

    // Simulate API delay
    setTimeout(() => {
      try {
        // In real implementation, this would update the backend
        // For now, just keep the reordered state
        showSuccess("Chapter sequence updated successfully!");
        setReorderedChapters(null);
        setIsSequenceMode(false);
      } catch (error) {
        console.error("Error updating sequence:", error);
        showError("Failed to update chapter sequence");
        // Revert changes
        fetchChapters();
      } finally {
        setIsSavingSequence(false);
      }
    }, 1000);
  };

  const handleCancelSequence = () => {
    setIsSequenceMode(false);
    setReorderedChapters(null);
    fetchChapters(); // Reload original order
  };

  // Pagination logic
  const filteredChapters = Array.isArray(chapters)
    ? chapters.filter((chapter) =>
        Object.values(chapter).some(
          (value) =>
            value &&
            value.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : [];

  const totalPages = Math.ceil(filteredChapters.length / recordsPerPage);
  const paginatedChapters = isSequenceMode
    ? filteredChapters
    : filteredChapters.slice(
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
  }, [searchTerm, chapters]);

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
    const end = Math.min(currentPage * recordsPerPage, filteredChapters.length);
    return { start, end };
  };

  // Show loading state
  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <div className="d-flex align-items-center mb-4">
              <Button
                color="link"
                className="text-white p-0 mr-3"
                onClick={() => navigate("/admin/stories")}
              >
                <i className="fas fa-arrow-left mr-2"></i>
                Back to Stories
              </Button>
              <h3 className="mb-0 text-white" style={{ fontSize: "1.25rem" }}>
                CHAPTERS - {storyName}
              </h3>
            </div>
            <Card className="shadow">
              <CardBody className="text-center py-5">
                <Spinner color="primary" />
                <p className="mt-3 text-muted">Loading chapters...</p>
              </CardBody>
            </Card>
          </div>
        </Row>
      </Container>
    );
  }

  // Show error state - but still allow chapter creation
  if (error) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <div className="d-flex align-items-center mb-4">
              <Button
                color="link"
                className="text-white p-0 mr-3"
                onClick={() => navigate("/admin/stories")}
              >
                <i className="fas fa-arrow-left mr-2"></i>
                Back to Stories
              </Button>
              <h3 className="mb-0 text-white" style={{ fontSize: "1.25rem" }}>
                CHAPTERS - {storyName}
              </h3>
            </div>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="mt-3">
                  <Col md="12" className="text-right">
                    <Button
                      style={{
                        backgroundColor: "#3A6D8C",
                        borderColor: "#3A6D8C",
                        color: "white",
                      }}
                      size="sm"
                      onClick={handleCreateChapter}
                    >
                      <i className="fas fa-plus mr-1"></i>
                      Add New Chapter
                    </Button>
                  </Col>
                </Row>
              </CardHeader>
              <CardBody className="text-center py-5">
                <i className="fas fa-exclamation-triangle fa-4x text-warning mb-4"></i>
                <h4 className="text-muted mb-3">Unable to Load Chapters</h4>
                <p className="text-muted mb-4">{error}</p>
                <div className="d-flex justify-content-center gap-3">
                  <Button color="outline-primary" onClick={fetchChapters}>
                    <i className="fas fa-refresh mr-2"></i>
                    Try Again
                  </Button>
                  <Button
                    style={{
                      backgroundColor: "#3A6D8C",
                      borderColor: "#3A6D8C",
                      color: "white",
                    }}
                    onClick={handleCreateChapter}
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Create Chapter Anyway
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </Row>
        {/* Include the form modal even in error state */}
        {renderFormModal()}
      </Container>
    );
  }


  const renderTableContent = () => {
    if (isSequenceMode) {
      return (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="chapters">
            {(provided) => (
              <tbody {...provided.droppableProps} ref={provided.innerRef}>
                {paginatedChapters.map((chapter, index) => (
                  <Draggable
                    key={chapter.chapterId}
                    draggableId={chapter.chapterId.toString()}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <tr
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        style={{
                          ...provided.draggableProps.style,
                          backgroundColor: snapshot.isDragging
                            ? "#f8f9fa"
                            : "white",
                        }}
                      >
                        <td style={{ ...tableStyles.td, width: "5%" }}>
                          <div {...provided.dragHandleProps}>
                            <FaGripVertical className="text-muted" />
                          </div>
                        </td>
                        <td style={{ ...tableStyles.td, width: "10%" }}>
                          <Badge color="primary">
                            {chapter.sequence !== null && chapter.sequence !== undefined ? chapter.sequence : index + 1}
                          </Badge>
                        </td>
                        <td style={{ ...tableStyles.td, width: "15%" }}>
                          {chapter.chapterName}
                        </td>
                        <td style={{ ...tableStyles.td, width: "25%" }}>
                          {chapter.firstMessage || "-"}
                        </td>
                        <td style={{ ...tableStyles.td, width: "30%" }}>
                          <div style={{ maxWidth: "300px" }}>
                            {chapter.description &&
                            chapter.description.length > 100
                              ? `${chapter.description.substring(0, 100)}...`
                              : chapter.description || "-"}
                          </div>
                        </td>
                        <td style={{ ...tableStyles.td, width: "15%" }}>
                          {chapter.createdAt
                            ? new Date(chapter.createdAt).toLocaleDateString(
                                "en-US"
                              )
                            : "-"}
                        </td>
                        <td style={{ ...tableStyles.td, width: "10%" }}>
                          <span className="text-muted">Reordering...</span>
                        </td>
                      </tr>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </tbody>
            )}
          </Droppable>
        </DragDropContext>
      );
    }

    return (
      <tbody>
        {paginatedChapters.map((chapter, index) => (
          <tr key={chapter.chapterId}>
            <td style={{ ...tableStyles.td, width: "10%" }}>
              <Badge color="primary">
                {chapter.sequence !== null && chapter.sequence !== undefined 
                  ? chapter.sequence 
                  : (currentPage - 1) * recordsPerPage + index + 1}
              </Badge>
            </td>
            <td style={{ ...tableStyles.td, width: "15%" }}>
              {chapter.chapterName}
            </td>
            <td style={{ ...tableStyles.td, width: "30%" }}>
              {chapter.firstMessage || "-"}
            </td>
            <td style={{ ...tableStyles.td, width: "30%" }}>
              <div style={{ maxWidth: "300px" }}>
                {chapter.description && chapter.description.length > 100
                  ? `${chapter.description.substring(0, 100)}...`
                  : chapter.description || "-"}
              </div>
            </td>
            <td style={{ ...tableStyles.td, width: "15%" }}>
              {chapter.createdAt
                ? new Date(chapter.createdAt).toLocaleDateString("en-US")
                : "-"}
            </td>
            <td style={{ ...tableStyles.td, width: "15%" }}>
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
                      handleEditChapter(chapter);
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
                    Edit Chapter
                  </DropdownItem>
                  <DropdownItem
                    href="#pablo"
                    onClick={(e) => {
                      e.preventDefault();
                      handleManageItems(chapter);
                    }}
                    style={{
                      padding: "8px 16px",
                      fontSize: "14px",
                      color: "#495057",
                    }}
                  >
                    <i
                      className="fas fa-database mr-2"
                      style={{ color: "#3A6D8C" }}
                    />
                    Manage Items
                  </DropdownItem>
                  <DropdownItem
                    href="#pablo"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(chapter);
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
    );
  };

  return (
    <>
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <div className="d-flex align-items-center mb-4">
              <Button
                color="link"
                className="text-white p-0 mr-3"
                onClick={() => navigate("/admin/stories")}
              >
                <i className="fas fa-arrow-left mr-2"></i>
                Back to Stories
              </Button>
              <h3 className="mb-0 text-white" style={{ fontSize: "1.25rem" }}>
                CHAPTERS - {storyName}
              </h3>
            </div>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="mt-3">
                  <Col md="4">
                    <InputGroup>
                      <InputGroupText>
                        <i className="fas fa-search"></i>
                      </InputGroupText>
                      <Input
                        placeholder="Search chapters..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-control-alternative"
                        disabled={isSequenceMode}
                      />
                    </InputGroup>
                  </Col>
                  <Col md="8" className="text-right">
                    {isSequenceMode ? (
                      <div className="d-flex justify-content-end gap-2">
                        <Button
                          color="secondary"
                          size="sm"
                          onClick={handleCancelSequence}
                          disabled={isSavingSequence}
                        >
                          Cancel
                        </Button>
                        <Button
                          style={{
                            backgroundColor: "#28a745",
                            borderColor: "#28a745",
                            color: "white",
                          }}
                          size="sm"
                          onClick={handleSaveSequence}
                          disabled={isSavingSequence || !reorderedChapters}
                        >
                          {isSavingSequence ? (
                            <>
                              <Spinner size="sm" className="mr-2" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-save mr-1"></i>
                              Save Order
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="d-flex justify-content-end gap-2">
                        {/* <Button
                          color="outline-primary"
                          size="sm"
                          onClick={() => setIsSequenceMode(true)}
                          disabled={filteredChapters.length === 0}
                        >
                          <i className="fas fa-sort mr-1"></i>
                          Reorder Chapters
                        </Button> */}
                        <Button
                          style={{
                            backgroundColor: "#3A6D8C",
                            borderColor: "#3A6D8C",
                            color: "white",
                          }}
                          size="sm"
                          onClick={handleCreateChapter}
                        >
                          <i className="fas fa-plus mr-1"></i>
                          Add New Chapter
                        </Button>
                      </div>
                    )}
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
                        {isSequenceMode && (
                          <th style={{ ...tableStyles.th, width: "5%" }}>
                            Drag
                          </th>
                        )}
                        <th
                          style={{
                            ...tableStyles.th,
                            width: isSequenceMode ? "10%" : "10%",
                          }}
                        >
                          Seq. No.
                        </th>
                        <th
                          style={{
                            ...tableStyles.th,
                            width: isSequenceMode ? "15%" : "15%",
                          }}
                        >
                          Name
                        </th>
                        <th
                          style={{
                            ...tableStyles.th,
                            width: isSequenceMode ? "30%" : "30%",
                          }}
                        >
                          First Message
                        </th>
                        <th
                          style={{
                            ...tableStyles.th,
                            width: isSequenceMode ? "30%" : "30%",
                          }}
                        >
                          Description
                        </th>
                        <th
                          style={{
                            ...tableStyles.th,
                            width: isSequenceMode ? "15%" : "15%",
                          }}
                        >
                          Created
                        </th>
                        <th
                          style={{
                            ...tableStyles.th,
                            width: isSequenceMode ? "10%" : "15%",
                          }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    {renderTableContent()}
                  </Table>
                </div>

                {/* Pagination Controls - Hidden in sequence mode */}
                {!isSequenceMode && (
                  <CardFooter className="py-4">
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="text-muted">
                        {filteredChapters.length > 0
                          ? `Showing ${getEntryRange().start} to ${
                              getEntryRange().end
                            } of ${filteredChapters.length} entries`
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
                            <PaginationItem
                              disabled={currentPage === totalPages}
                            >
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
                )}

                {filteredChapters.length === 0 && !loading && (
                  <div className="text-center py-5">
                    <i className="fas fa-book-open fa-4x text-muted mb-4"></i>
                    <h4 className="text-muted mb-3">
                      {searchTerm
                        ? "No chapters match your search"
                        : "No chapters found for this story"}
                    </h4>
                    <p className="text-muted mb-4">
                      {searchTerm
                        ? "Try adjusting your search criteria or create a new chapter"
                        : `Get started by creating the first chapter for "${storyName}"`}
                    </p>
                    <div className="d-flex justify-content-center gap-3">
                      {searchTerm && (
                        <Button
                          color="outline-secondary"
                          size="md"
                          onClick={() => setSearchTerm("")}
                        >
                          <i className="fas fa-times mr-2"></i>
                          Clear Search
                        </Button>
                      )}
                      <Button
                        style={{
                          backgroundColor: "#3A6D8C",
                          borderColor: "#3A6D8C",
                          color: "white",
                        }}
                        size="md"
                        onClick={handleCreateChapter}
                      >
                        <i className="fas fa-plus mr-2"></i>
                        {searchTerm
                          ? "Create New Chapter"
                          : "Create First Chapter"}
                      </Button>
                    </div>
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
          Delete Chapter?
        </ModalHeader>
        <ModalBody className="pt-0">
          <p className="text-left mb-4">
            Are you sure you want to delete this chapter? This action will also
            delete all associated items.
          </p>
          <div className="d-flex justify-content-end gap-3">
            <Button color="secondary" onClick={handleDeleteCancel}>
              Cancel
            </Button>
            <Button color="danger" onClick={handleDeleteConfirm}>
              Confirm Delete
            </Button>
          </div>
        </ModalBody>
      </Modal>

      {/* Create/Edit Chapter Modal */}
      {renderFormModal()}

      {/* Custom Toast Component */}
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

export default Chapters;
