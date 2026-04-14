import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Container,
  Row,
  Col,
  Button,
  Spinner,
  Alert,
  Progress,
} from "reactstrap";
import apiLogsService from "services/apiLogsService";
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaSyncAlt, FaArrowLeft, FaChevronDown, FaChevronRight, FaChartBar, FaServer } from "react-icons/fa";

const GROUP_LABELS = { today: "Today", yesterday: "Yesterday", older: "Older" };

const formatTimestamp = (dateString) => {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "—";
    const datePart = date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    const timePart = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return "—";
  }
};

const formatTimeOnly = (dateString) => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
};

const getDateGroup = (dateString) => {
  if (!dateString) return "older";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "older";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(d);
  dateOnly.setHours(0, 0, 0, 0);
  if (dateOnly.getTime() === today.getTime()) return "today";
  if (dateOnly.getTime() === yesterday.getTime()) return "yesterday";
  return "older";
};

const getEngagementLevel = (percentage, activityCount) => {
  const score = Math.min(100, Math.round((percentage * 0.6) + (Math.min(activityCount, 50) * 0.8)));
  if (score >= 70) return { label: "High", color: "#2dce89", bg: "rgba(45, 206, 137, 0.15)" };
  if (score >= 40) return { label: "Medium", color: "#fb6340", bg: "rgba(251, 99, 64, 0.15)" };
  return { label: "Low", color: "#5e72e4", bg: "rgba(94, 114, 228, 0.15)" };
};

