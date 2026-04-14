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

import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Container,
  Row,
  Table,
  Button,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Alert,
  Spinner,
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Pagination,
  PaginationItem,
  PaginationLink
} from "reactstrap";
import taskService from "services/taskService";
import platformService from "services/platformService";
import { FaPlus, FaEdit, FaTrash } from "react-icons/fa";
import CreateTaskModal from "./CreateTaskModal.js";
import CreateTaskWidgetModal from "./CreateTaskWidgetModal.js";
import { Message } from "rsuite";
import { IoWarningOutline } from "react-icons/io5";
import { SiTicktick } from "react-icons/si";
import "rsuite/dist/rsuite.min.css";
import { useNavigate } from "react-router-dom";

const Tasks = () => {

  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [platforms, setPlatforms] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [createTaskModal, setCreateTaskModal] = useState(false);

  const [selectedTask, setSelectedTask] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;
  const [apiMessage, setApiMessage] = useState({ content: "", type: "" });
  
  // Widget management state
  const [createWidgetModal, setCreateWidgetModal] = useState(false);
  const [selectedTaskForWidget, setSelectedTaskForWidget] = useState(null);
  const [taskWidgetMappings, setTaskWidgetMappings] = useState({});
  const [deleteWidgetModal, setDeleteWidgetModal] = useState(false);
  const [widgetToDelete, setWidgetToDelete] = useState(null);
  const [deleteWidgetLoading, setDeleteWidgetLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // Debug message state changes
  useEffect(() => {
    console.log("Message state changed:", apiMessage);
  }, [apiMessage]);



  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksResponse, platformsResponse] = await Promise.all([
        taskService.getAllTasks(),
        platformService.getAllPlatforms()
      ]);
      setTasks(tasksResponse.data || []);
      setPlatforms(platformsResponse.body || []);
      
      // Fetch widget mappings for all tasks
      await fetchTaskWidgetMappings(tasksResponse.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Error fetching data");
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskWidgetMappings = async (tasks) => {
    try {
      if (tasks.length > 0) {
        const taskIds = tasks.map(task => task.taskId);
        const response = await taskService.getTaskWidgetMappings(taskIds);
        const mappings = {};
        
        if (response.data) {
          response.data.forEach(mapping => {
            if (!mappings[mapping.entityId]) {
              mappings[mapping.entityId] = [];
            }
            mappings[mapping.entityId].push(mapping);
          });
        }
        
        setTaskWidgetMappings(mappings);
      }
    } catch (err) {
      console.error("Error fetching widget mappings:", err);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    setDeleteLoading(true);
    setError(null);
    
    try {
      console.log("Deleting task:", itemToDelete.taskId);
      await taskService.deleteTask(itemToDelete.taskId);
      console.log("Task deleted successfully");
      
      setDeleteModal(false);
      setItemToDelete(null);
      await fetchData(); // Refresh the data after successful deletion
      
      // Show success message
      console.log("Setting success message");
      setApiMessage({
        content: `Task template "${itemToDelete.task_type}" deleted successfully!`,
        type: "success",
      });
      
      // Auto-hide message after 5 seconds
      setTimeout(() => {
        console.log("Auto-hiding message");
        setApiMessage({ content: "", type: "" });
      }, 5000);
    } catch (err) {
      console.error("Error deleting task:", err);
      setError(err.response?.data?.message || "Error deleting task template");
      
      // Show error message
      console.log("Setting error message");
      setApiMessage({
        content: err.response?.data?.message || "Error deleting task template",
        type: "error",
      });
      
      // Auto-hide message after 5 seconds
      setTimeout(() => {
        console.log("Auto-hiding error message");
        setApiMessage({ content: "", type: "" });
      }, 5000);
    } finally {
      setDeleteLoading(false);
    }
  };

  const openDeleteModal = (task) => {
    setItemToDelete(task);
    setDeleteModal(true);
    setError(null);
  };

  const closeDeleteModal = () => {
    setDeleteModal(false);
    setItemToDelete(null);
    setError(null);
  };

  // Widget management functions
  const openCreateWidgetModal = (task) => {
    // Add platform name to the task object
    const taskWithPlatform = {
      ...task,
      platform_name: getPlatformName(task.platform_id)
    };
    setSelectedTaskForWidget(taskWithPlatform);
    setCreateWidgetModal(true);
  };

  const openEditWidgetModal = (task) => {
    // Add platform name and existing widget data to the task object
    const existingWidgets = getTaskWidgets(task.taskId);
    const taskWithWidget = {
      ...task,
      platform_name: getPlatformName(task.platform_id),
      existingWidget: existingWidgets[0] // Get the first (and only) widget
    };
    setSelectedTaskForWidget(taskWithWidget);
    setCreateWidgetModal(true);
  };

  const closeCreateWidgetModal = () => {
    setCreateWidgetModal(false);
    setSelectedTaskForWidget(null);
  };

  const handleWidgetCreated = async () => {
    // Refresh widget mappings after creating a new widget
    await fetchTaskWidgetMappings(tasks);
  };

  const getTaskWidgets = (taskId) => {
    return taskWidgetMappings[taskId] || [];
  };

  // Widget deletion functions
  const openDeleteWidgetModal = (task) => {
    const existingWidgets = getTaskWidgets(task.taskId);
    if (existingWidgets.length > 0) {
      setWidgetToDelete({
        task: task,
        widget: existingWidgets[0]
      });
      setDeleteWidgetModal(true);
    }
  };

  const closeDeleteWidgetModal = () => {
    setDeleteWidgetModal(false);
    setWidgetToDelete(null);
  };

  const handleDeleteWidget = async () => {
    if (!widgetToDelete) return;
    
    setDeleteWidgetLoading(true);
    setError(null);
    
    try {
      console.log("Deleting widget:", widgetToDelete.widget.id);
      await taskService.deleteTaskWidget(widgetToDelete.widget.id);
      console.log("Widget deleted successfully");
      
      setDeleteWidgetModal(false);
      setWidgetToDelete(null);
      await fetchData(); // Refresh the data after successful deletion
      
      // Show success message
      setApiMessage({
        content: `Widget "${widgetToDelete.widget.name}" deleted successfully!`,
        type: "success",
      });
      
      // Auto-hide message after 5 seconds
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 5000);
    } catch (err) {
      console.error("Error deleting widget:", err);
      setError(err.response?.data?.message || "Error deleting widget");
      
      // Show error message
      setApiMessage({
        content: err.response?.data?.message || "Error deleting widget",
        type: "error",
      });
      
      // Auto-hide message after 5 seconds
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 5000);
    } finally {
      setDeleteWidgetLoading(false);
    }
  };





  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString('en-US');
  };



  // Table styles similar to Tables.js
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

  // Pagination functions
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const getCurrentData = () => {
    const indexOfLastRecord = currentPage * recordsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
    return tasks.slice(indexOfFirstRecord, indexOfLastRecord);
  };

  const getTotalPages = () => {
    return Math.ceil(tasks.length / recordsPerPage);
  };

  const getEntryRange = () => {
    const indexOfLastRecord = currentPage * recordsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
    const start = indexOfFirstRecord + 1;
    const end = Math.min(indexOfLastRecord, tasks.length);
    return { start, end };
  };

  const getVisiblePages = () => {
    const totalPages = getTotalPages();
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

  const shouldShowLeftArrow = () => {
    return currentPage > 1;
  };

  const shouldShowRightArrow = () => {
    return currentPage < getTotalPages();
  };

  const getPlatformName = (platformId) => {
    if (!platformId) return "-";
    const platform = platforms.find(p => p.id === platformId);
    return platform ? platform.name : "-";
  };

  const currentData = getCurrentData();
  const totalPages = getTotalPages();

  return (
    <>
      {/* Page content */}
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>PLAN MANAGEMENT</h3>
                            <Card className="shadow" style={{ overflow: 'visible' }}>
              <CardHeader className="border-0">
                <Row className="mt-3">
                  <div className="col-md-6">
                    <h5 className="mb-0">Plan Templates</h5>
                  </div>
                  <div className="col-md-6 d-flex justify-content-end">
                    <Button
                      color="primary"
                      size="sm"
                      onClick={() => setCreateTaskModal(true)}
                    >
                      <FaPlus className="mr-2" />
                      Create Plan Template
                    </Button>
                  </div>
                </Row>
              </CardHeader>

              {error && (
                <Alert color="danger" className="mb-3 mx-3">
                  {error}
                </Alert>
              )}

              {loading ? (
                <div className="text-center py-4">
                  <Spinner color="primary" />
                </div>
              ) : (
                <>
                  <Table className="align-items-center table-flush mb-0" style={{...tableStyles.table, overflow: 'visible'}}>
                        <thead className="thead-light">
                          <tr>
                            <th style={{...tableStyles.th, width: '5%'}}>ID</th>
                            <th style={{...tableStyles.th, width: '15%'}}>PLAN TYPE</th>
                            <th style={{...tableStyles.th, width: '20%'}}>DESCRIPTION</th>
                            <th style={{...tableStyles.th, width: '10%'}}>PLATFORM</th>
                            <th style={{...tableStyles.th, width: '8%'}}>COLUMNS</th>
                            <th style={{...tableStyles.th, width: '8%'}}>WIDGETS</th>
                            <th style={{...tableStyles.th, width: '8%'}}>STATUS</th>
                            <th style={{...tableStyles.th, width: '10%'}}>CREATED AT</th>
                            <th style={{...tableStyles.th, width: '8%'}}>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentData.length === 0 ? (
                            <tr>
                              <td colSpan="9" className="text-center py-4">
                                No plan templates found
                              </td>
                            </tr>
                          ) : (
                            currentData.map((task, index) => {
                              const indexOfFirstRecord = (currentPage - 1) * recordsPerPage;
                              return (
                                <tr key={task.taskId}>
                                  <td style={{...tableStyles.td, width: '6%'}}>{task.taskId}</td>
                                  <td style={{...tableStyles.td, width: '18%'}}>{task.task_type || "-"}</td>
                                  <td style={{...tableStyles.td, width: '25%'}}>
                                    {task.description ? (
                                      task.description.length > 40
                                        ? `${task.description.substring(0, 40)}...`
                                        : task.description
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                  <td style={{...tableStyles.td, width: '10%'}}>
                                    <Badge color="primary" style={{ fontSize: '0.75rem' }}>
                                      {getPlatformName(task.platform_id)}
                                    </Badge>
                                  </td>
                                  <td style={{...tableStyles.td, width: '8%'}}>
                                    <Badge color="info">
                                      {task.fields?.length || 0}
                                    </Badge>
                                  </td>
                                  <td style={{...tableStyles.td, width: '8%'}}>
                                    <Badge color="warning">
                                      {getTaskWidgets(task.taskId).length}
                                    </Badge>
                                  </td>
                                  <td style={{...tableStyles.td, width: '8%'}}>
                                    <Badge color={task.is_active ? "success" : "secondary"}>
                                      {task.is_active ? "Active" : "Inactive"}
                                    </Badge>
                                  </td>
                                  <td style={{...tableStyles.td, width: '10%'}}>{formatDate(task.createdAt)}</td>
                                  <td style={{...tableStyles.td, width: '8%'}}>
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
                                            setSelectedTask(task);
                                            setCreateTaskModal(true);
                                          }}
                                          style={{
                                            padding: "8px 16px",
                                            fontSize: "14px",
                                            color: "#495057",
                                          }}
                                        >
                                          <FaEdit className="mr-2" />
                                          Edit
                                        </DropdownItem>
                                        <DropdownItem
                                          href="#pablo"
                                          className="text-indigo-900"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            navigate(`/admin/platform-tasks/${task.taskId}`);
                                          }}
                                          style={{
                                            padding: "8px 16px",
                                            fontSize: "14px",
                                          }}
                                        >
                                          <i className="fas fa-tasks mr-2 text-primary" />
                                          Manage Tasks
                                        </DropdownItem>
                                        {getTaskWidgets(task.taskId).length > 0 ? (
                                          <>
                                            <DropdownItem
                                              href="#pablo"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                openEditWidgetModal(task);
                                              }}
                                              style={{
                                                padding: "8px 16px",
                                                fontSize: "14px",
                                                color: "#28a745",
                                              }}
                                            >
                                             <FaEdit className="mr-2" /> Edit Widget
                                            </DropdownItem>
                                            <DropdownItem
                                              href="#pablo"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                openDeleteWidgetModal(task);
                                              }}
                                              style={{
                                                padding: "8px 16px",
                                                fontSize: "14px",
                                                color: "#dc3545",
                                              }}
                                            >
                                              <FaTrash className="mr-2" />
                                              Delete Widget
                                            </DropdownItem>
                                          </>
                                        ) : (
                                          <DropdownItem
                                            href="#pablo"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              openCreateWidgetModal(task);
                                            }}
                                            style={{
                                              padding: "8px 16px",
                                              fontSize: "14px",
                                              color: "#007bff",
                                            }}
                                          >
                                            <i className="fas fa-plus mr-2 text-primary" />
                                            Create Widget
                                          </DropdownItem>
                                        )}
                                        <DropdownItem
                                          href="#pablo"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            openDeleteModal(task);
                                          }}
                                          style={{
                                            padding: "8px 16px",
                                            fontSize: "14px",
                                            color: "#dc3545",
                                          }}
                                        >
                                          <FaTrash className="mr-2" />
                                          Delete
                                        </DropdownItem>
                                      </DropdownMenu>
                                    </UncontrolledDropdown>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </Table>
                      {tasks.length > recordsPerPage && (
                        <CardFooter className="py-4">
                          <div className="d-flex justify-content-between align-items-center">
                            <div className="text-muted">
                              Showing {getEntryRange().start} to {getEntryRange().end} of {tasks.length} entries
                            </div>
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
                          </div>
                        </CardFooter>
                      )}
                    </>
                  )}
                </Card>
          </div>
        </Row>
      </Container>

      {/* Create/Edit Task Modal */}
      <CreateTaskModal
        isOpen={createTaskModal}
        toggle={() => {
          setCreateTaskModal(false);
          setSelectedTask(null);
        }}
        task={selectedTask}
        onSuccess={() => {
          setCreateTaskModal(false);
          setSelectedTask(null);
          fetchData();
        }}
      />

      {/* Create Widget Modal */}
      <CreateTaskWidgetModal
        isOpen={createWidgetModal}
        toggle={closeCreateWidgetModal}
        task={selectedTaskForWidget}
        onSuccess={handleWidgetCreated}
      />

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModal} toggle={closeDeleteModal} centered>
        <ModalHeader toggle={closeDeleteModal}>
          Confirm Delete
        </ModalHeader>
        <ModalBody>
          {error && (
            <Alert color="danger" className="mb-3">
              {error}
            </Alert>
          )}
          <p>
            Are you sure you want to delete the plan template <strong>"{itemToDelete?.task_type}"</strong>?
          </p>
          <p className="text-muted mb-0">
            This action cannot be undone and will permanently remove this plan template.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={closeDeleteModal} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button color="danger" onClick={handleDelete} disabled={deleteLoading}>
            {deleteLoading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Widget Confirmation Modal */}
      <Modal isOpen={deleteWidgetModal} toggle={closeDeleteWidgetModal} centered>
        <ModalHeader toggle={closeDeleteWidgetModal}>
          Confirm Widget Delete
        </ModalHeader>
        <ModalBody>
          {error && (
            <Alert color="danger" className="mb-3">
              {error}
            </Alert>
          )}
          <p>
            Are you sure you want to delete the widget <strong>"{widgetToDelete?.widget?.name}"</strong> for the plan template <strong>"{widgetToDelete?.task?.task_type}"</strong>?
          </p>
          <p className="text-muted mb-0">
            This action cannot be undone and will permanently remove this widget from the plan template.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={closeDeleteWidgetModal} disabled={deleteWidgetLoading}>
            Cancel
          </Button>
          <Button color="danger" onClick={handleDeleteWidget} disabled={deleteWidgetLoading}>
            {deleteWidgetLoading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Deleting...
              </>
            ) : (
              "Delete Widget"
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
            zIndex: 1040,
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

export default Tasks; 