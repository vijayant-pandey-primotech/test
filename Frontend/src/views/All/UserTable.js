/*!

=========================================================
* Argon Dashboard React - v1.2.4
=========================================================

* Product Page: https://www.creative-tim.com/product/argon-dashboard-react
* Copyright 2024 Creative Tim (https://www.creative-tim.com)
* Licensed under MIT (https://github.com/creativetimofficial/argon-dashboard-react/blob/master/LICENSE.md)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
// reactstrap components
import {
  Badge,
  Card,
  CardHeader,
  CardFooter,
  DropdownMenu,
  DropdownItem,
  UncontrolledDropdown,
  DropdownToggle,
  Media,
  Pagination,
  PaginationItem,
  PaginationLink,
  Progress,
  Table,
  Container,
  Row,
  UncontrolledTooltip,
  Spinner,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  FormGroup,
  Input
} from "reactstrap";
// core components
import userService from "services/userService";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { IoWarningOutline } from 'react-icons/io5';
import { SiTicktick } from 'react-icons/si';
import { IoClose } from 'react-icons/io5';
import { saveFilters, loadFilters, clearFilters, getActiveFiltersCount, getActiveFiltersText, getFilterPreview, getFilterCountText } from "utils/filterUtils";
import { useNavigate } from "react-router-dom";
// Add custom styles for the toast message
const toastStyles = `
  .custom-toast {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    top: 20px;
    z-index: 9999;
    min-width: 200px;
    max-width: 40%;
    background-color: #fff;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 32px 8px 16px;
    box-sizing: border-box;
  }
  .custom-toast.success {
    background-color: #d4edda;
  }
  .custom-toast.error {
    background-color: #f8d7da;
  }
  .custom-toast-content {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: center;
    width: 100%;
    position: relative;
  }
  .custom-toast-close {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: #8898aa;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
  }
  .custom-toast-close:hover {
    color: #172b4d;
  }
`;

const CustomToast = ({ message, type, onClose }) => {
  return createPortal(
    <div className={`custom-toast ${type}`}>
      <div className="custom-toast-content">
        {type === "error" ? (
          <IoWarningOutline size={16} color="#c40d0d" />
        ) : (
          <SiTicktick size={16} color="#183e17" />
        )}
        <span>{message}</span>
        <button className="custom-toast-close" onClick={onClose}>
          <IoClose size={14} />
        </button>
      </div>
    </div>,
    document.body
  );
};

// Add custom styles
const messageStyles = `
  /* Toast message styles */
  .toast-message {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    min-width: 200px;
    max-width: 40%;
    text-align: center;
  }
`;

const dropdownStyles = `
  .dropdown-item:hover {
    color: white !important;
    background-color: #3A6D8C !important;
  }
  .dropdown-item:hover i {
    color: white !important;
  }
`;

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

/* Filter button styles */
const filterButtonStyles = `
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

// Combine all styles
const styles = messageStyles + dropdownStyles + filterBadgeStyles + filterButtonStyles;

