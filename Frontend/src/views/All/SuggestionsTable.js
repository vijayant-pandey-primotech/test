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
  CardBody,
  CardTitle,
  Col,
  Label,
} from "reactstrap";
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from "react-router-dom";
import itemService from "services/itemService";
import { Message } from 'rsuite';
import { IoWarningOutline } from 'react-icons/io5';
import { SiTicktick } from 'react-icons/si';
import 'rsuite/dist/rsuite.min.css';
import { saveFilters, loadFilters, clearFilters, getActiveFiltersCount, getActiveFiltersText, getFilterPreview, getFilterCountText } from "utils/filterUtils";

// Add custom styles for the Message component
const messageStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap');

  body {
    font-family: "Lato", "sans-serif";
  }

  /* Modal text color styles */
  .modal-content {
    color: #000000 !important;
  }
  .modal-header {
    color: #000000 !important;
  }
  .modal-body {
    color: #000000 !important;
  }
  .modal-footer {
    color: #000000 !important;
  }
  .form-control {
    color: #000000 !important;
  }
  .form-control::placeholder {
    color: #8898aa !important;
  }
  .form-control:focus {
    color: #000000 !important;
  }
  .form-control-label {
    color: #000000 !important;
  }
  .modal-title {
    color: #000000 !important;
  }
  .modal p {
    color: #000000 !important;
  }
  .modal label {
    color: #000000 !important;
  }
  .modal textarea {
    color: #000000 !important;
  }
  .modal textarea::placeholder {
    color: #8898aa !important;
  }
  .modal textarea:focus {
    color: #000000 !important;
  }

  /* Modal label styles */
  .modal-body label {
    color: #3A6D8C !important;
    font-weight: bold !important;
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
`;

// Add this line after the existing styles constant
const styles = messageStyles + dropdownStyles + filterBadgeStyles;

const SuggestionsTable = () => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [apiMessage, setApiMessage] = useState({ content: "", type: "" });
  const [messageKey, setMessageKey] = useState(Date.now());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [suggestionToDelete, setSuggestionToDelete] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [suggestionToEdit, setSuggestionToEdit] = useState(null);
  const [editSuggestion, setEditSuggestion] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editConfirmModalOpen, setEditConfirmModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [filters, setFilters] = useState(() => loadFilters('suggestions', {
    suggestion: ''
  }));
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'ascending'
  });
  const recordsPerPage = 10;
  const { itemId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { itemName, currentPage: seedDataPage } = location.state || {};
  const isSuperAdmin = localStorage.getItem("userRole") === "admin";

  useEffect(() => {
    fetchSuggestions();
  }, [itemId]);

  const fetchSuggestions = async () => {
    try {
      setLoading(true);
      const response = await itemService.getSuggestionsList(itemId);
      if (response.status === 200) {
        // Filter out inactive suggestions
        const activeSuggestions = response.body.filter(suggestion => suggestion.status === "active");
        setSuggestions(activeSuggestions);
      } else {
        setError("Failed to fetch suggestions");
      }
    } catch (err) {
      setError(err.message || "An error occurred while fetching suggestions");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US');
  };

  const tableStyles = {
    table: {
      width: '100%',
      tableLayout: 'fixed',
    },
    th: {
      whiteSpace: 'normal',
      padding: '8px 4px',
      textAlign: 'center',
      fontSize: '0.75rem',
      fontWeight: '600',
      textTransform: 'uppercase',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      height: '40px',
      lineHeight: '24px',
      verticalAlign: 'middle'
    },
    td: {
      whiteSpace: 'normal',
      padding: '8px 4px',
      textAlign: 'center',
      fontSize: '0.875rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minHeight: '32px',
      lineHeight: '24px',
      verticalAlign: 'middle',
      wordBreak: 'break-word'
    },
    suggestionCell: {
      whiteSpace: 'normal',
      padding: '8px 4px',
      textAlign: 'center',
      fontSize: '0.875rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minHeight: '32px',
      lineHeight: '1.4',
      verticalAlign: 'middle',
      wordBreak: 'break-word',
      maxWidth: '400px'
    },
    actionsCell: {
      whiteSpace: 'normal',
      padding: '8px 24px 8px 4px',
      textAlign: 'center',
      fontSize: '0.875rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minHeight: '32px',
      lineHeight: '24px',
      verticalAlign: 'middle',
      wordBreak: 'break-word'
    }
  };

  // Function to handle sorting
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Function to get sort icon
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <i className="fas fa-sort ml-1" style={{ opacity: 0.3 }} />;
    }
    return sortConfig.direction === 'ascending' ? 
      <i className="fas fa-sort-up ml-1" /> : 
      <i className="fas fa-sort-down ml-1" />;
  };

  // Sort suggestions based on current sort configuration
  const sortedSuggestions = [...suggestions].sort((a, b) => {
    if (!sortConfig.key) return 0;

    if (sortConfig.key === 'suggestion') {
      const suggestionA = (a.suggestion || '').toLowerCase();
      const suggestionB = (b.suggestion || '').toLowerCase();
      return sortConfig.direction === 'ascending' ? 
        suggestionA.localeCompare(suggestionB) : 
        suggestionB.localeCompare(suggestionA);
    }

    return 0;
  });

  // Filter suggestions based on search criteria
  const filteredSuggestions = sortedSuggestions.filter(suggestion => {
    const suggestionMatch = filters.suggestion === '' || 
      suggestion.suggestion.toLowerCase().includes(filters.suggestion.toLowerCase());
    return suggestionMatch;
  });

  // Calculate pagination for filtered results
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords = filteredSuggestions.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(filteredSuggestions.length / recordsPerPage);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    const newFilters = {
      ...filters,
      [name]: value
    };
    setFilters(newFilters);
    saveFilters('suggestions', newFilters);
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
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
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
    const end = Math.min(indexOfLastRecord, filteredSuggestions.length);
    return { start, end };
  };

  const handleDeleteClick = (suggestion) => {
    setSuggestionToDelete(suggestion);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      setDeleteLoading(true);
      console.log(suggestionToDelete.id);
      const response = await itemService.deleteSuggestion(itemId, suggestionToDelete.id);
      if (response.status === 200) {
        setMessageKey(Date.now());
        setApiMessage({
          content: "Suggestion deleted successfully",
          type: "success"
        });
        fetchSuggestions();
        setDeleteModalOpen(false);
        setSuggestionToDelete(null);
      } else {
        setMessageKey(Date.now());
        setApiMessage({
          content: response.body.message || "Failed to delete suggestion",
          type: "error"
        });
      }
    } catch (err) {
      setMessageKey(Date.now());
      setApiMessage({
        content: err.message || "An error occurred while deleting the suggestion",
        type: "error"
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setSuggestionToDelete(null);
  };

  const handleEditClick = (suggestion) => {
    setSuggestionToEdit(suggestion);
    setEditSuggestion(suggestion.suggestion);
    setEditModalOpen(true);
  };

  const handleEditClose = () => {
    setEditModalOpen(false);
    setSuggestionToEdit(null);
    setEditSuggestion('');
  };

  const handleEditSubmit = async () => {
    try {
      setEditLoading(true);
      const response = await itemService.editSuggestion(itemId, suggestionToEdit.id, editSuggestion);
      if (response.status === 200) {
        setMessageKey(Date.now());
        setApiMessage({
          content: "Suggestion updated successfully",
          type: "success"
        });
        fetchSuggestions();
        setEditConfirmModalOpen(false);
        handleEditClose();
      } else {
        setMessageKey(Date.now());
        setApiMessage({
          content: response.body.message || "Failed to update suggestion",
          type: "error"
        });
      }
    } catch (err) {
      setMessageKey(Date.now());
      setApiMessage({
        content: err.message || "An error occurred while updating the suggestion",
        type: "error"
      });
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditConfirm = () => {
    setEditConfirmModalOpen(true);
  };

  const handleEditCancel = () => {
    setEditConfirmModalOpen(false);
  };

  const TableSkeleton = () => {
    return (
      <Card className="shadow">
        <Table className="align-items-center table-flush mb-0" style={tableStyles.table}>
          <thead className="thead-light">
            <tr>
              <th style={{...tableStyles.th, width: '8%'}}>ID</th>
              <th style={{...tableStyles.th, width: '92%'}}>SUGGESTION</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(10)].map((_, index) => (
              <tr key={index} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={{...tableStyles.td, width: '8%'}}>
                  <div style={{ 
                    width: '24px', 
                    height: '24px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '50%',
                    margin: '0 auto',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                </td>
                <td style={{...tableStyles.td, width: '92%'}}>
                  <div style={{ 
                    width: '400px', 
                    height: '16px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '4px',
                    margin: '0 auto',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
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
    if (editModalOpen || deleteModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [editModalOpen, deleteModalOpen]);

  if (loading) {
    return (
      <Container fluid className="pt-6">
        <style>{styles}</style>
        {apiMessage.content && (
          <Message
            closable
            key={messageKey}
            type={apiMessage.type}
            style={{
              position: "fixed",
              left: "50%",
              transform: "translateX(-50%)",
              textAlign: "center",
              width: "auto",
              minWidth: "200px",
              maxWidth: "40%",
              backgroundColor: apiMessage.type === "success" ? "#d4edda" : "#f8d7da",
              top: "20px",
              zIndex: 9999,
              fontSize: "0.875rem",
              padding: "8px 16px",
              margin: "0 auto",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transition: "none",
              animation: "none"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center", width: "100%" }}>
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
            <h3 className="mb-2 text-white" style={{ fontSize: '1.25rem' }}>SUGGESTIONS MANAGEMENT</h3>
            <nav aria-label="breadcrumb">
              <ol className="breadcrumb bg-transparent mb-4" style={{ padding: '0' }}>
                <li className="breadcrumb-item">
                  <a href="#pablo" onClick={(e) => { e.preventDefault(); navigate('/admin/training-data-hub', { state: { page: 1 } }); }} className="text-white" style={{ textDecoration: 'none' }}>
                    Training Data Hub
                  </a>
                </li>
                <li className="breadcrumb-item">
                  <a href="#pablo" onClick={(e) => { e.preventDefault(); navigate('/admin/training-data-hub', { state: { page: seedDataPage } }); }} className="text-white" style={{ textDecoration: 'none' }}>
                    {itemName || 'Item'}
                  </a>
                </li>
                <li className="breadcrumb-item active text-white" aria-current="page">Suggestions</li>
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
        <Alert color="danger">
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <>
      <style>
        {`
          .modal-backdrop {
            opacity: 0.5 !important;
          }
        `}
      </style>
      <Container fluid className="pt-6">
        <style>{styles}</style>
        {apiMessage.content && (
          <Message
            closable
            key={messageKey}
            type={apiMessage.type}
            style={{
              position: "fixed",
              left: "50%",
              transform: "translateX(-50%)",
              textAlign: "center",
              width: "auto",
              minWidth: "200px",
              maxWidth: "40%",
              backgroundColor: apiMessage.type === "success" ? "#d4edda" : "#f8d7da",
              top: "20px",
              zIndex: 9999,
              fontSize: "0.875rem",
              padding: "8px 16px",
              margin: "0 auto",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              transition: "none",
              animation: "none"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center", width: "100%" }}>
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
            <h3 className="mb-2 text-white" style={{ fontSize: '1.25rem' }}>SUGGESTIONS MANAGEMENT</h3>
            <nav aria-label="breadcrumb">
              <ol className="breadcrumb bg-transparent mb-4" style={{ padding: '0' }}>
                <li className="breadcrumb-item">
                  <a href="#pablo" onClick={(e) => { e.preventDefault(); navigate('/admin/training-data-hub', { state: { page: 1 } }); }} className="text-white" style={{ textDecoration: 'none' }}>
                    Training Data Hub
                  </a>
                </li>
                <li className="breadcrumb-item">
                  <a href="#pablo" onClick={(e) => { e.preventDefault(); navigate('/admin/training-data-hub', { state: { page: seedDataPage } }); }} className="text-white" style={{ textDecoration: 'none' }}>
                    {itemName || 'Item'}
                  </a>
                </li>
                <li className="breadcrumb-item active text-white" aria-current="page">Suggestions</li>
              </ol>
            </nav>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="mt-3">
                  <div className="col-md-12 d-flex justify-content-end">
                    <UncontrolledDropdown>
                      <DropdownToggle
                        className={`filter-button ${getActiveFiltersCount(filters) > 0 ? 'has-filters' : ''}`}
                        href="#pablo"
                        role="button"
                        size="sm"
                        color=""
                        onClick={(e) => e.preventDefault()}
                        style={{ textDecoration: 'none' }}
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
                                top: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                marginTop: '4px'
                              }}
                            >
                              {getActiveFiltersText(filters)}
                            </div>
                          </>
                        )}
                      </DropdownToggle>
                      {createPortal(
                        <DropdownMenu className="dropdown-menu-arrow" right style={{ zIndex: 9999, padding: '1rem', minWidth: '300px' }}>
                          <h6 className="text-uppercase text-muted mb-3">Filters</h6>
                          <FormGroup>
                            <Input
                              className="form-control-alternative"
                              placeholder="Filter by Suggestion"
                              type="text"
                              name="suggestion"
                              value={filters.suggestion}
                              onChange={handleFilterChange}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const dropdownToggle = document.querySelector('.filter-button');
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
                                  suggestion: ''
                                };
                                setFilters(clearedFilters);
                                clearFilters('suggestions');
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
              <Table className="align-items-center table-flush mb-0" style={tableStyles.table}>
                <thead className="thead-light">
                  <tr>
                    <th style={{...tableStyles.th, width: '8%'}}>ID</th>
                    <th 
                      style={{...tableStyles.th, width: isSuperAdmin ? '76%' : '92%', cursor: 'pointer'}} 
                      onClick={() => handleSort('suggestion')}
                    >
                      SUGGESTION {getSortIcon('suggestion')}
                    </th>
                    {isSuperAdmin && <th style={{...tableStyles.th, width: '16%'}}>ACTIONS</th>}
                  </tr>
                </thead>
                <tbody>
                  {currentRecords.map((suggestion, index) => (
                    <tr key={index}>
                      <td style={{...tableStyles.td, width: '8%'}}>{indexOfFirstRecord + index + 1}</td>
                      <td style={{...tableStyles.suggestionCell, width: isSuperAdmin ? '76%' : '92%'}}>{suggestion.suggestion}</td>
                      {isSuperAdmin && (
                        <td style={{...tableStyles.actionsCell, width: '16%'}}>
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
                              <DropdownMenu className="dropdown-menu-arrow" right style={{ zIndex: 9999 }}>
                                <DropdownItem onClick={() => handleEditClick(suggestion)} style={{ color: '#8898aa', display: 'flex', alignItems: 'center' }}>
                                  <i className="fas fa-pencil-alt text-warning mr-2" />
                                  <span>Edit</span>
                                </DropdownItem>
                                <DropdownItem onClick={() => handleDeleteClick(suggestion)} style={{ color: '#8898aa', display: 'flex', alignItems: 'center' }}>
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
                  ))}
                </tbody>
              </Table>
              <CardFooter className="py-4">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="text-muted">
                    Showing {getEntryRange().start} to {getEntryRange().end} of {filteredSuggestions.length} entries
                  </div>
                  {filteredSuggestions.length > recordsPerPage && (
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
                          <PaginationItem key={pageNum} className={currentPage === pageNum ? 'active' : ''}>
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

        {/* Edit Modal */}
        <Modal isOpen={editModalOpen} toggle={handleEditClose} centered>
          <ModalHeader className="border-0 pb-0" toggle={handleEditClose}>
            Edit Suggestion
          </ModalHeader>
          <ModalBody className="pt-0">
            <Form>
              <FormGroup>
                <Label for="suggestion" style={{ color: '#3A6D8C !important', fontWeight: 'bold !important' }}>Suggestion</Label>
                <Input
                  type="textarea"
                  name="suggestion"
                  id="suggestion"
                  value={editSuggestion}
                  onChange={(e) => setEditSuggestion(e.target.value)}
                  rows="4"
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
              onClick={handleEditConfirm}
              disabled={editLoading || !editSuggestion.trim()}
              className="btn-custom-primary"
            >
              {editLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Updating...
                </>
              ) : (
                'Update'
              )}
            </Button>
          </ModalFooter>
        </Modal>

        {/* Edit Confirmation Modal */}
        <Modal isOpen={editConfirmModalOpen} toggle={handleEditCancel} centered>
          <ModalHeader className="border-0 pb-0" toggle={handleEditCancel}>
            Edit Suggestion?
          </ModalHeader>
          <ModalBody className="pt-0">
            <p className="text-left mb-4">Are you sure you want to update this suggestion?</p>
            <div className="d-flex justify-content-end gap-3">
              <Button color="secondary" onClick={handleEditCancel}>
                Cancel
              </Button>
              <Button 
                color="primary" 
                onClick={handleEditSubmit}
                disabled={editLoading}
                className="btn-custom-primary"
              >
                {editLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Updating...
                  </>
                ) : (
                  'Confirm'
                )}
              </Button>
            </div>
          </ModalBody>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal isOpen={deleteModalOpen} toggle={handleDeleteCancel} centered>
          <ModalHeader className="border-0 pb-0" toggle={handleDeleteCancel}>
            Delete Suggestion?
          </ModalHeader>
          <ModalBody className="pt-0">
            <p className="text-left mb-4">Are you sure you want to delete this suggestion?</p>
            <div className="d-flex justify-content-end gap-3">
              <Button color="secondary" onClick={handleDeleteCancel}>
                Cancel
              </Button>
              <Button 
                color="danger" 
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Deleting...
                  </>
                ) : (
                  'Confirm'
                )}
              </Button>
            </div>
          </ModalBody>
        </Modal>
      </Container>
    </>
  );
};

export default SuggestionsTable; 