import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardFooter,
  Table,
  Container,
  Row,
  Spinner,
  Alert,
  Pagination,
  PaginationItem,
  PaginationLink,
  DropdownMenu,
  DropdownItem,
  UncontrolledDropdown,
  DropdownToggle,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  FormGroup,
  Input,
  Form,
} from "reactstrap";
import { createPortal } from "react-dom";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import itemService from "services/itemService";
import { Message } from "rsuite";
import { IoWarningOutline } from "react-icons/io5";
import { SiTicktick } from "react-icons/si";
import "rsuite/dist/rsuite.min.css";
import {
  saveFilters,
  loadFilters,
  clearFilters,
  getActiveFiltersCount,
  getActiveFiltersText,
  getFilterPreview,
  getFilterCountText,
} from "utils/filterUtils";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

// Add custom styles for the Message component
const messageStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap');

  body {
    font-family: "Lato", "sans-serif";
  }

  .rs-message {
    position: fixed !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    min-height: auto !important;
    padding: 0 !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    width: auto !important;
    min-width: 200px !important;
    max-width: 40% !important;
    box-sizing: border-box !important;
    margin: 0 !important;
    transition: all 0.3s ease-in-out !important;
    transform-origin: center !important;
    will-change: transform, opacity !important;
  }
  .rs-message.rs-message-exiting {
    transform: translateX(-50%) !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  .rs-message-close {
    background: none !important;
    color: #8898aa !important;
    top: 50% !important;
    right: 8px !important;
    transform: translateY(-50%) !important;
    position: absolute !important;
    width: 14px !important;
    height: 14px !important;
    padding: 0 !important;
    margin: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 1 !important;
  }
  .rs-message-close:hover {
    background: none !important;
    color: #172b4d !important;
  }
  .rs-message-content {
    padding: 8px 32px 8px 16px !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    width: 100% !important;
    text-align: center !important;
    position: relative !important;
    box-sizing: border-box !important;
    margin: 0 !important;
  }

  /* Input field styles */
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

  /* Custom radio button styles */
  .custom-control-input:checked ~ .custom-control-label::before {
    background-color: #3A6D8C !important;
    border-color: #3A6D8C !important;
  }
  .custom-control-input:focus ~ .custom-control-label::before {
    box-shadow: 0 0 0 0.2rem rgba(58, 109, 140, 0.25) !important;
  }
  .custom-control-label {
    margin-left: 0.5rem !important;
  }
  .radio-group {
    margin-top: 0.5rem !important;
  }

  .message {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    padding: 1rem;
    border-radius: 0.375rem;
    box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
    margin-top: 0.5rem !important;
  }

  /* Filter button styles */
  .filter-button {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: white;
    color: black;
    border: 1px solid #3A6D8C;
    border-radius: 4px;
    padding: 8px 16px;
    transition: all 0.2s ease;
  }
  .filter-button.has-filters {
    background-color: #3A6D8C;
    color: white;
  }
  .filter-button i {
    color: inherit;
    font-size: 14px;
  }
  .filter-badge {
    background-color: #3A6D8C;
    color: white;
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    margin-left: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .filter-badge i {
    font-size: 10px;
    opacity: 0.8;
  }
  .filter-tooltip {
    position: absolute;
    background: white;
    padding: 8px 12px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    font-size: 12px;
    color: #8898aa;
    white-space: nowrap;
    z-index: 1000;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 4px;
    display: none;
  }
  .filter-button:hover .filter-tooltip {
    display: block;
  }
  .clear-filters-btn {
    background-color: #ccc !important;
    border-color: #ccc !important;
    color: #333 !important;
  }
  .clear-filters-btn:hover {
    background-color: #bbb !important;
    border-color: #bbb !important;
  }
`;

// Add this style block at the top of the file after the imports
const dropdownStyles = `
  .dropdown-item:hover {
    color: white !important;
    background-color: #3A6D8C !important;
  }
  .dropdown-item:hover i {
    color: white !important;
  }
`;

// Update the filterBadgeStyles
const filterBadgeStyles = `
  .filter-button {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: white;
    color: black;
    border: 1px solid #3A6D8C;
    border-radius: 4px;
    padding: 8px 16px;
    transition: all 0.2s ease;
    height: 40px;
    text-decoration: none !important;
  }
  .filter-button:hover {
    text-decoration: none !important;
  }
  .filter-button.has-filters {
    background-color: #3A6D8C;
    color: white;
  }
  .filter-button.has-filters i,
  .filter-button.has-filters .filter-badge {
    font-size: 16px;
  }
  .filter-button i {
    color: inherit;
    font-size: 14px;
  }
  .filter-badge {
    background-color: #E8F0F5;
    color: #3A6D8C;
    padding: 0;
    border-radius: 50%;
    font-size: 12px;
    margin-left: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    min-width: 24px;
    min-height: 24px;
  }
  .filter-badge i {
    font-size: 10px;
    opacity: 0.8;
  }
  .filter-tooltip {
    position: fixed;
    background: white;
    padding: 8px 12px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    font-size: 12px;
    color: #8898aa;
    z-index: 1000;
    display: none;
    max-width: 300px;
    word-wrap: break-word;
    white-space: normal;
  }
  .filter-button:hover .filter-tooltip {
    display: block;
  }
  .clear-filters-btn {
    background-color: #ccc !important;
    border-color: #ccc !important;
    color: #333 !important;
  }
  .clear-filters-btn:hover {
    background-color: #bbb !important;
    border-color: #bbb !important;
  }

  /* Drag and Drop Styles */
  .draggable-row {
    cursor: grab;
    transition: all 0.2s ease;
  }
  .draggable-row:hover {
    background-color: #f8f9fa !important;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  .draggable-row:active {
    cursor: grabbing;
  }
  .draggable-row.dragging {
    background-color: #e3f2fd !important;
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    transform: rotate(2deg);
  }
  .drag-handle {
    cursor: grab;
    color: #8898aa;
    font-size: 14px;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s ease;
  }
  .drag-handle:hover {
    color: #3A6D8C;
    background-color: #f8f9fa;
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  .drag-loading {
    opacity: 0.6;
    pointer-events: none;
  }
`;

// Add custom styles for save/cancel buttons
const saveButtonStyles = `
  .btn-save-changes {
    background-color: #3A6D8C !important;
    border-color: #3A6D8C !important;
    color: white !important;
  }
  .btn-save-changes:hover {
    background-color: #3A6D8C !important;
    border-color: #3A6D8C !important;
    color: white !important;
  }
  .btn-save-changes:disabled {
    background-color: #3A6D8C !important;
    border-color: #3A6D8C !important;
    opacity: 0.65 !important;
  }
  .btn-cancel-changes {
    background-color: #6c757d !important;
    border-color: #6c757d !important;
    color: white !important;
  }
  .btn-cancel-changes:hover {
    background-color: #5a6268 !important;
    border-color: #545b62 !important;
    color: white !important;
  }
  .btn-cancel-changes:disabled {
    background-color: #6c757d !important;
    border-color: #6c757d !important;
    opacity: 0.65 !important;
  }
  .unsaved-indicator {
    background-color: #ffc107;
    color: #212529;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    margin-left: 8px;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.7; }
    100% { opacity: 1; }
  }
`;

// Add this line after the messageStyles constant
const styles =
  messageStyles + dropdownStyles + filterBadgeStyles + saveButtonStyles;

const PoliciesTable = () => {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [itemDetails, setItemDetails] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [apiMessage, setApiMessage] = useState({ content: "", type: "" });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [policyToEdit, setPolicyToEdit] = useState(null);
  const [editPolicyName, setEditPolicyName] = useState("");
  const [editPolicyQuestion, setEditPolicyQuestion] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editConfirmModalOpen, setEditConfirmModalOpen] = useState(false);
  const [addPolicyModalOpen, setAddPolicyModalOpen] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState("");
  const [newPolicyQuestion, setNewPolicyQuestion] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [filters, setFilters] = useState(() =>
    loadFilters("policies", {
      policyName: "",
    })
  );
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "ascending",
  });
  const [originalPolicyData, setOriginalPolicyData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragLoading, setDragLoading] = useState(false);
  const [dragConfirmModalOpen, setDragConfirmModalOpen] = useState(false);
  const [dragResult, setDragResult] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingPolicies, setPendingPolicies] = useState([]);
  const [unsavedChangesModalOpen, setUnsavedChangesModalOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [saveSequenceConfirmModalOpen, setSaveSequenceConfirmModalOpen] =
    useState(false);
  const [itemData, setItemData] = useState(null);
  const [isSequencingMode, setIsSequencingMode] = useState(false);
  const recordsPerPage = 10;
  const { itemId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    itemName: passedItemName,
    currentPage: seedDataPage,
    itemData: passedItemData,
  } = location.state || {};
  const isSuperAdmin = localStorage.getItem("userRole") === "admin";
  const [originalPoliciesOrder, setOriginalPoliciesOrder] = useState([]);
  // Store inactive policies separately to preserve them during drag/drop operations
  // These are not shown in UI but are appended when saving to maintain data integrity
  const [inactivePolicies, setInactivePolicies] = useState([]);

  useEffect(() => {
    fetchPolicies();
    // Set itemData from passed data if available
    if (passedItemData) {
      // console.log("📥 Received Item Data in Policies Page:", {
      //   itemId: passedItemData.itemId,
      //   itemName: passedItemData.itemName,
      //   storyId: passedItemData.storyId,
      //   chapterId: passedItemData.chapterId,
      //   fullItemData: passedItemData,
      // });
      setItemData(passedItemData);
    } else {
      console.log("⚠️ No item data passed from Seed Data page");
    }
  }, [itemId, passedItemData]);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      setError(null);
      setInactivePolicies([]); // Reset inactive policies at the start
      const response = await itemService.getPoliciesList(itemId);

      if (response.status === 200) {
        // console.log("📥 Raw API Response:", response.body);
        if (response.body && response.body.length > 0) {
          setItemDetails({
            storyName: response.body[0].storyName,
            chapterName: response.body[0].chapterName,
            itemName: response.body[0].itemName,
          });

          const policyRecord = response.body.find(
            (policy) => policy.itemId === parseInt(itemId)
          );
          if (policyRecord) {
            setOriginalPolicyData(policyRecord);
          }

          const flattenedPolicies = response.body
            .map((policy) => {
              // console.log("🔍 Processing policy record:", {
              //   policyId: policy.policyId,
              //   policiesType: typeof policy.policies,
              //   policiesIsArray: Array.isArray(policy.policies),
              //   policiesData: policy.policies
              // });

              // Handle both single policy object and array of policies
              let policyData = policy.policies;

              // If policies is a single object, convert it to an array
              if (
                policyData &&
                typeof policyData === "object" &&
                !Array.isArray(policyData)
              ) {
                // console.log("📝 Converting single policy object to array");
                policyData = [policyData];
              }

              // If policies is an array, use it as is
              if (Array.isArray(policyData)) {
                // Separate active and inactive policies first
                const activePolicyData = policyData.filter((p) => !p.status || p.status === "active");
                const inactivePolicyData = policyData.filter((p) => p.status && p.status !== "active");
                
                // Process active policies for display (with additional UI fields)
                const processedActivePolicies = activePolicyData.map((p) => ({
                  policyId: policy.policyId,
                  dbSequence: p.sequence,
                  originalSequence: p.sequence, // Store original sequence
                  policyName: p.policy,
                  status: p.status || "active",
                  mainQuestion: policy.question,
                  policyQuestion: p.question,
                  createdAt: policy.createdAt,
                  updatedAt: policy.updatedAt,
                }));

                // Store inactive policies in their original structure (preserve exact API format)
                if (inactivePolicyData.length > 0) {
                  setInactivePolicies(prev => [...prev, ...inactivePolicyData]);
                }

                // console.log("✅ Processed active policies:", processedActivePolicies);
                // console.log("✅ Preserved inactive policies in original format:", inactivePolicyData);
                return processedActivePolicies;
              }

              // If policies is null/undefined or not the expected format, return empty array
              // console.log("⚠️ No valid policies found for this record");
              return [];
            })
            .flat(); // Flatten the array of arrays
          // console.log("🎯 Final flattened policies:", flattenedPolicies);
          setPolicies(flattenedPolicies);
          setOriginalPoliciesOrder([...flattenedPolicies]);
          setHasUnsavedChanges(false);
        } else {
          setPolicies([]);
          setOriginalPolicyData(null);
          setItemDetails(null);
          setError(null);
          setOriginalPoliciesOrder([]);
          setInactivePolicies([]);
          setHasUnsavedChanges(false);
        }
      } else if (
        response.status === 404 ||
        response.message?.includes("No policies found")
      ) {
        setPolicies([]);
        setOriginalPolicyData(null);
        setItemDetails(null);
        setError(null);
        setOriginalPoliciesOrder([]);
        setInactivePolicies([]);
        setHasUnsavedChanges(false);
      } else {
        setError("Failed to fetch policies");
      }
    } catch (err) {
      if (
        err.message?.includes("No policies found") ||
        err.response?.data?.message?.includes("No policies found")
      ) {
        setPolicies([]);
        setOriginalPolicyData(null);
        setItemDetails(null);
        setError(null);
        setOriginalPoliciesOrder([]);
        setInactivePolicies([]);
        setHasUnsavedChanges(false);
      } else {
        setError(err.message || "An error occurred while fetching policies");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US");
  };

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

  // Function to handle sorting
  const handleSort = (key) => {
    let direction = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  // Function to get sort icon
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <i className="fas fa-sort ml-1" style={{ opacity: 0.3 }} />;
    }
    return sortConfig.direction === "ascending" ? (
      <i className="fas fa-sort-up ml-1" />
    ) : (
      <i className="fas fa-sort-down ml-1" />
    );
  };

  // Sort policies based on current sort configuration
  const sortedPolicies = [...policies].sort((a, b) => {
    if (!sortConfig.key) return 0;

    if (sortConfig.key === "policyName") {
      const nameA = (a.policyName || "").toLowerCase();
      const nameB = (b.policyName || "").toLowerCase();
      return sortConfig.direction === "ascending"
        ? nameA.localeCompare(nameB)
        : nameB.localeCompare(nameA);
    }

    if (sortConfig.key === "sequence") {
      return sortConfig.direction === "ascending"
        ? a.dbSequence - b.dbSequence
        : b.dbSequence - a.dbSequence;
    }

    return 0;
  });

  // Filter policies based on search criteria
  const filteredPolicies = sortedPolicies.filter((policy) => {
    const policyNameMatch =
      filters.policyName === "" ||
      policy.policyName
        .toLowerCase()
        .includes(filters.policyName.toLowerCase());
    return policyNameMatch;
  });

  // Calculate pagination for filtered results
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  // Show all policies when in sequencing mode, otherwise show paginated results
  const currentRecords = isSequencingMode 
    ? filteredPolicies 
    : filteredPolicies.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(filteredPolicies.length / recordsPerPage);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    const newFilters = {
      ...filters,
      [name]: value,
    };
    setFilters(newFilters);
    saveFilters("policies", newFilters);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  // Function to get visible page numbers
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

  // Function to determine if left arrow should be shown
  const shouldShowLeftArrow = () => {
    return currentPage > 1;
  };

  // Function to determine if right arrow should be shown
  const shouldShowRightArrow = () => {
    return currentPage < totalPages;
  };

  // Calculate the range of entries being shown
  const getEntryRange = () => {
    const start = indexOfFirstRecord + 1;
    const end = Math.min(indexOfLastRecord, filteredPolicies.length);
    return { start, end };
  };

  const handleDeleteClick = (policy) => {
    setPolicyToDelete(policy);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      const response = await itemService.deletePolicy(
        policyToDelete.policyId,
        policyToDelete.dbSequence - 1
      );
      if (response.status === 200) {
        setPolicies((prevPolicies) =>
          prevPolicies.filter(
            (policy) =>
              !(
                policy.policyId === policyToDelete.policyId &&
                policy.dbSequence === policyToDelete.dbSequence
              )
          )
        );
        setApiMessage({
          content: "Policy deleted successfully",
          type: "success",
        });
      } else {
        setApiMessage({
          content: response.message || "Failed to delete policy",
          type: "error",
        });
      }
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    } catch (err) {
      setApiMessage({
        content: err.message || "An error occurred while deleting the policy",
        type: "error",
      });
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    } finally {
      setDeleteModalOpen(false);
      setPolicyToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setPolicyToDelete(null);
  };

  const handleEditClick = (policy) => {
    setPolicyToEdit(policy);
    setEditPolicyName(policy.policyName);
    setEditPolicyQuestion(policy.policyQuestion);
    setEditModalOpen(true);
  };

  const handleEditClose = () => {
    setEditModalOpen(false);
    setPolicyToEdit(null);
    setEditPolicyName("");
    setEditPolicyQuestion("");
  };

  const handleEditSubmit = async () => {
    if (!policyToEdit || !editPolicyName.trim()) return;

    if (!originalPolicyData) {
      setApiMessage({
        content:
          "Unable to load policy details. Please refresh the page and try again.",
        type: "error",
      });
      return;
    }

    try {
      setEditLoading(true);

      let existingPolicies = [];
      const rawPolicies = originalPolicyData.policies;

      if (Array.isArray(rawPolicies)) {
        existingPolicies = [...rawPolicies];
      } else if (typeof rawPolicies === "string") {
        try {
          existingPolicies = JSON.parse(rawPolicies);
        } catch (error) {
          console.error("Failed to parse policies JSON", error);
          existingPolicies = [];
        }
      } else if (rawPolicies && typeof rawPolicies === "object") {
        existingPolicies = [rawPolicies];
      }

      if (!existingPolicies.length) {
        setApiMessage({
          content: "No policies found to update",
          type: "error",
        });
        return;
      }

      const updatedPolicies = existingPolicies.map((policy) => {
        const matchesSequence = Number(policy.sequence) === policyToEdit.dbSequence;
        const matchesName =
          (policy.policy || "").toLowerCase() ===
          (policyToEdit.policyName || "").toLowerCase();

        if (matchesSequence || matchesName) {
          return {
            ...policy,
            policy: editPolicyName.trim(),
            question: editPolicyQuestion.trim(),
          };
        }
        return policy;
      });

      const response = await itemService.updatePolicies(
        originalPolicyData.policyId,
        {
          policies: updatedPolicies,
          itemId: originalPolicyData.itemId || itemData?.itemId,
          storyId: originalPolicyData.storyId || itemData?.storyId,
          chapterId: originalPolicyData.chapterId || itemData?.chapterId,
        }
      );

      if (response.status === 200) {
        setApiMessage({
          content: "Policy updated successfully",
          type: "success",
        });

        setPolicies((prevPolicies) =>
          prevPolicies.map((policy) =>
            policy.policyId === policyToEdit.policyId &&
            policy.dbSequence === policyToEdit.dbSequence
              ? {
                  ...policy,
                  policyName: editPolicyName.trim(),
                  policyQuestion: editPolicyQuestion.trim(),
                  updatedAt: new Date().toISOString(),
                }
              : policy
          )
        );

        setOriginalPolicyData((prev) =>
          prev
            ? {
                ...prev,
                policies: updatedPolicies,
              }
            : prev
        );

        handleEditClose();
        await fetchPolicies();
      } else {
        setApiMessage({
          content: response.message || "Failed to update policy",
          type: "error",
        });
      }
    } catch (err) {
      setApiMessage({
        content: err.message || "An error occurred while updating the policy",
        type: "error",
      });
    } finally {
      setEditLoading(false);
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    }
  };

  const handleEditConfirm = () => {
    setEditConfirmModalOpen(false);
    handleEditSubmit();
  };

  const handleEditCancel = () => {
    setEditConfirmModalOpen(false);
  };

  const handleAddPolicy = async () => {
    if (!newPolicyName.trim()) return;

    try {
      setAddLoading(true);

      // console.log("🔧 Starting to add policy:", {
      //   itemId: itemId,
      //   newPolicyName: newPolicyName.trim(),
      //   newPolicyQuestion: newPolicyQuestion.trim(),
      //   hasOriginalPolicyData: !!originalPolicyData,
      //   hasItemData: !!itemData,
      // });

      // Create the new policy object
      const newPolicy = {
        type: "text",
        policy: newPolicyName.trim(),
        status: "active",
        question: newPolicyQuestion.trim(),
        sequence: 1,
      };

      let response;

      if (originalPolicyData) {
        // console.log("📝 Updating existing policy record:", {
        //   policyId: originalPolicyData.policyId,
        //   existingPoliciesCount: originalPolicyData.policies?.length || 0,
        // });

        // Policy record exists - update it with the new policy
        let existingPolicies = [];
        try {
          if (typeof originalPolicyData.policies === "string") {
            existingPolicies = JSON.parse(originalPolicyData.policies);
          } else if (Array.isArray(originalPolicyData.policies)) {
            existingPolicies = originalPolicyData.policies;
          } else if (
            originalPolicyData.policies &&
            typeof originalPolicyData.policies === "object"
          ) {
            // Handle single policy object - convert to array
            existingPolicies = [originalPolicyData.policies];
          }

          if (!Array.isArray(existingPolicies)) {
            existingPolicies = [];
          }
        } catch (error) {
          console.error("Error parsing existing policies:", error);
          existingPolicies = [];
        }

        // Separate active and inactive policies from existing data
        const existingActivePolicies = existingPolicies.filter(p => !p.status || p.status === "active");
        const existingInactivePolicies = existingPolicies.filter(p => p.status && p.status !== "active");
        
        // Add new policy to the end of active policies
        newPolicy.sequence = existingActivePolicies.length + 1;
        const updatedActivePolicies = [...existingActivePolicies, newPolicy];
        
        // Combine active policies with inactive policies (inactive policies appended at the end)
        const updatedPolicies = [...updatedActivePolicies, ...existingInactivePolicies];

        // console.log("📤 Sending update request with:", {
        //   policyId: originalPolicyData.policyId,
        //   updatedPoliciesCount: updatedPolicies.length,
        //   newPolicy: newPolicy,
        // });

        // Call updatePolicies API with the new policies array
        response = await itemService.updatePolicies(
          originalPolicyData.policyId,
          {
            policies: updatedPolicies,
            itemId: itemData?.itemId,
            storyId: itemData?.storyId,
            chapterId: itemData?.chapterId,
          }
        );
      } else {
        // console.log("🆕 Creating new policy record with item data:", {
        //   itemId: itemData?.itemId,
        //   storyId: itemData?.storyId,
        //   chapterId: itemData?.chapterId,
        //   itemName: itemData?.itemName,
        // });

        // No policy record exists - create a new one
        if (!itemData) {
          console.error("❌ No item data available for creating new policy");
          setApiMessage({
            content:
              "Item details not found. Please refresh the page and try again.",
            type: "error",
          });
          return;
        }

        // console.log("📤 Sending create request with:", {
        //   itemId: parseInt(itemId),
        //   storyId: itemData.storyId,
        //   chapterId: itemData.chapterId,
        //   newPolicy: newPolicy,
        // });

        response = await itemService.updatePolicies(
          null,
          {
            policies: [newPolicy],
            itemId: parseInt(itemId),
            storyId: itemData.storyId,
            chapterId: itemData.chapterId,
          },
          itemId
        );
      }

      // console.log("📨 API Response:", response);

      if (response.status === 200 || response.status === 201) {
        // console.log("✅ Policy added successfully");
        setApiMessage({
          content: "Policy added successfully",
          type: "success",
        });
        setAddPolicyModalOpen(false);
        setNewPolicyName("");
        setNewPolicyQuestion("");
        // Refresh the policies list
        await fetchPolicies();
      } else {
        console.error("❌ Failed to add policy:", response.message);
        setApiMessage({
          content: response.message || "Failed to add policy",
          type: "error",
        });
      }
    } catch (err) {
      console.error("❌ Error in handleAddPolicy:", err);
      setApiMessage({
        content: err.message || "An error occurred while adding the policy",
        type: "error",
      });
    } finally {
      setAddLoading(false);
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    }
  };

  const handleDragStart = () => {
    setIsDragging(true);
    setIsSequencingMode(true);
  };

  const handleDragEnd = async (result) => {
    setIsDragging(false);

    if (!result.destination || !originalPolicyData) {
      setIsSequencingMode(false);
      return;
    }

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    if (sourceIndex === destinationIndex) {
      return;
    }

    try {
      // Parse existing policies from original data
      let existingPolicies = [];
      try {
        if (typeof originalPolicyData.policies === "string") {
          existingPolicies = JSON.parse(originalPolicyData.policies);
        } else if (Array.isArray(originalPolicyData.policies)) {
          existingPolicies = originalPolicyData.policies;
        } else if (
          originalPolicyData.policies &&
          typeof originalPolicyData.policies === "object"
        ) {
          // Handle single policy object - convert to array
          existingPolicies = [originalPolicyData.policies];
        }

        if (!Array.isArray(existingPolicies)) {
          existingPolicies = [];
        }
      } catch (error) {
        console.error("Error parsing existing policies:", error);
        existingPolicies = [];
      }

      // Create a mapping from current display order to original policy data
      const currentPoliciesOrder = [...policies];

      // Map current display policies to their corresponding original policy data
      const mappedPolicies = currentPoliciesOrder.map((displayPolicy) => {
        return (
          existingPolicies.find(
            (originalPolicy) =>
              originalPolicy.sequence === displayPolicy.dbSequence
          ) || displayPolicy
        );
      });

      // Perform the drag and drop reordering on the mapped policies
      const reorderedPolicies = Array.from(mappedPolicies);
      const [removed] = reorderedPolicies.splice(sourceIndex, 1);
      reorderedPolicies.splice(destinationIndex, 0, removed);

      // Update sequence numbers for ALL policies in the new order
      const updatedPolicies = reorderedPolicies.map((policy, index) => ({
        ...policy,
        sequence: index + 1,
      }));

      // Store the reordered policies for saving later
      setPendingPolicies(updatedPolicies);
      setHasUnsavedChanges(true);

      // Update the display policies list to reflect the new order
      const reorderedDisplayPolicies = Array.from(currentPoliciesOrder);
      const [removedDisplayPolicy] = reorderedDisplayPolicies.splice(
        sourceIndex,
        1
      );
      reorderedDisplayPolicies.splice(
        destinationIndex,
        0,
        removedDisplayPolicy
      );

      // Update the display policies with original sequence preserved for display
      const updatedDisplayPolicies = reorderedDisplayPolicies.map(
        (policy, index) => ({
          ...policy,
          originalSequence: policy.dbSequence, // Keep original sequence for display
        })
      );

      setPolicies(updatedDisplayPolicies);
    } catch (err) {
      setApiMessage({
        content: err.message || "An error occurred while reordering policies",
        type: "error",
      });
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    }
  };

  const handleSaveChanges = async () => {
    if (!hasUnsavedChanges || !pendingPolicies.length || !originalPolicyData) {
      return;
    }

    // Show confirmation modal first
    setSaveSequenceConfirmModalOpen(true);
  };

  const handleSaveSequenceConfirm = async () => {
    try {
      setDragLoading(true);

      if (!pendingPolicies.length || !originalPolicyData) {
        setApiMessage({
          content: "No changes to save",
          type: "error",
        });
        return;
      }

      // Ensure all active policies have correct sequence numbers
      const finalActivePolicies = pendingPolicies.map((policy, index) => ({
        ...policy,
        sequence: index + 1,
      }));

      // Append inactive policies at the end (preserving their original data but without specific sequence order)
      // This ensures inactive policies are not lost during drag/drop operations
      // Active policies get proper sequential numbering (1, 2, 3...) while inactive policies maintain their original structure
      const finalPolicies = [...finalActivePolicies, ...inactivePolicies];

      // Call updatePolicies API with the combined policies array (active + inactive)
      const updateResponse = await itemService.updatePolicies(
        originalPolicyData.policyId,
        {
          policies: finalPolicies,
          itemId: itemData?.itemId,
          storyId: itemData?.storyId,
          chapterId: itemData?.chapterId,
        }
      );

      if (updateResponse.status === 200) {
        setApiMessage({
          content: "Policy sequence updated successfully",
          type: "success",
        });
        setHasUnsavedChanges(false);
        setPendingPolicies([]);
        setIsSequencingMode(false);
        // Refresh the policies list to get the latest data
        await fetchPolicies();
      } else {
        setApiMessage({
          content: updateResponse.message || "Failed to update policy sequence",
          type: "error",
        });
      }
    } catch (err) {
      setApiMessage({
        content:
          err.message || "An error occurred while saving policy sequence",
        type: "error",
      });
    } finally {
      setDragLoading(false);
      setSaveSequenceConfirmModalOpen(false);
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    }
  };

  const handleSaveSequenceCancel = () => {
    setSaveSequenceConfirmModalOpen(false);
  };

  const handleCancelChanges = () => {
    setHasUnsavedChanges(false);
    setPendingPolicies([]);
    setIsSequencingMode(false);
    // Reset policies to their original order and remove any temporary changes
    const resetPolicies = originalPoliciesOrder.map((policy) => ({
      ...policy,
      originalSequence: policy.dbSequence, // Reset original sequence display
    }));
    setPolicies(resetPolicies);
  };

  // Add simple styles for moved items
  const reorderStyles = `
    .policy-moved {
      /* Remove yellow highlighting - keep natural appearance */
    }
    .policy-moved:hover {
      /* Remove yellow highlighting - keep natural appearance */
    }
  `;

  // Update the styles constant
  const styles =
    messageStyles +
    dropdownStyles +
    filterBadgeStyles +
    saveButtonStyles +
    reorderStyles;

  const TableSkeleton = () => {
    return (
      <Card className="shadow">
        <Table
          className="align-items-center table-flush mb-0"
          style={tableStyles.table}
        >
          <thead className="thead-light">
            <tr>
              <th style={{ ...tableStyles.th, width: "8%" }}>ID</th>
              <th style={{ ...tableStyles.th, width: "8%" }}>SEQUENCE</th>
              <th style={{ ...tableStyles.th, width: "12%" }}>POLICY NAME</th>
              <th style={{ ...tableStyles.th, width: "20%" }}>
                POLICY QUESTION
              </th>
              <th style={{ ...tableStyles.th, width: "12%" }}>CREATED AT</th>
              <th style={{ ...tableStyles.th, width: "12%" }}>UPDATED AT</th>
              <th style={{ ...tableStyles.th, width: "10%" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(10)].map((_, index) => (
              <tr key={index} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ ...tableStyles.td, width: "8%" }}>
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "50%",
                      margin: "0 auto",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  ></div>
                </td>
                <td style={{ ...tableStyles.td, width: "8%" }}>
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "50%",
                      margin: "0 auto",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  ></div>
                </td>
                <td style={{ ...tableStyles.td, width: "12%" }}>
                  <div
                    style={{
                      width: "128px",
                      height: "16px",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "4px",
                      margin: "0 auto",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  ></div>
                </td>
                <td style={{ ...tableStyles.td, width: "20%" }}>
                  <div
                    style={{
                      width: "160px",
                      height: "16px",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "4px",
                      margin: "0 auto",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  ></div>
                </td>
                <td style={{ ...tableStyles.td, width: "12%" }}>
                  <div
                    style={{
                      width: "96px",
                      height: "16px",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "4px",
                      margin: "0 auto",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  ></div>
                </td>
                <td style={{ ...tableStyles.td, width: "12%" }}>
                  <div
                    style={{
                      width: "96px",
                      height: "16px",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "4px",
                      margin: "0 auto",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  ></div>
                </td>
                <td style={{ ...tableStyles.td, width: "10%" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "50%",
                      margin: "0 auto",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  ></div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    );
  };

  // Add effect to handle modal background
  useEffect(() => {
    if (
      editModalOpen ||
      deleteModalOpen ||
      addPolicyModalOpen ||
      saveSequenceConfirmModalOpen
    ) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [
    editModalOpen,
    deleteModalOpen,
    addPolicyModalOpen,
    saveSequenceConfirmModalOpen,
  ]);

  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-2 text-white" style={{ fontSize: "1.25rem" }}>
              POLICIES MANAGEMENT
            </h3>
            <nav aria-label="breadcrumb">
              <ol
                className="breadcrumb bg-transparent mb-4"
                style={{ padding: "0" }}
              >
                <li className="breadcrumb-item">
                  <a
                    href="#pablo"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/admin/training-data-hub", {
                        state: { page: seedDataPage },
                      });
                    }}
                    className="text-white"
                    style={{ textDecoration: "none" }}
                  >
                    Training Data Hub
                  </a>
                </li>
                <li className="breadcrumb-item">
                  <a
                    href="#pablo"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/admin/training-data-hub", {
                        state: { page: seedDataPage },
                      });
                    }}
                    className="text-white"
                    style={{ textDecoration: "none" }}
                  >
                    {passedItemName || "Item"}
                  </a>
                </li>
                <li
                  className="breadcrumb-item active text-white"
                  aria-current="page"
                >
                  Policies
                </li>
              </ol>
            </nav>
            <TableSkeleton />
          </div>
        </Row>
      </Container>
    );
  }

  if (error) {
    return (
      <Container fluid className="pt-7">
        <Alert color="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <style>
        {`
          .modal-backdrop {
            opacity: 0.5 !important;
          }
        `}
      </style>
      <Container fluid className="pt-6">
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
        <Row>
          <div className="col">
            <h3 className="mb-2 text-white" style={{ fontSize: "1.25rem" }}>
              POLICIES MANAGEMENT
            </h3>
            <nav aria-label="breadcrumb">
              <ol
                className="breadcrumb bg-transparent mb-4"
                style={{ padding: "0" }}
              >
                <li className="breadcrumb-item">
                  <a
                    href="#pablo"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/admin/training-data-hub", {
                        state: { page: seedDataPage },
                      });
                    }}
                    className="text-white"
                    style={{ textDecoration: "none" }}
                  >
                    Training Data Hub
                  </a>
                </li>
                <li className="breadcrumb-item">
                  <a
                    href="#pablo"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/admin/training-data-hub", {
                        state: { page: seedDataPage },
                      });
                    }}
                    className="text-white"
                    style={{ textDecoration: "none" }}
                  >
                    {passedItemName || "Item"}
                  </a>
                </li>
                <li
                  className="breadcrumb-item active text-white"
                  aria-current="page"
                >
                  Policies
                </li>
              </ol>
            </nav>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="mt-3">
                  <div className="col-md-6 d-flex justify-content-start">
                    {hasUnsavedChanges && (
                      <>
                        <Button
                          color="primary"
                          className="btn-save-changes mr-2"
                          onClick={handleSaveChanges}
                          disabled={dragLoading}
                        >
                          {dragLoading ? (
                            <>
                              <Spinner size="sm" className="mr-2" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-save mr-1" />
                              Save Sequence
                            </>
                          )}
                        </Button>
                        <Button
                          color="secondary"
                          className="btn-cancel-changes"
                          onClick={handleCancelChanges}
                          disabled={dragLoading}
                        >
                          <i className="fas fa-undo mr-1" />
                          Cancel Changes
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="col-md-6 d-flex justify-content-end">
                    <div>
                      <Button
                        className="btn-custom-primary mr-2"
                        color="primary"
                        onClick={() => setAddPolicyModalOpen(true)}
                      >
                        <i className="fas fa-plus" />
                        Add Policy
                      </Button>
                    </div>
                    <UncontrolledDropdown>
                      <DropdownToggle
                        className={`filter-button ${
                          getActiveFiltersCount(filters) > 0
                            ? "has-filters"
                            : ""
                        }`}
                        href="#pablo"
                        role="button"
                        size="sm"
                        color=""
                        onClick={(e) => e.preventDefault()}
                        style={{ textDecoration: "none" }}
                      >
                        <i className="fas fa-sliders-h" />
                        {getActiveFiltersCount(filters) > 0 && (
                          <>
                            <span className="filter-badge">
                              {getActiveFiltersCount(filters)}
                            </span>
                            <div
                              className="filter-tooltip"
                              style={{
                                top: "100%",
                                left: "50%",
                                transform: "translateX(-50%)",
                                marginTop: "4px",
                              }}
                            >
                              {getActiveFiltersText(filters)}
                            </div>
                          </>
                        )}
                      </DropdownToggle>
                      {createPortal(
                        <DropdownMenu
                          className="dropdown-menu-arrow"
                          right
                          style={{
                            zIndex: 9999,
                            padding: "1rem",
                            minWidth: "300px",
                          }}
                        >
                          <h6 className="text-uppercase text-muted mb-3">
                            Filters
                          </h6>
                          <FormGroup>
                            <Input
                              className="form-control-alternative"
                              placeholder="Filter by Policy Name"
                              type="text"
                              name="policyName"
                              value={filters.policyName}
                              onChange={handleFilterChange}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const dropdownToggle =
                                    document.querySelector(".filter-button");
                                  if (dropdownToggle) {
                                    dropdownToggle.click();
                                  }
                                }
                              }}
                              autoComplete="off"
                            />
                          </FormGroup>
                          <FormGroup>
                            <Input
                              className="form-control-alternative"
                              placeholder="Filter by Status"
                              type="text"
                              name="status"
                              value={filters.status}
                              onChange={handleFilterChange}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const dropdownToggle =
                                    document.querySelector(".filter-button");
                                  if (dropdownToggle) {
                                    dropdownToggle.click();
                                  }
                                }
                              }}
                              autoComplete="off"
                            />
                          </FormGroup>
                          <div className="d-flex justify-content-end mt-3">
                            <Button
                              color="secondary"
                              size="sm"
                              className="clear-filters-btn"
                              onClick={() => {
                                const clearedFilters = {
                                  policyName: "",
                                  status: "",
                                };
                                setFilters(clearedFilters);
                                clearFilters("policies");
                              }}
                            >
                              Clear Filters
                            </Button>
                          </div>
                        </DropdownMenu>,
                        document.body
                      )}
                    </UncontrolledDropdown>
                  </div>
                </Row>
              </CardHeader>
              <DragDropContext
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <Table
                  className={`align-items-center table-flush mb-0 ${
                    dragLoading ? "drag-loading" : ""
                  }`}
                  style={tableStyles.table}
                >
                  <thead className="thead-light">
                    <tr>
                      <th style={{ ...tableStyles.th, width: "5%" }}></th>
                      <th style={{ ...tableStyles.th, width: "8%" }}>ID</th>
                      <th
                        style={{
                          ...tableStyles.th,
                          width: isSuperAdmin ? "12%" : "14%",
                          cursor: "pointer",
                        }}
                        onClick={() => handleSort("sequence")}
                      >
                        SEQ NO. {getSortIcon("sequence")}
                      </th>
                      <th
                        style={{
                          ...tableStyles.th,
                          width: isSuperAdmin ? "12%" : "14%",
                          cursor: "pointer",
                        }}
                        onClick={() => handleSort("policyName")}
                      >
                        POLICY NAME {getSortIcon("policyName")}
                      </th>
                      <th
                        style={{
                          ...tableStyles.th,
                          width: isSuperAdmin ? "20%" : "24%",
                        }}
                      >
                        POLICY QUESTION
                      </th>
                      <th
                        style={{
                          ...tableStyles.th,
                          width: isSuperAdmin ? "12%" : "14%",
                        }}
                      >
                        CREATED AT
                      </th>
                      <th
                        style={{
                          ...tableStyles.th,
                          width: isSuperAdmin ? "12%" : "14%",
                        }}
                      >
                        UPDATED AT
                      </th>
                      {isSuperAdmin && (
                        <th style={{ ...tableStyles.th, width: "10%" }}>
                          ACTIONS
                        </th>
                      )}
                    </tr>
                  </thead>
                  <Droppable droppableId="policies-table">
                    {(provided) => (
                      <tbody
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                      >
                        {currentRecords.map((policy, index) => {
                          // Check if this policy has been moved
                          const originalIndex = originalPoliciesOrder.findIndex(
                            (p) =>
                              p.policyId === policy.policyId &&
                              p.dbSequence === policy.dbSequence
                          );
                          const isMoved = originalIndex !== index;

                          return (
                            <Draggable
                              key={`${policy.policyId}-${policy.dbSequence}`}
                              draggableId={`${policy.policyId}-${policy.dbSequence}`}
                              index={index}
                              isDragDisabled={dragLoading}
                            >
                              {(provided, snapshot) => (
                                <tr
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`draggable-row ${
                                    snapshot.isDragging ? "dragging" : ""
                                  }`}
                                >
                                  <td
                                    style={{ ...tableStyles.td, width: "5%" }}
                                  >
                                    <div
                                      {...provided.dragHandleProps}
                                      className="drag-handle"
                                      style={{
                                        display: "flex",
                                        justifyContent: "center",
                                      }}
                                    >
                                      <i className="fas fa-grip-vertical" />
                                    </div>
                                  </td>
                                  <td
                                    style={{ ...tableStyles.td, width: "8%" }}
                                  >
                                    {indexOfFirstRecord + index + 1}
                                  </td>
                                  <td
                                    style={{
                                      ...tableStyles.td,
                                      width: isSuperAdmin ? "12%" : "14%",
                                    }}
                                  >
                                    {policy.originalSequence ||
                                      policy.dbSequence}
                                  </td>
                                  <td
                                    style={{
                                      ...tableStyles.td,
                                      width: isSuperAdmin ? "12%" : "14%",
                                    }}
                                  >
                                    {policy.policyName}
                                  </td>
                                  <td
                                    style={{
                                      ...tableStyles.td,
                                      width: isSuperAdmin ? "20%" : "24%",
                                    }}
                                  >
                                    {policy.policyQuestion}
                                  </td>
                                  <td
                                    style={{
                                      ...tableStyles.td,
                                      width: isSuperAdmin ? "12%" : "14%",
                                    }}
                                  >
                                    {formatDate(policy.createdAt)}
                                  </td>
                                  <td
                                    style={{
                                      ...tableStyles.td,
                                      width: isSuperAdmin ? "12%" : "14%",
                                    }}
                                  >
                                    {formatDate(policy.updatedAt)}
                                  </td>
                                  {isSuperAdmin && (
                                    <td
                                      style={{
                                        ...tableStyles.td,
                                        width: "10%",
                                      }}
                                    >
                                      <UncontrolledDropdown nav>
                                        <DropdownToggle
                                          className="btn-icon-only text-light"
                                          href="#pablo"
                                          role="button"
                                          size="sm"
                                          color=""
                                          onClick={(e) => e.preventDefault()}
                                        >
                                          <i className="fas fa-ellipsis-v" />
                                        </DropdownToggle>
                                        {createPortal(
                                          <DropdownMenu
                                            className="dropdown-menu-arrow"
                                            right
                                            style={{ zIndex: 9999 }}
                                          >
                                            <DropdownItem
                                              onClick={() =>
                                                handleEditClick(policy)
                                              }
                                              style={{
                                                color: "#8898aa",
                                                display: "flex",
                                                alignItems: "center",
                                              }}
                                            >
                                              <i className="fas fa-pencil-alt text-warning mr-2" />
                                              <span>Edit</span>
                                            </DropdownItem>
                                            <DropdownItem
                                              onClick={() =>
                                                handleDeleteClick(policy)
                                              }
                                              style={{
                                                color: "#8898aa",
                                                display: "flex",
                                                alignItems: "center",
                                              }}
                                            >
                                              <i className="fas fa-trash-alt text-danger mr-2" />
                                              <span>Delete</span>
                                            </DropdownItem>
                                          </DropdownMenu>,
                                          document.body
                                        )}
                                      </UncontrolledDropdown>
                                    </td>
                                  )}
                                </tr>
                              )}
                            </Draggable>
                          );
                        })}
                        {currentRecords.length === 0 && (
                          <tr>
                            <td
                              colSpan={isSuperAdmin ? 8 : 7}
                              style={{
                                textAlign: "center",
                                padding: "40px 20px",
                              }}
                            >
                              <div
                                style={{ color: "#8898aa", fontSize: "1rem" }}
                              >
                                <i
                                  className="fas fa-file-alt mb-3"
                                  style={{
                                    fontSize: "3rem",
                                    display: "block",
                                    marginBottom: "1rem",
                                  }}
                                ></i>
                                <h5
                                  style={{
                                    color: "#525f7f",
                                    marginBottom: "0.5rem",
                                  }}
                                >
                                  No Policies Found
                                </h5>
                                <p
                                  style={{
                                    marginBottom: "1.5rem",
                                    color: "#8898aa",
                                  }}
                                >
                                  This item doesn't have any policies yet. Start
                                  by adding your first policy to define the
                                  conversation flow.
                                </p>
                                <Button
                                  color="primary"
                                  className="btn-custom-primary"
                                  onClick={() => setAddPolicyModalOpen(true)}
                                >
                                  <i className="fas fa-plus mr-2" />
                                  Add Your First Policy
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                        {provided.placeholder}
                      </tbody>
                    )}
                  </Droppable>
                </Table>
              </DragDropContext>
              <CardFooter className="py-4">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="text-muted">
                    {filteredPolicies.length > 0
                      ? isSequencingMode
                        ? `Showing all ${filteredPolicies.length} entries (Sequencing Mode)`
                        : `Showing ${getEntryRange().start} to ${
                            getEntryRange().end
                          } of ${filteredPolicies.length} entries`
                      : "No policies found"}
                  </div>
                  {filteredPolicies.length > recordsPerPage && !isSequencingMode && (
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
                            className={currentPage === pageNum ? "active" : ""}
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
            </Card>
          </div>
        </Row>

        {/* Delete Confirmation Modal */}
        <Modal isOpen={deleteModalOpen} toggle={handleDeleteCancel} centered>
          <ModalHeader className="border-0 pb-0" toggle={handleDeleteCancel}>
            Delete Policy?
          </ModalHeader>
          <ModalBody className="pt-0">
            <p className="text-left mb-4">
              Are you sure you want to delete this policy?
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

        {/* Edit Modal */}
        <Modal isOpen={editModalOpen} toggle={handleEditClose} centered>
          <ModalHeader className="border-0 pb-0" toggle={handleEditClose}>
            Edit Policy
          </ModalHeader>
          <ModalBody className="pt-0">
            <Form>
              <FormGroup>
                <label htmlFor="policyName" className="form-control-label">
                  Policy Name
                </label>
                <Input
                  className="form-control-alternative"
                  id="policyName"
                  placeholder="Enter policy name"
                  type="text"
                  value={editPolicyName}
                  onChange={(e) => setEditPolicyName(e.target.value)}
                  autoComplete="off"
                />
              </FormGroup>
              <FormGroup>
                <label htmlFor="policyQuestion" className="form-control-label">
                  Policy Question
                </label>
                <Input
                  className="form-control-alternative"
                  id="policyQuestion"
                  placeholder="Enter policy question"
                  type="textarea"
                  rows="3"
                  value={editPolicyQuestion}
                  onChange={(e) => setEditPolicyQuestion(e.target.value)}
                  autoComplete="off"
                />
              </FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter className="border-0">
            <Button color="secondary" onClick={handleEditClose}>
              Cancel
            </Button>
            <Button
              color="primary"
              onClick={() => setEditConfirmModalOpen(true)}
              disabled={editLoading || !editPolicyName.trim()}
              className="btn-custom-primary"
            >
              {editLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Updating...
                </>
              ) : (
                "Update"
              )}
            </Button>
          </ModalFooter>
        </Modal>

        {/* Edit Confirmation Modal */}
        <Modal isOpen={editConfirmModalOpen} toggle={handleEditCancel} centered>
          <ModalHeader className="border-0 pb-0" toggle={handleEditCancel}>
            Edit Policy?
          </ModalHeader>
          <ModalBody className="pt-0">
            <p className="text-left mb-4">
              Are you sure you want to update this policy?
            </p>
            <div className="d-flex justify-content-end gap-3">
              <Button color="secondary" onClick={handleEditCancel}>
                Cancel
              </Button>
              <Button
                color="primary"
                onClick={handleEditConfirm}
                disabled={editLoading}
                className="btn-custom-primary"
              >
                {editLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Updating...
                  </>
                ) : (
                  "Confirm"
                )}
              </Button>
            </div>
          </ModalBody>
        </Modal>

        {/* Add Policy Modal */}
        <Modal
          isOpen={addPolicyModalOpen}
          toggle={() => setAddPolicyModalOpen(false)}
          centered
        >
          <ModalHeader
            className="border-0 pb-0"
            toggle={() => setAddPolicyModalOpen(false)}
          >
            Add Policy
          </ModalHeader>
          <ModalBody className="pt-0">
            <Form>
              <FormGroup>
                <label htmlFor="policyName" className="form-control-label">
                  Policy Name
                </label>
                <Input
                  className="form-control-alternative"
                  id="policyName"
                  required
                  placeholder="Enter policy name"
                  type="text"
                  value={newPolicyName}
                  onChange={(e) => setNewPolicyName(e.target.value)}
                  autoComplete="off"
                />
              </FormGroup>
              <FormGroup>
                <label htmlFor="policyQuestion" className="form-control-label">
                  Policy Question
                </label>
                <Input
                  className="form-control-alternative"
                  id="policyQuestion"
                  placeholder="Enter policy question"
                  type="textarea"
                  rows="3"
                  value={newPolicyQuestion}
                  onChange={(e) => setNewPolicyQuestion(e.target.value)}
                  autoComplete="off"
                />
              </FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter className="border-0">
            <Button
              color="secondary"
              onClick={() => setAddPolicyModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              color="primary"
              onClick={handleAddPolicy}
              disabled={
                addLoading || !newPolicyName.trim()
              }
              className="btn-custom-primary"
            >
              {addLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Adding...
                </>
              ) : (
                "Add"
              )}
            </Button>
          </ModalFooter>
        </Modal>

        {/* Save Sequence Confirmation Modal */}
        <Modal
          isOpen={saveSequenceConfirmModalOpen}
          toggle={handleSaveSequenceCancel}
          centered
        >
          <ModalHeader
            className="border-0 pb-0"
            toggle={handleSaveSequenceCancel}
          >
            Save Sequence Changes?
          </ModalHeader>
          <ModalBody className="pt-0">
            <p className="text-left mb-4">
              Are you sure you want to save the new policy sequence?
            </p>
            <div className="d-flex justify-content-end gap-3">
              <Button color="secondary" onClick={handleSaveSequenceCancel}>
                Cancel
              </Button>
              <Button
                color="primary"
                onClick={handleSaveSequenceConfirm}
                disabled={dragLoading}
                className="btn-custom-primary"
              >
                {dragLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : (
                  "Yes, Save"
                )}
              </Button>
            </div>
          </ModalBody>
        </Modal>
      </Container>
    </>
  );
};

export default PoliciesTable;