const UserActivity = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [collapsedGroups, setCollapsedGroups] = useState({ today: false, yesterday: false, older: false });
  const [sortOrder, setSortOrder] = useState("newest");
  const [analytics, setAnalytics] = useState({
    apiCategories: {},
    mostUsedEndpoints: [],
    totalRequests: 0,
  });

  const fetchActivity = useCallback(async () => {
    if (!userId) {
      setError("User ID is missing.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await apiLogsService.getUserActivity(userId);
      const body = response?.data?.body;
      if (body) {
        setData(body);
      } else {
        setData({
          activities: [],
          progress: { percentage: 0, completed: [], nextMilestone: "" },
          nextStep: "",
        });
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load user activity.";
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fromTimestamp = React.useMemo(() => {
    if (!dateRange.from) return null;
    const d = new Date(dateRange.from);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [dateRange.from]);

  const toTimestamp = React.useMemo(() => {
    if (!dateRange.to) return null;
    const d = new Date(dateRange.to);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, [dateRange.to]);

  const calculateAnalytics = useCallback(
    (rawActivities) => {
      if (!Array.isArray(rawActivities) || rawActivities.length === 0) {
        setAnalytics({
          apiCategories: {},
          mostUsedEndpoints: [],
          totalRequests: 0,
        });
        return;
      }

      // Filter by selected date range only (independent of category filter)
      const timeFiltered = rawActivities.filter((a) => {
        if (!a.timestamp) return false;
        const ts = new Date(a.timestamp).getTime();
        if (Number.isNaN(ts)) return false;
        if (fromTimestamp && ts < fromTimestamp) return false;
        if (toTimestamp && ts > toTimestamp) return false;
        return true;
      });

      if (timeFiltered.length === 0) {
        setAnalytics({
          apiCategories: {},
          mostUsedEndpoints: [],
          totalRequests: 0,
        });
        return;
      }

      const extractCategoryFromUrl = (url) => {
        if (!url) return "Other";
        const trimmedUrl = url.trim().split("?")[0];
        const apiModuleRegex = /\/api\/([^/]+)/;
        const match = trimmedUrl.match(apiModuleRegex);
        if (!match) return "Other";
        const moduleName = match[1];
        return moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
      };

      const endpointCounts = {};
      const apiCategories = {};

      timeFiltered.forEach((activity) => {
        const url =
          activity.fullRoute || activity.apiUrl || activity.url || "";
        if (!url) return;
        endpointCounts[url] = (endpointCounts[url] || 0) + 1;
        const category = extractCategoryFromUrl(url);
        apiCategories[category] = (apiCategories[category] || 0) + 1;
      });

      const mostUsedEndpoints = Object.entries(endpointCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([url, count]) => ({ url, count }));

      setAnalytics({
        apiCategories,
        mostUsedEndpoints,
        totalRequests: timeFiltered.length,
      });
    },
    [fromTimestamp, toTimestamp]
  );

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  const activities = data?.activities ?? [];
  const progress = data?.progress ?? {
    percentage: 0,
    completed: [],
    nextMilestone: "",
  };
  const nextStep = data?.nextStep ?? "";

  const categories = [
    "all",
    ...Array.from(new Set(activities.map((a) => a.category).filter(Boolean))),
  ];

  const filteredActivities = activities.filter((a) => {
    const inCategory = categoryFilter === "all" || a.category === categoryFilter;

    if (!a.timestamp || (!fromTimestamp && !toTimestamp)) {
      return inCategory;
    }

    const ts = new Date(a.timestamp).getTime();
    if (Number.isNaN(ts)) {
      return inCategory;
    }

    if (fromTimestamp && ts < fromTimestamp) return false;
    if (toTimestamp && ts > toTimestamp) return false;

    return inCategory;
  });

  // Recalculate analytics whenever activities or date range change
  useEffect(() => {
    calculateAnalytics(activities);
  }, [activities, calculateAnalytics]);
  const sortedActivities = [...filteredActivities].sort((a, b) => {
    const tA = new Date(a.timestamp).getTime();
    const tB = new Date(b.timestamp).getTime();
    return sortOrder === "newest" ? tB - tA : tA - tB;
  });

  const grouped = React.useMemo(() => {
    const groups = { today: [], yesterday: [], older: [] };
    sortedActivities.forEach((a) => {
      const key = getDateGroup(a.timestamp);
      if (groups[key]) groups[key].push(a);
    });
    return groups;
  }, [sortedActivities]);

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const engagement = getEngagementLevel(progress.percentage, activities.length);

  if (loading) {
    return (
      <Container fluid className="pt-6 user-activity-page">
        <Row>
          <Col>
            <Card className="shadow border-0">
              <CardBody className="text-center py-5">
                <Spinner color="primary" />
                <p className="mt-2 text-muted mb-0">Loading user activity...</p>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  if (error) {
    return (
      <Container fluid className="pt-6 user-activity-page">
        <Row>
          <Col>
            <Alert color="danger" className="border-0 shadow-sm">{error}</Alert>
            <Button color="primary" onClick={() => fetchActivity()}>
              <FaSyncAlt className="mr-2" /> Retry
            </Button>
            <Button
              color="secondary"
              className="ml-2"
              onClick={() => navigate("/admin/user-details")}
            >
              <FaArrowLeft className="mr-2" /> Back to Users
            </Button>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <>
      <style>{`
        .user-activity-page { --ua-radius: 8px; --ua-transition: 0.25s ease; }
        .user-activity-page .card { border-radius: var(--ua-radius); transition: box-shadow var(--ua-transition); }
        .user-activity-page .card:hover { box-shadow: 0 0.5rem 1.5rem rgba(0,0,0,0.08) !important; }
        .user-activity-page .sticky-summary {
          position: sticky;
          top: 1rem;
          transition: top var(--ua-transition);
        }
        .user-activity-page .activity-group-header {
          cursor: pointer;
          user-select: none;
          transition: background-color var(--ua-transition);
          border-radius: var(--ua-radius);
        }
        .user-activity-page .activity-group-header:hover { background-color: rgba(0,0,0,0.03); }
        .user-activity-page .activity-item {
          transition: opacity var(--ua-transition), transform var(--ua-transition);
        }
        .user-activity-page .activity-item:hover { opacity: 1; }
        .user-activity-page .collapse-content {
          overflow-y: hidden;
          transition: max-height 0.35s ease, opacity 0.25s ease;
        }
        .user-activity-page .collapse-content.expanded {
          overflow-y: auto;
        }
        .user-activity-page .engagement-pill {
          transition: transform var(--ua-transition), box-shadow var(--ua-transition);
        }
        .user-activity-page .engagement-pill:hover { transform: scale(1.02); }
        @media (max-width: 767px) {
          .user-activity-page .sticky-summary { position: static; }
        }
      `}</style>
      <Container fluid className="pt-6 user-activity-page pb-5">
        <div className="d-flex justify-content-between align-items-center flex-wrap mb-4">
          <Button
            color="link"
            className="p-0 text-muted pl-0"
            onClick={() => navigate("/admin/user-details")}
          >
            <FaArrowLeft className="mr-2" /> Back to Users
          </Button>
          <Button color="primary" size="sm" onClick={fetchActivity}>
            <FaSyncAlt className="mr-2" /> Refresh
          </Button>
        </div>

        <Row>
          <Col lg={4} xl={3} className="mb-4 mb-lg-0">
            <div className="sticky-summary">
              <Card className="shadow-sm border-0 mb-3">
                <CardBody className="p-4">
                  {data?.platformName && (
                    <div className="mb-3">
                      <small className="text-muted text-uppercase d-block">
                        Platform
                      </small>
                      <span className="font-weight-bold">{data?.platformName?.toUpperCase()}</span>
                    </div>
                  )}
                  <h6 className="text-uppercase text-muted mb-3 font-weight-bold">Progress summary</h6>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-sm">Onboarding</span>
                    <span className="font-weight-bold">{progress.percentage}%</span>
                  </div>
                  <Progress
                    value={progress.percentage}
                    color="primary"
                    className="mb-3"
                    style={{ height: "8px", borderRadius: "4px" }}
                  />
                  <div className="mb-3">
                    <span className="text-muted small">Engagement</span>
                    <div
                      className="engagement-pill mt-1 d-inline-flex align-items-center px-3 py-2 rounded"
                      style={{
                        backgroundColor: engagement.bg,
                        color: engagement.color,
                        fontWeight: 600,
                        fontSize: "0.875rem",
                      }}
                    >
                      {engagement.label}
                    </div>
                  </div>
                  {progress.completed && progress.completed.length > 0 && (
                    <div className="mb-2">
                      <small className="text-muted">Completed</small>
                      <div className="d-flex flex-wrap mt-1">
                        {progress.completed.map((item, i) => (
                          <Badge
                            key={i}
                            color="success"
                            className="mr-1 mb-1 font-weight-normal"
                            style={{ fontSize: "0.7rem" }}
                          >
                            {item.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {progress.nextMilestone && (
                    <div>
                      <small className="text-muted">Next milestone</small>
                      <p className="mb-0 small font-weight-bold">{progress.nextMilestone.replace(/_/g, " ")}</p>
                    </div>
                  )}
                </CardBody>
              </Card>
              {nextStep && (
                <Card className="shadow-sm border-0 border-left-primary" style={{ borderLeft: "4px solid #5e72e4" }}>
                  <CardBody className="p-4">
                    <h6 className="text-uppercase text-muted mb-2 font-weight-bold small">Suggested next step</h6>
                    <p className="mb-0 small">{nextStep}</p>
                  </CardBody>
                </Card>
              )}
            </div>
          </Col>
              
          <Col lg={8} xl={9}>
            <Card className="shadow-sm border-0 mb-4">
              <CardBody className="p-4">
              <div className="d-flex flex-wrap align-items-center justify-content-between mb-4">
                  <h5 className="mb-0 font-weight-bold">Activity timeline</h5>
                  <div className="d-flex align-items-center flex-wrap mt-2 mt-md-0">
                    <div className="d-flex align-items-center mr-3 mb-2 mb-md-0">
                      <small className="text-muted mr-2">From</small>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={dateRange.from}
                        max={dateRange.to || undefined}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDateRange((prev) => {
                            let nextTo = prev.to;
                            if (nextTo && value && nextTo < value) {
                              nextTo = value;
                            }
                            return { ...prev, from: value, to: nextTo };
                          });
                        }}
                        style={{ width: "auto" }}
                      />
                    </div>
                    <div className="d-flex align-items-center mr-3 mb-2 mb-md-0">
                      <small className="text-muted mr-2">To</small>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={dateRange.to}
                        min={dateRange.from || undefined}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDateRange((prev) => {
                            let nextFrom = prev.from;
                            if (nextFrom && value && nextFrom > value) {
                              nextFrom = value;
                            }
                            return { ...prev, from: nextFrom, to: value };
                          });
                        }}
                        style={{ width: "auto" }}
                      />
                    </div>
                    {categories.length > 1 && (
                      <select
                        className="form-control form-control-sm mr-2"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        style={{ width: "auto", minWidth: "130px" }}
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat === "all" ? "All categories" : cat}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      className="form-control form-control-sm"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
                      style={{ width: "auto" }}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                  </div>
                </div>
                <Row className="mb-4">
                  <Col md={6}>
                    <Card className="shadow-sm border-2">
                      <CardHeader className="bg-primary d-flex justify-content-between align-items-center">
                        <h5 className="mb-0 text-white text-base">
                          <FaChartBar className="mr-2 text-white" />
                          API Categories Distribution
                        </h5>
                        <small className="text-white">
                          total {analytics.totalRequests} requests
                        </small>
                      </CardHeader>
                      <CardBody>
                        {Object.keys(analytics.apiCategories).length === 0 ? (
                          <p className="text-muted mb-0 small">
                            No API activity for selected range.
                          </p>
                        ) : (
                          Object.entries(analytics.apiCategories)
                            .sort(([, a], [, b]) => b - a)
                            .map(([category, count]) => {
                              const displayCategory =
                                category === "Assistant"
                                  ? "Platform Assistant"
                                  : category === "Gather-assist"
                                  ? "Gather Assistant"
                                  : category === "Other"
                                  ? "Other / External"
                                  : category;
                              return (
                              <div
                                key={category}
                                className="d-flex justify-content-between align-items-center mb-3 mt-3"
                              >
                                <div
                                  className="d-flex align-items-center"
                                  style={{ minWidth: "120px" }}
                                >
                                  <span className="font-weight-medium text-truncate">
                                    {displayCategory}
                                  </span>
                                </div>
                                <div className="d-flex align-items-center flex-grow-1 mx-3">
                                  <Progress
                                    value={
                                      (count / analytics.totalRequests) * 100
                                    }
                                    className="flex-grow-1"
                                    style={{
                                      minWidth: "60px",
                                      maxWidth: "200px",
                                      marginBottom: "0px",
                                    }}
                                    color="primary"
                                  />
                                </div>
                                <div
                                  className="text-right"
                                  style={{ minWidth: "40px" }}
                                >
                                  <span
                                    className="text-muted bg-primary text-white rounded p-2"
                                    style={{ fontSize: "12px" }}
                                  >
                                    {count}
                                  </span>
                                </div>
                              </div>
                              );
                            })
                        )}
                      </CardBody>
                    </Card>
                  </Col>
                  <Col md={6}>
                    <Card className="shadow-sm border-2 h-100">
                      <CardHeader className="bg-primary">
                        <h5 className="mb-0 text-white ">
                          <FaServer className="mr-2 text-white" />
                          Most Used Endpoints
                        </h5>
                      </CardHeader>
                      <CardBody>
                        {analytics.mostUsedEndpoints.length === 0 ? (
                          <p className="text-muted mb-0 small">
                            No endpoint usage for selected range.
                          </p>
                        ) : (
                          analytics.mostUsedEndpoints.map(
                            (endpoint, index) => (
                              <div
                                key={index}
                                className="endpoint-item p-2 rounded mb-2"
                              >
                                <div className="d-flex justify-content-between align-items-center">
                                  <div
                                    className="text-truncate"
                                    style={{ maxWidth: "280px" }}
                                  >
                                    <small className="text-muted">
                                      {endpoint.url}
                                    </small>
                                  </div>
                                  <div
                                    className="text-right"
                                    style={{ minWidth: "40px" }}
                                  >
                                    <span
                                      className="text-muted bg-primary text-white rounded p-2"
                                      style={{ fontSize: "12px" }}
                                    >
                                      {endpoint.count}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )
                          )
                        )}
                      </CardBody>
                    </Card>
                  </Col>
                </Row>

                

                {sortedActivities.length === 0 ? (
                  <p className="text-muted text-center py-5 mb-0">No activities yet.</p>
                ) : (
                  <div className="activity-timeline">
                    {(["today", "yesterday", "older"]).map((groupKey) => {
                      const items = grouped[groupKey] || [];
                      if (items.length === 0) return null;
                      const isCollapsed = collapsedGroups[groupKey];
                      return (
                        <div key={groupKey} className="mb-3 rounded" style={{ border: "1px solid #e9ecef" }}>
                          <div
                            className="activity-group-header d-flex align-items-center justify-content-between px-3 py-2"
                            onClick={() => toggleGroup(groupKey)}
                          >
                            <span className="font-weight-bold">
                              {GROUP_LABELS[groupKey]} ({items.length})
                            </span>
                            {isCollapsed ? (
                              <FaChevronRight className="text-muted" />
                            ) : (
                              <FaChevronDown className="text-muted" />
                            )}
                          </div>
                          <div
                            className={`collapse-content ${!isCollapsed ? 'expanded' : ''}`}
                            style={{
                              maxHeight: isCollapsed ? 0 : "500px",
                              opacity: isCollapsed ? 0 : 1,
                              overflowY: isCollapsed ? "hidden" : "auto",
                            }}
                          >
                            <div className="pl-2 pt-2">
                              {items.map((activity, index) => (
                                <div
                                  key={`${groupKey}-${index}`}
                                  className="activity-item d-flex mb-3"
                                  style={{
                                    borderLeft: "3px solid #dee2e6",
                                    marginLeft: "6px",
                                    paddingLeft: "1rem",
                                    position: "relative",
                                  }}
                                >
                                  <div
                                    style={{
                                      position: "absolute",
                                      left: "-6px",
                                      top: "6px",
                                      width: "12px",
                                      height: "12px",
                                      borderRadius: "50%",
                                      backgroundColor: "#5e72e4",
                                    }}
                                  />
                                  <div className="flex-grow-1 min-width-0">
                                    <p className="mb-1 small mb-0" style={{ lineHeight: 1.4 }}>
                                      {activity.readableMessage}
                                    </p>
                                    <div className="d-flex align-items-center flex-wrap mt-1">
                                      {activity.category && (
                                        <Badge
                                          color="info"
                                          className="text-uppercase mr-2"
                                          style={{ fontSize: "0.65rem" }}
                                        >
                                          {activity.category}
                                        </Badge>
                                      )}
                                      <small className="text-muted">
                                        {formatTimeOnly(activity.timestamp)}
                                      </small>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default UserActivity;