const UserTable = () => {
  const navigate = useNavigate();
  const isViewer = localStorage.getItem("userRole") === "viewer";
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [apiMessage, setApiMessage] = useState({ content: "", type: "" });
  const [messageKey, setMessageKey] = useState(Date.now());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [filters, setFilters] = useState(() => loadFilters('users', {
    name: '',
    email: ''
  }));
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'ascending'
  });
  const recordsPerPage = 10;

  useEffect(() => {
    fetchUsers();
  }, []);
  const handleViewLogs = (userId) => {
    console.log(userId, "=============================userId");
    navigate(`/admin/user-activity/${userId}`);
  };
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await userService.getUsers();
      if (response.status === 200) {
        // Filter out deleted users
        const activeUsers = response.body.filter(user => user.is_deleted !== 1);
        setUsers(activeUsers);
      } else {
        setError("Failed to fetch users");
      }
    } catch (err) {
      setError(err.message || "An error occurred while fetching users");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US');
  };

  const formatCreatedAt = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US'); // Changed from 'en-GB' to 'en-US' for mm/dd/yyyy format
  };

  const formatLastActiveTime = (dateString) => {
    if (dateString == null || dateString === '') return '-';
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return '-';
      const datePart = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${datePart}, ${timePart}`;
    } catch {
      return '-';
    }
  };

  // Function to generate a random color
  const getRandomColor = () => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
      '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB',
      '#E67E22', '#2ECC71', '#1ABC9C', '#F1C40F'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Function to get user's initial
  const getUserInitial = (firstName, lastName, email) => {
    if (firstName || lastName) {
      return ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase();
    }
    // If no name, use first letter of email
    return email ? email[0].toUpperCase() : '?';
  };

  // Function to capitalize first letter of each word
  const capitalizeName = (name) => {
    if (!name) return '';
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Add custom styles
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

  // Sort users based on current sort configuration
  const sortedUsers = [...users].sort((a, b) => {
    if (!sortConfig.key) {
      // Default sort: empty names at the end
      const aHasName = a.firstName || a.lastName;
      const bHasName = b.firstName || b.lastName;
      if (aHasName && !bHasName) return -1;
      if (!aHasName && bHasName) return 1;
      return 0;
    }

    if (sortConfig.key === 'name') {
      // For name sort, empty names go to the end
      const aHasName = a.firstName || a.lastName;
      const bHasName = b.firstName || b.lastName;
      
      if (aHasName && !bHasName) return -1;
      if (!aHasName && bHasName) return 1;
      if (!aHasName && !bHasName) return 0;

      const nameA = `${capitalizeName(a.firstName)} ${capitalizeName(a.lastName)}`.toLowerCase();
      const nameB = `${capitalizeName(b.firstName)} ${capitalizeName(b.lastName)}`.toLowerCase();
      return sortConfig.direction === 'ascending' ? 
        nameA.localeCompare(nameB) : 
        nameB.localeCompare(nameA);
    }

    if (sortConfig.key === 'last_active_time') {
      const timeA = a.last_active_time ? new Date(a.last_active_time).getTime() : 0;
      const timeB = b.last_active_time ? new Date(b.last_active_time).getTime() : 0;
      // Missing/invalid dates (0) go to the end
      if (timeA !== timeB) {
        if (timeA === 0) return 1;
        if (timeB === 0) return -1;
      }
      return sortConfig.direction === 'ascending' ? timeA - timeB : timeB - timeA;
    }

    return 0;
  });

  // Filter users based on search criteria
  const filteredUsers = sortedUsers.filter(user => {
    const nameMatch = filters.name === '' || 
      `${capitalizeName(user.firstName)} ${capitalizeName(user.lastName)}`.toLowerCase().includes(filters.name.toLowerCase());
    const emailMatch = filters.email === '' || 
      (user.emailAddress && user.emailAddress.toLowerCase().includes(filters.email.toLowerCase()));
    return nameMatch && emailMatch;
  });

  // Calculate pagination
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;

  // Get current page records from filtered results
  const currentRecords = filteredUsers.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(filteredUsers.length / recordsPerPage);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    const newFilters = {
      ...filters,
      [name]: value
    };
    setFilters(newFilters);
    saveFilters('users', newFilters);
    setCurrentPage(1); // Reset to first page when filter changes
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
    const end = Math.min(indexOfLastRecord, filteredUsers.length);
    return { start, end };
  };

  const handleDelete = async (userId) => {
    try {
      const response = await userService.deleteUser(userId);
      if (response.status === 200) {
        setUsers(prevUsers => prevUsers.filter(user => user.userId !== userId));
        setMessageKey(Date.now());
        setApiMessage({
          content: "User deleted successfully",
          type: "success"
        });
      } else {
        setMessageKey(Date.now());
        setApiMessage({
          content: response.message || 'Failed to delete user',
          type: "error"
        });
      }
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    } catch (err) {
      setMessageKey(Date.now());
      setApiMessage({
        content: err.message || 'An error occurred while deleting the user',
        type: "error"
      });
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    }
  };

  const handleDeleteConfirm = () => {
    if (selectedUserId) {
      handleDelete(selectedUserId);
      setDeleteModalOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
  };

  const TableSkeleton = () => {
    return (
      <Card className="shadow">
        <Table className="align-items-center table-flush mb-0" style={tableStyles.table}>
          <thead className="thead-light">
            <tr>
              <th style={{...tableStyles.th, width: '8%'}}>ID</th>
              <th style={{...tableStyles.th, width: '12%'}}>PROFILE PICTURE</th>
              <th style={{...tableStyles.th, width: '15%'}}>NAME</th>
              <th style={{...tableStyles.th, width: '20%'}}>EMAIL</th>
              <th style={{...tableStyles.th, width: '12%'}}>RECENT ACTIVITY</th>
              <th style={{...tableStyles.th, width: '10%'}}>MIGRATED</th>
              <th style={{...tableStyles.th, width: '10%'}}>PLATFORM</th>
              <th style={{...tableStyles.th, width: '10%'}}>CREATED AT</th>
              <th style={{...tableStyles.th, width: '10%'}}>ACTIONS</th>
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
                <td style={{...tableStyles.td, width: '12%'}}>
                  <div style={{ 
                    width: '32px', 
                    height: '32px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '50%',
                    margin: '0 auto',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                </td>
                <td style={{...tableStyles.td, width: '15%'}}>
                  <div style={{ 
                    width: '128px', 
                    height: '16px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '4px',
                    margin: '0 auto',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                </td>
                <td style={{...tableStyles.td, width: '20%'}}>
                  <div style={{ 
                    width: '160px', 
                    height: '16px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '4px',
                    margin: '0 auto',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                </td>
                <td style={{...tableStyles.td, width: '12%'}}>
                  <div style={{ 
                    width: '120px', 
                    height: '16px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '4px',
                    margin: '0 auto',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                </td>
                <td style={{...tableStyles.td, width: '10%'}}>
                  <div style={{ 
                    width: '96px', 
                    height: '16px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '4px',
                    margin: '0 auto',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                </td>
                <td style={{...tableStyles.td, width: '10%'}}>
                  <div style={{ 
                    width: '96px', 
                    height: '16px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '4px',
                    margin: '0 auto',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                </td>
                <td style={{...tableStyles.td, width: '10%'}}>
                  <div style={{ 
                    width: '96px', 
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
  React.useEffect(() => {
    if (deleteModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [deleteModalOpen]);

  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>USER MANAGEMENT</h3>
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
      <style>{toastStyles}</style>
      <style>{styles}</style>
      <style>
        {`
          .modal-open {
            overflow: hidden;
          }
          .modal-open::after {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1040;
          }
          .modal {
            z-index: 1050;
          }
        `}
      </style>
      {/* <Header /> */}
      {/* Page content */}
      <Container fluid className="pt-6">
        {apiMessage.content && (
          <CustomToast
            message={apiMessage.content}
            type={apiMessage.type}
            onClose={() => setApiMessage({ content: "", type: "" })}
          />
        )}
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>USER MANAGEMENT</h3>
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
                              placeholder="Filter by Name"
                              type="text"
                              name="name"
                              value={filters.name}
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
                          <FormGroup>
                            <Input
                              className="form-control-alternative"
                              placeholder="Filter by Email"
                              type="text"
                              name="email"
                              value={filters.email}
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
                                  name: '',
                                  email: '',
                                  role: ''
                                };
                                setFilters(clearedFilters);
                                clearFilters('users');
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
                    <th style={{...tableStyles.th, width: '12%'}}>PROFILE PICTURE</th>
                    <th 
                      style={{...tableStyles.th, width: '15%', cursor: 'pointer'}} 
                      onClick={() => handleSort('name')}
                    >
                      NAME {getSortIcon('name')}
                    </th>
                    <th style={{...tableStyles.th, width: '20%'}}>EMAIL</th>
                    <th
                      style={{...tableStyles.th, width: '12%', cursor: 'pointer'}}
                      onClick={() => handleSort('last_active_time')}
                    >
                      RECENT ACTIVITY {getSortIcon('last_active_time')}
                    </th>
                    {/* <th style={{...tableStyles.th, width: '15%'}}>PHONE</th>
                    <th style={{...tableStyles.th, width: '15%'}}>DATE OF BIRTH</th>
                    <th style={{...tableStyles.th, width: '10%'}}>2FA ENABLED</th> */}
                    <th style={{...tableStyles.th, width: '10%'}}>MIGRATED</th>
                    <th style={{...tableStyles.th, width: '10%'}}>PLATFORM</th>
                    <th style={{...tableStyles.th, width: '10%'}}>CREATED AT</th>
                    <th style={{...tableStyles.th, width: '10%'}}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRecords.map((user, index) => (
                    <tr key={index}>
                      <td style={{...tableStyles.td, width: '8%'}}>{indexOfFirstRecord + index + 1}</td>
                      <td style={{...tableStyles.td, width: '12%'}}>
                        <Media className="align-items-center justify-content-center">
                          <a className="mr-2" href="#pablo" onClick={(e) => e.preventDefault()}>
                            {user.userImage ? (
                              <img
                                alt="..."
                                src={user.userImage}
                                style={{ width: '30px', height: '30px', objectFit: 'cover', border: 'none', borderRadius: '50%' }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '50%',
                                  backgroundColor: getRandomColor(),
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'white',
                                  fontSize: '14px',
                                  fontWeight: 'bold'
                                }}
                              >
                                {getUserInitial(user.firstName, user.lastName, user.emailAddress)}
                              </div>
                            )}
                          </a>
                        </Media>
                      </td>
                      <td style={{...tableStyles.td, width: '15%'}}>
                        {`${capitalizeName(user.firstName)} ${capitalizeName(user.lastName)}`}
                      </td>
                      <td style={{...tableStyles.td, width: '20%'}}>{user.emailAddress}</td>
                      <td style={{...tableStyles.td, width: '12%'}}>{formatLastActiveTime(user.last_active_time)}</td>
                      <td style={{...tableStyles.td, width: '10%'}}>{user.isMigrated ? "Yes" : "No"}</td>
                      {/* <td style={{...tableStyles.td, width: '15%'}}>{user.phone}</td>
                      <td style={{...tableStyles.td, width: '15%'}}>{formatDate(user.dateOfBirth)}</td>
                      <td style={{...tableStyles.td, width: '10%'}}>
                        <Badge color={user.is_two_fa_enabled ? "success" : "warning"} className="badge-dot mr-2">
                          <i className={user.is_two_fa_enabled ? "bg-success" : "bg-warning"} />
                          {user.is_two_fa_enabled ? "Yes" : "No"}
                        </Badge>
                      </td> */}
                      <td style={{...tableStyles.td, width: '10%'}}>{user.platformName}</td>
                      <td style={{...tableStyles.td, width: '10%'}}>{formatCreatedAt(user.createdAt)}</td>
                      <td style={{...tableStyles.td, width: '10%'}}>
                        <Button color="primary" size="sm" onClick={() => handleViewLogs(user.userId)}>
                          Activity
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <CardFooter className="py-4">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="text-muted">
                    Showing {getEntryRange().start} to {getEntryRange().end} of {filteredUsers.length} entries
                  </div>
                  {filteredUsers.length > recordsPerPage && (
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
      </Container>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} toggle={handleDeleteCancel} centered>
        <ModalHeader className="border-0 pb-0" toggle={handleDeleteCancel} />
        <ModalBody className="pt-0">
          <p className="text-left mb-4">Are you sure you want to delete this user?</p>
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
    </>
  );
};

export default UserTable;
