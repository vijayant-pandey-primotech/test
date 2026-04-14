import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardFooter,
  Table,
  Container,
  Row,
  Col,
  Button,
  Spinner,
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
  Toast,
  Badge,
} from 'reactstrap';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import assistantService from 'services/assistantService';

// Add custom styles
const styles = `
  .table th {
    background-color: #f8f9fa;
  }
  .table td, .table th {
    vertical-align: middle;
  }
  .btn-custom-primary {
    background-color: #3A6D8C;
    border-color: #3A6D8C;
    color: white;
  }
  .btn-custom-primary:hover {
    background-color: #2d5670;
    border-color: #2d5670;
    color: white;
  }
  .dropdown-menu {
    min-width: 160px;
  }
  .dropdown-item {
    padding: 0.5rem 1rem;
  }
  .dropdown-item i {
    width: 20px;
  }
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
`;

const AllArticles = () => {
  const navigate = useNavigate();
  const isViewer = localStorage.getItem("userRole") === "viewer";
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'ascending'
  });
  const recordsPerPage = 10;
  const [toast, setToast] = useState({
    isOpen: false,
    message: "",
    type: "success",
    position: "top",
  });

  // Add showToast function
  const showToast = (message, type = "success", position = "top") => {
    setToast({
      isOpen: true,
      message,
      type,
      position,
    });
    // Auto hide after 5 seconds
    setTimeout(() => {
      setToast({
        isOpen: false,
        message: "",
        type: "success",
        position: "top",
      });
    }, 5000);
  };

  // Function to format display path
  const formatDisplayPath = (path) => {
    if (!path) return '';
    return path
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // console.log('Fetching articles...');
        const response = await assistantService.getArticlesList();
        console.log('Articles response:', response);
        
        if (response.status === 200) {
          const data = response.body;
          console.log('Processed data:', data);

          if (!data || !Array.isArray(data)) {
            console.error('Invalid data format received:', data);
            setError('Invalid data format received from server');
            setLoading(false);
            return;
          }

          const formattedArticles = data.map(article => {
            let displayPath = '';
            try {
              if (article.targetValue) {
                const parsedValue = JSON.parse(article.targetValue);
                displayPath = parsedValue.displayPath || '';
              }
            } catch (err) {
              console.warn(`Error parsing targetValue for article ${article.id}:`, err);
            }

            return {
              id: article.id,
              name: article.assistantName || '',
              displayPath: formatDisplayPath(displayPath),
              createdAt: article.createdAt,
              description: article.description || '',
              image: article.image || '',
              status: article.status,
              expireDate: article.expireDate,
              userRecommendedPeriod: article.userRecommendedPeriod,
              targetType: article.targetType || 'Article',
              publishStatus: article.publishStatus?.toLowerCase() === 'published' ? 'Published' : 'Draft'
            };
          });

          console.log('Formatted articles:', formattedArticles);
          setArticles(formattedArticles);
          setLoading(false);
        } else {
          console.error('Failed to fetch articles:', response);
          setError('Failed to fetch articles');
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching articles:', err);
        setError('Error fetching articles');
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Table styles
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

  // Sort items based on current sort configuration
  const sortedItems = (items) => {
    return [...items].sort((a, b) => {
      if (!sortConfig.key) return 0;

      if (sortConfig.key === 'name') {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return sortConfig.direction === 'ascending' ? 
          nameA.localeCompare(nameB) : 
          nameB.localeCompare(nameA);
      }

      return 0;
    });
  };

  // Calculate pagination
  const getPaginationData = (items) => {
    const indexOfLastRecord = currentPage * recordsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
    const currentRecords = items.slice(indexOfFirstRecord, indexOfLastRecord);
    const totalPages = Math.ceil(items.length / recordsPerPage);
    return { currentRecords, totalPages, indexOfFirstRecord };
  };

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);

  };

  const handleDeleteConfirm = async () => {
    try {
      const response = await assistantService.deleteArticleById(itemToDelete.id);
      if(response.status === 200){
        setArticles(prevArticles => 
          prevArticles.filter(article => article.id !== itemToDelete.id)
        );
        setDeleteModalOpen(false);
        setItemToDelete(null);
        showToast(response.message, "success");
      } else {
        showToast(response.message, "error");
      }
    } catch (error) {
      showToast("Failed to delete article", "error");
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const handleEditClick = (item) => {
    navigate(`/admin/article-form/edit/${item.id}`);
  };

  const handleCreateClick = () => {
    navigate('/admin/article-form');
  };

  const handleTogglePublish = async (item) => {
    try {
      setLoading(true);
      const newPublishStatus = item.publishStatus === 'Published' ? 'Draft' : 'Published';
      
      // Create FormData to match the expected format
      const formData = new FormData();
      formData.append('publishStatus', newPublishStatus);
      formData.append('articleName', item.name);
      formData.append('description', item.description || '');
      
      const response = await assistantService.updateArticleById(item.id, formData);
      
      if (response.data.status === 200) {
        // Update local state
        setArticles(prev => prev.map(article => 
          article.id === item.id 
            ? { ...article, publishStatus: newPublishStatus }
            : article
        ));
        showToast(`Article ${newPublishStatus === 'Published' ? 'published' : 'unpublished'} successfully`, 'success');
      } else {
        showToast('Failed to update publish status', 'error');
      }
    } catch (error) {
      console.error('Error toggling publish status:', error);
      showToast('Error updating publish status', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get publish status badge
  const getPublishStatusBadge = (article) => {
    if (article.publishStatus === 'Published') {
      return <Badge color="success">Published</Badge>;
    } else {
      return <Badge color="warning">Draft</Badge>;
    }
  };

  // Loading skeleton
  const TableSkeleton = () => {
    return (
      <Card className="shadow">
        <Table className="align-items-center table-flush mb-0" style={tableStyles.table}>
          <thead className="thead-light">
            <tr>
              <th style={{...tableStyles.th, width: '8%'}}>ID</th>
              <th style={{...tableStyles.th, width: '20%'}}>NAME</th>
              <th style={{...tableStyles.th, width: '20%'}}>DISPLAY PATH</th>
              <th style={{...tableStyles.th, width: '12%'}}>CREATED AT</th>
              <th style={{...tableStyles.th, width: '20%'}}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(10)].map((_, index) => (
              <tr key={index}>
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
                    width: '96px', 
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
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    );
  };

  const renderTable = () => {
    const sortedData = sortedItems(articles);
    const { currentRecords, totalPages, indexOfFirstRecord } = getPaginationData(sortedData);

    return (
      <Card className="shadow">
        <CardHeader className="border-0">
          <Row className="align-items-center">
            <Col>
              {/* <h3 className="mb-0">Action Intelligence</h3> */}
            </Col>
            <Col className="text-right">
              {!isViewer && (
                <Button
                  color="primary"
                  onClick={handleCreateClick}
                  className="btn-custom-primary"
                >
                  <i className="fas fa-plus mr-2" />
                  Create New
                </Button>
              )}
            </Col>
          </Row>
        </CardHeader>
        {articles.length > 0 ? (
        <>
        <Table className="align-items-center table-flush mb-0" style={tableStyles.table}>
          <thead className="thead-light">
            <tr>
              <th style={{...tableStyles.th, width: '6%'}}>ID</th>
              <th 
                style={{...tableStyles.th, width: '18%', cursor: 'pointer'}} 
                onClick={() => handleSort('name')}
              >
                ACTION INTELLIGENCE NAME {getSortIcon('name')}
              </th>
              <th style={{...tableStyles.th, width: '15%'}}>DISPLAY PATH</th>
              <th style={{...tableStyles.th, width: '18%'}}>DESCRIPTION</th>
              <th style={{...tableStyles.th, width: '10%'}}>PUBLISH</th>
              <th style={{...tableStyles.th, width: '12%'}}>CREATED AT</th>
              {!isViewer && <th style={{...tableStyles.th, width: '12%'}}>ACTIONS</th>}
            </tr>
          </thead>
          <tbody>
            {currentRecords.map((item, index) => (
              <tr key={item.id}>
                <td style={{...tableStyles.td, width: '6%'}}>{indexOfFirstRecord + index + 1}</td>
                <td style={{...tableStyles.td, width: '18%'}}>{item.name}</td>
                <td style={{...tableStyles.td, width: '15%'}}>{item.displayPath}</td>
                <td style={{...tableStyles.td, width: '18%'}}>{item.description}</td>
                <td style={{...tableStyles.td, width: '10%'}}>
                  {getPublishStatusBadge(item)}
                </td>
                <td style={{...tableStyles.td, width: '12%'}}>
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}
                </td>
                {!isViewer && (
                  <td style={{...tableStyles.td, width: '12%'}}>
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
                          <DropdownItem onClick={() => handleEditClick(item)} style={{ color: '#8898aa', display: 'flex', alignItems: 'center' }}>
                            <i className="fas fa-pencil-alt text-warning mr-2" />
                            <span>Edit</span>
                          </DropdownItem>
                          <DropdownItem onClick={() => handleTogglePublish(item)} style={{ color: '#8898aa', display: 'flex', alignItems: 'center' }}>
                            <i className={`fas ${item.publishStatus === 'Published' ? 'fa-eye-slash text-warning' : 'fa-eye text-success'} mr-2`} />
                            <span>{item.publishStatus === 'Published' ? 'Unpublish' : 'Publish'}</span>
                          </DropdownItem>
                          <DropdownItem onClick={() => handleDeleteClick(item)} style={{ color: '#8898aa', display: 'flex', alignItems: 'center' }}>
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
          <nav aria-label="...">
            {totalPages > 1 && (
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
                    <span className="sr-only">First</span>
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem disabled={currentPage === 1}>
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
                {[...Array(totalPages)].map((_, index) => (
                  <PaginationItem key={index + 1} active={currentPage === index + 1}>
                    <PaginationLink
                      href="#pablo"
                      onClick={(e) => {
                        e.preventDefault();
                        handlePageChange(index + 1);
                      }}
                    >
                      {index + 1}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem disabled={currentPage === totalPages}>
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
            )}
          </nav>
        </CardFooter>
        </>
        ): (
          <div className="text-center py-4">
            <h5 className="text-muted">No Action Intelligence Found</h5>
          </div>
        )}
      </Card>
    );
  };

  if (error) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>Action Intelligence</h3>
            <div className="text-center p-4">
              <p className="text-danger">{error}</p>
            </div>
          </div>
        </Row>
      </Container>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>ACTION INTELLIGENCE</h3>
        
            { renderTable()}
           
          </div>
        </Row>

        {/* Delete Confirmation Modal */}
        <Modal isOpen={deleteModalOpen} toggle={handleDeleteCancel} centered>
          <ModalHeader className="border-0 pb-0" toggle={handleDeleteCancel}>
            Delete Action Intelligence?
          </ModalHeader>
          <ModalBody className="pt-0">
            <p className="text-left mb-4">Are you sure you want to delete this action intelligence?</p>
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

        {/* Add Toast Notifications */}
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
            className="bg-white shadow-lg border-0"
            style={{
              borderLeft: `4px solid ${
                toast.type === "success" ? "#2dce89" : "#f5365c"
              }`,
              borderRadius: "0.375rem",
              boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.15)",
            }}
          >
            <div className="d-flex align-items-center p-3">
              <div className="mr-3">
                <i
                  className={`ni ni-${
                    toast.type === "success" ? "check-bold" : "alert-circle"
                  }`}
                  style={{
                    color: toast.type === "success" ? "#2dce89" : "#f5365c",
                    fontSize: "1.5rem",
                  }}
                />
              </div>
              <div className="flex-grow-1">
                <p
                  className="mb-0 font-weight-bold"
                  style={{
                    color: toast.type === "success" ? "#2dce89" : "#f5365c",
                    fontSize: "1rem",
                    lineHeight: "1.5",
                  }}
                >
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                className="close ml-3"
                onClick={() => setToast((prev) => ({ ...prev, isOpen: false }))}
                style={{
                  fontSize: "1.25rem",
                  color: "#8898aa",
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

export default AllArticles; 