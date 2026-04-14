import {
  Badge,
  Card,
  CardHeader,
  CardBody,
  Container,
  Row,
  Col,
  FormGroup,
  Input,
  Button,
  Table,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
  Alert,
  UncontrolledTooltip,
  Progress,
  Pagination,
  PaginationItem,
  PaginationLink,
  Label,
} from "reactstrap";
// core components
import { Toast, useToast } from "components/Toast";
import apiLogsService from "services/apiLogsService";
import userService from "services/userService";
import React, { useState, useEffect } from "react";
import {
  FaEye,
  FaSearch,
  FaTimes,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaChartBar,
  FaClock,
  FaCalendarAlt,
  FaServer,
} from "react-icons/fa";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";

const ApiLogs = () => {
  const { toast, showError, showSuccess, hideToast } = useToast();
  const { userId } = useParams();
  const navigate = useNavigate();
  const [apiLogs, setApiLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");

  // Analytics state
  const [analytics, setAnalytics] = useState({
    apiCategories: {},
    mostUsedEndpoints: [],
    hourlyActivity: [],
    dailyActivity: [],
    peakActivityTime: "",
    totalRequests: 0,
  });

  // View state
  const [currentView, setCurrentView] = useState("analytics"); // "analytics" or "logs"

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Date filter state
  const [dateFilters, setDateFilters] = useState({
    timeRange: "7", // Default to last 7 days
    startDate: "",
    endDate: "",
    useCustomRange: false,
  });

  // Applied filters state (what's actually being used for API calls)
  const [appliedFilters, setAppliedFilters] = useState({
    timeRange: "7",
    startDate: "",
    endDate: "",
    useCustomRange: false,
  });

  // Add CSS styles for sortable headers
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .sortable-header:hover {
        background-color: rgba(0, 0, 0, 0.05) !important;
        transition: background-color 0.2s ease;
      }
      .sortable-header svg {
        color: #6c757d;
        font-size: 0.875rem;
      }
      .sortable-header:hover svg {
        color: #495057;
      }
      .endpoint-item {
        transition: background-color 0.2s ease;
      }
      .endpoint-item:hover {
        background-color: rgba(0, 0, 0, 0.02);
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Fetch user list on component mount
  useEffect(() => {
    fetchApiLogs(userId);
  }, []);

  // Fetch logs when applied filters change
  useEffect(() => {
    if (userId) {
      fetchApiLogs(userId);
    }
  }, [
    appliedFilters.timeRange,
    appliedFilters.startDate,
    appliedFilters.endDate,
  ]);

  // Calculate analytics when apiLogs change
  useEffect(() => {
    if (apiLogs.length > 0) {
      calculateAnalytics();
    } else {
      // Clear analytics when no data
      setAnalytics({
        apiCategories: {},
        mostUsedEndpoints: [],
        hourlyActivity: [],
        dailyActivity: [],
        peakActivityTime: "",
        totalRequests: 0,
      });
    }
  }, [apiLogs]);

  // Reset pagination when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [apiLogs]);

  // Analytics calculation function
  const calculateAnalytics = () => {
    const logs = apiLogs;

    // Function to dynamically extract category from URL using regex
    const extractCategoryFromUrl = (url) => {
      if (!url) return "Unknown";

      // Trim the URL and remove query parameters
      const trimmedUrl = url.trim().split("?")[0];

      // Use regex to extract the module name after /api/
      const apiModuleRegex = /\/api\/([^\/]+)/;

      const match = trimmedUrl.match(apiModuleRegex);
      if (!match) {
        return "Unknown";
      }

      const moduleName = match[1];

      // Return capitalized module name (dynamic categorization)
      return moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
    };

    // Endpoint analysis with dynamic categorization
    const endpointCounts = {};
    const apiCategories = {};

    logs.forEach((log) => {
      const url = log.apiUrl || "";
      endpointCounts[url] = (endpointCounts[url] || 0) + 1;

      // Dynamically categorize APIs based on URL structure
      const category = extractCategoryFromUrl(url);
      apiCategories[category] = (apiCategories[category] || 0) + 1;
    });

    const mostUsedEndpoints = Object.entries(endpointCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([url, count]) => ({ url, count }));

    // Time-based analysis
    const hourlyActivity = new Array(24).fill(0);
    const dailyActivity = new Array(7).fill(0);

    logs.forEach((log) => {
      const timestamp = log.timestamp;
      if (timestamp) {
        let date;
        if (timestamp._seconds) {
          date = new Date(timestamp._seconds * 1000);
        } else if (typeof timestamp === "string") {
          date = new Date(timestamp);
        } else if (timestamp instanceof Date) {
          date = timestamp;
        }

        if (date && !isNaN(date.getTime())) {
          const hour = date.getHours();
          const day = date.getDay();
          hourlyActivity[hour]++;
          dailyActivity[day]++;
        }
      }
    });

    // Find peak activity time
    const peakHour = hourlyActivity.indexOf(Math.max(...hourlyActivity));
    const peakActivityTime = `${peakHour}:00`;

    setAnalytics({
      apiCategories,
      mostUsedEndpoints,
      hourlyActivity,
      dailyActivity,
      peakActivityTime,
      totalRequests: logs.length,
    });
  };

  // Fixed fetchApiLogs function
  const fetchApiLogs = async (userId) => {
    if (!userId) {
      showError("route error ! UserId not found");
      navigate("/admin/user-details");
      return;
    }
    setLoading(true);
    setError(""); // Clear any previous errors
    setApiLogs([]);

    try {
      // Prepare filters
      const filters = {};
      if (
        appliedFilters.useCustomRange &&
        appliedFilters.startDate &&
        appliedFilters.endDate
      ) {
        filters.startDate = appliedFilters.startDate;
        filters.endDate = appliedFilters.endDate;
      } else {
        filters.timeRange = appliedFilters.timeRange;
      }

      const response = await apiLogsService.getApiLogsByUserId(userId, filters);
      const body = response.data.body;
      const logs = Array.isArray(body) ? body : (body?.activities ?? []);
      setApiLogs(logs);

      // Show message if no logs found
      if (logs.length === 0) {
        showError("No API logs found for the selected date range");
      }
    } catch (error) {
      console.error("Error fetching API logs:", error);

      // Check for specific error messages
      const errorMessage =
        error.response?.data?.message || "Failed to fetch API logs";

      if (
        errorMessage.toLowerCase().includes("user not found") ||
        errorMessage.toLowerCase().includes("not found")
      ) {
        showError("User not found. Please check the user id.");
      } else {
        showError(errorMessage);
      }

      setApiLogs([]);
    } finally {
      setLoading(false);
    }
  };

  // Sorting functions
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <FaSort className="ml-1" />;
    }
    return sortDirection === "asc" ? (
      <FaSortUp className="ml-1" />
    ) : (
      <FaSortDown className="ml-1" />
    );
  };

  const sortData = (data) => {
    if (!Array.isArray(data)) return [];
    return [...data].sort((a, b) => {
      let aValue, bValue;

      switch (sortField) {
        case "apiUrl":
          aValue = (a.apiUrl || "").toLowerCase();
          bValue = (b.apiUrl || "").toLowerCase();
          break;
        case "timestamp":
          aValue = a.timestamp?._seconds || a.timestamp || "";
          bValue = b.timestamp?._seconds || b.timestamp || "";
          break;
        case "responseStatus":
          aValue = parseInt(
            a.apiResponse?.responseStatus || a.responseStatus || 0
          );
          bValue = parseInt(
            b.apiResponse?.responseStatus || b.responseStatus || 0
          );
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortDirection === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === "asc" ? 1 : -1;
      }
      return 0;
    });
  };

  // Get sorted data
  const sortedApiLogs = sortData(apiLogs);

  // Pagination calculations
  const totalPages = Math.ceil(sortedApiLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentApiLogs = sortedApiLogs.slice(startIndex, endIndex);

  // Pagination handlers
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  // Date filter handlers
  const handleTimeRangeChange = (timeRange) => {
    setDateFilters((prev) => ({
      ...prev,
      timeRange,
      useCustomRange: false,
    }));
    // Apply immediately for quick select options
    setAppliedFilters((prev) => ({
      ...prev,
      timeRange,
      useCustomRange: false,
    }));
  };

  const handleCustomRangeChange = (field, value) => {
    setDateFilters((prev) => ({
      ...prev,
      [field]: value,
      useCustomRange: true,
    }));
    // Don't apply immediately - wait for submit
  };

  // Function to validate date range
  const validateDateRange = () => {
    if (dateFilters.startDate && dateFilters.endDate) {
      return new Date(dateFilters.startDate) <= new Date(dateFilters.endDate);
    }
    return true; // Valid if either date is not set yet
  };

  // Function to get validation message
  const getValidationMessage = () => {
    if (!dateFilters.startDate || !dateFilters.endDate) {
      return "Please select both start and end dates";
    }
    if (!validateDateRange()) {
      return "Start date cannot be greater than end date";
    }
    return `Selected: ${dateFilters.startDate} to ${dateFilters.endDate}`;
  };

  const handleCustomRangeToggle = () => {
    setDateFilters((prev) => ({
      ...prev,
      useCustomRange: !prev.useCustomRange,
    }));
    // Don't apply immediately - wait for submit
    // Also clear custom dates when hiding custom range
    if (dateFilters.useCustomRange) {
      setDateFilters((prev) => ({
        ...prev,
        startDate: "",
        endDate: "",
      }));
    }
  };

  const handleApplyCustomRange = () => {
    if (dateFilters.startDate && dateFilters.endDate) {
      // Validate that start date is not greater than end date
      if (new Date(dateFilters.startDate) > new Date(dateFilters.endDate)) {
        showError("Start date cannot be greater than end date");
        return;
      }

      setAppliedFilters({
        timeRange: "",
        startDate: dateFilters.startDate,
        endDate: dateFilters.endDate,
        useCustomRange: true,
      });
    }
  };

  const handleResetCustomRange = () => {
    setDateFilters({
      timeRange: "7",
      startDate: "",
      endDate: "",
      useCustomRange: false,
    });
    setAppliedFilters({
      timeRange: "7",
      startDate: "",
      endDate: "",
      useCustomRange: false,
    });
  };

  // Format timestamp function
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "N/A";

    try {
      if (timestamp._seconds) {
        // Firebase timestamp format
        const date = new Date(timestamp._seconds * 1000);
        return date.toLocaleString();
      } else if (typeof timestamp === "string") {
        // ISO string format
        return new Date(timestamp).toLocaleString();
      } else if (timestamp instanceof Date) {
        // Date object
        return timestamp.toLocaleString();
      }
      return "Invalid timestamp";
    } catch (error) {
      return "Invalid timestamp";
    }
  };

  // Get status badge function
  const getStatusBadge = (status) => {
    if (!status) return <Badge color="secondary">N/A</Badge>;

    const statusCode = parseInt(status);
    if (statusCode >= 200 && statusCode < 300) {
      return <Badge color="success">{statusCode}</Badge>;
    } else if (statusCode >= 300 && statusCode < 400) {
      return <Badge color="success">{statusCode}</Badge>;
    } else if (statusCode >= 400 && statusCode < 500) {
      return <Badge style={{ backgroundColor: '#ffc107', color: '#000' }}>{statusCode}</Badge>;
    } else if (statusCode >= 500) {
      return <Badge color="danger">{statusCode}</Badge>;
    }
    return <Badge color="secondary">{statusCode}</Badge>;
  };

  // Handle view JSON function
  const handleViewJson = (log) => {
    console.log("handleViewJson called with log:", log);
    console.log("Current showModal state:", showModal);
    setSelectedLog(log);
    setShowModal(true);
    console.log("Modal should be opening now");
  };

  // Close modal function
  const closeModal = () => {
    setShowModal(false);
    setSelectedLog(null);
  };

  // Function to get dynamic color for category
  const getCategoryColor = (category) => {
    // Array of available colors for dynamic assignment
    const colors = ["primary"];

    // Generate a consistent color based on category name
    const hash = category.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    const colorIndex = Math.abs(hash) % colors.length;
    return colors[colorIndex];
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

  // Date Filter Component
  const DateFilterComponent = () => (
    <Card className="shadow-sm border-0 mb-4">
      <CardBody className="mb-0 pb-0">
        <Row>
          <Col md={6}>
            <div className="d-flex align-items-center mb-3">
              <span className="text-muted mr-3">Quick Select:</span>
              <div className="btn-group" role="group">
                <Button
                  color={
                    !dateFilters.useCustomRange && dateFilters.timeRange === "1"
                      ? "primary"
                      : "outline-primary"
                  }
                  size="sm"
                  onClick={() => handleTimeRangeChange("1")}
                >
                  Today
                </Button>
                <Button
                  color={
                    !dateFilters.useCustomRange && dateFilters.timeRange === "7"
                      ? "primary"
                      : "outline-primary"
                  }
                  size="sm"
                  onClick={() => handleTimeRangeChange("7")}
                >
                  Last 7 Days
                </Button>
              </div>
            </div>
          </Col>
          <Col md={6}>
            <div className="d-flex align-items-center">
              <span className="text-muted mr-3">Custom Range:</span>
              <Button
                color={
                  dateFilters.useCustomRange ? "primary" : "outline-primary"
                }
                size="sm"
                onClick={handleCustomRangeToggle}
              >
                {dateFilters.useCustomRange ? "Hide" : "Show"} Custom Range
              </Button>
            </div>
          </Col>
        </Row>

        {dateFilters.useCustomRange && (
          <Row className="mt-3">
            <Col md={4}>
              <FormGroup>
                <Label for="startDate">Start Date</Label>
                <Input
                  type="date"
                  id="startDate"
                  value={dateFilters.startDate}
                  onChange={(e) =>
                    handleCustomRangeChange("startDate", e.target.value)
                  }
                />
              </FormGroup>
            </Col>
            <Col md={4}>
              <FormGroup>
                <Label for="endDate">End Date</Label>
                <Input
                  type="date"
                  id="endDate"
                  value={dateFilters.endDate}
                  onChange={(e) =>
                    handleCustomRangeChange("endDate", e.target.value)
                  }
                />
              </FormGroup>
            </Col>

            <Col
              md={4}
              className="d-flex justify-content-center align-items-center"
            >
              <Button
                color="primary"
                size="sm"
                onClick={handleApplyCustomRange}
                disabled={
                  !dateFilters.startDate ||
                  !dateFilters.endDate ||
                  !validateDateRange()
                }
              >
                Apply
              </Button>
              <Button
                color="secondary"
                size="sm"
                onClick={handleResetCustomRange}
              >
                Reset
              </Button>
            </Col>
          </Row>
        )}

        <div className="mt-3 pt-2 border-top d-flex justify-content-between align-items-center">
          <small className="text-muted">
            {appliedFilters.useCustomRange
              ? `Applied: ${appliedFilters.startDate} to ${appliedFilters.endDate}`
              : `Showing data for last ${appliedFilters.timeRange} day${
                  appliedFilters.timeRange !== "1" ? "s" : ""
                }`}
          </small>
          {dateFilters.useCustomRange && (
            <small
              className={`${
                !validateDateRange() ? "text-danger" : "text-muted"
              }`}
            >
              {getValidationMessage()}
            </small>
          )}
        </div>
      </CardBody>
    </Card>
  );

  // Pagination Component
  const PaginationComponent = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="d-flex justify-content-between align-items-center mt-3">
        <div className="d-flex align-items-center">
          <span className="text-muted mr-2">Show:</span>
          <select
            className="form-control form-control-sm"
            style={{ width: "80px" }}
            value={itemsPerPage}
            onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-muted ml-2">
            of {sortedApiLogs.length} entries
          </span>
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
      </div>
    );
  };

  // Analytics Dashboard Components
  const AnalyticsDashboard = () => (
    <div>
      {/* API Categories and Most Used Endpoints */}
      <Row className="mb-4">
        <Col md={6}>
          <Card className="shadow-sm border-2 ">
            <CardHeader className="bg-primary d-flex justify-content-between align-items-center">
              <h5 className="mb-0 text-white">
                <FaChartBar className="mr-2 text-white" />
                API Categories Distribution
              </h5>
              <small className="text-white">
                total {analytics.totalRequests} requests
              </small>
            </CardHeader>
            <CardBody>
              {Object.entries(analytics.apiCategories)
                .sort(([, a], [, b]) => b - a) // Sort by count descending
                .map(([category, count]) => (
                  <div
                    key={category}
                    className="d-flex justify-content-between align-items-center mb-3 mt-3"
                  >
                    <div
                      className="d-flex align-items-center"
                      style={{ minWidth: "120px" }}
                    >
                      <span className="font-weight-medium text-truncate">
                        {category === "Assistant"
                          ? "Platform Assistant"
                          : category === "Gather-assist"
                          ? "Gather Assistant"
                          : category}
                          {console.log(category)}
                      </span>
                    </div>
                    <div className="d-flex align-items-center flex-grow-1 mx-3">
                      <Progress
                        value={(count / analytics.totalRequests) * 100}
                        className="flex-grow-1"
                        style={{
                          minWidth: "60px",
                          maxWidth: "200px",
                          marginBottom: "0px",
                        }}
                        color={getCategoryColor(category)}
                      />
                    </div>
                    <div className="text-right" style={{ minWidth: "40px" }}>
                      <span
                        className="text-muted bg-primary text-white rounded p-2"
                        style={{ fontSize: "12px" }}
                      >
                        {count}
                      </span>
                    </div>
                  </div>
                ))}
            </CardBody>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="shadow-sm border-2">
            <CardHeader className="bg-primary">
              <h5 className="mb-0 text-white">
                <FaServer className="mr-2 text-white" />
                Most Used Endpoints
              </h5>
            </CardHeader>
            <CardBody>
              {analytics.mostUsedEndpoints.map((endpoint, index) => (
                <div key={index} className="endpoint-item p-2 rounded mb-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <div
                      className="text-truncate"
                      style={{ maxWidth: "280px" }}
                    >
                      <small className="text-muted">{endpoint.url}</small>
                    </div>
                    <div className="text-right" style={{ minWidth: "40px" }}>
                      <span
                        className="text-muted bg-primary text-white rounded p-2"
                        style={{ fontSize: "12px" }}
                      >
                        {endpoint.count}
                      </span>
                    </div>
                    {/* <Badge color="primary">{endpoint.count}</Badge> */}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Activity Patterns */}
      {/* <Row className="mb-4">
         <Col md={6}>
           <Card className="shadow-sm border-0">
             <CardHeader className="bg-light">
               <h6 className="mb-0">
                 <FaClock className="mr-2" />
                 Hourly Activity Pattern
               </h6>
             </CardHeader>
             <CardBody>
               <div className="d-flex align-items-end justify-content-between" style={{ height: '140px', padding: '0 10px' }}>
                 {analytics.hourlyActivity
                   .map((count, hour) => ({ count, hour }))
                   .filter(item => item.count > 0) // Only show hours with activity
                   .sort((a, b) => b.count - a.count) // Sort by activity descending
                   .slice(0, 8) // Show top 8 most active hours
                   .map(({ count, hour }) => {
                     const maxCount = Math.max(...analytics.hourlyActivity);
                     const barHeight = Math.max(20, (count / maxCount) * 100);
                     const isPeak = count === maxCount;
                     
                     return (
                       <div key={hour} className="d-flex flex-column align-items-center" style={{ width: '40px' }}>
                         <div 
                           className={`rounded ${isPeak ? 'bg-success' : 'bg-primary'}`}
                           style={{ 
                             width: '20px', 
                             height: `${barHeight}px`,
                             minHeight: '20px',
                             transition: 'all 0.3s ease'
                           }}
                         />
                         <small className="text-muted mt-2" style={{ fontSize: '0.75rem', fontWeight: '500' }}>
                           {hour}:00
                         </small>
                         <small className="text-muted" style={{ fontSize: '0.65rem', marginTop: '2px' }}>
                           {count}
                         </small>
                       </div>
                     );
                   })}
               </div>
               <div className="text-center mt-3 pt-2 border-top">
                 <small className="text-muted">
                   Peak activity at <strong className="text-success">{analytics.peakActivityTime}</strong> with <strong>{Math.max(...analytics.hourlyActivity)}</strong> requests
                 </small>
               </div>
             </CardBody>
           </Card>
         </Col>
         <Col md={6}>
           <Card className="shadow-sm border-0">
             <CardHeader className="bg-light">
               <h6 className="mb-0">
                 <FaCalendarAlt className="mr-2" />
                 Daily Activity Pattern
               </h6>
             </CardHeader>
             <CardBody>
               <div className="d-flex align-items-end justify-content-between" style={{ height: '140px', padding: '0 10px' }}>
                 {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => {
                   const count = analytics.dailyActivity[index];
                   const maxCount = Math.max(...analytics.dailyActivity);
                   const isPeakDay = count === maxCount && count > 0;
                   const barHeight = count > 0 ? Math.max(15, (count / maxCount) * 100) : 0;
                   
                   return (
                     <div key={day} className="d-flex flex-column align-items-center" style={{ width: '35px' }}>
                       <div 
                         className={`rounded ${isPeakDay ? 'bg-success' : count > 0 ? 'bg-primary' : 'bg-light'}`}
                         style={{ 
                           width: '25px', 
                           height: `${barHeight}px`,
                           minHeight: count > 0 ? '15px' : '0px',
                           transition: 'all 0.3s ease'
                         }}
                       />
                       <small className={`mt-2 ${isPeakDay ? 'font-weight-bold text-success' : 'text-muted'}`} style={{ fontSize: '0.75rem' }}>
                         {day}
                       </small>
                       {count > 0 && (
                         <small className="text-muted" style={{ fontSize: '0.65rem', marginTop: '2px' }}>
                           {count}
                         </small>
                       )}
                     </div>
                   );
                 })}
               </div>
               <div className="text-center mt-3 pt-2 border-top">
                 <small className="text-muted">
                   {(() => {
                     const maxCount = Math.max(...analytics.dailyActivity);
                     const peakDayIndex = analytics.dailyActivity.indexOf(maxCount);
                     const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                     return maxCount > 0 ? (
                       <>Peak day: <strong className="text-success">{days[peakDayIndex]}</strong> with <strong>{maxCount}</strong> requests</>
                     ) : 'No activity recorded';
                   })()}
                 </small>
               </div>
             </CardBody>
           </Card>
         </Col>
       </Row> */}
    </div>
  );

  return (
    <>
      {/* Page content */}
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <div className="mb-4">
              <h3 className="text-white" style={{ fontSize: "1.25rem" }}>
                USER ACTIVITY 
              </h3>
            </div>

            <Card className="shadow">
              <CardBody>
                {/* Loading State - Inline */}
                {loading && (
                  <div className="text-center py-5">
                    <Spinner color="primary" />
                    <p className="mt-3 text-muted">Loading API logs...</p>
                  </div>
                )}

                {/* Content - Always show analytics and logs together */}
                {!loading && (
                  <>
                    {/* Date Filter */}
                    <DateFilterComponent />

                    {/* Analytics Dashboard */}
                    <AnalyticsDashboard />

                    {/* Divider */}
                    <hr className="my-4" />

                    {/* API Logs Table */}
                    {apiLogs.length > 0 && (
                      <div className="table-responsive">
                        <h4 className="mb-3 text-white bg-primary p-2 rounded">
                          API Logs{" "}
                        </h4>
                        <Table className="align-items-center table-flush">
                          <thead className="thead-light">
                            <tr>
                              <th
                                scope="col"
                                style={{
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                                className="sortable-header"
                              >
                                <div className="d-flex align-items-center">
                                  API URL
                                </div>
                              </th>
                              <th
                                scope="col"
                                onClick={() => handleSort("timestamp")}
                                style={{
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                                className="sortable-header"
                              >
                                <div className="d-flex align-items-center">
                                  Timestamp {getSortIcon("timestamp")}
                                </div>
                              </th>
                              <th
                                scope="col"
                                onClick={() => handleSort("responseStatus")}
                                style={{
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                                className="sortable-header"
                              >
                                <div className="d-flex align-items-center">
                                  Response Status{" "}
                                  {getSortIcon("responseStatus")}
                                </div>
                              </th>
                              <th scope="col">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentApiLogs.map((log, index) => (
                              <tr key={startIndex + index}>
                                <td>
                                  <div
                                    className="text-wrap"
                                    style={{ maxWidth: "300px" }}
                                  >
                                    {log.apiUrl || "N/A"}
                                  </div>
                                </td>
                                <td>{formatTimestamp(log.timestamp)}</td>
                                <td
                                  style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    paddingTop: "25px",
                                  }}
                                >
                                  {getStatusBadge(
                                    log.apiResponse?.responseStatus ||
                                      log.responseStatus
                                  )}
                                </td>
                                <td>
                                  <Button
                                    color="primary"
                                    size="sm"
                                    onClick={() => {
                                      console.log(
                                        "Button clicked for log:",
                                        log
                                      );
                                      handleViewJson(log);
                                    }}
                                    id={`view-${startIndex + index}`}
                                  >
                                    View Details
                                  </Button>
                                  <UncontrolledTooltip
                                    target={`view-${startIndex + index}`}
                                  >
                                    View Full JSON
                                  </UncontrolledTooltip>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>

                        {/* Pagination */}
                        <PaginationComponent />
                      </div>
                    )}

                    {/* No Data Message */}
                    {apiLogs.length === 0 && !loading && (
                      <div className="text-center py-5">
                        <h4 className="text-muted">No API logs found</h4>
                        <p className="text-muted">
                          No API activity found for the selected date range
                        </p>
                      </div>
                    )}
                  </>
                )}
              </CardBody>
            </Card>
          </div>
        </Row>
      </Container>

      {/* JSON Details Modal */}
      <Modal
        isOpen={showModal}
        toggle={closeModal}
        size="lg"
        style={{ zIndex: 9999 }}
      >
        {console.log(
          "Modal render - showModal:",
          showModal,
          "selectedLog:",
          selectedLog
        )}
        <ModalHeader toggle={closeModal}>
          <span className="mb-0">API Log Details</span>
        </ModalHeader>
        <ModalBody>
          {selectedLog ? (
            <div>
              <div className="mb-3">
                <strong>API URL:</strong>
                <div className="text-wrap bg-light p-2 rounded">
                  {selectedLog.apiUrl || "N/A"}
                </div>
              </div>

              <div className="mb-3">
                <strong>Full JSON Data:</strong>
                <pre
                  className="bg-light p-2 rounded"
                  style={{
                    maxHeight: "400px",
                    overflow: "auto",
                    fontSize: "0.875rem",
                  }}
                >
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div>No log data selected</div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={closeModal}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      {/* Toast component */}
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

export default ApiLogs;
