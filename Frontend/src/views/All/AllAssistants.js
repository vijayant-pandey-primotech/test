import React, { useState, useEffect, useRef } from 'react';
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
  FormGroup,
  Label,
  Input,
} from 'reactstrap';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import assistantService from 'services/assistantService';
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import platformService from 'services/platformService';

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

  /* Drag and drop styles */
  .table td, .table th {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-height: 40px;
    vertical-align: middle;
  }
  
  /* Ensure consistent date formatting */
  .table td span {
    display: inline-block;
    max-width: 100%;
  }
`;

// Add getPublishStatusBadge function
const getPublishStatusBadge = (assistant) => {
  if (assistant.publishStatus === 'Published') {
    return <Badge color="success">Published</Badge>;
  } else {
    return <Badge color="warning">Draft</Badge>;
  }
};

// Add formatDisplayPath function after the getStatusBadge function
const formatDisplayPath = (path) => {
  if (!path) return '';
  return path
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Add helper function to get activity name from activityId
const getActivityName = (activityId, activitiesList) => {
  if (!activityId || !activitiesList || activitiesList.length === 0) return '-';
  const activity = activitiesList.find(a => a.id.toString() === activityId.toString());
  return activity ? activity.activityName : '-';
};

// Add helper function to map dependency IDs to names
const getDependencyNames = (prerequisiteAgents, assistantsList) => {
  // console.log("prerequisiteAgents",prerequisiteAgents,"assistantsList",assistantsList);
  if (!prerequisiteAgents) return '-';
  let dependencyIds = [];
  
  try {
    if (Array.isArray(prerequisiteAgents)) {
      dependencyIds = prerequisiteAgents;
    }
    else if (typeof prerequisiteAgents === 'string') {
      const cleanedString = prerequisiteAgents.trim();
      if (/^[\d,\s]+$/.test(cleanedString)) {
        dependencyIds = cleanedString.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      } 
      else {
        dependencyIds = JSON.parse(cleanedString);
      }
    }
    else if (typeof prerequisiteAgents === 'number') {
      dependencyIds = [prerequisiteAgents];
    }
    
    if (!Array.isArray(dependencyIds) || dependencyIds.length === 0) return '-';
    
    const dependencyNames = dependencyIds.map(id => {
      const assistant = assistantsList.find(a => a.id === id);
      return assistant ? assistant.name : `Assistant ${id}`;
    });
    
    if (dependencyNames.length === 1) {
      return dependencyNames[0];
    } else {
      return (
        <div style={{ lineHeight: '1.2' }}>
          {dependencyNames.map((name, index) => (
            <div key={index} style={{ marginBottom: '2px' }}>
              {name}{index < dependencyNames.length - 1 ? ',' : ''}
            </div>
          ))}
        </div>
      );
    }
  } catch (error) {
    console.error('Error parsing prerequisite_agents:', error);
    console.error('Raw prerequisite_agents value:', prerequisiteAgents);
    console.error('Type of prerequisite_agents:', typeof prerequisiteAgents);
    return '-';
  }
};

const AllAssistants = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSequenceMode, setIsSequenceMode] = useState(false);
  const [originalSequence, setOriginalSequence] = useState([]);
  const [originalSequenceValues, setOriginalSequenceValues] = useState({});
  const isViewer = localStorage.getItem("userRole") === "viewer";
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isPlatformFilter, setIsPlatformFilter] = useState(false);
  const [platforms, setPlatforms] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [selectedActivity, setSelectedActivity] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activities, setActivities] = useState([]);
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'ascending'
  });
  const recordsPerPage = 10;
  
  // Dependency modal states
  const [isDependencyModalOpen, setIsDependencyModalOpen] = useState(false);
  const [selectedAssistantForDependency, setSelectedAssistantForDependency] = useState(null);
  const [selectedDependencies, setSelectedDependencies] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [toast, setToast] = useState({
    isOpen: false,
    message: "",
    type: "success",
    position: "top",
  });

  // Ref to track if platform filter has been initialized from URL
  const isPlatformInitializedFromUrl = useRef(false);
  // Ref to track if activity filter has been initialized from URL
  const isActivityInitializedFromUrl = useRef(false);

  // Add effect to handle location state messages
  useEffect(() => {
    if (location.state?.message) {
      showToast(location.state.message, location.state.type);
      // Clear the location state after showing the message
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await assistantService.getAssistantsList("all");
        if (response.status === 200) {
          const data = response.body;
          // console.log('Processed data:', data);

          const formattedAssistants = data.map(assistant => {
            let displayPath = '';
            try {
              if (assistant.targetValue) {
                const parsedValue = JSON.parse(assistant.targetValue);
                // console.log(parsedValue, "=============================parsedValue");
                // Format each display path individually before joining
                if (Array.isArray(parsedValue.displayPath) && parsedValue.displayPath.length > 0) {
                  displayPath = parsedValue.displayPath
                    .map(path => formatDisplayPath(path))
                    .join(', ');
                } else {
                  displayPath = '-';
                }
              }
            } catch (err) {
              console.warn(`Error parsing targetValue for assistant ${assistant.id}:`, err);
            }

            return {
              id: assistant.id,
              name: assistant.assistantName || '',
              displayPath: displayPath,
              createdAt: assistant.createdAt,
              description: assistant.description || '-',
              image: assistant.image || 'https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png',
              status: assistant.status,
              expireDate: assistant.expireDate,
              userRecommendedPeriod: assistant.userRecommendedPeriod,
              targetType: assistant.targetType || 'Assistant',
              sequence: assistant.sequence,
              platforms: assistant.platforms || [],
              platformNames: [], // Will be populated when platforms are loaded
              prerequisite_agents: assistant.prerequisite_agents || null,
              publishStatus: assistant.publishStatus?.toLowerCase() === 'published' ? 'Published' : 'Draft',
              activityId: assistant.activityId || null,
              activityName: assistant.activityName || null
            };
          });

          setAssistants(formattedAssistants);
          setLoading(false);
        } else {
          setError('Failed to fetch assistants');
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching assistants:', err);
        setError('Error fetching assistants');
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Helper function to map platform IDs to names
  const mapPlatformIdsToNames = (platformIds, platformsList) => {
    if (!platformIds || !Array.isArray(platformIds) || !platformsList || platformsList.length === 0) return [];
    return platformIds.map(platformId => {
      const platform = platformsList.find(p => p.id.toString() === platformId.toString());
      return platform ? platform.name : `Platform ${platformId}`;
    });
  };

  // Fetch platforms data
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

  // Update platform names whenever platforms data changes
  useEffect(() => {
    if (platforms.length > 0) {
      setAssistants(prevAssistants => 
        prevAssistants.map(assistant => ({
          ...assistant,
          platformNames: mapPlatformIdsToNames(assistant.platforms, platforms)
        }))
      );
    }
  }, [platforms]);

  // Read platform filter from URL on mount and apply filter
  useEffect(() => {
    if (platforms.length === 0 || isPlatformInitializedFromUrl.current) {
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    const platformFromUrl = searchParams.get('platform');
    
    if (platformFromUrl) {
      // Validate that the platform exists
      const platformExists = platforms.find(p => p.id.toString() === platformFromUrl);
      if (platformExists) {
        isPlatformInitializedFromUrl.current = true;
        isUserPlatformChange.current = false; // This is from URL, not user action
        setSelectedPlatform(platformFromUrl);
        // Apply filter directly (handlePlatformChange will handle user changes)
        const applyFilterFromUrl = async () => {
          // Fetch activities first (this will also handle activity restoration from URL)
          await fetchActivities(platformFromUrl);
          
          setLoading(true);
          
          try {
            const response = await assistantService.getAssistantsList(platformFromUrl);
            if(response.status === 200){
              const data = response.body;
              const formattedAssistants = data.map(assistant => {
                let displayPath = '';
                try {
                  if (assistant.targetValue) {
                    const parsedValue = JSON.parse(assistant.targetValue);
                    if (Array.isArray(parsedValue.displayPath) && parsedValue.displayPath.length > 0) {
                      displayPath = parsedValue.displayPath.join(' > ');
                    }
                  }
                } catch (error) {
                  console.error('Error parsing displayPath:', error);
                }

                return {
                  id: assistant.id,
                  name: assistant.assistantName,
                  displayPath: displayPath,
                  createdAt: assistant.createdAt,
                  description: assistant.description || '-',
                  image: assistant.image || 'https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png',
                  status: assistant.status,
                  expireDate: assistant.expireDate,
                  userRecommendedPeriod: assistant.userRecommendedPeriod,
                  targetType: assistant.targetType || 'Assistant',
                  sequence: assistant.sequence,
                  targetValue: assistant.targetValue,
                  platforms: assistant.platforms || [],
                  platformNames: mapPlatformIdsToNames(assistant.platforms || [], platforms),
                  prerequisite_agents: assistant.prerequisite_agents || null,
                  publishStatus: assistant.publishStatus?.toLowerCase() === 'published' ? 'Published' : 'Draft',
                  activityId: assistant.activityId || null,
                  activityName: assistant.activityName || null
                };
              });
              setAssistants(formattedAssistants);
              setIsPlatformFilter(platformFromUrl !== "all");
            }
          } catch (error) {
            console.error('Error fetching assistants:', error);
            showToast("Error fetching assistants", "error");
          } finally {
            setLoading(false);
          }
        };
        applyFilterFromUrl();
      } else {
        // Invalid platform in URL, remove it
        const newSearchParams = new URLSearchParams(location.search);
        newSearchParams.delete('platform');
        navigate({ search: newSearchParams.toString() }, { replace: true });
        isPlatformInitializedFromUrl.current = true;
      }
    } else {
      isPlatformInitializedFromUrl.current = true;
    }
  }, [location.search, platforms, navigate]);

  // Track previous location.search to detect navigation changes
  const prevSearchRef = useRef(location.search);

  // Read activity filter from URL after activities are loaded
  useEffect(() => {
    // Reset flag if location.search changed (e.g., coming back from edit page)
    if (location.search !== prevSearchRef.current) {
      const searchParams = new URLSearchParams(location.search);
      const activityFromUrl = searchParams.get('activity');
      // Only reset if there's an activity in URL that's different from current selection
      if (activityFromUrl && activityFromUrl !== selectedActivity) {
        isActivityInitializedFromUrl.current = false;
      }
      prevSearchRef.current = location.search;
    }

    if (activities.length === 0 || isActivityInitializedFromUrl.current || selectedPlatform === "all") {
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    const activityFromUrl = searchParams.get('activity');
    
    if (activityFromUrl) {
      // Validate that the activity exists and belongs to the current platform
      const activityExists = activities.find(a => a.id.toString() === activityFromUrl);
      if (activityExists) {
        isActivityInitializedFromUrl.current = true;
        setSelectedActivity(activityFromUrl);
      } else {
        // Invalid activity in URL, remove it
        const newSearchParams = new URLSearchParams(location.search);
        newSearchParams.delete('activity');
        navigate({ search: newSearchParams.toString() }, { replace: true });
        isActivityInitializedFromUrl.current = true;
      }
    } else {
      isActivityInitializedFromUrl.current = true;
    }
  }, [activities, location.search, selectedPlatform, navigate, selectedActivity]);

  // Read search query from URL on mount and when location changes
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const searchFromUrl = searchParams.get('search') || "";
    
    // Only update state if URL search differs from current state
    // This prevents loops while allowing URL to be the source of truth
    if (searchFromUrl !== searchQuery) {
      setSearchQuery(searchFromUrl);
    }
  }, [location.search]); // Only depend on location.search, not searchQuery

  // Ref to track if platform change is from user action (not URL initialization)
  const isUserPlatformChange = useRef(false);

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
      whiteSpace: 'nowrap',
      padding: '8px 4px',
      textAlign: 'center',
      fontSize: '0.875rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minHeight: '32px',
      lineHeight: '24px',
      verticalAlign: 'middle',
      // wordBreak: 'break-word'
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
    // In sequence mode, show items in their current manual order
    if (isSequenceMode) return items;
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
  const fetchActivities = async (platformId) => {
    if (!platformId || platformId === "all") {
      setActivities([]);
      setSelectedActivity("all");
      isActivityInitializedFromUrl.current = false; // Reset flag when platform is "all"
      return;
    }
    try {
      const response = await assistantService.getActivitiesByPlatformId(platformId);
      if (response.status === 200) {
        const fetchedActivities = response.body || [];
        setActivities(fetchedActivities);
        // Activity restoration from URL will be handled by useEffect when activities state updates
      } else {
        setActivities([]);
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
      setActivities([]);
    }
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

  // Drag & Drop: sequence reordering within the current page
  const handleSequenceDragEnd = (result) => {
    const { destination, source } = result;
    if (!destination || destination.index === source.index) {
      return;
    }
    // When in sequence mode, we are working with the full 'assistants' array.
    // The source.index and destination.index are the correct absolute indices.
    setAssistants((prev) => {
      const updated = [...prev];
      const [movedItem] = updated.splice(source.index, 1);
      updated.splice(destination.index, 0, movedItem);
      return updated;
    });
  };

  const handleSaveSequence = async () => {
    try {
      // Prepare assistants with new sequence numbers
      const assistantsWithSequence = assistants.map((assistant, index) => ({
        id: assistant.id,
        sequence: index + 1
      }));

      const response = await assistantService.updateAssistantSequence(assistantsWithSequence);
      
      if (response.status === 200) {
        // Update the assistants with new sequence values
        setAssistants(prev => prev.map((assistant, index) => ({
          ...assistant,
          sequence: index + 1
        })));
        
        showToast("Sequence saved successfully", "success");
        setIsSequenceMode(false);
        setOriginalSequence([]);
        setOriginalSequenceValues({});
      } else {
        showToast("Failed to save sequence", "error");
      }
    } catch (error) {
      console.error("Error saving sequence:", error);
      showToast("Error saving sequence", "error");
    }
  };

  const handleEnterSequenceMode = () => {
    // Preserve current order when entering sequence mode
    setOriginalSequence([...assistants]);
    
    // Store original sequence values for each assistant
    const sequenceValues = {};
    assistants.forEach((assistant, index) => {
      sequenceValues[assistant.id] = assistant.sequence || (index + 1);
    });
    setOriginalSequenceValues(sequenceValues);
    
    setIsSequenceMode(true);
  };

  const handleCancelSequence = () => {
    // Restore original order when canceling
    if (originalSequence.length > 0) {
      setAssistants([...originalSequence]);
    }
    setIsSequenceMode(false);
    setOriginalSequence([]);
    setOriginalSequenceValues({});
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      const response = await assistantService.deleteAssistantById(itemToDelete.id);
      if(response.status === 200){
        setAssistants(prevAssistants => 
          prevAssistants.filter(assistant => assistant.id !== itemToDelete.id)
        );
        setDeleteModalOpen(false);
        setItemToDelete(null);
        showToast(response.message, "success");
      } else {
        showToast(response.message, "error");
      }
    } catch (error) {
      showToast("Failed to delete assistant", "error");
    }
  };

  // Dependency modal handlers
  const handleAddDependencyClick = (assistant) => {
    setSelectedAssistantForDependency(assistant);
    setIsDropdownOpen(false);
    
    // Initialize selected dependencies with current ones
    let currentDependencies = [];
    if (assistant.prerequisite_agents) {
      try {
        if (typeof assistant.prerequisite_agents === "string") {
          currentDependencies = JSON.parse(assistant.prerequisite_agents);
        } else if (Array.isArray(assistant.prerequisite_agents)) {
          currentDependencies = assistant.prerequisite_agents;
        }
      } catch (error) {
        console.error('Error parsing current dependencies:', error);
        currentDependencies = [];
      }
    }
    if (!Array.isArray(currentDependencies)) {
      currentDependencies = [];
    }
    setSelectedDependencies(currentDependencies);
    
    setIsDependencyModalOpen(true);
  };

  const handleDependencyCheckboxChange = (assistantId, isChecked) => {
    if (isChecked) {
      // Add dependency
      if (!selectedDependencies.includes(assistantId)) {
        setSelectedDependencies(prev => [...prev, assistantId]);
      }
    } else {
      // Remove dependency
      setSelectedDependencies(prev => prev.filter(id => id !== assistantId));
    }
  };

  const handleRemoveDependency = (dependencyId) => {
    setSelectedDependencies(prev => prev.filter(id => id !== dependencyId));
  };

  const handleDependencySave = async () => {
    if (!selectedAssistantForDependency) {
      showToast("No assistant selected", "error");
      return;
    }

    try {
      setLoading(true);
      const response = await assistantService.updateAssistantDependencies(selectedAssistantForDependency.id, JSON.stringify(selectedDependencies));

      if (response.status === 200) {
        showToast("Dependencies updated successfully", "success");
        
        // Update the local state
        setAssistants(prev => prev.map(assistant => 
          assistant.id === selectedAssistantForDependency.id 
            ? { ...assistant, prerequisite_agents: JSON.stringify(selectedDependencies) }
            : assistant
        ));
      } else {
        showToast("Failed to update dependencies", "error");
      }
    } catch (error) {
      console.error('Error updating dependencies:', error);
      showToast("Error updating dependencies", "error");
    } finally {
      setLoading(false);
      setIsDependencyModalOpen(false);
      setSelectedAssistantForDependency(null);
      setSelectedDependencies([]);
      setIsDropdownOpen(false);
    }
  };

  const handleDependencyModalClose = () => {
    setIsDependencyModalOpen(false);
    setSelectedAssistantForDependency(null);
    setSelectedDependencies([]);
    setIsDropdownOpen(false);
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const handleEditClick = (item) => {
    // Preserve platform, activity, and search filters in URL when navigating to edit
    const searchParams = new URLSearchParams(location.search);
    const platformParam = searchParams.get('platform');
    const activityParam = searchParams.get('activity');
    const searchParam = searchParams.get('search');
    
    const queryParams = new URLSearchParams();
    if (platformParam) queryParams.set('platform', platformParam);
    if (activityParam) queryParams.set('activity', activityParam);
    if (searchParam) queryParams.set('search', searchParam);
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    navigate(`/admin/assistant-form/edit/${item.id}${queryString}`);
  };

  const handleCreateClick = () => {
    // Preserve platform, activity, and search filters in URL when navigating to create
    const searchParams = new URLSearchParams(location.search);
    const platformParam = searchParams.get('platform');
    const activityParam = searchParams.get('activity');
    const searchParam = searchParams.get('search');
    
    const queryParams = new URLSearchParams();
    if (platformParam) queryParams.set('platform', platformParam);
    if (activityParam) queryParams.set('activity', activityParam);
    if (searchParam) queryParams.set('search', searchParam);
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    navigate(`/admin/assistant-form${queryString}`);
  };

  const handleTogglePublish = async (item) => {
    try {
      setLoading(true);
      const newPublishStatus = item.publishStatus === 'Published' ? 'Draft' : 'Published';
      
      // Create FormData to match the expected format
      const formData = new FormData();
      formData.append('publishStatus', newPublishStatus);
      formData.append('assistantName', item.name);
      formData.append('description', item.description || '');
      
      const response = await assistantService.updateAssistantById(item.id, formData);
      
      if (response.data.status === 200) {
        // Update local state
        setAssistants(prev => prev.map(assistant => 
          assistant.id === item.id 
            ? { ...assistant, publishStatus: newPublishStatus }
            : assistant
        ));
        showToast(`Assistant ${newPublishStatus === 'Published' ? 'published' : 'unpublished'} successfully`, 'success');
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

const handleActivityChange = (e) => {
  const activityId = e.target.value;
  setSelectedActivity(activityId);
  setCurrentPage(1);
  
  // Update URL with activity filter
  const searchParams = new URLSearchParams(location.search);
  if (activityId === "all") {
    searchParams.delete('activity');
  } else {
    searchParams.set('activity', activityId);
  }
  // Preserve platform and search filters if they exist
  if (selectedPlatform !== "all") {
    searchParams.set('platform', selectedPlatform);
  }
  if (searchQuery.trim() !== "") {
    searchParams.set('search', searchQuery);
  }
  navigate({ search: searchParams.toString() }, { replace: true });
};
  
const handlePlatformChange = async(e) => {
  const platformId = e.target.value;
  setSelectedPlatform(platformId);
  
  // Update URL with platform filter (only if it's a user action)
  isUserPlatformChange.current = true;
  const searchParams = new URLSearchParams(location.search);
  if (platformId === "all") {
    searchParams.delete('platform');
    searchParams.delete('activity'); // Remove activity when platform is "all"
  } else {
    searchParams.set('platform', platformId);
    // Keep activity in URL - it will be validated after activities are fetched
  }
  // Preserve search filter if it exists
  if (searchQuery.trim() !== "") {
    searchParams.set('search', searchQuery);
  }
  navigate({ search: searchParams.toString() }, { replace: true });
  
  // Reset activity filter when platform changes (will be restored from URL if valid)
  setSelectedActivity("all");
  isActivityInitializedFromUrl.current = false; // Allow re-initialization from URL
  await fetchActivities(platformId);
  setLoading(true);
  
  try {
    const response = await assistantService.getAssistantsList(platformId);
    if(response.status === 200){
      const data = response.body;
      const formattedAssistants = data.map(assistant => {
        let displayPath = '';
        try {
          if (assistant.targetValue) {
            const parsedValue = JSON.parse(assistant.targetValue);
            if (Array.isArray(parsedValue.displayPath) && parsedValue.displayPath.length > 0) {
              displayPath = parsedValue.displayPath.join(' > ');
            }
          }
        } catch (error) {
          console.error('Error parsing displayPath:', error);
        }

         return {
           id: assistant.id,
           name: assistant.assistantName,
           displayPath: displayPath,
           createdAt: assistant.createdAt,
           description: assistant.description || '-',
           image: assistant.image || 'https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png',
           status: assistant.status,
           expireDate: assistant.expireDate,
           userRecommendedPeriod: assistant.userRecommendedPeriod,
           targetType: assistant.targetType || 'Assistant',
           sequence: assistant.sequence,
           targetValue: assistant.targetValue,
           platforms: assistant.platforms || [],
           platformNames: mapPlatformIdsToNames(assistant.platforms || [], platforms),
           prerequisite_agents: assistant.prerequisite_agents || null,
           publishStatus: assistant.publishStatus?.toLowerCase() === 'published' ? 'Published' : 'Draft',
           activityId: assistant.activityId || null,
           activityName: assistant.activityName || null
         };
      });
      setAssistants(formattedAssistants);
      setIsPlatformFilter(platformId !== "all");
    }
  } catch (error) {
    console.error('Error fetching assistants:', error);
    showToast("Error fetching assistants", "error");
  } finally {
    setLoading(false);
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
              {isSequenceMode && <th style={{...tableStyles.th, width: '8%'}}>SEQ.</th>}
              <th style={{...tableStyles.th, width: '20%'}}>NAME</th>
              <th style={{...tableStyles.th, width: '20%'}}>DISPLAY PATH</th>
              <th style={{...tableStyles.th, width: '12%'}}>CREATED AT</th>
              <th style={{...tableStyles.th, width: '8%'}}>ACTIONS</th>
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
              {isSequenceMode && <td style={{...tableStyles.td, width: '8%'}}>
                  <div style={{ 
                    width: '32px', 
                    height: '16px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '4px',
                    margin: '0 auto',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                </td>}
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
    const searchValue = searchQuery.trim().toLowerCase();
    const filteredAssistants = assistants.filter((assistant) => {
      const matchesActivity =
        selectedActivity === "all" ||
        (assistant.activityId && assistant.activityId.toString() === selectedActivity);

      const matchesSearch =
        searchValue === "" ||
        (assistant.name || "").toLowerCase().includes(searchValue) ||
        (assistant.activityName || "").toLowerCase().includes(searchValue);

      return matchesActivity && matchesSearch;
    });
    const sortedData = sortedItems(filteredAssistants);
    // In sequence mode or when platform filter is applied, show all records; otherwise use pagination
    const { currentRecords, totalPages, indexOfFirstRecord } = (isSequenceMode || selectedPlatform !== "all")
      ? { currentRecords: sortedData, totalPages: 1, indexOfFirstRecord: 0 }
      : getPaginationData(sortedData);

    return (
      <Card className="shadow">
        <CardHeader className="border-0">
          <Row className="align-items-center">
            <Col>
            {!isViewer && !isSequenceMode && isPlatformFilter && (
              <Button
                color="primary"
                onClick={handleEnterSequenceMode}
                className="btn-custom-primary"
              
                title={!isPlatformFilter ? "Please select a platform first" : "Change sequence for selected platform"}
              >
                Change Sequence
              </Button>
            )}
            {isSequenceMode && (
              <>
              <Button
                color="primary"
                onClick={handleSaveSequence}
                className="btn-custom-secondary"
              >
                Save Sequence
              </Button>
               <Button
                onClick={handleCancelSequence}
                className="btn-custom-secondary"
              >
                Cancel
              </Button>
              </>
            )}
            </Col>
            <Col className="text-right d-flex align-items-center justify-content-end gap-2">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  const newSearchQuery = e.target.value;
                  setSearchQuery(newSearchQuery);
                  setCurrentPage(1);
                  
                  // Update URL with search query
                  const searchParams = new URLSearchParams(location.search);
                  if (newSearchQuery.trim() === "") {
                    searchParams.delete('search');
                  } else {
                    searchParams.set('search', newSearchQuery);
                  }
                  // Preserve platform and activity filters if they exist
                  if (selectedPlatform !== "all") {
                    searchParams.set('platform', selectedPlatform);
                  }
                  if (selectedActivity !== "all") {
                    searchParams.set('activity', selectedActivity);
                  }
                  navigate({ search: searchParams.toString() }, { replace: true });
                }}
                placeholder="Search by agent or function"
                className="form-control"
                style={{ maxWidth: '240px', marginRight: '10px' }}
              />
            <select
                value={selectedActivity}
                onChange={handleActivityChange}
                className="form-control"
                style={{ width: '180px', minWidth: '140px',marginRight: '10px'}}
                disabled={selectedPlatform === "all" || activities.length === 0}
              >
                <option value="all">All Functions</option>
                {activities.map(activity => (
                  <option key={activity.id} value={activity.id.toString()}>
                    {activity.activityName}
                  </option>
                ))}
              </select>
              <select
                value={selectedPlatform}
                onChange={handlePlatformChange}
                className="form-control"
                style={{ width: '180px', minWidth: '140px',marginRight: '10px' }}
              >
                <option value="all">All Platforms</option>
                {platforms.map(platform => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name}
                  </option>
                ))}
              </select>
              {!isViewer && !isSequenceMode && (
                <Button
                  color="primary"
                  onClick={handleCreateClick}
                  className="btn-custom-primary"
                >
                  Create New 
                </Button>
              )}
            </Col>
          </Row>
        </CardHeader>
        {assistants.length > 0 ? (
        <DragDropContext onDragEnd={handleSequenceDragEnd}>
        <Table className="align-items-center table-flush mb-0" style={tableStyles.table}>
          <thead className="thead-light">
            <tr>
              <th style={{...tableStyles.th, width: '5%'}}>ID</th>
              {isSequenceMode && <th style={{...tableStyles.th, width: '5%'}}>SEQ.</th>}
              <th 
                style={{...tableStyles.th, width: '18%', cursor: 'pointer'}} 
                onClick={() => handleSort('name')}
              >
                AI AGENT NAME {getSortIcon('name')}
              </th>
              <th style={{...tableStyles.th, width: '15%'}}>DISPLAY PATH</th>
              {/* <th style={{...tableStyles.th, width: '10%'}}>STATUS</th> */}
              <th style={{...tableStyles.th, width: '10%'}}>PUBLISH</th>
              <th style={{...tableStyles.th, width: '10%'}}>PLATFORM</th>
              <th style={{...tableStyles.th, width: '10%'}}>Function</th>
              <th style={{...tableStyles.th,width:'10%'}}>Depends On</th>
              {/* <th style={{...tableStyles.th, width: '12%'}}>EXPIRY DATE</th> */}
              <th style={{...tableStyles.th, width: '10%'}}>CREATED AT</th>
              {!isViewer && <th style={{...tableStyles.th, width: '8%'}}>ACTIONS</th>}
            </tr>
          </thead>
          {isSequenceMode ? (
            <Droppable droppableId="assistants">
              {(provided) => (
                <tbody ref={provided.innerRef} {...provided.droppableProps}>
                  {currentRecords.map((item, index) => (
                    <Draggable key={String(item.id)} draggableId={String(item.id)} index={index}>
                      {(providedDraggable, snapshot) => (
                        <tr
                          ref={providedDraggable.innerRef}
                          {...providedDraggable.draggableProps}
                          {...providedDraggable.dragHandleProps}
                          style={{
                            ...providedDraggable.draggableProps.style,
                            backgroundColor: snapshot.isDragging ? '#f8f9fa' : undefined,
                          }}
                        >
                          <td style={{...tableStyles.td, width: '8%'}}>
                            <span style={{ cursor: 'grab', marginRight: 8 }}>
                              <i className="fas fa-grip-vertical" />
                            </span>
                            {indexOfFirstRecord + index + 1}
                          </td>
                          {isSequenceMode && <td style={{...tableStyles.td, width: '8%'}}>
                            <span style={{ 
                              fontSize: '0.9rem', 
                              fontWeight: 'bold'
                            }}>
                              {originalSequenceValues[item.id]}
                            </span>
                          </td>}
                          <td style={{...tableStyles.td, width: '20%'}}>{item.name}</td>
                          <td style={{...tableStyles.td, width: '20%'}}>
                            {formatDisplayPath(item.displayPath)}
                          </td>
                          {/* <td style={{...tableStyles.td, width: '10%'}}>
                            {getStatusBadge(item)}
                          </td> */}
                          <td style={{...tableStyles.td, width: '10%'}}>
                            {getPublishStatusBadge(item)}
                          </td>
                          <td style={{...tableStyles.td, width: '10%'}}>
                            {item.platformNames && item.platformNames.length > 0 ? (
                              <div className="d-flex flex-wrap gap-1">
                                {item.platformNames.map((platformName, index) => (
                                  <Badge key={index} color="primary" className="small">
                                    {platformName}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td style={{...tableStyles.td, width: '10%'}}>
                            {getActivityName(item.activityName, activities)}
                          </td>
                          <td style={{...tableStyles.td, width: '10%', whiteSpace: 'normal', wordWrap: 'break-word'}}>
                            {getDependencyNames(item.prerequisite_agents, assistants)}
                          </td>
                          {/* <td style={{...tableStyles.td, width: '12%'}}>
                            <span style={{ fontSize: '0.8rem' }}>
                              {item.expireDate ? new Date(item.expireDate).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              }) : 'Never'}
                            </span>
                          </td> */}
                          <td style={{...tableStyles.td, width: '10%'}}>
                            <span style={{ fontSize: '0.8rem' }}>
                              {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              }) : '-'}
                            </span>
                          </td>
                          {!isViewer && (
                            <td style={{...tableStyles.td, width: '8%'}}>
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
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </tbody>
              )}
            </Droppable>
          ) : (
            <tbody>
              {currentRecords.map((item, index) => (
                <tr key={item.id}>
                  <td style={{...tableStyles.td, width: '8%'}}>{indexOfFirstRecord + index + 1}</td>
                  {isSequenceMode && <td style={{...tableStyles.td, width: '8%'}}>
                    <span style={{ 
                      fontSize: '0.9rem', 
                    }}>
                      {item.sequence }
                    </span>
                  </td>}
                  <td style={{...tableStyles.td, width: '20%'}}>{item.name}</td>
                  <td style={{...tableStyles.td, width: '20%'}}>
                    {formatDisplayPath(item.displayPath)}
                  </td>
                  {/* <td style={{...tableStyles.td, width: '10%'}}>
                    {getStatusBadge(item)}
                  </td> */}
                  <td style={{...tableStyles.td, width: '10%'}}>
                    {getPublishStatusBadge(item)}
                  </td>
                  <td style={{...tableStyles.td, width: '10%'}}>
                    {item.platformNames && item.platformNames.length > 0 ? (
                      <div className="d-flex flex-wrap gap-1">
                        {item.platformNames.map((platformName, index) => (
                          <span key={index} >{platformName}</span>
                            
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={{...tableStyles.td, width: '10%'}}>
                    {/* {console.log(item)} */}
                    {item.activityName || '-'}
                  </td>
                  <td style={{...tableStyles.td, width: '10%', whiteSpace: 'normal', wordWrap: 'break-word'}}>
                    {getDependencyNames(item.prerequisite_agents, assistants)}
                  </td>
                  {/* <td style={{...tableStyles.td, width: '12%'}}>
                    <span style={{ fontSize: '0.8rem' }}>
                      {item.expireDate ? new Date(item.expireDate).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      }) : 'Never'}
                    </span>
                  </td> */}
                  <td style={{...tableStyles.td, width: '10%'}}>
                    <span style={{ fontSize: '0.8rem' }}>
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      }) : '-'}
                    </span>
                  </td>
                  {!isViewer && (
                    <td style={{...tableStyles.td, width: '8%'}}>
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
                             <DropdownItem onClick={() => handleAddDependencyClick(item)} style={{ color: '#8898aa', display: 'flex', alignItems: 'center' }}>
                               <i className="fas fa-plus text-warning mr-2" />
                               <span>Add Dependency</span>
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
          )}
        </Table>
        {!isSequenceMode && selectedPlatform === "all" && (
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
        )}
        </DragDropContext>
        ): (
          <div className="text-center py-4">
            <h5 className="text-muted">No AI Agents Found</h5>
          </div>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            {/* <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>AI AGENTS</h3> */}
            <TableSkeleton />
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
            <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>PLATFORM AGENT STUDIO</h3>
            { renderTable()}
           
          </div>
        </Row>

        {/* Delete Confirmation Modal */}
        <Modal isOpen={deleteModalOpen} toggle={handleDeleteCancel} centered>
          <ModalHeader className="border-0 pb-0" toggle={handleDeleteCancel}>
            Delete AI Agent?
          </ModalHeader>
          <ModalBody className="pt-0">
            <p className="text-left mb-4">Are you sure you want to delete this AI Agent?</p>
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

      {/* Dependency Modal */}
        <Modal
          isOpen={isDependencyModalOpen}
          toggle={handleDependencyModalClose}
          size="md"
          centered
        >
          <ModalHeader toggle={handleDependencyModalClose}>
            Add Assistant Dependency
          </ModalHeader>
          <ModalBody>
            {selectedAssistantForDependency && (
              <div className="mb-3">
                <strong>Assistant:</strong> {selectedAssistantForDependency.name}
              </div>
            )}

            {/* Simple Dependencies Selection */}
            <div className="mb-4">
              <Label>Select Assistants</Label>
              <div style={{ border: '1px solid #ccc', padding: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                {assistants
                  .filter(assistant => assistant.id !== selectedAssistantForDependency?.id)
                  .map(assistant => (
                    <div key={assistant.id} style={{ marginBottom: '8px' }}>
                      <input
                        type="checkbox"
                        id={`dependency-${assistant.id}`}
                        checked={selectedDependencies.includes(assistant.id)}
                        onChange={(e) => handleDependencyCheckboxChange(assistant.id, e.target.checked)}
                        style={{ marginRight: '8px' }}
                      />
                      <label htmlFor={`dependency-${assistant.id}`} style={{ cursor: 'pointer' }}>
                        {assistant.name}
                      </label>
                    </div>
                  ))
                }
                {assistants.filter(assistant => assistant.id !== selectedAssistantForDependency?.id).length === 0 && (
                  <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                    No other assistants available
                  </div>
                )}
              </div>
            </div>

            {/* Selected Dependencies */}
            <div className="mb-4">
              <Label>Selected Assistants ({selectedDependencies.length})</Label>
              {selectedDependencies.length > 0 ? (
                <div>
                  {selectedDependencies.map((depId, index) => {
                    const depAssistant = assistants.find(a => a.id === depId);
                    return (
                      <div key={index} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        padding: '5px 10px',
                        marginBottom: '5px',
                        backgroundColor: '#f5f5f5',
                        border: '1px solid #ddd'
                      }}>
                        <span>{depAssistant ? depAssistant.name : `Assistant ${depId}`}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDependency(depId)}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: '#999',
                            cursor: 'pointer'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#666', padding: '10px', textAlign: 'center' }}>
                  No dependencies selected
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={handleDependencyModalClose}>
              Cancel
            </Button>
            <Button color="primary" onClick={handleDependencySave} disabled={loading}>
              {loading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save Dependencies'
              )}
            </Button>
          </ModalFooter>
        </Modal>
    </>
  );
};

export default AllAssistants;