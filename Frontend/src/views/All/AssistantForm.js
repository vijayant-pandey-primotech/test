import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardHeader,
  Container,
  Row,
  Form,
  FormGroup,
  Input,
  Button,
  Label,
  Col,
  CardBody,
  Badge,
  Alert,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Table,
  Toast,
  ToastHeader,
  ToastBody,
} from "reactstrap";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { IoClose, IoCheckmarkCircle } from "react-icons/io5";
import { FaGripVertical, FaRegFileAlt, FaTrash } from "react-icons/fa";
import { BsArrowRight, BsArrowLeft, BsEmojiSmile } from "react-icons/bs";
import EmojiPicker from "emoji-picker-react";
import axiosInstance from "utils/axiosConfig";
import { getAuthToken } from "utils/authUtils";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import assistantService from "services/assistantService";
import dynamicFunctionsService from "services/dynamicFunctionsService";
import platformService from "services/platformService";
import widgetService from "services/widgetService";
import "../../assets/css/AssistantForm.css";

// Selection validation utility functions for platform changes
const validateAndPreserveSelections = (
  existingSelections,
  newAvailableData,
  platforms
) => {
  const { stories: existingStories, chapters: existingChapters, items: existingItems } = existingSelections;
  const { stories: newStories, chapters: newChapters, items: newItems } = newAvailableData;

  // Validate and preserve stories
  const preservedStories = existingStories.filter(storyId => 
    newStories.some(story => story.storyId.toString() === storyId)
  );
  const removedStories = existingStories.filter(storyId => 
    !newStories.some(story => story.storyId.toString() === storyId)
  );

  // Validate and preserve chapters (must belong to preserved stories)
  const preservedChapters = existingChapters.filter(chapterId => {
    const chapter = newChapters.find(c => c.chapterId.toString() === chapterId);
    return chapter && preservedStories.includes(chapter.storyId.toString());
  });
  const removedChapters = existingChapters.filter(chapterId => {
    const chapter = newChapters.find(c => c.chapterId.toString() === chapterId);
    return !chapter || !preservedStories.includes(chapter.storyId?.toString());
  });

  // Validate and preserve items (must belong to preserved chapters)
  const preservedItems = existingItems.filter(item => {
    const itemExists = newItems.some(i => i.itemId === item.itemId);
    const chapterPreserved = preservedChapters.includes(item.chapterId.toString());
    return itemExists && chapterPreserved;
  });
  const removedItems = existingItems.filter(item => {
    const itemExists = newItems.some(i => i.itemId === item.itemId);
    const chapterPreserved = preservedChapters.includes(item.chapterId.toString());
    return !itemExists || !chapterPreserved;
  });

  return {
    preservedStories,
    removedStories,
    preservedChapters,
    removedChapters,
    preservedItems,
    removedItems,
    totalPreserved: preservedStories.length + preservedChapters.length + preservedItems.length,
    totalRemoved: removedStories.length + removedChapters.length + removedItems.length
  };
};

// MultiSelectDropdown Component for Goals selection
const GoalsMultiSelectDropdown = ({
  options = [],
  selectedValues = [],
  onChange,
  disabled = false,
  placeholder = "Select goals",
  loading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = (option) => {
    if (disabled) return;
    
    const optionId = option.id.toString();
    const isSelected = selectedValues.some(v => v.goalId === optionId);
    let newValues;
    
    if (isSelected) {
      // Remove this goal
      newValues = selectedValues.filter((v) => v.goalId !== optionId);
    } else {
      // Add this goal
      newValues = [...selectedValues, {
        goalId: optionId,
        modeId: null,
        isAllowed: true,
        goalName: option.name,
      }];
    }
    
    onChange(newValues);
  };

  const handleRemoveTag = (e, goalId) => {
    e.stopPropagation();
    const newValues = selectedValues.filter((v) => v.goalId !== goalId);
    onChange(newValues);
  };

  const handleToggleAllowed = (e, goalId) => {
    e.stopPropagation();
    const newValues = selectedValues.map(v => 
      v.goalId === goalId ? { ...v, isAllowed: !v.isAllowed } : v
    );
    onChange(newValues);
  };

  return (
    <div className="position-relative" ref={dropdownRef}>
      <div
        onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
        className={`form-control d-flex align-items-center justify-content-between flex-wrap gap-1`}
        style={{ 
          minHeight: '42px',
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          backgroundColor: disabled ? '#e9ecef' : '#fff',
          padding: '6px 12px',
        }}
      >
        <div className="d-flex flex-wrap gap-1 align-items-center flex-grow-1" style={{ minHeight: '28px' }}>
          {loading ? (
            <span className="text-muted">Loading...</span>
          ) : selectedValues.length === 0 ? (
            <span className="text-muted">{placeholder}</span>
          ) : (
            selectedValues.map((value) => {
              const goal = options.find(o => o.id.toString() === value.goalId);
              const displayName = goal?.name || value.goalName || value.goalId;
              return (
                <span
                  key={value.goalId}
                  className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded text-white mr-1"
                  style={{ 
                    backgroundColor: value.isAllowed ? '#3A6D8C' : '#dc3545',
                    fontSize: '12px',
                    fontWeight: '500',
                    maxWidth: '180px',
                  }}
                  title={`${displayName} - ${value.isAllowed ? 'Allowed' : 'Not Allowed'}`}
                >
                  <span className="text-truncate" style={{ maxWidth: '120px' }}>{displayName}</span>
                  {!disabled && (
                    <>
                      {/* <button
                        type="button"
                        onClick={(e) => handleToggleAllowed(e, value.goalId)}
                        className="btn btn-link p-0 text-white"
                        style={{ fontSize: '10px', lineHeight: 1 }}
                        title={value.isAllowed ? 'Click to set Not Allowed' : 'Click to set Allowed'}
                      >
                        {value.isAllowed ? '✓' : '✗'}
                      </button> */}
                      <button
                        type="button"
                        onClick={(e) => handleRemoveTag(e, value.goalId)}
                        className="btn btn-link p-0 text-white"
                        style={{ fontSize: '14px', lineHeight: 1 }}
                      >
                        <IoClose />
                      </button>
                    </>
                  )}
                </span>
              );
            })
          )}
        </div>
        <span style={{ fontSize: '12px', color: '#6c757d' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </div>

      {isOpen && !disabled && !loading && (
        <div 
          className="position-absolute w-100 bg-white border rounded shadow-sm"
          style={{ 
            zIndex: 1050, 
            maxHeight: '250px', 
            overflowY: 'auto',
            marginTop: '4px',
          }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-muted">No goals available</div>
          ) : (
            options.map((option) => {
              const optionId = option.id.toString();
              const isSelected = selectedValues.some(v => v.goalId === optionId);
              const selectedItem = selectedValues.find(v => v.goalId === optionId);
              
              return (
                <div
                  key={option.id}
                  onClick={() => handleToggle(option)}
                  className="d-flex align-items-center gap-2 px-3 py-2"
                  style={{ 
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#f0f7ff' : 'transparent',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#e0efff' : '#f8f9fa'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#f0f7ff' : 'transparent'}
                >
                  <div
                    className="d-flex align-items-center justify-content-center mr-1"
                    style={{
                      width: '18px',
                      height: '18px',
                      border: `2px solid ${isSelected ? '#3A6D8C' : '#ced4da'}`,
                      borderRadius: '4px',
                      backgroundColor: isSelected ? '#3A6D8C' : '#fff',
                    }}
                  >
                    {isSelected && (
                      <span style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>✓</span>
                    )}
                  </div>
                  <span className="flex-grow-1" style={{ fontSize: '14px' }}>
                    {option.name}
                  </span>
                  {/* {isSelected && selectedItem && (
                    <Badge 
                      color={selectedItem.isAllowed ? 'success' : 'danger'} 
                      pill
                      style={{ fontSize: '10px' }}
                    >
                      {selectedItem.isAllowed ? 'Allowed' : 'Not Allowed'}
                    </Badge>
                  )} */}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

const AssistantForm = () => {
  const { id } = useParams(); // Get assistant ID from URL if in edit mode
  const location = useLocation();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const isViewer = localStorage.getItem("userRole") === "viewer";

  // Helper function to safely get selected platforms array
  const getSelectedPlatforms = () => {
    return Array.isArray(formData.selectedPlatforms) ? formData.selectedPlatforms : [];
  };

  const [formData, setFormData] = useState({
    assistantName: "",
    displayPath: ["Gather_Assist"],
    selectedPlatforms: [], // Add selected platforms array
    selectedActivity: null, // Add selected activity (optional, single selection)
    selectedExperienceMode: null, // Selected experience mode (kept for backward compatibility)
    selectedGoal: null, // Selected platform goal (kept for backward compatibility)
    personaRules: [], // New: Array of persona rules [{goalId, modeId, isAllowed}, ...]
    selectedItems: [],
    expiryDate: "",
    assistantDescription: "",
    firstMessage: "Hi there! I'm your Assistant. I'm here to help you gather and organize important information. Are you ready to get started? You can type 'yes'.",
    callToAction: "",
    selectedImage:
      "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
    customImage: null,
    isCustomImage: false, // Add flag to track if current image is custom
    createAsWidget: false, // Add widget option
    widgetName: "", // Widget name
    widgetKey: "assistant_progress", // Fixed widget category
    widgetDisplayPath: {
      page: "Home Screen",
      section: "Left Panel"
    }, 
    isLoop: false,
    publishStatus: "Draft", // Draft or Published
    alternateName: "", // Alternate name for the assistant
    alternateInfo: "", // Alternate info/description
  });
  const [stories, setStories] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [items, setItems] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [platforms, setPlatforms] = useState([]); // Add platforms state
  const [activities, setActivities] = useState([]); // Add activities state
  const [activitiesLoading, setActivitiesLoading] = useState(false); // Loading state for activities
  const [masterWidgetName, setMasterWidgetName] = useState("Assistant Progress"); // Master widget name
  const [experienceModes, setExperienceModes] = useState([]); // Experience modes state
  const [experienceModesLoading, setExperienceModesLoading] = useState(false);
  const [platformGoals, setPlatformGoals] = useState([]); // Platform goals state
  const [platformGoalsLoading, setPlatformGoalsLoading] = useState(false);
  const [selectedStories, setSelectedStories] = useState([]);
  const [selectedChapters, setSelectedChapters] = useState([]);
  
  // Debug wrapper for setSelectedChapters
  const setSelectedChaptersDebug = (chapters) => {
    // console.log("setSelectedChapters called with:", chapters, "Stack trace:", new Error().stack);
    setSelectedChapters(chapters);
  };
  const [selectedItem, setSelectedItem] = useState("");
  const [itemQuestion, setItemQuestion] = useState("");
  const [useCustomQuestion, setUseCustomQuestion] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const token = getAuthToken();
  const [previewModal, setPreviewModal] = useState(false);
  const [showWidgetModal, setShowWidgetModal] = useState(false);
  const [toast, setToast] = useState({
    isOpen: false,
    message: "",
    type: "success",
    position: "top",
  });

  // Add new state variables for search
  const [storySearch, setStorySearch] = useState("");
  const [chapterSearch, setChapterSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  
  // Platform search and dropdown state
  const [platformSearchTerm, setPlatformSearchTerm] = useState("");
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  
  // Activity search and dropdown state
  const [activitySearchTerm, setActivitySearchTerm] = useState("");
  const [showActivityDropdown, setShowActivityDropdown] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [basicDetailsComplete, setBasicDetailsComplete] = useState(false);

  const [errors, setErrors] = useState({
    displayPath: "",
    expiryDate: "",
    customQuestions: "", // Add validation for custom questions
    firstMessage: "",
    callToAction: "",
  });

  // State for inline editing of selected item question
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editingQuestionValue, setEditingQuestionValue] = useState("");
  const textareaRefs = useRef({});
  const contentEditableRef = useRef({});

  // Emoji picker state for firstMessage
  const [showFirstMessageEmojiPicker, setShowFirstMessageEmojiPicker] = useState(false);
  const firstMessageEmojiPickerRef = useRef(null);
  const firstMessageTextareaRef = useRef(null);

  const [caretPositions, setCaretPositions] = useState({});

  const [revertModal, setRevertModal] = useState({
    isOpen: false,
    item: null,
  });

  const handleBack = () => {
    const searchParams = new URLSearchParams(location.search);
    const platform = searchParams.get('platform');
    const activity = searchParams.get('activity');
    const search = searchParams.get('search');
    let target = '/admin/ai-agents';
    const params = new URLSearchParams();
    if (platform) params.set('platform', platform);
    if (activity) params.set('activity', activity);
    if (search) params.set('search', search);
    
    if (params.toString()) {
      target += `?${params.toString()}`;
    }
    navigate(target);
  };

  // Enhanced policy modal state to include functions and custom questions
  const [policyModal, setPolicyModal] = useState({
    isOpen: false,
    itemName: "",
    policies: [],
    itemId: null, // Add itemId to track which item's policies we're viewing
  });

  // Add local policy cache to preserve modifications
  const [policyCache, setPolicyCache] = useState({});

  // Add loading state for initial data fetch
  const [initialLoading, setInitialLoading] = useState(isEditMode);

  // Add loading state for image validation
  const [imageValidationLoading, setImageValidationLoading] = useState(false);

  // Add loading state for platform changes
  const [platformChangeInProgress, setPlatformChangeInProgress] = useState(false);

  // Platform change warning modal state
  const [platformChangeWarningModal, setPlatformChangeWarningModal] = useState({
    isOpen: false,
    selectedItemsCount: 0
  });

  // Agent actions state
  const [dynamicFunctions, setDynamicFunctions] = useState([]);
  const [dynamicFunctionsLoading, setDynamicFunctionsLoading] = useState(false);

  // Agent Actions modal state
  const [agentFunctionsModal, setAgentFunctionsModal] = useState({
    isOpen: false,
    selectedItemIndex: null,
    selectedItem: null,
  });

  // Add Function modal state
  const [addFunctionModal, setAddFunctionModal] = useState({
    isOpen: false,
    itemIndex: null,
    newFunctionData: {
      event: "before",
      functionId: "",
      displayType: "radio",
    },
  });

  // Edit Function modal state
  const [editFunctionModal, setEditFunctionModal] = useState({
    isOpen: false,
    itemIndex: null,
    functionIndex: null,
    functionData: {
      event: "before",
      functionId: "",
      displayType: "radio",
      order: 1,
    },
  });

  // Function configuration modal state
  const [functionModal, setFunctionModal] = useState({
    isOpen: false,
    itemIndex: null,
    functionIndex: null,
    functionData: {
      event: "before",
      functionId: "",
      order: 1,
    },
  });

  // Add new state variables for policy functions and custom questions
  const [policyFunctionsModal, setPolicyFunctionsModal] = useState({
    isOpen: false,
    selectedPolicyIndex: null,
    selectedPolicy: null,
  });

  // Add Policy Function modal state
  const [addPolicyFunctionModal, setAddPolicyFunctionModal] = useState({
    isOpen: false,
    policyIndex: null,
    newFunctionData: {
      event: "before",
      functionId: "",
      displayType: "radio",
    },
  });

  // Edit Policy Function modal state
  const [editPolicyFunctionModal, setEditPolicyFunctionModal] = useState({
    isOpen: false,
    policyIndex: null,
    functionIndex: null,
    functionData: {
      event: "before",
      functionId: "",
      displayType: "radio",
      order: 1,
    },
  });

  // State for policy custom questions editing
  const [editingPolicyQuestionId, setEditingPolicyQuestionId] = useState(null);
  const [editingPolicyQuestionValue, setEditingPolicyQuestionValue] =
    useState("");

  // Ref for policy question contenteditable elements
  const policyContentEditableRef = useRef({});

  // State for policy revert modal
  const [policyRevertModal, setPolicyRevertModal] = useState({
    isOpen: false,
    policy: null,
  });

  // Add condition modal state
  const [conditionModal, setConditionModal] = useState({
    isOpen: false,
    policyIndex: null,
    selectedPolicy: null,
  });

  // Add condition form state
  const [conditionForm, setConditionForm] = useState({
    dependsOn: "",
    value: "yes",
    operator: "Equal",
  });

  // Add condition list state for the current policy
  const [currentConditions, setCurrentConditions] = useState([]);

  // Add condition operators
  const conditionOperators = [
    { value: "Equal", label: "Equal to" },
    { value: "NotEqual", label: "Not equal to" },
    { value: "Greater", label: "Greater than" },
    { value: "Less", label: "Less than" },
    { value: "GreaterEqual", label: "Greater than or equal to" },
    { value: "LessEqual", label: "Less than or equal to" },
  ];

  // Add condition values
  const conditionValues = [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ];
  // Fetch agent actions
  const fetchDynamicFunctions = async () => {
    try {
      setDynamicFunctionsLoading(true);
      const response = await dynamicFunctionsService.getDynamicFunctions();
      if (response.data.status === 200) {
        setDynamicFunctions(response.data.body || []);
      }
    } catch (error) {
      console.error("Error fetching agent actions:", error);
      showToast("Failed to fetch agent actions", "error");
    } finally {
      setDynamicFunctionsLoading(false);
    }
  };

  // Fetch platforms
  const fetchPlatforms = async () => {
    try {
      const response = await platformService.getAllPlatforms();
      if (response.status === 200) {
        setPlatforms(response.body || []);
      }
    } catch (error) {
      console.error("Error fetching platforms:", error);
      showToast("Failed to fetch platforms", "error");
    }
  };

  // Fetch activities for a platform
  const fetchActivities = async (platformId) => {
    if (!platformId) {
      setActivities([]);
      return;
    }
    
    setActivitiesLoading(true);
    try {
      const API_URL = process.env.REACT_APP_API_URL;
      const response = await axiosInstance.get(`${API_URL}/${platformId}/activities`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      if (response.data && response.data.status === 200) {
        setActivities(response.data.body || []);
      } else {
        setActivities([]);
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  };

  // Fetch experience modes for a platform
  const fetchExperienceModes = async (platformId) => {
    if (!platformId) {
      setExperienceModes([]);
      return;
    }
    
    setExperienceModesLoading(true);
    try {
      const API_URL = process.env.REACT_APP_PLATFORM_API_URL;
      const response = await axiosInstance.get(`${API_URL}/experience-modes`, {
        params: { platformId },
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      if (response.data && response.data.status === 200) {
        setExperienceModes(response.data.body || []);
      } else {
        setExperienceModes([]);
      }
    } catch (error) {
      console.error("Error fetching experience modes:", error);
      setExperienceModes([]);
    } finally {
      setExperienceModesLoading(false);
    }
  };

  // Fetch platform goals for a platform
  const fetchPlatformGoals = async (platformId) => {
    if (!platformId) {
      setPlatformGoals([]);
      return;
    }
    
    setPlatformGoalsLoading(true);
    try {
      const API_URL = process.env.REACT_APP_PLATFORM_API_URL;
      const response = await axiosInstance.get(`${API_URL}/platform-goals`, {
        params: { platformId },
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`
        }
      });
      if (response.data && response.data.status === 200) {
        setPlatformGoals(response.data.body || []);
      } else {
        setPlatformGoals([]);
      }
    } catch (error) {
      console.error("Error fetching platform goals:", error);
      setPlatformGoals([]);
    } finally {
      setPlatformGoalsLoading(false);
    }
  };

  // Fetch agent actions on component mount
  // Fetch master widget name
  const fetchMasterWidgetName = async () => {
    try {
      const response = await widgetService.getAllWidgets();
      if (response.status === 200) {
        const assistantProgressWidget = response.body.data?.find(widget => widget.widgetKey === 'assistant_progress');
        if (assistantProgressWidget) {
          setMasterWidgetName(assistantProgressWidget.widgetName);
        }
      }
    } catch (error) {
      console.error("Error fetching master widget name:", error);
      // Keep default name "Assistant Progress"
    }
  };

  useEffect(() => {
    fetchDynamicFunctions();
    fetchPlatforms(); // Fetch platforms on mount
    fetchMasterWidgetName(); // Fetch master widget name
  }, []);

  // Handle clicking outside platform dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      const dropdown = document.getElementById("platform-dropdown-container");
      const input = document.getElementById("platform-search-input");

      if (
        dropdown &&
        input &&
        !dropdown.contains(event.target) &&
        !input.contains(event.target)
      ) {

        setShowPlatformDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);

    };
  }, []);

  // Handle clicking outside activity dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      const dropdown = document.getElementById("activity-dropdown-container");
      const input = document.getElementById("activity-search-input");
      if (
        dropdown &&
        input &&
        !dropdown.contains(event.target) &&
        !input.contains(event.target)
      ) {
        setShowActivityDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle clicking outside emoji picker for firstMessage
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        firstMessageEmojiPickerRef.current &&
        !firstMessageEmojiPickerRef.current.contains(event.target)
      ) {
        setShowFirstMessageEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Auto-sync policy changes back to selectedItems whenever policy modal policies change
  useEffect(() => {
    if (
      policyModal.isOpen &&
      policyModal.itemId &&
      policyModal.policies.length >= 0
    ) {
      syncPoliciesToSelectedItems(policyModal.itemId, policyModal.policies);
    }
  }, [policyModal.policies]);

  // Fetch assistant data if in edit mode
  useEffect(() => {
    const fetchAssistantData = async () => {
      if (!isEditMode) return;

      try {
        setInitialLoading(true);
        const response = await axiosInstance.get(
          `${process.env.REACT_APP_API_URL}/assistant/${id}`,
          {
            headers: {
              Authorization: `Bearer ${getAuthToken()}`,
            },
          }
        );

        if (response.data.status === 200) {
          const assistantData = response.data.body;
          console.log('Full Assistant Data:', assistantData);
          console.log('Widget Mapping Data:', assistantData.WidgetMapping);
          // console.log('Assistant Image URL:', assistantData.image);

          let targetValue;
          try {
            targetValue =
              typeof assistantData.targetValue === "string"
                ? JSON.parse(assistantData.targetValue)
                : assistantData.targetValue;

            // console.log('Parsed Target Value:', targetValue);
          } catch (parseError) {
            console.error("Error parsing targetValue:", parseError);
            showToast("Error parsing assistant data", "error");
            navigate("/admin/ai-agents");
            return;
          }

          if (!targetValue || !targetValue.clusteredItems) {
            // console.error("Invalid targetValue structure:", targetValue);
            showToast("Invalid assistant data structure", "error");
            navigate("/admin/ai-agents");
            return;
          }

          // Fetch stories based on selected platforms in edit mode
          const selectedPlatforms = (assistantData.platforms || []).map(p => p.toString());
          // console.log("Selected platforms:", selectedPlatforms);
          let allStories = [];

          try {
            if (selectedPlatforms.length > 0) {
              // console.log("Fetching stories for platforms:", selectedPlatforms);
              const storiesResponse =
                await platformService.getStoriesByPlatforms(
                  selectedPlatforms,
                  false
                );
              // console.log("Stories response:", storiesResponse);
              if (storiesResponse.status === 200 && storiesResponse.body) {
                allStories = storiesResponse.body;
                // console.log("Fetched stories:", allStories);
              }
            } else {
              console.warn("No platforms specified in edit mode");
              allStories = [];
            }
          } catch (error) {
            console.error(
              "Failed to fetch platform-specific stories in edit mode:",
              error
            );
            allStories = [];
            showToast(
              "Failed to fetch stories for selected platforms",
              "error"
            );
          }

          setStories(allStories);

          // Get unique story IDs and set them as selected
          const storyIds = [
            ...new Set(targetValue.clusteredItems.map((item) => item.storyId)),
          ];
          // console.log("Story IDs from clustered items:", storyIds);

          // Fetch chapters for selected stories using platform-aware API
          let allChapters = [];
          try {
            if (selectedPlatforms.length > 0 && storyIds.length > 0) {
              // console.log("Fetching chapters for story IDs:", storyIds, "and platforms:", selectedPlatforms);
              const chaptersResponse =
                await platformService.getChaptersByPlatform(
                  storyIds,
                  selectedPlatforms
                );
              // console.log("Chapters response:", chaptersResponse);
              if (chaptersResponse.status === 200 && chaptersResponse.body) {
                allChapters = chaptersResponse.body.map((chapter) => ({
                ...chapter,
                  storyId: chapter.storyId.toString(),
                  storyName: chapter.storyName || "Unknown Story",
                }));
                // console.log("Fetched chapters:", allChapters);
              }
            }
          } catch (error) {
            console.error(
              "Failed to fetch platform-specific chapters in edit mode:",
              error
            );
            allChapters = [];
          }

          // console.log("Setting chapters in state (fetchAssistantData):", allChapters);
          setChapters(allChapters);

          // Get unique chapter IDs and set them as selected
          const chapterIds = [
            ...new Set(
              targetValue.clusteredItems.map((item) => item.chapterId)
            ),
          ];

          // Set selections after all data is loaded
          const selectedStoryIds = storyIds.map((id) => id.toString());
          const selectedChapterIds = chapterIds.map((id) => id.toString());
          setSelectedStories(selectedStoryIds);
          setSelectedChaptersDebug(selectedChapterIds);
          
          // Force a re-render to ensure selections are applied
          setTimeout(() => {
            setSelectedChaptersDebug(selectedChapterIds);
          }, 100);

          // Fetch items for selected chapters using platform-aware API
          let allItems = [];
          try {
            if (selectedPlatforms.length > 0 && chapterIds.length > 0) {
              const itemsResponse = await platformService.getItemsByPlatform(
                chapterIds,
                selectedPlatforms
              );
              if (itemsResponse.status === 200 && itemsResponse.body) {
                allItems = itemsResponse.body.map((item) => ({
                ...item,
                  chapterId: item.chapterId.toString(),
                  chapterName: item.chapterName || "Unknown Chapter",
                  storyId: item.storyId.toString(),
                  storyName: item.storyName || "Unknown Story",
                }));
              }
            }
          } catch (error) {
            console.error(
              "Failed to fetch platform-specific items in edit mode:",
              error
            );
            allItems = [];
          }

          setItems(allItems);

          // Fetch activities, experience modes, and goals for the selected platform in edit mode
          const selectedPlatformsList = (assistantData.platforms || []).map(p => p.toString());
          if (selectedPlatformsList.length > 0) {
            fetchActivities(selectedPlatformsList[0]);
            fetchExperienceModes(selectedPlatformsList[0]);
            fetchPlatformGoals(selectedPlatformsList[0]);
          }

          // When setting form data, use the image from the database
          // Transform persona rules from API response
          // The API returns goalId as number, we convert to string for consistent comparison with platformGoals
          const personaRulesFromApi = (assistantData.personaRules || []).map(rule => ({
            id: rule.id,
            goalId: rule.goalId != null ? String(rule.goalId) : null,
            modeId: rule.modeId != null ? String(rule.modeId) : null,
            isAllowed: rule.isAllowed !== undefined ? rule.isAllowed : true,
            goalName: rule.Goal?.name || null,
            modeName: rule.Mode?.name || null,
          }));

          const formDataToSet = {
            assistantName: assistantData.assistantName || "",
            displayPath: targetValue.displayPath || ["Gather_Assist"],
            selectedPlatforms: selectedPlatformsList, // Convert platform IDs to strings
            selectedActivity: assistantData.activityId ? assistantData.activityId.toString() : null, // Load activity id if present
            personaRules: personaRulesFromApi, // Load persona rules from API
            firstMessage: assistantData.firstMessage || "Hi there! I'm your Assistant. I'm here to help you gather and organize important information. Are you ready to get started? You can type 'yes'.",
            selectedItems: targetValue.clusteredItems.map((item, index) => {
              const story = allStories.find((s) => s.storyId === item.storyId);
              const chapter = allChapters.find(
                (c) => c.chapterId === item.chapterId
              );
              const itemDetails = allItems.find(
                (i) => i.itemId === item.itemId
              );

              return {
                storyId: item.storyId,
                chapterId: item.chapterId,
                itemId: item.itemId,
                sequence: item.sequence,
                question: item.question,
                originalQuestion: itemDetails?.question || item.question || "", // Set original question from item details
                useCustomQuestion: item.useCustomQuestion,
                functionFlow: item.functionFlow || [], // Load function flow from existing data
                policies: item.policies || [], // Load policies from existing data
                uniqueId: `${Date.now()}-${Math.random()
                  .toString(36)
                  .substr(2, 9)}`,
                storyName: story?.storyName || "Unknown Story",
                chapterName: chapter?.chapterName || "Unknown Chapter",
                itemName: itemDetails?.itemName || "Unknown Item",
              };
            }),
            expiryDate: assistantData.expireDate
              ? new Date(assistantData.expireDate).toISOString().split("T")[0]
              : "",
            assistantDescription: assistantData.description || "",
            callToAction: assistantData.callToAction || "",
            selectedImage:
              assistantData.image ||
              "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
            customImage: null,
            isCustomImage: false, // Will be determined by checking if image is not a default one
            // Handle widget data - check if widget mapping exists in the response
            createAsWidget: assistantData.WidgetMapping ? true : (assistantData.createAsWidget || false),
            widgetName: assistantData.WidgetMapping?.name || assistantData.widgetName || "",
            widgetDisplayPath: assistantData.WidgetMapping?.display_path || assistantData.widgetDisplayPath || {
              page: "Home Screen",
              section: "Left Panel"
            },
            isLoop: Boolean(assistantData.isLoop),
            publishStatus: assistantData.publishStatus?.toLowerCase() === 'published' ? 'Published' : 'Draft',
            alternateName: assistantData.alternateName || "",
            alternateInfo: assistantData.alternateInfo || "",
          };

          console.log('Form Data with Widget Info:', {
            createAsWidget: formDataToSet.createAsWidget,
            widgetName: formDataToSet.widgetName,
            widgetDisplayPath: formDataToSet.widgetDisplayPath,
            hasWidgetMapping: !!assistantData.WidgetMapping
          });

          // Determine if the image is custom by checking if it's not one of the default images
          const defaultImages = [
            "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
            "https://storage.googleapis.com/rejara-wallpaper/chapters/insurance/1744382346101_Insurance_1744382346101.png",
            "https://storage.googleapis.com/rejara-wallpaper/chapters/expenses/1744382346958_Expenses_1744382346958.png",
          ];

          if (
            assistantData.image &&
            !defaultImages.includes(assistantData.image)
          ) {
            formDataToSet.isCustomImage = true;
          }

          // console.log('Setting form data with image:', formDataToSet.selectedImage);
          setFormData(formDataToSet);
        }
      } catch (error) {
        handleApiError(error, "Failed to fetch assistant data");
        navigate("/admin/ai-agents");
      } finally {
        setInitialLoading(false);
      }
    };

    fetchAssistantData();
  }, [id, isEditMode]);

  const validateExpiryDate = (date) => {
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of today

    if (selectedDate < today) {
      return "Expiry date cannot be in the past";
    }
    return "";
  };
const handleIsLoopChange = (value) => {
  setFormData((prev) => ({
    ...prev,
    isLoop: value,
  }));
};
  const handleExpiryDateChange = (e) => {
    const date = e.target.value;
    const error = validateExpiryDate(date);

    setErrors((prev) => ({
      ...prev,
      expiryDate: error,
    }));

    if (!error) {
      setFormData((prev) => ({
        ...prev,
        expiryDate: date,
      }));
    }
  };

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

  const handleApiError = (error, customMessage = "") => {
    console.error("API Error:", error);
    // Only show error toast if there's an actual error
    if (error.response?.status >= 400 || error.message) {
      const message =
        customMessage ||
        error.response?.data?.message ||
        "An error occurred. Please try again.";
      showToast(message, "error");
    }
  };

  // Add validation for display path
  const validateDisplayPath = (paths) => {
    if (!paths || paths.length === 0) {
      return "Please select at least one display path";
    }
    return "";
  };

  // Update the display path change handler
  const handleDisplayPathChange = (path, isChecked) => {
    const newPaths = isChecked
      ? [...(formData.displayPath || []), path]
      : (formData.displayPath || []).filter((p) => p !== path);

    setFormData((prev) => ({
      ...prev,
      displayPath: newPaths,
    }));

    // Validate and update error state
    const error = validateDisplayPath(newPaths);
    setErrors((prev) => ({
      ...prev,
      displayPath: error,
    }));
  };

  // Modify checkBasicDetails to include display path and platform validation
  const checkBasicDetails = React.useCallback(() => {
    const displayPathError = validateDisplayPath(formData.displayPath);
    setErrors((prev) => ({
      ...prev,
      displayPath: displayPathError,
    }));

    const isComplete =
      formData.assistantName.trim() !== "" &&
      formData.firstMessage.trim() !== "" &&
      formData.selectedPlatforms.length > 0 && // Require at least one platform
      displayPathError === "" &&
      (!formData.expiryDate || !errors.expiryDate) &&
      !errors.firstMessage &&
      !errors.callToAction;

    return isComplete;
  }, [
    formData.assistantName,
    formData.firstMessage,
    formData.callToAction,
    formData.selectedPlatforms,
    formData.displayPath,
    formData.expiryDate,
    errors.expiryDate,
    errors.firstMessage,
    errors.callToAction,
  ]);

  // Add function to handle next step
  const handleNextStep = React.useCallback(
    (e) => {
      e.preventDefault(); // Prevent form submission
      const isComplete = checkBasicDetails();
      if (isComplete) {
        setCurrentStep(2);
        setBasicDetailsComplete(true);
      } else {
        // Check specific missing fields and show appropriate error message
        if (!formData.assistantName.trim()) {
          showToast("Please enter an Assistant Name", "error");
        } else if (!formData.firstMessage.trim()) {
          showToast("Please enter a First Message", "error");
        } else if (formData.selectedPlatforms.length === 0) {
          showToast("Please select at least one Platform", "error");
        } else if (errors.displayPath) {
          showToast("Please select at least one Display Path", "error");
        } else if (errors.expiryDate) {
          showToast(errors.expiryDate, "error");
        } else if (errors.firstMessage) {
          showToast(errors.firstMessage, "error");
        } else if (errors.callToAction) {
          showToast(errors.callToAction, "error");
        } else if (formData.createAsWidget && !formData.widgetName.trim()) {
          showToast("Please enter a Widget Name when creating as widget", "error");
        } else if (formData.createAsWidget && formData.widgetName.length > 50) {
          showToast("Widget Name must be 50 characters or less", "error");
        } else {
          showToast("Please fill in all required fields", "error");
        }
      }
    },
    [
      checkBasicDetails,
      formData.assistantName,
      formData.callToAction,
      errors.displayPath,
      errors.expiryDate,
      errors.callToAction,
    ]
  );

  // Add function to handle previous step
  const handlePrevStep = React.useCallback((e) => {
    e.preventDefault(); // Prevent form submission
    setCurrentStep(1);
  }, []);



  // Utility functions for platform change in edit mode
  const validateAndPreserveSelectionsInEditMode = React.useCallback((newStories, newChapters, newItems, existingSelections) => {
    const result = {
      preservedStories: [],
      removedStories: [],
      preservedChapters: [],
      removedChapters: [],
      preservedItems: [],
      removedItems: []
    };

    // Validate and preserve stories
    const newStoryIds = newStories.map(story => story.storyId.toString());
    existingSelections.stories.forEach(storyId => {
      if (newStoryIds.includes(storyId)) {
        result.preservedStories.push(storyId);
      } else {
        result.removedStories.push(storyId);
      }
    });

    // Validate and preserve chapters (only for preserved stories)
    const newChapterIds = newChapters
      .filter(chapter => result.preservedStories.includes(chapter.storyId.toString()))
      .map(chapter => chapter.chapterId.toString());
    
    existingSelections.chapters.forEach(chapterId => {
      if (newChapterIds.includes(chapterId)) {
        result.preservedChapters.push(chapterId);
      } else {
        result.removedChapters.push(chapterId);
      }
    });

    // Validate and preserve items (only for preserved chapters)
    const newItemIds = newItems
      .filter(item => result.preservedChapters.includes(item.chapterId.toString()))
      .map(item => item.itemId.toString());

    existingSelections.items.forEach(item => {
      if (newItemIds.includes(item.itemId.toString())) {
        result.preservedItems.push(item);
      } else {
        result.removedItems.push(item);
      }
    });

    return result;
  }, []);

  const generatePreservationFeedback = React.useCallback((preservationResult) => {
    // Count total changes
    const totalRemoved = preservationResult.removedItems.length + 
                        preservationResult.removedChapters.length + 
                        preservationResult.removedStories.length;
    
    const totalPreserved = preservationResult.preservedItems.length;
    
    // Generate simple summary message
    let summary;
    if (totalRemoved > 0) {
      summary = "Platform updated";
    } else if (totalPreserved > 0) {
      summary = "Platform updated";
    } else {
      summary = "Platform updated";
    }

    return {
      summary: summary,
      details: [],
      hasRemovals: totalRemoved > 0,
      hasPreservations: totalPreserved > 0
    };
  }, []);

  const updateSelectionsAfterPlatformChange = React.useCallback((preservationResult) => {
    // Update selections in the correct order to avoid race conditions
    // First update stories, then chapters, then items
    
    setSelectedStories(preservationResult.preservedStories);
    
    // Use setTimeout to ensure state updates are processed in sequence
    setTimeout(() => {
      setSelectedChaptersDebug(preservationResult.preservedChapters);
      
      setTimeout(() => {
        setFormData((prev) => ({
          ...prev,
          selectedItems: preservationResult.preservedItems,
        }));
      }, 0);
    }, 0);
  }, [setSelectedChaptersDebug]);

  const handlePlatformChangeInEditMode = React.useCallback(async (newPlatforms) => {
    try {
      setPlatformChangeInProgress(true);
      setLoading(true);

      // Validate platform IDs
      const validPlatformIds = newPlatforms.filter((p) => {
        const platformExists = platforms.find(
          (platform) => platform.id.toString() === p
        );
        return platformExists && !platformExists.isDeleted;
      });

      if (validPlatformIds.length === 0) {
        showToast("No valid platforms selected", "error");
        return;
      }

      // Clear activity and fetch new activities for the selected platform
      setFormData((prev) => ({
        ...prev,
        selectedActivity: null,
        selectedExperienceMode: null,
        selectedGoal: null,
        personaRules: [], // Clear persona rules when platform changes
      }));
      setActivities([]);
      setActivitySearchTerm("");
      setExperienceModes([]);
      setPlatformGoals([]);
      if (validPlatformIds.length > 0) {
        fetchActivities(validPlatformIds[0]);
        fetchExperienceModes(validPlatformIds[0]);
        fetchPlatformGoals(validPlatformIds[0]);
      }

      // Fetch stories for new platforms
      const storiesResponse = await platformService.getStoriesByPlatforms(
        validPlatformIds,
        false
      );

      if (storiesResponse.status !== 200 || !storiesResponse.body) {
        showToast("Failed to fetch stories for selected platforms", "error");
        return;
      }

      const newStories = storiesResponse.body;
      setStories(newStories);

      // Get current selections for validation
      const existingSelections = {
        stories: selectedStories,
        chapters: selectedChapters,
        items: formData.selectedItems
      };

      // If we have existing story selections, fetch chapters for them
      let newChapters = [];
      if (existingSelections.stories.length > 0) {
        try {
          const chaptersResponse = await platformService.getChaptersByPlatform(
            existingSelections.stories,
            validPlatformIds
          );
          
          if (chaptersResponse.status === 200 && chaptersResponse.body) {
            newChapters = chaptersResponse.body.map((chapter) => ({
              ...chapter,
              storyId: chapter.storyId.toString(),
              storyName: chapter.storyName || "Unknown Story",
            }));
          }
        } catch (error) {
          console.error("Failed to fetch chapters:", error);
        }
      }

      setChapters(newChapters);

      // If we have existing chapter selections, fetch items for them
      let newItems = [];
      if (existingSelections.chapters.length > 0) {
        try {
          const itemsResponse = await platformService.getItemsByPlatform(
            existingSelections.chapters,
            validPlatformIds
          );
          
          if (itemsResponse.status === 200 && itemsResponse.body) {
            newItems = itemsResponse.body.map((item) => ({
              ...item,
              chapterId: item.chapterId.toString(),
              chapterName: item.chapterName || "Unknown Chapter",
              storyId: item.storyId.toString(),
              storyName: item.storyName || "Unknown Story",
            }));
          }
        } catch (error) {
          console.error("Failed to fetch items:", error);
        }
      }

      setItems(newItems);

      // Validate and preserve selections
      const preservationResult = validateAndPreserveSelectionsInEditMode(
        newStories,
        newChapters,
        newItems,
        existingSelections
      );

      // Update selections based on validation results
      updateSelectionsAfterPlatformChange(preservationResult);

      // Generate and show user feedback
      const feedback = generatePreservationFeedback(preservationResult);
      
      // Show simple feedback message
      showToast(
        feedback.summary,
        "success"
      );

    } catch (error) {
      console.error("Error during platform change in edit mode:", error);
      showToast("Failed to update platforms. Please try again.", "error");
    } finally {
      setPlatformChangeInProgress(false);
      setLoading(false);
    }
  }, [
    platforms,
    selectedStories,
    selectedChapters,
    formData.selectedItems,
    validateAndPreserveSelections,
    generatePreservationFeedback,
    updateSelectionsAfterPlatformChange,
    showToast
  ]);

  // Platform change handler
  const handlePlatformChange = React.useCallback(async (newPlatforms) => {
    // Check if there are selected items and block platform change
    if (formData.selectedItems.length > 0) {
      // Show warning modal that blocks the change
      setPlatformChangeWarningModal({
        isOpen: true,
        selectedItemsCount: formData.selectedItems.length
      });
      return;
    }

    // If no selected items, proceed with platform change
    await proceedWithPlatformChange(newPlatforms);
  }, [isEditMode, initialLoading, handlePlatformChangeInEditMode, formData.selectedItems.length]);

  // Function to proceed with platform change (only called when no items are selected)
  const proceedWithPlatformChange = React.useCallback(async (newPlatforms) => {
    // Update platform selection in form data and clear selected activity, experience mode, goal, and persona rules
    setFormData((prev) => ({
      ...prev,
      selectedPlatforms: newPlatforms,
      selectedActivity: null, // Clear activity when platform changes
      selectedExperienceMode: null, // Clear experience mode when platform changes
      selectedGoal: null, // Clear goal when platform changes
      personaRules: [], // Clear persona rules when platform changes
    }));

    // Clear activities, experience modes, goals and fetch new ones if a platform is selected
    setActivities([]);
    setActivitySearchTerm("");
    setExperienceModes([]);
    setPlatformGoals([]);
    if (newPlatforms.length > 0) {
      fetchActivities(newPlatforms[0]); // Fetch activities for the selected platform
      fetchExperienceModes(newPlatforms[0]); // Fetch experience modes for the selected platform
      fetchPlatformGoals(newPlatforms[0]); // Fetch goals for the selected platform
    }

    // Handle edit mode differently to preserve existing selections
    if (isEditMode && !initialLoading) {
      await handlePlatformChangeInEditMode(newPlatforms);
      return;
    }

    // Create mode: Clear existing selections when platforms change
    setSelectedStories([]);
    setSelectedChapters([]);
    setFormData((prev) => ({
      ...prev,
      selectedItems: [],
    }));

    // Story fetching will be triggered by the useEffect that watches selectedPlatforms
  }, [isEditMode, initialLoading, handlePlatformChangeInEditMode]);

  // Add new function to filter stories based on search
  const filteredStories = React.useMemo(
    () =>
      stories.filter((story) =>
        story?.storyName?.toLowerCase().includes(storySearch.toLowerCase())
      ),
    [stories, storySearch]
  );

  // Add new function to filter chapters based on search
  const filteredChapters = React.useMemo(
    () =>
      chapters.filter(
        (chapter) =>
          chapter.chapterName
            .toLowerCase()
            .includes(chapterSearch.toLowerCase()) ||
          chapter.storyName.toLowerCase().includes(chapterSearch.toLowerCase())
      ),
    [chapters, chapterSearch]
  );

  // Add new function to filter items based on search and selected chapters
    const filteredItems = React.useMemo(() => {
    // First filter items based on selected chapters
    const itemsFromSelectedChapters = items.filter((item) => {
      // Convert chapterId to string for comparison
      const itemChapterId = item.chapterId?.toString();
      const isIncluded = selectedChapters.includes(itemChapterId);
      return isIncluded;
    });
    // Filter out items that are already selected
    const availableItems = itemsFromSelectedChapters.filter((item) => {
      const isAlreadySelected = formData.selectedItems.some(
        (selectedItem) => selectedItem.itemId === item.itemId
      );
      return !isAlreadySelected;
    });

    // Then filter by search term
    return availableItems.filter((item) =>
      item.itemName.toLowerCase().includes(itemSearch.toLowerCase())
    );
  }, [items, itemSearch, selectedChapters, formData.selectedItems]);

  // Update basic details completion when form data changes
  useEffect(() => {
    const isComplete = checkBasicDetails();
    setBasicDetailsComplete(isComplete);
  }, [checkBasicDetails]);

  // Validate custom questions whenever selected items change
  useEffect(() => {
    if (formData.selectedItems.length > 0) {
      validateCustomQuestions();
    }
  }, [formData.selectedItems]);

  // Ensure items are properly filtered when selectedChapters changes
  useEffect(() => {
    // console.log("Items effect triggered - selectedChapters:", selectedChapters, "current items count:", items.length);
    if (selectedChapters.length === 0) {
      // console.log("Clearing items because no chapters selected");
      setItems([]);
    }
  }, [selectedChapters]);

  // Platform-aware story fetching function
  const fetchStoriesForPlatforms = React.useCallback(
    async (selectedPlatforms) => {
      try {
        setLoading(true);
        setError(null);

        // Clear existing data when platforms change
        // console.log("Clearing chapters in fetchStoriesForPlatforms");
        setStories([]);
        setChapters([]);
        // In edit mode, preserve existing items to avoid clearing fetched items
        if (!isEditMode) {
          setItems([]);
        }
        // Only clear selections if not in edit mode to avoid clearing loaded data
        if (!isEditMode) {
          setSelectedStories([]);
          setSelectedChaptersDebug([]);
        }

        if (!selectedPlatforms || selectedPlatforms.length === 0) {
          // No platforms selected, show empty state
          setStories([]);
          showToast(
            "Please select at least one platform to view stories",
            "info"
          );
          return;
        }

        // Validate platform IDs
        const validPlatformIds = selectedPlatforms.filter((p) => {
          const platformExists = platforms.find(
            (platform) => platform.id.toString() === p
          );
          return platformExists && !platformExists.isDeleted;
        });

        if (validPlatformIds.length === 0) {
          setStories([]);
          showToast("No valid platforms selected", "error");
          return;
        }

        if (validPlatformIds.length < selectedPlatforms.length) {
          const invalidCount =
            selectedPlatforms.length - validPlatformIds.length;
          // console.warn(`${invalidCount} invalid platform(s) were filtered out`);
        }

        // Use the platform-aware API
        const response = await platformService.getStoriesByPlatforms(
          validPlatformIds,
          false
        );

        if (response.status === 200 && response.body) {
          setStories(response.body);
          if (response.body.length === 0) {
            showToast("No stories found for the selected platforms", "info");
          }
          
          // In edit mode, also fetch chapters for the selected stories
          if (isEditMode && response.body.length > 0) {
            // console.log("Fetching chapters for edit mode in fetchStoriesForPlatforms");
            try {
              // Only fetch chapters for selected stories, not all stories
              const selectedStoryIds = selectedStories.length > 0 ? selectedStories : 
                response.body.map(story => story.storyId.toString());
              // console.log("Fetching chapters for selected story IDs:", selectedStoryIds);
              const chaptersResponse = await platformService.getChaptersByPlatform(
                selectedStoryIds,
                validPlatformIds
              );
              if (chaptersResponse.status === 200 && chaptersResponse.body) {
                const allChapters = chaptersResponse.body.map((chapter) => ({
                  ...chapter,
                  storyId: chapter.storyId.toString(),
                  storyName: chapter.storyName || "Unknown Story",
                }));
                // console.log("Setting chapters in state (fetchStoriesForPlatforms) - OVERWRITING chapters:", allChapters.length, "chapters");
                setChapters(allChapters);
              }
            } catch (error) {
              console.error("Failed to fetch chapters in fetchStoriesForPlatforms:", error);
            }
          }
        } else {
          setStories([]);
          showToast(response.message || "Failed to fetch stories", "error");
        }
      } catch (err) {
        console.error("Error fetching stories for platforms:", err);

        // Provide specific error messages based on error type
        let errorMessage = "Failed to fetch stories. Please try again.";

        if (err.response) {
          // Server responded with error status
          if (err.response.status === 401) {
            errorMessage = "Authentication failed. Please log in again.";
          } else if (err.response.status === 403) {
            errorMessage =
              "You don't have permission to access these platforms.";
          } else if (err.response.status === 404) {
            errorMessage = "Selected platforms not found.";
          } else if (err.response.data?.message) {
            errorMessage = err.response.data.message;
          }
        } else if (err.request) {
          // Request was made but no response received
          errorMessage =
            "Network error. Please check your connection and try again.";
        }

        handleApiError(err, errorMessage);
        setStories([]);

        // Graceful fallback to empty state
        setError(
          "Unable to load stories. Please refresh the page or contact support if the problem persists."
        );
      } finally {
        setLoading(false);
      }
    },
    [platforms]
  );

    // Fetch stories when platforms change
  useEffect(() => {
    // console.log("Platforms useEffect triggered - selectedPlatforms:", formData.selectedPlatforms, "isEditMode:", isEditMode, "initialLoading:", initialLoading, "selectedStories:", selectedStories);
    
    // Skip the useEffect during initial loading in edit mode
    if (isEditMode && initialLoading) {
      // console.log("Skipping useEffect during initial loading in edit mode");
      return;
    }
    
    // Skip if platform change is being handled by the specialized edit mode handler
    if (isEditMode && platformChangeInProgress) {
      // console.log("Skipping useEffect - platform change in progress via specialized handler");
      return;
    }
    
    // In edit mode, only run this useEffect for create mode scenarios
    // Edit mode platform changes are handled by handlePlatformChangeInEditMode
    if (isEditMode) {
      // console.log("Skipping story/chapter fetch in edit mode - handled by specialized handler");
      return;
    }
    
    if (formData.selectedPlatforms && formData.selectedPlatforms.length > 0) {
      fetchStoriesForPlatforms(formData.selectedPlatforms);
    } else {
      // If no platforms selected, clear stories and show empty state
      setStories([]);
      setChapters([]);
      setItems([]);
      // Only clear selections if not in edit mode to avoid clearing loaded data
      if (!isEditMode) {
        // console.log("Clearing selections (not in edit mode)");
        setSelectedStories([]);
        setSelectedChaptersDebug([]);
      } else {
        // console.log("Not clearing selections (in edit mode)");
      }
    }
  }, [formData.selectedPlatforms, fetchStoriesForPlatforms, isEditMode, initialLoading, platformChangeInProgress]);

  const handleStoryChange = React.useCallback(
    async (storyIds) => {
      // console.log("handleStoryChange called with:", storyIds, "isEditMode:", isEditMode);
      if (!storyIds.length) {
        setSelectedStories([]);
        setSelectedChaptersDebug([]);
        setItems([]);
        setChapters([]);
        return;
      }

      const previousStoryIds = selectedStories;
      setSelectedStories(storyIds);

      try {
        setLoading(true);
        setError(null);
        const token = getAuthToken();

        // Determine which stories were added vs removed
        const addedStories = storyIds.filter(
          (id) => !previousStoryIds.includes(id)
        );
        const removedStories = previousStoryIds.filter(
          (id) => !storyIds.includes(id)
        );

        if (addedStories.length > 0) {
          // Fetch chapters for newly added stories using platform-aware API
          try {
            if (
              formData.selectedPlatforms &&
              formData.selectedPlatforms.length > 0
            ) {
              const chaptersResponse =
                await platformService.getChaptersByPlatform(
                  addedStories,
                  formData.selectedPlatforms
                );

              if (chaptersResponse.status === 200 && chaptersResponse.body) {
                const newChapters = chaptersResponse.body.map((chapter) => ({
                ...chapter,
                  storyId: chapter.storyId.toString(),
                  storyName: chapter.storyName || "Unknown Story",
              }));

          // Add new chapters to existing ones
                setChapters((prevChapters) => [
                  ...prevChapters,
                  ...newChapters,
                ]);
              }
            }
          } catch (error) {
            console.error("Failed to fetch chapters for added stories:", error);
            showToast("Failed to fetch chapters for selected stories", "error");
          }
        }

        if (removedStories.length > 0) {
          // Remove chapters that belong to deselected stories
          setChapters((prevChapters) =>
            prevChapters.filter(
              (chapter) => !removedStories.includes(chapter.storyId)
            )
          );

          // Remove selected chapters that belong to deselected stories
          setSelectedChaptersDebug((prevSelectedChapters) => {
            const filtered = prevSelectedChapters.filter((chapterId) => {
              const chapter = chapters.find(
                (c) => c.chapterId.toString() === chapterId
              );
              return chapter && !removedStories.includes(chapter.storyId);
            });
            // console.log("Filtering chapters in handleStoryChange:", { prevSelectedChapters, filtered, removedStories });
            return filtered;
          });

          // Remove items that belong to deselected stories
          setItems((prevItems) =>
            prevItems.filter((item) => {
              // Convert storyId to string for comparison
              const itemStoryId = item.storyId?.toString();
              return !removedStories.includes(itemStoryId);
            })
          );
        }

        // If this is the first time selecting stories, fetch all chapters
        if (previousStoryIds.length === 0 && storyIds.length > 0) {
          try {
            if (
              formData.selectedPlatforms &&
              formData.selectedPlatforms.length > 0
            ) {
              const chaptersResponse =
                await platformService.getChaptersByPlatform(
                  storyIds,
                  formData.selectedPlatforms
                );

              if (chaptersResponse.status === 200 && chaptersResponse.body) {
                const allChapters = chaptersResponse.body.map((chapter) => ({
                ...chapter,
                  storyId: chapter.storyId.toString(),
                  storyName: chapter.storyName || "Unknown Story",
              }));

          // console.log("Setting chapters in state (handleStoryChange):", allChapters);
          setChapters(allChapters);
              }
            }
          } catch (error) {
            console.error("Failed to fetch chapters for stories:", error);
            showToast("Failed to fetch chapters for selected stories", "error");
          }
        }
      } catch (err) {
        handleApiError(err, "Failed to fetch chapters. Please try again.");
        setChapters([]);
      } finally {
        setLoading(false);
      }
    },
    [stories, selectedStories, chapters]
  ); // Add selectedStories and chapters as dependencies

  const handleSelectAllStories = () => {
    const allStoryIds = stories.map((story) => story.storyId.toString());
    handleStoryChange(allStoryIds);
  };

  const handleUnselectAllStories = () => {
    handleStoryChange([]);
  };
  // Helper function to convert the stored string to HTML for the contenteditable div
const stringToHtml = (str) => {
  if (!str) return "";
  const html = str.replace(
    /\{(storyName|chapterName|itemName|subCategoryName)\}/g,
    (match) => {
      const value = match.slice(1, -1);
      return `<span class="placeholder-tag" contenteditable="false" data-value="${value}">${value.replace(
        /_/g,
        " "
      )}</span>`;
    }
  );
  return html;
};
// Helper function to convert the contenteditable div's HTML back to the stored string
const htmlToString = (html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const tempDiv = doc.body;

  let result = "";
  tempDiv.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.classList.contains("placeholder-tag")
    ) {
      result += `{${node.dataset.value}}`;
    }
  });

  return result;
};
  const handleSelectAllChapters = () => {
    const allChapterIds = chapters.map((chapter) =>
      chapter.chapterId.toString()
    );
    handleChapterChange(allChapterIds);
  };

  const handleUnselectAllChapters = () => {
    handleChapterChange([]);
  };

    const handleChapterChange = React.useCallback(
    async (chapterIds) => {
      // console.log("handleChapterChange called with:", chapterIds, "formData.selectedPlatforms:", formData.selectedPlatforms);
      if (!chapterIds.length) {
        setSelectedChapters([]);
        setItems([]);
        return;
      }

      const previousChapterIds = selectedChapters;
      setSelectedChapters(chapterIds);

      try {
        setLoading(true);
        setError(null);
        const token = getAuthToken();

        // Determine which chapters were added vs removed
        const addedChapters = chapterIds.filter(
          (id) => !previousChapterIds.includes(id)
        );
        const removedChapters = previousChapterIds.filter(
          (id) => !chapterIds.includes(id)
        );

        if (addedChapters.length > 0) {
          // Fetch items for newly added chapters using platform-aware API
          try {
            if (
              formData.selectedPlatforms &&
              formData.selectedPlatforms.length > 0
            ) {
              const itemsResponse = await platformService.getItemsByPlatform(
                addedChapters,
                formData.selectedPlatforms
              );

              if (itemsResponse.status === 200 && itemsResponse.body) {
                const newItems = itemsResponse.body.map((item) => ({
                  ...item,
                  chapterId: item.chapterId.toString(),
                  chapterName: item.chapterName || "Unknown Chapter",
                  storyId: item.storyId.toString(),
                  storyName: item.storyName || "Unknown Story",
                }));

          // Add new items to existing ones
          setItems((prevItems) => [...prevItems, ...newItems]);
              }
            }
          } catch (error) {
            console.error("Failed to fetch items for added chapters:", error);
            showToast("Failed to fetch items for selected chapters", "error");
          }
        }

        if (removedChapters.length > 0) {
          // Remove items that belong to deselected chapters
          setItems((prevItems) =>
            prevItems.filter((item) => {
              // Convert chapterId to string for comparison
              const itemChapterId = item.chapterId?.toString();
              return !removedChapters.includes(itemChapterId);
            })
          );
        }

        // console.log("Chapter change logic - previousChapterIds:", previousChapterIds, "chapterIds:", chapterIds, "addedChapters:", addedChapters);
        
        // If this is the first time selecting chapters, fetch all items
        if (previousChapterIds.length === 0 && chapterIds.length > 0) {
          try {
            if (
              formData.selectedPlatforms &&
              formData.selectedPlatforms.length > 0
            ) {
              const itemsResponse = await platformService.getItemsByPlatform(
                chapterIds,
                formData.selectedPlatforms
              );

              if (itemsResponse.status === 200 && itemsResponse.body) {
                const allItems = itemsResponse.body.map((item) => ({
                  ...item,
                  chapterId: item.chapterId.toString(),
                  chapterName: item.chapterName || "Unknown Chapter",
                  storyId: item.storyId.toString(),
                  storyName: item.storyName || "Unknown Story",
                }));

                // console.log("Setting items in state:", allItems.length);
                setItems(allItems);
              }
            }
          } catch (error) {
            console.error("Failed to fetch items for chapters:", error);
            showToast("Failed to fetch items for selected chapters", "error");
          }
        }
      } catch (err) {
        handleApiError(err, "Failed to fetch items. Please try again.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedChapters, formData.selectedPlatforms]
  ); // Add selectedChapters and platforms as dependencies

  const handleRemoveItem = (index) => {
    const removedItem = formData.selectedItems[index];
    const updatedItems = formData.selectedItems.filter((_, i) => i !== index);

    // Update sequence numbers for remaining items
    const reorderedItems = updatedItems.map((item, idx) => ({
      ...item,
      sequence: idx + 1,
    }));

    setFormData((prev) => ({
      ...prev,
      selectedItems: reorderedItems,
    }));

    // Add the removed item back to the items list so it can be selected again
    // Only add it back if it belongs to currently selected chapters
    const itemChapterId = removedItem.chapterId?.toString();
    const itemStoryId = removedItem.storyId?.toString();

    // Check if the item's chapter and story are still selected
    if (
      selectedChapters.includes(itemChapterId) &&
      selectedStories.includes(itemStoryId)
    ) {
      const itemToAddBack = {
        itemId: removedItem.itemId,
        chapterId: removedItem.chapterId,
        storyId: removedItem.storyId,
        itemName: removedItem.itemName,
        chapterName: removedItem.chapterName,
        storyName: removedItem.storyName,
        question: removedItem.originalQuestion || removedItem.question, // Use original question
        sample_conversation: removedItem.sample_conversation || "",
        sequence: removedItem.sequence || 1,
        is_deleted: 0,
        createdAt: removedItem.createdAt || new Date().toISOString(),
        updatedAt: removedItem.updatedAt || new Date().toISOString(),
        source: removedItem.source || "platform",
        platforms: removedItem.platforms || [],
      };

      // Check if the item is not already in the items list to avoid duplicates
      setItems((prevItems) => {
        const itemExists = prevItems.some(
          (item) => item.itemId === removedItem.itemId
        );
        if (!itemExists) {
          // Add the item back and sort by sequence to maintain order
          const newItems = [...prevItems, itemToAddBack];
          return newItems.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        }
        return prevItems;
      });

      showToast(
        `Item "${removedItem.itemName}" has been removed and is now available for selection again`,
        "success"
      );
    } else {
      // If the chapter/story is no longer selected, just show a different message
    showToast(`Item "${removedItem.itemName}" has been removed`, "success");
    }

    // Clean up policy cache for the removed item to free memory
    setPolicyCache((prev) => {
      const newCache = { ...prev };
      delete newCache[removedItem.itemId];
      return newCache;
    });
  };

  // Agent Actions modal management
  const openAgentFunctionsModal = (itemIndex) => {
    const selectedItem = formData.selectedItems[itemIndex];
    setAgentFunctionsModal({
      isOpen: true,
      selectedItemIndex: itemIndex,
      selectedItem: selectedItem,
    });
  };

  const closeAgentFunctionsModal = () => {
    setAgentFunctionsModal({
      isOpen: false,
      selectedItemIndex: null,
      selectedItem: null,
    });
  };

  const openAddFunctionModal = (itemIndex) => {
    setAddFunctionModal({
      isOpen: true,
      itemIndex: itemIndex,
      newFunctionData: {
        event: "before",
        functionId: "",
        displayType: "radio",
      },
    });
  };

  const closeAddFunctionModal = () => {
    setAddFunctionModal({
      isOpen: false,
      itemIndex: null,
      newFunctionData: {
        event: "before",
        functionId: "",
        displayType: "radio",
      },
    });
  };

  const openEditFunctionModal = (itemIndex, functionIndex) => {
    const item = formData.selectedItems[itemIndex];
    const functionToEdit = item.functionFlow[functionIndex];

    setEditFunctionModal({
      isOpen: true,
      itemIndex: itemIndex,
      functionIndex: functionIndex,
      functionData: {
        event: functionToEdit.event || "before",
        functionId: functionToEdit.functionId || "",
        displayType: functionToEdit.displayType || "radio",
        order: functionToEdit.order || 1,
      },
    });
  };

  const closeEditFunctionModal = () => {
    setEditFunctionModal({
      isOpen: false,
      itemIndex: null,
      functionIndex: null,
      functionData: {
        event: "before",
        functionId: "",
        displayType: "radio",
        order: 1,
      },
    });
  };

  const addFunctionToItem = () => {
    const { itemIndex, newFunctionData } = addFunctionModal;

    if (!newFunctionData.functionId) {
      showToast("Please select a function", "error");
      return;
    }

    // Get the current item's function count to set the order
    const currentItem = formData.selectedItems[itemIndex];
    const currentFunctionCount = (currentItem.functionFlow || []).length;
    const functionWithOrder = {
      ...newFunctionData,
      order: currentFunctionCount + 1,
    };

    setFormData((prev) => ({
      ...prev,
      selectedItems: prev.selectedItems.map((item, index) =>
        index === itemIndex
          ? {
              ...item,
              functionFlow: [...(item.functionFlow || []), functionWithOrder],
            }
          : item
      ),
    }));

    // Update the modal state to reflect the new function
    setAgentFunctionsModal((prev) => ({
      ...prev,
      selectedItem: {
        ...prev.selectedItem,
        functionFlow: [
          ...(prev.selectedItem.functionFlow || []),
          functionWithOrder,
        ],
      },
    }));

    closeAddFunctionModal();
    showToast("Function added successfully", "success");
  };

  const updateFunctionInItem = () => {
    const { itemIndex, functionIndex, functionData } = editFunctionModal;

    if (!functionData.functionId) {
      showToast("Please select a function", "error");
      return;
    }

    setFormData((prev) => ({
      ...prev,
      selectedItems: prev.selectedItems.map((item, index) =>
        index === itemIndex
          ? {
              ...item,
              functionFlow: item.functionFlow.map((func, fIndex) =>
                fIndex === functionIndex ? { ...func, ...functionData } : func
              ),
            }
          : item
      ),
    }));

    // Update the modal state to reflect the changes
    setAgentFunctionsModal((prev) => {
      if (!prev.selectedItem || !prev.selectedItem.functionFlow) {
        return prev;
      }

      const updatedFunctions = prev.selectedItem.functionFlow.map(
        (func, fIndex) =>
          fIndex === functionIndex ? { ...func, ...functionData } : func
      );

      return {
        ...prev,
        selectedItem: {
          ...prev.selectedItem,
          functionFlow: updatedFunctions,
        },
      };
    });

    closeEditFunctionModal();
    showToast("Function updated successfully", "success");
  };

  const removeFunctionFromItem = (functionIndex) => {
    const itemIndex = agentFunctionsModal.selectedItemIndex;

    if (itemIndex === null || itemIndex === undefined) {
      showToast("Error: Item index not found", "error");
      return;
    }

    setFormData((prev) => ({
      ...prev,
      selectedItems: prev.selectedItems.map((item, index) =>
        index === itemIndex
          ? {
              ...item,
              functionFlow: (item.functionFlow || [])
                .filter((_, fIndex) => fIndex !== functionIndex)
                .map((func, newIndex) => ({ ...func, order: newIndex + 1 })), // Reorder remaining functions
            }
          : item
      ),
    }));

    // Update the modal state to reflect changes
    setAgentFunctionsModal((prev) => {
      if (!prev.selectedItem || !prev.selectedItem.functionFlow) {
        return prev;
      }

      const updatedFunctions = prev.selectedItem.functionFlow
        .filter((_, fIndex) => fIndex !== functionIndex)
        .map((func, newIndex) => ({ ...func, order: newIndex + 1 }));

      return {
        ...prev,
        selectedItem: {
          ...prev.selectedItem,
          functionFlow: updatedFunctions,
        },
      };
    });

    showToast("Function removed successfully", "success");
  };

  const handleFunctionDragEnd = (result) => {
    if (!result.destination) return;

    const { source, destination } = result;
    const itemIndex = agentFunctionsModal.selectedItemIndex;

    const item = formData.selectedItems[itemIndex];
    const functions = Array.from(item.functionFlow || []);
    const [movedFunction] = functions.splice(source.index, 1);
    functions.splice(destination.index, 0, movedFunction);

    // Update order numbers
    const reorderedFunctions = functions.map((func, index) => ({
      ...func,
      order: index + 1,
    }));

    setFormData((prev) => ({
      ...prev,
      selectedItems: prev.selectedItems.map((item, index) =>
        index === itemIndex
          ? { ...item, functionFlow: reorderedFunctions }
          : item
      ),
    }));

    // Update the modal state to reflect changes
    setAgentFunctionsModal((prev) => ({
      ...prev,
      selectedItem: {
        ...prev.selectedItem,
        functionFlow: reorderedFunctions,
      },
    }));
  };

  const updateNewFunctionData = (field, value) => {
    setAddFunctionModal((prev) => ({
      ...prev,
      newFunctionData: {
        ...prev.newFunctionData,
        [field]: value,
      },
    }));
  };

  const updateEditFunctionData = (field, value) => {
    setEditFunctionModal((prev) => ({
      ...prev,
      functionData: {
        ...prev.functionData,
        [field]: value,
      },
    }));
  };

  const handlePolicyItem = async (id, itemName) => {
    try {
      setLoading(true);

      // Check if we have cached policies for this item
      const cachedPolicies = policyCache[id];

      if (cachedPolicies) {
        // Use cached policies (preserves modifications)
        // console.log("Using cached policies for item:", id);
        setPolicyModal({
          isOpen: true,
          itemName: itemName,
          policies: cachedPolicies,
          itemId: id,
        });
        setLoading(false);
        return;
      }

      // In edit mode, try to get policies from existing selectedItems first
      if (isEditMode) {
        const existingItem = formData.selectedItems.find(
          (item) => item.itemId === id
        );
        if (existingItem && existingItem.policies) {
          // console.log(
          //   "Using existing policies from selectedItems for item:",
          //   id
          // );

          // Filter out inactive policies
          const activePolicies = existingItem.policies.filter((policy) => {
            return !policy.status || policy.status !== "inactive";
          });

          if (activePolicies && activePolicies.length > 0) {
            // Initialize policies with function flow, custom question support, and conditions
            const enhancedPolicies = activePolicies.map((policy) => ({
              ...policy,
              functionFlow: policy.functionFlow || [], // Initialize empty function flow
              useCustomQuestion: policy.useCustomQuestion || false, // Track if using custom question
              originalQuestion: policy.question || "", // Store original question
              question: policy.question || "", // Current question (can be custom)
              conditions: policy.conditions || [], // Initialize empty conditions array
            }));

            // Cache the policies
            setPolicyCache((prev) => ({
              ...prev,
              [id]: enhancedPolicies,
            }));

            setPolicyModal({
              isOpen: true,
              itemName: itemName,
              policies: enhancedPolicies,
              itemId: id,
            });
            setLoading(false);
            return;
          }
        }
      }

      // Fallback: Fetch fresh policies from backend
      const data = await assistantService.getPolicies(id);

      // console.log("Raw data from getPolicies:", data);
      // console.log("Data type:", typeof data);
      // console.log("Is data an array?", Array.isArray(data));

      // Check if data exists
      if (!data) {
        showToast("No policies found for this item", "error");
        return;
      }

      // Handle different possible data structures
      let policies = [];

      if (Array.isArray(data)) {
        // If data is directly an array
        policies = data;
      } else if (data.policies && Array.isArray(data.policies)) {
        // If data has a policies property that is an array
        policies = data.policies;
      } else if (data.body && Array.isArray(data.body)) {
        // If data has a body property that is an array
        policies = data.body;
      } else if (typeof data === "object" && data !== null) {
        // If data is an object, try to find any array property
        const arrayKeys = Object.keys(data).filter((key) =>
          Array.isArray(data[key])
        );
        if (arrayKeys.length > 0) {
          policies = data[arrayKeys[0]];
        }
      }

      // console.log("Extracted policies:", policies);

      // Check if we found any policies
      if (!policies || policies.length === 0) {
        showToast("No policies found for this item", "error");
        return;
      }

      // Filter out inactive policies (if status property exists)
      const allPolicies = policies.filter((policy) => {
        // Check if policy has a status property and it's not inactive
        return !policy.status || policy.status !== "inactive";
      });

      // console.log("Active policies:", allPolicies);

      if (!allPolicies || allPolicies.length === 0) {
        showToast("No active policies found for this item", "error");
        return;
      }

      // Initialize policies with function flow, custom question support, and conditions
      const enhancedPolicies = allPolicies.map((policy) => ({
        ...policy,
        functionFlow: policy.functionFlow || [], // Initialize empty function flow
        useCustomQuestion: policy.useCustomQuestion || false, // Track if using custom question
        originalQuestion: policy.question || "", // Store original question
        question: policy.question || "", // Current question (can be custom)
        conditions: policy.conditions || [], // Initialize empty conditions array
      }));

      // Cache the policies
      setPolicyCache((prev) => ({
        ...prev,
        [id]: enhancedPolicies,
      }));

      setPolicyModal({
        isOpen: true,
        itemName: itemName,
        policies: enhancedPolicies,
        itemId: id,
      });
    } catch (error) {
      console.error("Error fetching policies:", error);

      // Handle different types of errors
      let errorMessage = "Failed to fetch policies";

      if (error.response) {
        // Server responded with error status
        errorMessage = error.response.data?.message || errorMessage;
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = "Network error. Please check your connection.";
      } else {
        // Something else happened
        errorMessage = error.message || errorMessage;
      }

      showToast(errorMessage, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (item) => {
    try {
      // Fetch policies for this item when adding it
      let itemPolicies = [];

      try {
        const policiesData = await assistantService.getPolicies(item.itemId);

        // Handle different possible data structures
        if (Array.isArray(policiesData)) {
          itemPolicies = policiesData;
        } else if (
          policiesData?.policies &&
          Array.isArray(policiesData.policies)
        ) {
          itemPolicies = policiesData.policies;
        } else if (policiesData?.body && Array.isArray(policiesData.body)) {
          itemPolicies = policiesData.body;
        }

        // Filter out inactive policies and enhance them
        itemPolicies = itemPolicies
          .filter((policy) => !policy.status || policy.status !== "inactive")
          .map((policy) => ({
            ...policy,
            functionFlow: policy.functionFlow || [],
            useCustomQuestion: policy.useCustomQuestion || false,
            originalQuestion: policy.question || "",
            question: policy.question || "",
            conditions: policy.conditions || [],
          }));

        // console.log(
        //   `Fetched ${itemPolicies.length} policies for item ${item.itemId}`
        // );

        // Cache the policies for immediate availability
        if (itemPolicies.length > 0) {
          setPolicyCache((prev) => ({
            ...prev,
            [item.itemId]: itemPolicies,
          }));
        }
      } catch (error) {
        console.warn(
          `Failed to fetch policies for item ${item.itemId}:`,
          error
        );
        // Continue with empty policies array if fetch fails
      }

      const newItem = {
        storyId: parseInt(item.storyId),
        chapterId: parseInt(item.chapterId),
        itemId: parseInt(item.itemId),
        sequence: formData.selectedItems.length + 1, // Set sequence to next number
        storyName: item.storyName,
        chapterName: item.chapterName,
        itemName: item.itemName,
        question: item.question,
        originalQuestion: item.question, // Store original question
        useCustomQuestion: false,
        uniqueId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        functionFlow: [], // Initialize empty function flow array
        policies: itemPolicies, // Include fetched policies
      };

      setFormData((prev) => ({
        ...prev,
        selectedItems: [...prev.selectedItems, newItem],
      }));

      setItems((prev) => prev.filter((i) => i.itemId !== item.itemId));

      // Debug log
      // console.log(
      //   `Added item ${item.itemName} (ID: ${item.itemId}) with ${itemPolicies.length} policies:`,
      //   newItem
      // );

      if (itemPolicies.length > 0) {
        showToast(
          `Item added successfully with ${itemPolicies.length} policies`,
          "success"
        );
      } else {
        showToast("Item added successfully", "success");
      }
    } catch (error) {
      console.error("Error adding item:", error);
      showToast("Failed to add item. Please try again.", "error");
    }
    setPreviewModal(false);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(formData.selectedItems);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update sequence numbers after reordering
    const updatedItems = items.map((item, index) => ({
      ...item,
      sequence: index + 1,
    }));

    setFormData((prev) => ({
      ...prev,
      selectedItems: updatedItems,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.selectedItems.length === 0) {
      showToast("Please select at least one item", "error");
      return;
    }

    // Validate custom questions
    if (!validateCustomQuestions()) {
      const errorMessage = getCustomQuestionValidationError();
      showToast(errorMessage, "error");
      return;
    }

    setPreviewModal(true);
  };

  // Handle widget deletion (clear widget data from form)
  const handleDeleteWidget = () => {
    if (!formData.createAsWidget || !formData.widgetName) {
      showToast("No widget to delete", "error");
      return;
    }

    if (window.confirm("Are you sure you want to delete this widget? This will make it inactive and it won't be shown in the frontend.")) {
      // Clear widget configuration from form
      setFormData((prev) => ({
        ...prev,
        createAsWidget: false,
        widgetName: "",
        widgetDisplayPath: {
          section: "Left Panel",
          page: "Home Screen"
        },
        isLoop: false,
      }));
      
      setShowWidgetModal(false);
      showToast("Widget configuration cleared. Save the assistant to apply changes.", "info");
    }
  };

  // Modify handleConfirmSubmit to handle both create and edit
  const handleConfirmSubmit = async () => {
    try {
      // Validate image
      if (!formData.selectedImage) {
        showToast("Please select an assistant image", "error");
        return;
      }

      // Validate custom questions
      if (!validateCustomQuestions()) {
        const errorMessage = getCustomQuestionValidationError();
        showToast(errorMessage, "error");
        return;
      }

      setLoading(true);

      // Create FormData for the request
      const formDataToSend = new FormData();

      // Add all the assistant data
      formDataToSend.append("assistantName", formData.assistantName);
      formDataToSend.append("firstMessage", formData.firstMessage);
      formDataToSend.append("callToAction", formData.callToAction);
      formDataToSend.append("targetType", "Assistant");
      formDataToSend.append("assistantCategory", "Assistant");

      // Always include expiryDate parameter for Sequelize
      formDataToSend.append(
        "expiryDate",
        formData.expiryDate && formData.expiryDate.trim() !== ""
          ? new Date(formData.expiryDate).toISOString().split("T")[0]
          : ""
      );

      formDataToSend.append("description", formData.assistantDescription || "");

      // Add widget configuration data
      formDataToSend.append("createAsWidget", formData.createAsWidget ? "true" : "false");
      formDataToSend.append("widgetName", formData.widgetName || "");
      formDataToSend.append("widgetKey", formData.widgetKey || "assistant_progress");
      formDataToSend.append("widgetDisplayPath", JSON.stringify(formData.widgetDisplayPath || {}));
      
      // Add isLoop field - default to false
      formDataToSend.append("isLoop", (formData.isLoop === true) ? "true" : "false");
      
      // Add publishStatus field - default to Draft
      formDataToSend.append("publishStatus", formData.publishStatus || "Draft");

      // Add alternateName and alternateInfo fields
      formDataToSend.append("alternateName", formData.alternateName || "");
      formDataToSend.append("alternateInfo", formData.alternateInfo || "");

      // Use policies from selectedItems (with cache modifications)
      const itemsWithPolicies = formData.selectedItems.map((item) => {
        // Check if we have cached policies for this item (modified policies)
        const cachedPolicies = policyCache[item.itemId];

        if (cachedPolicies) {
          // Use cached policies (includes modifications)
          // console.log(
          //   `Using cached policies for item ${item.itemId}: ${cachedPolicies.length} policies`
          // );
          return {
            storyId: item.storyId,
            chapterId: item.chapterId,
            itemId: item.itemId,
            sequence: item.sequence,
            question: item.question,
            useCustomQuestion: item.useCustomQuestion,
            functionFlow: item.functionFlow || [],
            policies: cachedPolicies, // Use cached policies with modifications
          };
        }

        // Use existing policies from selectedItems (for edit mode or when policies were fetched during add)
        if (item.policies && item.policies.length > 0) {
          // console.log(
          //   `Using existing policies for item ${item.itemId}: ${item.policies.length} policies`
          // );
          return {
            storyId: item.storyId,
            chapterId: item.chapterId,
            itemId: item.itemId,
            sequence: item.sequence,
            question: item.question,
            useCustomQuestion: item.useCustomQuestion,
            functionFlow: item.functionFlow || [],
            policies: item.policies, // Use existing policies
          };
        }

        // Fallback: empty policies array (this should rarely happen now)
        // console.warn(
        //   `No policies found for item ${item.itemId} - using empty array`
        // );
        return {
          storyId: item.storyId,
          chapterId: item.chapterId,
          itemId: item.itemId,
          sequence: item.sequence,
          question: item.question,
          useCustomQuestion: item.useCustomQuestion,
          functionFlow: item.functionFlow || [],
          policies: [], // Empty policies array
        };
      });

      // Debug: Log summary of policies being submitted
      const totalPolicies = itemsWithPolicies.reduce(
        (sum, item) => sum + (item.policies?.length || 0),
        0
      );
      // console.log(
      //   `Submitting ${itemsWithPolicies.length} items with a total of ${totalPolicies} policies`
      // );
      itemsWithPolicies.forEach((item, index) => {
        // console.log(
        //   `Item ${index + 1} (ID: ${item.itemId}): ${
        //     item.policies?.length || 0
        //   } policies`
        // );
      });

      // Extract platforms from clusteredItems data for separate handling
      const platforms = getSelectedPlatforms();
      
      // Add the clustered items data with policies (without platforms)
      const clusteredItemsData = {
        url: "no url for this",
        displayPath: formData.displayPath,
        selectedPlatforms: formData.selectedPlatforms, // Add selected platforms
        clusteredItems: itemsWithPolicies,
      };

      // console.log('Clustered Items Data being sent to backend:', JSON.stringify(clusteredItemsData, null, 2));

      formDataToSend.append(
        "clusteredItems",
        JSON.stringify(clusteredItemsData)
      );
      
      // Add platforms separately to formData - send as individual values
      platforms.forEach((platformId, index) => {
        formDataToSend.append(`platforms[${index}]`, platformId);
      });

      // Add selected activity id if present (optional field)
      if (formData.selectedActivity) {
        formDataToSend.append("activityId", formData.selectedActivity);
      }

      // Add persona rules (new multi-goal mapping)
      if (formData.personaRules && formData.personaRules.length > 0) {
        const personaRulesForApi = formData.personaRules.map(rule => ({
          goalId: rule.goalId ? parseInt(rule.goalId) : null,
          modeId: rule.modeId ? parseInt(rule.modeId) : (formData.selectedExperienceMode ? parseInt(formData.selectedExperienceMode) : null),
          isAllowed: rule.isAllowed !== undefined ? rule.isAllowed : true,
        }));
        formDataToSend.append("personaRules", JSON.stringify(personaRulesForApi));
      }

      // Add the image
      if (formData.isCustomImage && formData.customImage) {
        // If it's a custom uploaded image and currently selected, append the file
        formDataToSend.append("assistantImage", formData.customImage);
      } else {
        // If it's a predefined image or custom image is not currently selected, append the URL
        formDataToSend.append("image", formData.selectedImage);
      }

      // console.log('Sending form data:', {
      //   assistantName: formData.assistantName,
      //   expiryDate: formData.expiryDate ? new Date(formData.expiryDate).toISOString().split('T')[0] : null,
      //   image: formData.isCustomImage && formData.customImage ? 'custom image file' : formData.selectedImage,
      //   isCustomImage: formData.isCustomImage,
      //   hasCustomImageFile: !!formData.customImage
      // });

      let response;
      if (isEditMode) {
        // Update existing assistant
        response = await assistantService.updateAssistantById(
          id,
          formDataToSend
        );
      } else {
        // Create new assistant
        response = await assistantService.createAssistant(formDataToSend);
      }

      if (response.data.status === 200) {
        setPreviewModal(false);
        const successMessage = isEditMode
          ? "Assistant updated successfully"
          : "Assistant created successfully";
        showToast(successMessage, "success");

        if (!isEditMode) {
          // Reset form only for create mode
          setFormData({
            assistantName: "",
            displayPath: ["Gather_Assist"],
            selectedPlatforms: [], // Reset selected platforms
            selectedActivity: null, // Reset selected activity
            selectedExperienceMode: null, // Reset selected experience mode
            selectedGoal: null, // Reset selected goal
            personaRules: [], // Reset persona rules
            selectedItems: [],
            expiryDate: "",
            assistantDescription: "",
            firstMessage: "Hi there! I'm your Assistant. I'm here to help you gather and organize important information. Are you ready to get started? You can type 'yes'.",
            callToAction: "",
            selectedImage:
              "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
            customImage: null,
            isCustomImage: false,
            createAsWidget: false,
            widgetName: "",
            widgetKey: "assistant_progress",
            widgetDisplayPath: {
              page: "Home Screen",
              section: "Left Panel",
            },
            isLoop: false,
            publishStatus: "Draft",
            alternateName: "",
            alternateInfo: "",
          });
          setChapters([]);
          setItems([]);
          setSelectedStories([]);
          setSelectedChapters([]);
          setSelectedItem("");
          setItemQuestion("");
          setUseCustomQuestion(false);
          setStorySearch("");
          setChapterSearch("");
          setItemSearch("");
          setCurrentStep(1);
          // Clear policy cache for create mode
          setPolicyCache({});
          // Clear activities, experience modes, and goals
          setActivities([]);
          setActivitySearchTerm("");
          setExperienceModes([]);
          setPlatformGoals([]);
        }

        // Navigate to ai-agents page with success message
        setTimeout(() => {
          // Preserve query parameters (platform, activity, search) from URL
          const searchParams = new URLSearchParams(location.search);
          const platform = searchParams.get('platform');
          const activity = searchParams.get('activity');
          const search = searchParams.get('search');
          
          const params = new URLSearchParams();
          if (platform) params.set('platform', platform);
          if (activity) params.set('activity', activity);
          if (search) params.set('search', search);
          
          const queryString = params.toString() ? `?${params.toString()}` : '';
          
          navigate(`/admin/ai-agents${queryString}`, {
            state: {
              message: successMessage,
              type: "success",
              action: isEditMode ? "updated" : "created",
            },
          });
        }, 1000);
      } else {
        const errorMessage = isEditMode
          ? "Failed to update assistant"
          : "Failed to create assistant";
        showToast(response.data.message || errorMessage, "error");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      showToast(error.response?.data?.message || "An error occurred", "error");
    } finally {
      setLoading(false);
    }
  };

  // const handleStartEditQuestion = (item) => {
  //   setEditingQuestionId(item.uniqueId);
  //   setEditingQuestionValue(item.question || "");
  //   // Initialize caret position for this item
  //   setTimeout(() => {
  //     const ref = textareaRefs.current[item.uniqueId];
  //     if (ref && ref.selectionStart !== undefined) {
  //       setCaretPositions((prev) => ({
  //         ...prev,
  //         [item.uniqueId]: ref.selectionStart,
  //       }));
  //     }
  //   }, 0);
  // };
// Modify handleStartEditQuestion to prepare the div's content
const handleStartEditQuestion = (item) => {
  setEditingQuestionId(item.uniqueId);
  const htmlContent = stringToHtml(item.question);
  setEditingQuestionValue(htmlContent);
  setTimeout(() => {
    const ref = contentEditableRef.current[item.uniqueId];
    if (ref) {
      ref.focus();
    }
  }, 0);
};
  // Update the revert question handler
  const handleRevertQuestion = (item) => {
    // Use a confirmation modal for a better user experience
    setRevertModal({
      isOpen: true,
      item: item,
    });
  };

  // Add new handlers for the modal
  const handleRevertConfirm = () => {
    if (revertModal.item) {
      let originalQuestion = revertModal.item.originalQuestion;
  
      // Fallback logic to get original question from the items list
      if (!originalQuestion || !originalQuestion.trim()) {
        const itemFromList = items.find(
          (item) => item.itemId === revertModal.item.itemId
        );
        if (itemFromList && itemFromList.question) {
          originalQuestion = itemFromList.question;
        }
      }
      
      // Final fallback
      if (!originalQuestion || !originalQuestion.trim()) {
          originalQuestion = revertModal.item.question || "No question available";
      }
  
      // Update the selectedItems state directly
      setFormData((prev) => ({
        ...prev,
        selectedItems: prev.selectedItems.map((i) =>
          i.uniqueId === revertModal.item.uniqueId
            ? {
                ...i,
                question: originalQuestion,
                useCustomQuestion: false, // Set to false to indicate it's no longer custom
              }
            : i
        ),
      }));
      
      showToast("Question reverted to original", "success");
    }
    setRevertModal({ isOpen: false, item: null });
  };

  const handleRevertCancel = () => {
    setRevertModal({ isOpen: false, item: null });
  };

  // Platform change warning modal handlers
  const handlePlatformChangeWarningClose = () => {
    setPlatformChangeWarningModal({ isOpen: false, selectedItemsCount: 0 });
  };

  // Handler to remove widget configuration
  const handleRemoveWidget = () => {
    setFormData((prev) => ({
      ...prev,
      createAsWidget: false,
      widgetName: "",
      widgetKey: "assistant_progress", // Reset to default
      widgetDisplayPath: {
        section: "Left Panel",
        page: "Home Screen"
      },
      isLoop: false,
    }));
    showToast("Widget configuration removed", "success");
  };

  // Handler to save edited question
  // const handleSaveEditQuestion = (item) => {
  //   // Validate that the question is not empty
  //   if (!editingQuestionValue || editingQuestionValue.trim() === "") {
  //     showToast("Custom question cannot be empty", "error");
  //     return;
  //   }

  //   setFormData((prev) => ({
  //     ...prev,
  //     selectedItems: prev.selectedItems.map((i) =>
  //       i.uniqueId === item.uniqueId
  //         ? { ...i, question: editingQuestionValue, useCustomQuestion: true }
  //         : i
  //     ),
  //   }));
  //   setEditingQuestionId(null);
  //   setEditingQuestionValue("");
  //   showToast("Question updated", "success");
  // };
  // Modify handleSaveEditQuestion to parse the div's content
const handleSaveEditQuestion = (item) => {
  const ref = contentEditableRef.current[item.uniqueId];
  if (!ref || !ref.textContent || ref.textContent.trim() === "") {
    showToast("Custom question cannot be empty", "error");
    return;
  }
  const finalQuestion = htmlToString(ref.innerHTML);
  setFormData((prev) => ({
    ...prev,
    selectedItems: prev.selectedItems.map((i) =>
      i.uniqueId === item.uniqueId
        ? { ...i, question: finalQuestion, useCustomQuestion: true }
        : i
    ),
  }));
  setEditingQuestionId(null);
  setEditingQuestionValue("");
  showToast("Question updated", "success");
};

  // Insert placeholder at caret and highlight in question
  // const handleInsertPlaceholder = (e, item) => {
  //   const key = e.target.value;
  //   if (!key) return;
  //   const token = `{${key}}`;

  //   if (editingQuestionId === item.uniqueId) {
  //     // Insert into textarea at caret
  //     const ref = textareaRefs.current[item.uniqueId];
  //     const value = editingQuestionValue || "";
  //     let start = (ref && ref.selectionStart != null) ? ref.selectionStart : (caretPositions[item.uniqueId] || value.length);
  //     let end = (ref && ref.selectionEnd != null) ? ref.selectionEnd : start;
  //     const newValue = value.slice(0, start) + token + value.slice(end);
  //     setEditingQuestionValue(newValue);
  //     // Move caret after inserted token
  //     requestAnimationFrame(() => {
  //       const pos = start + token.length;
  //       if (ref) {
  //         ref.focus();
  //         ref.setSelectionRange(pos, pos);
  //       }
  //       setCaretPositions((prev) => ({ ...prev, [item.uniqueId]: pos }));
  //     });
  //   } else {
  //     // Not in edit mode: start edit and append at end
  //     setEditingQuestionId(item.uniqueId);
  //     const base = item.question || "";
  //     const newValue = base + token;
  //     setEditingQuestionValue(newValue);
  //     requestAnimationFrame(() => {
  //       const ref = textareaRefs.current[item.uniqueId];
  //       const pos = newValue.length;
  //       if (ref) {
  //         ref.focus();
  //         ref.setSelectionRange(pos, pos);
  //       }
  //       setCaretPositions((prev) => ({ ...prev, [item.uniqueId]: pos }));
  //     });
  //   }

  //   // Reset the select back to placeholder option
  //   e.target.value = "";
  // };
  // Modify handleInsertPlaceholder to insert the new HTML span at the cursor
const handleInsertPlaceholder = (e, item) => {
  const key = e.target.value;
  if (!key) return;
  
  const tokenHtml = `<span class="placeholder-tag" contenteditable="false" data-value="${key}">${key.replace(
    /_/g,
    " "
  )}</span>`;

  // Helper function to find the contenteditable element
  const findContentEditableElement = (uniqueId) => {
    // First try the ref
    let ref = contentEditableRef.current[uniqueId];
    if (ref) return ref;
    
    // If ref is not available, try to find it in the DOM
    const element = document.querySelector(`[data-unique-id="${uniqueId}"]`);
    if (element) {
      contentEditableRef.current[uniqueId] = element; // Cache it
      return element;
    }
    
    return null;
  };

  // If not already in edit mode, switch to edit mode first
  if (!editingQuestionId) {
    handleStartEditQuestion(item);
    setTimeout(() => {
      const element = findContentEditableElement(item.uniqueId);
      if (element) {
        insertHtmlAtCaret(element, tokenHtml);
      } else {
        console.error('ContentEditable element not found after starting edit mode');
      }
      e.target.value = "";
    }, 100); // Increased timeout to ensure DOM is updated
  } else {
    const element = findContentEditableElement(item.uniqueId);
    if (element) {
      insertHtmlAtCaret(element, tokenHtml);
    } else {
      console.error('ContentEditable element not found:', item.uniqueId);
    }
    e.target.value = "";
  }
};
// Enhanced helper function to insert HTML at the current caret position
const insertHtmlAtCaret = (el, html) => {
  // 1. First, focus the target element to ensure it's the active element
  el.focus();
  
  const sel = window.getSelection();
  if (!sel) return;
  
  let range;
  
  // 2. Check if we have a valid selection inside our target element
  if (sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
    // The cursor is already in the right place, use it
    range = sel.getRangeAt(0);
  } else {
    // 3. If no valid selection, create a new range at the end of the element
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // Collapse to the end
    sel.removeAllRanges();
    sel.addRange(range);
  }
  
  // 4. Perform the insertion
  range.deleteContents();
  
  // Create a temporary element to safely parse the HTML string
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  
  // Create a document fragment to efficiently insert the new nodes
  const frag = document.createDocumentFragment();
  let lastNode;
  while (tempDiv.firstChild) {
    lastNode = frag.appendChild(tempDiv.firstChild);
  }
  range.insertNode(frag);
  
  // 5. Move cursor after the inserted content
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  
  // 6. Ensure the element stays focused
  el.focus();
};
  // Helper function to sync policy changes back to selectedItems
  const syncPoliciesToSelectedItems = (itemId, policies) => {
    if (itemId && policies) {
      setFormData((prev) => ({
        ...prev,
        selectedItems: prev.selectedItems.map((item) => {
          if (item.itemId === itemId) {
            return {
              ...item,
              policies: policies,
            };
          }
          return item;
        }),
      }));
    }
  };

  // Add function to close policy modal and save changes
  const handleClosePolicyModal = () => {
    // Save policy changes back to selectedItems if there's an itemId
    if (policyModal.itemId && policyModal.policies.length >= 0) {
      syncPoliciesToSelectedItems(policyModal.itemId, policyModal.policies);
      // console.log(
      //   `Saved ${policyModal.policies.length} policies for item ${policyModal.itemId} back to selectedItems`
      // );
    }

    setPolicyModal({
      isOpen: false,
      itemName: "",
      policies: [],
      itemId: null,
    });
  };

  // Policy Functions Modal management
  const openPolicyFunctionsModal = (policyIndex) => {
    const selectedPolicy = policyModal.policies[policyIndex];
    setPolicyFunctionsModal({
      isOpen: true,
      selectedPolicyIndex: policyIndex,
      selectedPolicy: selectedPolicy,
    });
  };
  const openConditionModal = (policyIndex) => {
    const selectedPolicy = policyModal.policies[policyIndex];
    setConditionModal({
      isOpen: true,
      policyIndex: policyIndex,
      selectedPolicy: selectedPolicy,
    });
    // Load existing conditions for this policy
    setCurrentConditions(selectedPolicy.conditions || []);
    // Reset form
    setConditionForm({
      dependsOn: "",
      value: "yes",
      operator: "Equal",
    });
  };

  const handleCloseConditionModal = () => {
    setConditionModal({
      isOpen: false,
      policyIndex: null,
      selectedPolicy: null,
    });
    setCurrentConditions([]);
    setConditionForm({
      dependsOn: "",
      value: "yes",
      operator: "Equal",
    });
  };

  const handleAddCondition = () => {
    if (!conditionForm.dependsOn) {
      showToast("Please select a policy to depend on", "error");
      return;
    }

    const newCondition = {
      dependsOn: conditionForm.dependsOn, // Store policy name instead of sequence
      value: conditionForm.value,
      operator: conditionForm.operator,
    };

    setCurrentConditions((prev) => [...prev, newCondition]);

    const updatedPolicies = policyModal.policies.map((policy, index) =>
      index === conditionModal.policyIndex
        ? {
            ...policy,
            conditions: [...(policy.conditions || []), newCondition],
          }
        : policy
    );

    // Update both modal state and cache
    setPolicyModal((prev) => ({
      ...prev,
      policies: updatedPolicies,
    }));

    // Update cache
    setPolicyCache((prev) => ({
      ...prev,
      [policyModal.itemId]: updatedPolicies,
    }));

    // Reset form
    setConditionForm({
      dependsOn: "",
      value: "yes",
      operator: "Equal",
    });

    showToast("Condition added successfully", "success");
  };

  const handleRemoveCondition = (conditionIndex) => {
    setCurrentConditions((prev) =>
      prev.filter((_, index) => index !== conditionIndex)
    );

    const updatedPolicies = policyModal.policies.map((policy, index) =>
      index === conditionModal.policyIndex
        ? {
            ...policy,
            conditions: (policy.conditions || []).filter(
              (_, cIndex) => cIndex !== conditionIndex
            ),
          }
        : policy
    );

    // Update both modal state and cache
    setPolicyModal((prev) => ({
      ...prev,
      policies: updatedPolicies,
    }));

    // Update cache
    setPolicyCache((prev) => ({
      ...prev,
      [policyModal.itemId]: updatedPolicies,
    }));

    showToast("Condition removed successfully", "success");
  };

  const handleConditionFormChange = (field, value) => {
    setConditionForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };
  const closePolicyFunctionsModal = () => {
    setPolicyFunctionsModal({
      isOpen: false,
      selectedPolicyIndex: null,
      selectedPolicy: null,
    });
  };

  const openAddPolicyFunctionModal = (policyIndex) => {
    setAddPolicyFunctionModal({
      isOpen: true,
      policyIndex: policyIndex,
      newFunctionData: {
        event: "before",
        functionId: "",
        displayType: "radio",
      },
    });
  };

  const closeAddPolicyFunctionModal = () => {
    setAddPolicyFunctionModal({
      isOpen: false,
      policyIndex: null,
      newFunctionData: {
        event: "before",
        functionId: "",
        displayType: "radio",
      },
    });
  };

  const openEditPolicyFunctionModal = (policyIndex, functionIndex) => {
    const policy = policyModal.policies[policyIndex];
    const functionToEdit = policy.functionFlow[functionIndex];

    setEditPolicyFunctionModal({
      isOpen: true,
      policyIndex: policyIndex,
      functionIndex: functionIndex,
      functionData: {
        event: functionToEdit.event || "before",
        functionId: functionToEdit.functionId || "",
        displayType: functionToEdit.displayType || "radio",
        order: functionToEdit.order || 1,
      },
    });
  };

  const closeEditPolicyFunctionModal = () => {
    setEditPolicyFunctionModal({
      isOpen: false,
      policyIndex: null,
      functionIndex: null,
      functionData: {
        event: "before",
        functionId: "",
        displayType: "radio",
        order: 1,
      },
    });
  };

  const addFunctionToPolicy = () => {
    const { policyIndex, newFunctionData } = addPolicyFunctionModal;

    if (!newFunctionData.functionId) {
      showToast("Please select a function", "error");
      return;
    }

    // Get the current policy's function count to set the order
    const currentPolicy = policyModal.policies[policyIndex];
    const currentFunctionCount = (currentPolicy.functionFlow || []).length;
    const functionWithOrder = {
      ...newFunctionData,
      order: currentFunctionCount + 1,
    };

    const updatedPolicies = policyModal.policies.map((policy, index) =>
      index === policyIndex
        ? {
            ...policy,
            functionFlow: [...(policy.functionFlow || []), functionWithOrder],
          }
        : policy
    );

    // Update both modal state and cache
    setPolicyModal((prev) => ({
      ...prev,
      policies: updatedPolicies,
    }));

    // Update cache
    setPolicyCache((prev) => ({
      ...prev,
      [policyModal.itemId]: updatedPolicies,
    }));

    // Update the modal state to reflect the new function
    setPolicyFunctionsModal((prev) => ({
      ...prev,
      selectedPolicy: {
        ...prev.selectedPolicy,
        functionFlow: [
          ...(prev.selectedPolicy.functionFlow || []),
          functionWithOrder,
        ],
      },
    }));

    closeAddPolicyFunctionModal();
    showToast("Function added successfully", "success");
  };

  const updateFunctionInPolicy = () => {
    const { policyIndex, functionIndex, functionData } =
      editPolicyFunctionModal;

    if (!functionData.functionId) {
      showToast("Please select a function", "error");
      return;
    }

    const updatedPolicies = policyModal.policies.map((policy, index) =>
      index === policyIndex
        ? {
            ...policy,
            functionFlow: policy.functionFlow.map((func, fIndex) =>
              fIndex === functionIndex ? { ...func, ...functionData } : func
            ),
          }
        : policy
    );

    // Update both modal state and cache
    setPolicyModal((prev) => ({
      ...prev,
      policies: updatedPolicies,
    }));

    // Update cache
    setPolicyCache((prev) => ({
      ...prev,
      [policyModal.itemId]: updatedPolicies,
    }));

    // Update the modal state to reflect the changes
    setPolicyFunctionsModal((prev) => {
      if (!prev.selectedPolicy || !prev.selectedPolicy.functionFlow) {
        return prev;
      }

      const updatedFunctions = prev.selectedPolicy.functionFlow.map(
        (func, fIndex) =>
          fIndex === functionIndex ? { ...func, ...functionData } : func
      );

      return {
        ...prev,
        selectedPolicy: {
          ...prev.selectedPolicy,
          functionFlow: updatedFunctions,
        },
      };
    });

    closeEditPolicyFunctionModal();
    showToast("Function updated successfully", "success");
  };

  const removeFunctionFromPolicy = (functionIndex) => {
    const policyIndex = policyFunctionsModal.selectedPolicyIndex;

    if (policyIndex === null || policyIndex === undefined) {
      showToast("Error: Policy index not found", "error");
      return;
    }

    const updatedPolicies = policyModal.policies.map((policy, index) =>
      index === policyIndex
        ? {
            ...policy,
            functionFlow: (policy.functionFlow || [])
              .filter((_, fIndex) => fIndex !== functionIndex)
              .map((func, newIndex) => ({ ...func, order: newIndex + 1 })), // Reorder remaining functions
          }
        : policy
    );

    // Update both modal state and cache
    setPolicyModal((prev) => ({
      ...prev,
      policies: updatedPolicies,
    }));

    // Update cache
    setPolicyCache((prev) => ({
      ...prev,
      [policyModal.itemId]: updatedPolicies,
    }));

    // Update the modal state to reflect changes
    setPolicyFunctionsModal((prev) => {
      if (!prev.selectedPolicy || !prev.selectedPolicy.functionFlow) {
        return prev;
      }

      const updatedFunctions = prev.selectedPolicy.functionFlow
        .filter((_, fIndex) => fIndex !== functionIndex)
        .map((func, newIndex) => ({ ...func, order: newIndex + 1 }));

      return {
        ...prev,
        selectedPolicy: {
          ...prev.selectedPolicy,
          functionFlow: updatedFunctions,
        },
      };
    });

    showToast("Function removed successfully", "success");
  };

  const handlePolicyFunctionDragEnd = (result) => {
    if (!result.destination) return;

    const { source, destination } = result;
    const policyIndex = policyFunctionsModal.selectedPolicyIndex;

    const policy = policyModal.policies[policyIndex];
    const functions = Array.from(policy.functionFlow || []);
    const [movedFunction] = functions.splice(source.index, 1);
    functions.splice(destination.index, 0, movedFunction);

    // Update order numbers
    const reorderedFunctions = functions.map((func, index) => ({
      ...func,
      order: index + 1,
    }));

    setPolicyModal((prev) => ({
      ...prev,
      policies: prev.policies.map((policy, index) =>
        index === policyIndex
          ? { ...policy, functionFlow: reorderedFunctions }
          : policy
      ),
    }));

    // Update the modal state to reflect changes
    setPolicyFunctionsModal((prev) => ({
      ...prev,
      selectedPolicy: {
        ...prev.selectedPolicy,
        functionFlow: reorderedFunctions,
      },
    }));
  };

  const updateNewPolicyFunctionData = (field, value) => {
    setAddPolicyFunctionModal((prev) => ({
      ...prev,
      newFunctionData: {
        ...prev.newFunctionData,
        [field]: value,
      },
    }));
  };

  const updateEditPolicyFunctionData = (field, value) => {
    setEditPolicyFunctionModal((prev) => ({
      ...prev,
      functionData: {
        ...prev.functionData,
        [field]: value,
      },
    }));
  };

  // Policy custom questions handlers
  const handleStartEditPolicyQuestion = (policy) => {
    setEditingPolicyQuestionId(policy.sequence);
    setTimeout(() => {
      const ref = policyContentEditableRef.current[policy.sequence];
      if (ref) {
        ref.focus();
      }
    }, 0);
  };

  const handleSaveEditPolicyQuestion = (policy) => {
    const ref = policyContentEditableRef.current[policy.sequence];
    if (!ref || !ref.textContent || ref.textContent.trim() === "") {
      showToast("Custom question cannot be empty", "error");
      return;
    }
    const finalQuestion = htmlToString(ref.innerHTML);
    
    const updatedPolicies = policyModal.policies.map((p) =>
      p.sequence === policy.sequence
        ? {
            ...p,
            question: finalQuestion,
            useCustomQuestion: true,
          }
        : p
    );

    // Update both modal state and cache
    setPolicyModal((prev) => ({
      ...prev,
      policies: updatedPolicies,
    }));

    // Update cache
    setPolicyCache((prev) => ({
      ...prev,
      [policyModal.itemId]: updatedPolicies,
    }));

    setEditingPolicyQuestionId(null);
    showToast("Policy question updated", "success");
  };

  const handleRevertPolicyQuestion = (policy) => {
    setPolicyRevertModal({
      isOpen: true,
      policy: policy,
    });
  };

  // Handle inserting placeholders into policy questions
  const handleInsertPolicyPlaceholder = (e, policy) => {
    const key = e.target.value;
    if (!key) return;
    
    const tokenHtml = `<span class="placeholder-tag" contenteditable="false" data-value="${key}">${key.replace(
      /_/g,
      " "
    )}</span>`;

    // Helper function to find the contenteditable element
    const findContentEditableElement = (uniqueId) => {
      // First try the ref
      let ref = policyContentEditableRef.current[uniqueId];
      if (ref) return ref;
      
      // If ref is not available, try to find it in the DOM
      const element = document.querySelector(`[data-unique-id="${uniqueId}"]`);
      if (element) {
        policyContentEditableRef.current[uniqueId] = element; // Cache it
        return element;
      }
      
      return null;
    };

    // If not already in edit mode, switch to edit mode first
    if (!editingPolicyQuestionId) {
      handleStartEditPolicyQuestion(policy);
      setTimeout(() => {
        const element = findContentEditableElement(policy.sequence);
        if (element) {
          insertHtmlAtCaret(element, tokenHtml);
        } else {
          console.error('Policy contenteditable element not found after starting edit mode');
        }
        e.target.value = "";
      }, 100); // Increased timeout to ensure DOM is updated
    } else {
      const element = findContentEditableElement(policy.sequence);
      if (element) {
        insertHtmlAtCaret(element, tokenHtml);
      } else {
        console.error('Policy contenteditable element not found:', policy.sequence);
      }
      e.target.value = "";
    }
  };

  const handlePolicyRevertConfirm = () => {
    if (policyRevertModal.policy) {
      // Try to get the original question from multiple sources
      let originalQuestion = policyRevertModal.policy.originalQuestion;

      // If originalQuestion is not available, try to get it from the policy details
      if (!originalQuestion || !originalQuestion.trim()) {
        originalQuestion =
          policyRevertModal.policy.question || "No question available";
      }

      const updatedPolicies = policyModal.policies.map((p) =>
        p.sequence === policyRevertModal.policy.sequence
          ? {
              ...p,
              question: originalQuestion,
              originalQuestion: originalQuestion,
              useCustomQuestion: false,
            }
          : p
      );

      // Update both modal state and cache
      setPolicyModal((prev) => ({
        ...prev,
        policies: updatedPolicies,
      }));

      // Update cache
      setPolicyCache((prev) => ({
        ...prev,
        [policyModal.itemId]: updatedPolicies,
      }));

      showToast("Policy question reverted to original", "success");
    }
    setPolicyRevertModal({ isOpen: false, policy: null });
  };

  const handlePolicyRevertCancel = () => {
    setPolicyRevertModal({ isOpen: false, policy: null });
  };

  // Add this handler after all other drag handlers
  const handlePolicyDragEnd = (result) => {
    if (!result.destination) return;

    const { source, destination } = result;
    const policies = Array.from(policyModal.policies);
    const [movedPolicy] = policies.splice(source.index, 1);
    policies.splice(destination.index, 0, movedPolicy);

    // Update sequence numbers after reordering
    const reorderedPolicies = policies.map((policy, index) => ({
      ...policy,
      sequence: index + 1,
    }));

    // Update both modal state and cache
    setPolicyModal((prev) => ({
      ...prev,
      policies: reorderedPolicies,
    }));
    setPolicyCache((prev) => ({
      ...prev,
      [policyModal.itemId]: reorderedPolicies,
    }));
  };

  // Enhanced policy styles with functions and custom questions
  const policyStyles = `
    .policy-modal .modal-content {
      border-radius: 0.5rem;
    }
    
    .policy-modal .modal-header {
      border-bottom: 1px solid #e9ecef;
      padding: 1rem 1.5rem;
    }
    
    .policy-modal .modal-body {
      padding: 1.5rem;
    }
    
    .policy-list {
      max-height: 60vh;
      overflow-y: auto;
    }
    
    .policy-item {
      background: white;
      border: 1px solid #e9ecef;
      border-radius: 0.5rem;
      transition: all 0.2s ease;
      margin-bottom: 1rem;
    }
    
    .policy-item:hover {
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      border-color: #3A6D8C;
    }

    .policy-header {
      padding: 1rem;
    }

    .policy-question-section {
      margin-bottom: 1rem;
    }

    .policy-functions-section {
      text-align: right;
      min-width: 200px;
    }

    .edit-button {
      color: #3A6D8C;
      cursor: pointer;
      padding: 8px;
      border-radius: 4px;
      background: rgba(58, 109, 140, 0.1);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
    }

    .edit-button:hover {
      background: rgba(58, 109, 140, 0.2);
      transform: scale(1.05);
    }

    .function-summary {
      font-size: 0.875rem;
      color: #8898aa;
    }

    .function-count {
      background: #e9ecef;
      padding: 0.25rem 0.75rem;
      border-radius: 1rem;
      font-size: 0.75rem;
      color: #525f7f;
      font-weight: 500;
    }

    .function-flow-button {
      background: #3A6D8C;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.2s ease;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .function-flow-button:hover {
      background: #2d5670;
      transform: translateY(-1px);
    }

    .function-flow-button:disabled {
      background: #e9ecef;
      color: #8898aa;
      cursor: not-allowed;
    }

    .functions-droppable {
      transition: all 0.2s ease;
    }

    .functions-droppable.dragging-over {
      background-color: #f8f9fa !important;
      border-color: #3A6D8C !important;
    }

    .function-card {
      transition: all 0.2s ease;
    }

    .function-card:hover {
      border-color: #3A6D8C !important;
    }

    .function-card.dragging {
      transform: rotate(5deg);
      box-shadow: 0 8px 16px rgba(0,0,0,0.1);
    }

    .function-name {
      font-weight: 500;
      color: #32325d;
    }

    .edit-question-container {
      background: #f8f9fa;
      padding: 0.5rem;
      border-radius: 0.375rem;
      border: 1px solid #e9ecef;
    }

    .edit-question-actions {
      display: flex;git p
      gap: 0.5rem;
      align-items: center;
    }

    .question-text {
      transition: all 0.2s ease;
      line-height: 1.5;
    }

    .question-text:hover {
      background-color: #e9ecef !important;
    }

    .policy-item .badge {
      font-size: 0.75rem;
      font-weight: 500;
    }

    .policy-item .btn-link {
      color: #3A6D8C;
      text-decoration: none;
      font-size: 0.875rem;
    }

    .policy-item .btn-link:hover {
      color: #2d5670;
      text-decoration: underline;
    }

    /* Condition Modal Styles */
    .condition-item {
      transition: all 0.2s ease;
      border: 1px solid #e9ecef;
    }

    .condition-item:hover {
      border-color: #3A6D8C;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .add-condition-form {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 0.375rem;
      border: 1px solid #e9ecef;
    }

    .conditions-list {
      max-height: 300px;
      overflow-y: auto;
    }

    .condition-item .badge {
      font-size: 0.75rem;
      font-weight: 500;
    }

    .condition-item .text-muted {
      font-size: 0.875rem;
      font-style: italic;
    }
  `;

  // Add these new functions after the existing state declarations
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        showToast("Please upload an image file", "error");
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showToast("Image size should be less than 5MB", "error");
        return;
      }

      // Show loading state during validation
      setImageValidationLoading(true);

      // Validate image dimensions
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url); // Clean up the URL
        setImageValidationLoading(false);
        
        const reader = new FileReader();
        reader.onload = (e) => {
          setFormData((prev) => ({
            ...prev,
            selectedImage: e.target.result,
            customImage: file,
            isCustomImage: true, 
          }));
          showToast("Custom image uploaded successfully", "success");
        };
        reader.readAsDataURL(file);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        setImageValidationLoading(false);
        showToast("Error loading image. Please try again.", "error");
      };

      img.src = url;
    }
  };

  const handleImageSelect = (imageUrl) => {
    setFormData((prev) => ({
      ...prev,
      selectedImage: imageUrl,
      isCustomImage: false, // Mark as default image
      // Note: We don't clear customImage here to allow re-uploading
    }));
    showToast("Default image selected", "success");
  };

  // Add function to handle custom image removal
  const handleRemoveCustomImage = () => {
    setFormData((prev) => ({
      ...prev,
      selectedImage:
        "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
      customImage: null,
      isCustomImage: false,
    }));
    showToast("Custom image removed", "success");
  };

  // Add function to re-upload custom image
  const handleReuploadCustomImage = () => {
    // Trigger the file input click
    document.getElementById("custom-image-upload").click();
  };

  // Add function to restore previously uploaded custom image
  const handleRestoreCustomImage = () => {
    if (formData.customImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData((prev) => ({
          ...prev,
          selectedImage: e.target.result,
          isCustomImage: true,
        }));
        showToast("Custom image restored", "success");
      };
      reader.readAsDataURL(formData.customImage);
    }
  };

  // Add loading indicator for initial data fetch
  if (initialLoading) {
    return (
      <Container fluid>
        <Row className="justify-content-center align-items-center" style={{ minHeight: '80vh' }}>
          <Col md={6} className="text-center">
            <div className="p-4 bg-white rounded shadow-sm">
              <Spinner 
                color="primary" 
                style={{ width: '3rem', height: '3rem', marginBottom: '1rem' }} 
              />
              <h5 className="text-primary mb-2">Loading Assistant Data</h5>
              <p className="text-muted">Please wait while we fetch the assistant information...</p>
            </div>
          </Col>
        </Row>
      </Container>
    );
  }

  // Add a constant for max description length
  const MAX_DESCRIPTION_LENGTH = 500;

  // Add a function to handle description change with character limit
  const handleDescriptionChange = (e) => {
    const value = e.target.value;
    if (value.length <= MAX_DESCRIPTION_LENGTH) {
      setFormData((prev) => ({
        ...prev,
        assistantDescription: value,
      }));
    }
  };

  // Add function to handle first message change with validation
  const handleFirstMessageChange = (e) => {
    const value = e.target.value;
    let validationError = "";

    if (value.length > 1000) {
      validationError = "First message cannot exceed 1000 characters";
    }

    setFormData((prev) => ({
      ...prev,
      firstMessage: value,
    }));

    setErrors((prev) => ({
      ...prev,
      firstMessage: validationError,
    }));
  };

  // Handle emoji click for firstMessage
  const handleFirstMessageEmojiClick = (emojiObject) => {
    const textarea = firstMessageTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = formData.firstMessage;
      const newText = text.substring(0, start) + emojiObject.emoji + text.substring(end);
      
      // Check if adding emoji exceeds max length
      if (newText.length > 1000) {
        showToast("First message cannot exceed 1000 characters", "error");
        return;
      }

      setFormData((prev) => ({
        ...prev,
        firstMessage: newText,
      }));

      // Set cursor position after emoji
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emojiObject.emoji.length, start + emojiObject.emoji.length);
      }, 0);
    }
    setShowFirstMessageEmojiPicker(false);
  };

  // Add function to handle call to action change with validation
  const handleCallToActionChange = (e) => {
    const value = e.target.value;
    let validationError = "";

    if (value.length > 100) {
      validationError = "Call to action cannot exceed 100 characters";
    }

    setFormData((prev) => ({
      ...prev,
      callToAction: value,
    }));

    setErrors((prev) => ({
      ...prev,
      callToAction: validationError,
    }));
  };

  // Add function to validate custom questions
  const validateCustomQuestions = () => {
    const isValid = formData.selectedItems.every(
      (item) =>
        !item.useCustomQuestion ||
        (item.question && item.question.trim() !== "")
    );

    if (!isValid) {
      updateCustomQuestionErrors();
    } else {
      setErrors((prev) => ({
        ...prev,
        customQuestions: "",
      }));
    }

    return isValid;
  };

  // Add function to get validation error message for custom questions
  const getCustomQuestionValidationError = () => {
    const invalidItems = formData.selectedItems.filter(
      (item) =>
        item.useCustomQuestion &&
        (!item.question || item.question.trim() === "")
    );

    if (invalidItems.length > 0) {
      return `Custom questions cannot be empty for: ${invalidItems
        .map((item) => item.itemName)
        .join(", ")}`;
    }
    return "";
  };

  // Add function to update custom question validation errors
  const updateCustomQuestionErrors = () => {
    const errorMessage = getCustomQuestionValidationError();
    setErrors((prev) => ({
      ...prev,
      customQuestions: errorMessage,
    }));
  };
  // Enhanced policies modal with dynamic functions and custom questions
  const renderPolicyModal = () => {
    return (
      <Modal
        isOpen={policyModal.isOpen}
        toggle={handleClosePolicyModal}
        size="lg"
        className="policy-modal"
      >
        <ModalHeader toggle={handleClosePolicyModal}>
          <div className="d-flex align-items-center">
            <i className="fas fa-shield-alt mr-2"></i>
            Policies for {policyModal.itemName}
          </div>
        </ModalHeader>
        <ModalBody>
          {loading ? (
            <div className="text-center py-4">
              <Spinner color="primary" />
            </div>
          ) : policyModal.policies.length > 0 ? (
            <DragDropContext onDragEnd={handlePolicyDragEnd}>
              <Droppable droppableId="policies-list">
                {(provided, snapshot) => (
                  <div
                    className="policy-list"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {policyModal.policies.map((policy, index) => (
                      <Draggable
                        key={policy.sequence}
                        draggableId={`policy-${policy.sequence}`}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`policy-item ${
                              snapshot.isDragging ? "dragging" : ""
                            }`}
                            style={{
                              ...provided.draggableProps.style,
                              background: snapshot.isDragging
                                ? "#f8f9fa"
                                : "white",
                            }}
                          >
                            <div
                              style={{ display: "flex", alignItems: "center" }}
                            >
                              <div
                                {...provided.dragHandleProps}
                                style={{
                                  marginRight: 12,
                                  cursor: "grab",
                                  color: "#8898aa",
                                  fontSize: 20,
                                }}
                              >
                                <FaGripVertical />
                              </div>
                              <div style={{ flex: 1 }}>
                                {/* Policy header and question section as before */}
                                <div className="policy-header d-flex justify-content-between align-items-start mb-1">
                                  <div className="flex-grow-1">
                                    <div className="d-flex align-items-center mb-3">
                                      <Badge color="primary" className="mr-2">
                                        Sequence: {policy.sequence}
                                      </Badge>
                                      <span className="function-summary">
                                        {policy.policy}
                                      </span>
                                      {policy.useCustomQuestion && (
                                        <Badge color="warning" className="mr-2">
                                          Custom Question
                                        </Badge>
                                      )}
                                      {(policy.conditions || []).length > 0 && (
                                        <Badge color="primary" className="mr-2">
                                          {(policy.conditions || []).length}{" "}
                                          Condition
                                          {(policy.conditions || []).length !==
                                          1
                                            ? "s"
                                            : ""}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  {/* Policy Functions Section - Positioned on the right */}
                                  <div className="policy-functions-section d-flex align-items-center">
                                    <div className="function-summary">
                                      <span className="function-summary mt-2 mr-2">
                                        {(policy.functionFlow || []).length}{" "}
                                        Action
                                        {(policy.functionFlow || []).length !==
                                        1
                                          ? "s"
                                          : ""}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      className="function-flow-button"
                                      onClick={() =>
                                        openPolicyFunctionsModal(index)
                                      }
                                    >
                                      <i className="fas fa-cog"></i>
                                      Agent Actions
                                    </button>
                                  </div>
                                  <div className="d-flex align-items-center ml-2">
                                    <button
                                      type="button"
                                      className="function-flow-button"
                                      onClick={() => openConditionModal(index)}
                                      disabled={policy.sequence === 1}
                                      title={
                                        policy.sequence === 1
                                          ? "Cannot add condition to the first policy"
                                          : ""
                                      }
                                    >
                                      Add Condition
                                    </button>
                                  </div>
                                </div>
                                {/* Policy Question Section (unchanged) */}
                                <div className="policy-question-section">
                                  {editingPolicyQuestionId ===
                                  policy.sequence ? (
                                    <div className="edit-question-container">
                                      <div
                                        ref={(el) => (policyContentEditableRef.current[policy.sequence] = el)}
                                        className="form-control-alternative contenteditable-container"
                                        contentEditable={true}
                                        data-unique-id={policy.sequence}
                                        dangerouslySetInnerHTML={{ __html: stringToHtml(policy.question || "") }}
                                        style={{
                                          minHeight: 60,
                                          marginBottom: "8px",
                                        }}
                                      />
                                      <div className="mt-2 mb-2">
                                        <select
                                          className="placeholder-select mb-1 bg-primary"
                                          value=""
                                          onChange={(e) => handleInsertPolicyPlaceholder(e, policy)}
                                          aria-label="Insert Placeholder"
                                        >
                                          <option value="" disabled>
                                            Insert Placeholder
                                          </option>
                                          <option value="storyName">Story Name</option>
                                          <option value="chapterName">Chapter Name</option>
                                          <option value="itemName">Item Name</option>
                                          <option value="subCategoryName">Sub Category</option>
                                        </select>
                                      </div>
                                      <div className="edit-question-actions">
                                        <Button
                                          color="primary"
                                          size="sm"
                                          onClick={() =>
                                            handleSaveEditPolicyQuestion(policy)
                                          }
                                          className="mr-2"
                                        >
                                          Save
                                        </Button>
                                        <Button
                                          color="secondary"
                                          size="sm"
                                          onClick={() => {
                                            setEditingPolicyQuestionId(null);
                                          }}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="question-display">
                                      <div
                                        className="question-text"
                                        style={{
                                          cursor: "pointer",
                                          padding: "16px",
                                          borderRadius: "8px",
                                          backgroundColor: "#f8f9fa",
                                          minHeight: "60px",
                                          border:
                                            policy.useCustomQuestion &&
                                            (!policy.question ||
                                              policy.question.trim() === "")
                                              ? "2px solid #dc3545"
                                              : "1px solid #e9ecef",
                                          borderStyle:
                                            policy.useCustomQuestion &&
                                            (!policy.question ||
                                              policy.question.trim() === "")
                                              ? "dashed"
                                              : "solid",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                        }}
                                        onClick={() =>
                                          handleStartEditPolicyQuestion(policy)
                                        }
                                        title={
                                          policy.useCustomQuestion &&
                                          (!policy.question ||
                                            policy.question.trim() === "")
                                            ? "Click to add custom question (required)"
                                            : "Click to edit question"
                                        }
                                      >
                                        <div className="flex-grow-1">
                                          {policy.question ? (
                                            <div
                                              dangerouslySetInnerHTML={{
                                                __html: stringToHtml(policy.question),
                                              }}
                                            />
                                          ) : (
                                            <span
                                              className={
                                                policy.useCustomQuestion
                                                  ? "text-danger"
                                                  : "text-muted"
                                              }
                                            >
                                              {policy.useCustomQuestion
                                                ? "Custom question required (click to add)"
                                                : "No question available (click to add)"}
                                            </span>
                                          )}
                                        </div>
                                        <div className="ml-2"></div>
                                      </div>
                                      {policy.useCustomQuestion &&
                                        (!policy.question ||
                                          policy.question.trim() === "") && (
                                          <div className="text-danger mt-1 small">
                                            Custom question cannot be empty
                                          </div>
                                        )}
                                      {policy.useCustomQuestion && (
                                        <div className="mt-2">
                                          <Button
                                            color="link"
                                            size="sm"
                                            className="p-0"
                                            onClick={() =>
                                              handleRevertPolicyQuestion(policy)
                                            }
                                          >
                                            Revert to Original
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted mb-0">No policies found for this item</p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={handleClosePolicyModal}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    );
  };

  const renderConditionModal = () => {
    return (
      <Modal
        isOpen={conditionModal.isOpen}
        toggle={handleCloseConditionModal}
        size="lg"
      >
        <ModalHeader toggle={handleCloseConditionModal}>
          <div className="d-flex align-items-center">
            <i className="fas fa-link mr-2"></i>
            Add Conditions - Policy {conditionModal.selectedPolicy?.sequence}
            {conditionModal.selectedPolicy?.question && (
              <span>| {conditionModal.selectedPolicy.question}</span>
            )}
          </div>
        </ModalHeader>
        <ModalBody>
          {/* Current Conditions List */}
          <div className="mb-4">
            <h4
              className="mb-3"
              style={{ fontWeight: 400, fontSize: "1.15rem" }}
            >
              Current Conditions
            </h4>
            {currentConditions.length > 0 ? (
              <div className="conditions-list">
                {currentConditions.map((condition, index) => {
                  const operatorLabel =
                    conditionOperators.find(
                      (op) => op.value === condition.operator
                    )?.label || condition.operator;
                  const valueLabel =
                    conditionValues.find((val) => val.value === condition.value)
                      ?.label || condition.value;

                  return (
                    <div
                      key={index}
                      className="condition-item d-flex align-items-center justify-content-between p-3 mb-2 bg-light rounded"
                    >
                      <div className="flex-grow-1">
                        <div className="d-flex align-items-center">
                          <Badge color="primary" className="mr-2">
                            {condition.dependsOn}
                          </Badge>
                          <span className="mr-2">{operatorLabel}</span>
                          <Badge color="primary">{valueLabel}</Badge>
                        </div>
                      </div>
                      <Button
                        color="danger"
                        size="sm"
                        onClick={() => handleRemoveCondition(index)}
                        title="Remove condition"
                      >
                        <i className="fas fa-times"></i>
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-muted py-3">
                No conditions configured for this policy
              </div>
            )}
          </div>

          <hr />

          {/* Add New Condition Form */}
          <div className="add-condition-form">
            <h4
              className="mb-3"
              style={{ fontWeight: 400, fontSize: "1.15rem" }}
            >
              Add New Condition
            </h4>
            <div className="row">
              <div className="col-md-4">
                <FormGroup>
                  <Label>Depend on Policy</Label>
                  <Input
                    type="select"
                    value={conditionForm.dependsOn}
                    onChange={(e) =>
                      handleConditionFormChange("dependsOn", e.target.value)
                    }
                  >
                    <option value="">Select Policy</option>
                    {policyModal.policies
                      .filter(
                        (policy) =>
                          policy.sequence !==
                            conditionModal.selectedPolicy?.sequence &&
                          policy.sequence <
                            conditionModal.selectedPolicy?.sequence // Only previous policies
                      )
                      .map((policy) => (
                        <option key={policy.sequence} value={policy.policy}>
                          Policy {policy.sequence} - {policy.question}
                        </option>
                      ))}
                  </Input>
                </FormGroup>
              </div>
              <div className="col-md-4">
                <FormGroup>
                  <Label>Operator</Label>
                  <Input
                    type="select"
                    value={conditionForm.operator}
                    onChange={(e) =>
                      handleConditionFormChange("operator", e.target.value)
                    }
                  >
                    {conditionOperators.map((operator) => (
                      <option key={operator.value} value={operator.value}>
                        {operator.label}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              </div>
              <div className="col-md-4">
                <FormGroup>
                  <Label>Value</Label>
                  <Input
                    type="select"
                    value={conditionForm.value}
                    onChange={(e) =>
                      handleConditionFormChange("value", e.target.value)
                    }
                  >
                    {conditionValues.map((value) => (
                      <option key={value.value} value={value.value}>
                        {value.label}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              </div>
            </div>
            <div className="text-center mt-3">
              <Button
                color="primary"
                onClick={handleAddCondition}
                disabled={!conditionForm.dependsOn}
              >
                <i className="fas fa-plus mr-1"></i>
                Add Condition
              </Button>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={handleCloseConditionModal}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    );
  };



  return (
    <>
      <Container fluid className="pt-6">
        {/* Toast Notifications */}
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

        <Row>
          <div className="col">
            <div className="d-flex align-items-center mb-2">
              <Button 
                color="link" 
                className="p-0 mr-3 text-white" 
                onClick={handleBack}
                style={{ fontSize: "1.2rem", lineHeight: 1 }}
              >
                <BsArrowLeft />
              </Button>
              <h3 className="mb-0 text-white" style={{ fontSize: "1.25rem" }}>
                {isEditMode ? "EDIT ASSISTANT" : "CREATE ASSISTANT"}
              </h3>
            </div>
            <nav aria-label="breadcrumb">
              <ol
                className="breadcrumb bg-transparent mb-4"
                style={{ padding: "0" }}
              >
                <li
                  className="breadcrumb-item active text-white"
                  aria-current="page"
                ></li>
              </ol>
            </nav>

            {/* Stepper */}
            <div className="stepper">
              <div
                className={`step ${
                  currentStep === 1
                    ? "active"
                    : basicDetailsComplete
                    ? "completed"
                    : ""
                }`}
                onClick={() => setCurrentStep(1)}
              >
                <div className="step-number">
                  {basicDetailsComplete ? <IoCheckmarkCircle /> : "1"}
                </div>
                <div className="step-title">Basic Details</div>
              </div>
              <div
                className={`step-connector ${
                  basicDetailsComplete
                    ? "completed"
                    : currentStep === 2
                    ? "active"
                    : ""
                }`}
              />
              <div
                className={`step ${currentStep === 2 ? "active" : ""}`}
                onClick={() => basicDetailsComplete && setCurrentStep(2)}
                style={{
                  cursor: basicDetailsComplete ? "pointer" : "not-allowed",
                }}
              >
                <div className="step-number">2</div>
                <div className="step-title">Item Selection</div>
              </div>
            </div>

            <Card className="shadow">
              <CardHeader className="border-0">
                <Form onSubmit={handleSubmit}>
                  {/* Step 1: Basic Details */}
                  <div
                    className={`form-step ${currentStep === 1 ? "active" : ""}`}
                  >
                    <FormGroup>
                      <Label for="assistantName">
                        Assistant Name <span className="text-danger">*</span>
                      </Label>
                      <Input
                        className="form-control-alternative"
                        type="text"
                        name="assistantName"
                        id="assistantName"
                        value={formData.assistantName}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            assistantName: e.target.value,
                          }))
                        }
                        placeholder="Enter Assistant Name"
                        required
                      />
                    </FormGroup>

                    {/* Platform and Activity Selection Row */}
                    <Row>
                      <Col md="6">
                        {/* Platform Selection */}
                        <FormGroup>
                          <Label>
                            Platforms <span className="text-danger">*</span>
                          </Label>

                          {/* Selected Platforms Display */}
                          {getSelectedPlatforms().length > 0 && (
                            <div className="mb-3">
                              <div className="d-flex flex-wrap gap-2">
                                {getSelectedPlatforms().map((platformId) => {
                                  const platform = platforms.find(
                                    (p) => p.id.toString() === platformId
                                  );
                                  return platform ? (
                                    <Badge
                                      key={platformId}
                                      color="primary"
                                      className="d-flex align-items-center"
                                      style={{
                                        fontSize: "0.775rem",
                                        padding: "0.4rem 0.75rem",
                                        margin: "2px",
                                      }}
                                    >
                                      {platform.name}
                                      <IoClose
                                        className="ms-2"
                                        style={{
                                          cursor: "pointer",
                                          fontSize: "1.1rem",
                                        }}
                                        onClick={() => {
                                          const newPlatforms =
                                            getSelectedPlatforms().filter(
                                              (id) => id !== platformId
                                            );
                                          handlePlatformChange(newPlatforms);
                                        }}
                                      />
                                    </Badge>
                                  ) : null;
                                })}
                              </div>
                            </div>
                          )}

                          {/* Platform Selection Dropdown - Only show when no platform is selected */}
                          {getSelectedPlatforms().length === 0 && (
                            <div className="position-relative">
                              <Input
                                id="platform-search-input"
                                type="text"
                                placeholder={formData.selectedItems.length > 0 ? "Platform changes blocked: Remove all items first to change platform..." : "Search and select platform..."}
                                className="form-control-alternative"
                                value={platformSearchTerm}
                                onChange={(e) =>
                                  setPlatformSearchTerm(e.target.value)
                                }
                                onFocus={() => {
                                  if (formData.selectedItems.length === 0) {
                                    setShowPlatformDropdown(true);
                                  } else {
                                    setPlatformChangeWarningModal({
                                      isOpen: true,
                                      selectedItemsCount: formData.selectedItems.length
                                    });
                                  }
                                }}
                                style={{ 
                                  cursor: formData.selectedItems.length > 0 ? "not-allowed" : "text",
                                  opacity: formData.selectedItems.length > 0 ? 0.6 : 1
                                }}
                                disabled={formData.selectedItems.length > 0}
                              />
                              <div
                                id="platform-dropdown-container"
                                className="position-absolute"
                                style={{
                                  top: "100%",
                                  left: 0,
                                  right: 0,
                                  zIndex: 1000,
                                  backgroundColor: "white",
                                  border: "1px solid #e9ecef",
                                  borderRadius: "0.25rem",
                                  boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.15)",
                                  maxHeight: "300px",
                                  overflowY: "auto",
                                  display: showPlatformDropdown ? "block" : "none",
                                }}
                              >
                                {platforms
                                  .filter(
                                    (platform) =>
                                      platform.name
                                        .toLowerCase()
                                        .includes(platformSearchTerm.toLowerCase()) &&
                                      !(Array.isArray(formData.selectedPlatforms) ? formData.selectedPlatforms : []).includes(
                                        platform.id.toString()
                                      )
                                  )
                                  .map((platform) => (
                                    <div
                                      key={platform.id}
                                      className="p-3 border-bottom"
                                      style={{
                                        cursor: "pointer",
                                        transition: "background-color 0.2s",
                                      }}
                                      onMouseEnter={(e) => {
                                        e.target.style.backgroundColor = "#f8f9fa";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.target.style.backgroundColor = "white";
                                      }}
                                      onClick={() => {
                                        // Only allow 1 platform to be selected
                                        const newPlatforms = [platform.id.toString()];
                                        handlePlatformChange(newPlatforms);
                                        setPlatformSearchTerm("");
                                        setShowPlatformDropdown(false);
                                      }}
                                    >
                                      <div className="d-flex align-items-center">
                                        <div className="me-3">
                                          <div
                                            style={{
                                              width: "24px",
                                              height: "24px",
                                              borderRadius: "50%",
                                              backgroundColor: "#3A6D8C",
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              color: "white",
                                              fontSize: "0.75rem",
                                              fontWeight: "bold",
                                            }}
                                          >
                                            {platform.name.charAt(0).toUpperCase()}
                                          </div>
                                        </div>
                                        <div>
                                          <div
                                            style={{
                                              fontWeight: "500",
                                              marginLeft: "5px",
                                            }}
                                          >
                                            {platform.name}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                {platforms.filter(
                                  (platform) =>
                                    platform.name
                                      .toLowerCase()
                                      .includes(platformSearchTerm.toLowerCase()) &&
                                    !(Array.isArray(formData.selectedPlatforms) ? formData.selectedPlatforms : []).includes(
                                      platform.id.toString()
                                    )
                                ).length === 0 && (
                                  <div className="p-3 text-muted text-center">
                                    {platformSearchTerm
                                      ? "No platforms found matching your search."
                                      : "All platforms have been selected."}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </FormGroup>
                      </Col>

                      <Col md="6">
                        {/* Activity Selection */}
                        <FormGroup>
                          <Label>
                            Functions
                          </Label>

                          {/* Selected Activity Display */}
                          {formData.selectedActivity && (
                            <div className="mb-3">
                              <div className="d-flex flex-wrap gap-2">
                                {(() => {
                                  const activity = activities.find(
                                    (a) => a.id?.toString() === formData.selectedActivity?.toString()
                                  );
                                  return activity ? (
                                    <Badge
                                      key={formData.selectedActivity}
                                      color="primary"
                                      className="d-flex align-items-center"
                                      style={{
                                        fontSize: "0.775rem",
                                        padding: "0.4rem 0.75rem",
                                        margin: "2px",
                                      }}
                                    >
                                      {activity.name || activity.activityName}
                                      <IoClose
                                        className="ms-2"
                                        style={{
                                          cursor: "pointer",
                                          fontSize: "1.1rem",
                                        }}
                                        onClick={() => {
                                          setFormData((prev) => ({
                                            ...prev,
                                            selectedActivity: null,
                                          }));
                                        }}
                                      />
                                    </Badge>
                                  ) : null;
                                })()}
                              </div>
                            </div>
                          )}

                          {/* Activity Selection Dropdown - Only show when no activity is selected and platform is selected */}
                          {!formData.selectedActivity && (
                            <div className="position-relative">
                              <Input
                                id="activity-search-input"
                                type="text"
                                placeholder={
                                  getSelectedPlatforms().length === 0
                                    ? "Select a platform first..."
                                    : activitiesLoading
                                    ? "Loading activities..."
                                    : "Search and select activity..."
                                }
                                className="form-control-alternative"
                                value={activitySearchTerm}
                                onChange={(e) =>
                                  setActivitySearchTerm(e.target.value)
                                }
                                onFocus={() => {
                                  if (getSelectedPlatforms().length > 0 && !activitiesLoading) {
                                    setShowActivityDropdown(true);
                                  }
                                }}
                                style={{ 
                                  cursor: getSelectedPlatforms().length === 0 || activitiesLoading ? "not-allowed" : "text",
                                  opacity: getSelectedPlatforms().length === 0 || activitiesLoading ? 0.6 : 1
                                }}
                                disabled={getSelectedPlatforms().length === 0 || activitiesLoading}
                              />
                              <div
                                id="activity-dropdown-container"
                                className="position-absolute"
                                style={{
                                  top: "100%",
                                  left: 0,
                                  right: 0,
                                  zIndex: 1000,
                                  backgroundColor: "white",
                                  border: "1px solid #e9ecef",
                                  borderRadius: "0.25rem",
                                  boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.15)",
                                  maxHeight: "300px",
                                  overflowY: "auto",
                                  display: showActivityDropdown ? "block" : "none",
                                }}
                              >
                                {activities
                                  .filter((activity) =>
                                    (activity.name || activity.activityName || "")
                                      .toLowerCase()
                                      .includes(activitySearchTerm.toLowerCase())
                                  )
                                  .map((activity) => (
                                    <div
                                      key={activity.id}
                                      className="p-3 border-bottom"
                                      style={{
                                        cursor: "pointer",
                                        transition: "background-color 0.2s",
                                      }}
                                      onMouseEnter={(e) => {
                                        e.target.style.backgroundColor = "#f8f9fa";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.target.style.backgroundColor = "white";
                                      }}
                                      onClick={() => {
                                        setFormData((prev) => ({
                                          ...prev,
                                          selectedActivity: activity.id?.toString(),
                                        }));
                                        setActivitySearchTerm("");
                                        setShowActivityDropdown(false);
                                      }}
                                    >
                                      <div className="d-flex align-items-center">
                                        <div className="me-3">
                                          <div
                                            style={{
                                              width: "24px",
                                              height: "24px",
                                              borderRadius: "50%",
                                              backgroundColor: "#17a2b8",
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              color: "white",
                                              fontSize: "0.75rem",
                                              fontWeight: "bold",
                                            }}
                                          >
                                            {(activity.name || activity.activityName || "A").charAt(0).toUpperCase()}
                                          </div>
                                        </div>
                                        <div>
                                          <div
                                            style={{
                                              fontWeight: "500",
                                              marginLeft: "5px",
                                            }}
                                          >
                                            {activity.name || activity.activityName}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                {activities.filter((activity) =>
                                  (activity.name || activity.activityName || "")
                                    .toLowerCase()
                                    .includes(activitySearchTerm.toLowerCase())
                                ).length === 0 && (
                                  <div className="p-3 text-muted text-center">
                                    {activitySearchTerm
                                      ? "No activities found matching your search."
                                      : activities.length === 0
                                      ? "No activities available for this platform."
                                      : "No activities available."}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </FormGroup>
                      </Col>
                    </Row>
                    <div className="row g-3 mb-4 bg-secondary">
                    <div className="col-md-6 ">
                      <FormGroup>
                        <Label>
                          Display Path <span className="text-danger">*</span>
                        </Label>
                        <div className="mt-2">
                          <FormGroup check>
                            <Label check>
                              <Input
                                type="checkbox"
                                name="displayPathHome"
                                checked={formData.displayPath?.includes(
                                  "Home_Recommendation"
                                )}
                                onChange={(e) =>
                                  handleDisplayPathChange(
                                    "Home_Recommendation",
                                    e.target.checked
                                  )
                                }
                              />
                              Home Recommendations
                            </Label>
                          </FormGroup>
                          <FormGroup check>
                            <Label check>
                              <Input
                                type="checkbox"
                                name="displayPathGather"
                                checked={formData.displayPath?.includes(
                                  "Gather_Assist"
                                )}
                                onChange={(e) =>
                                  handleDisplayPathChange(
                                    "Gather_Assist",
                                    e.target.checked
                                  )
                                }
                              />
                              Gather Assist
                            </Label>
                          </FormGroup>
                          {errors.displayPath && (
                            <div className="text-danger mt-1">
                              {errors.displayPath}
                            </div>
                          )}
                        </div>
                      </FormGroup>
                      </div>
                      <div className="col-md-6 " style={{ display: 'none' }}>
                        <FormGroup>
                            <Label>
                              Experience Mode
                            </Label>
                            <Input
                              type="select"
                              className="form-select"
                              value={formData.selectedExperienceMode || ""}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  selectedExperienceMode: e.target.value || null,
                                }))
                              }
                              disabled={experienceModesLoading || !formData.selectedPlatforms?.length}
                            >
                              <option value="">
                                {experienceModesLoading 
                                  ? "Loading..." 
                                  : !formData.selectedPlatforms?.length 
                                    ? "Select a platform first" 
                                    : "Select Experience Mode"}
                              </option>
                              {experienceModes.map((mode) => (
                                <option key={mode.id} value={mode.id}>
                                  {mode.name}
                                </option>
                              ))}
                            </Input>
                        </FormGroup>
                      </div>
                    </div>
                    <div className="row g-3 mb-4 bg-secondary">
                    <div className="col-md-6 ">
                      <div className="card h-100 border-0 ">
                        <div className="card-body p-2 bg-secondary">
                          <FormGroup>
                            <Label className="fw-semibold text-dark mb-2">
                              
                              Expiry Date
                              <span className="text-muted ms-1">(Optional)</span>
                            </Label>
                            <Input
                              type="date"
                              className="form-control-lg border-2"
                              style={{ 
                                color: "black",
                                borderRadius: "8px",
                                borderColor: "#e9ecef",
                                transition: "all 0.3s ease"
                              }}
                              value={formData.expiryDate}
                              onChange={handleExpiryDateChange}
                              onClick={(e) => e.target.showPicker?.()}
                              min={new Date().toISOString().split("T")[0]}
                              onFocus={(e) => {
                                e.target.style.borderColor = "#0d6efd";
                                e.target.style.boxShadow = "0 0 0 0.2rem rgba(13, 110, 253, 0.25)";
                              }}
                              onBlur={(e) => {
                                e.target.style.borderColor = "#e9ecef";
                                e.target.style.boxShadow = "none";
                              }}
                            />
                            {errors.expiryDate && (
                              <div className="text-danger mt-2 d-flex align-items-center">
                                <i className="fas fa-exclamation-circle me-2"></i>
                                {errors.expiryDate}
                              </div>
                            )}
                          </FormGroup>
                        </div>
                      </div>
                    </div>

                    <div className="col-md-6 ">
                      <div className="card h-100 border-0 ">
                        <div className="card-body p-2 bg-secondary" >
                          <FormGroup>
                            <Label className="fw-semibold text-dark mb-3">
                              
                              For Cloning?
                            </Label>
                            <div className="d-flex gap-4">
                              <div className="form-check form-check-inline">
                                <Input
                                  type="radio"
                                  name="isLoop"
                                  value="true"
                                  className="form-check-input"
                                  id="isLoopYes"
                                  checked={formData.isLoop === true}
                                  onChange={() => handleIsLoopChange(true)}
                                  style={{
                                    width: "18px",
                                    height: "18px",
                                    marginTop: "2px"
                                  }}
                                />
                                <Label 
                                  check 
                                  className="form-check-label fw-medium text-dark ms-2"
                                  htmlFor="isLoopYes"
                                  style={{ cursor: "pointer" }}
                                >
                                
                                  Yes
                                </Label>
                              </div>

                              <div className="form-check form-check-inline">
                                <Input
                                  type="radio"
                                  name="isLoop"
                                  value="false"
                                  className="form-check-input"
                                  id="isLoopNo"
                                  checked={formData.isLoop === false}
                                  onChange={() => handleIsLoopChange(false)}
                                  style={{
                                    width: "18px",
                                    height: "18px",
                                    marginTop: "2px"
                                  }}
                                />
                                <Label 
                                  check 
                                  className="form-check-label fw-medium text-dark ms-2"
                                  htmlFor="isLoopNo"
                                  style={{ cursor: "pointer" }}
                                >
                                  
                                  No
                                </Label>
                              </div>
                            </div>

                            {errors.isLoop && (
                              <div className="text-danger mt-2 d-flex align-items-center">
                                <i className="fas fa-exclamation-circle me-2"></i>
                                {errors.isLoop}
                              </div>
                            )}
                          </FormGroup>
                        </div>
                      </div>
                    </div>
                  </div>

                    <FormGroup>
                      <Label>
                        Assistant Image <span className="text-danger">*</span>
                      </Label>
                      <div className="mb-2">
                        {/* <div className="dimension-requirement">
                          <i className="ni ni-image"></i>
                          <span>
                            Required dimensions:{" "}
                            <strong>325 × 358 pixels</strong>
                          </span>
                          <small className="text-muted ml-2">
                            (Images with different dimensions will be rejected)
                          </small>
                        </div> */}
                      </div>
                      <div className="image-selection-container">
                        <div className="row">
                          {/* Custom Image Upload */}
                          <div className="col-md-2 col-sm-4 mb-3">
                            <div className="image-option">
                              <label
                                htmlFor="custom-image-upload"
                                className="custom-image-upload"
                                style={{
                                  width: "100%",
                                  height: "100px",
                                  border: formData.isCustomImage
                                    ? "3px solid #3A6D8C"
                                    : "2px dashed #3A6D8C",
                                  borderRadius: "8px",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                  backgroundColor: formData.isCustomImage
                                    ? "#f8f9fa"
                                    : "#f8f9fa",
                                  transition: "all 0.3s ease",
                                  position: "relative",
                                }}
                              >
                                <input
                                  type="file"
                                  id="custom-image-upload"
                                  accept="image/*"
                                  onChange={handleImageUpload}
                                  disabled={imageValidationLoading}
                                  style={{ display: "none" }}
                                />
                                {formData.isCustomImage ? (
                                  <>
                                    <i
                                      className="ni ni-image"
                                      style={{
                                        fontSize: "20px",
                                        color: "#3A6D8C",
                                      }}
                                    />
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        color: "#3A6D8C",
                                        marginTop: "4px",
                                        textAlign: "center",
                                      }}
                                    >
                                      Re-upload
                                    </span>
                                  </>
                                ) : formData.customImage ? (
                                  <>
                                    <i
                                      className="ni ni-image"
                                      style={{
                                        fontSize: "20px",
                                        color: "#3A6D8C",
                                      }}
                                    />
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        color: "#3A6D8C",
                                        marginTop: "4px",
                                        textAlign: "center",
                                      }}
                                    >
                                      Restore Custom
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    {imageValidationLoading ? (
                                      <>
                                        <Spinner size="sm" color="primary" />
                                        <span
                                          style={{
                                            fontSize: "10px",
                                            color: "#3A6D8C",
                                            marginTop: "4px",
                                            textAlign: "center",
                                          }}
                                        >
                                          Validating...
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <i
                                          className="ni ni-image"
                                          style={{
                                            fontSize: "24px",
                                            color: "#3A6D8C",
                                          }}
                                        />
                                        <span
                                          style={{
                                            fontSize: "12px",
                                            color: "#3A6D8C",
                                            marginTop: "8px",
                                          }}
                                        >
                                          Upload Custom Image
                                        </span>
                                      </>
                                    )}
                                  </>
                                )}
                                {formData.isCustomImage && (
                                  <div className="selected-overlay">
                                    <IoCheckmarkCircle
                                      size={20}
                                      color="#3A6D8C"
                                    />
                                  </div>
                                )}
                              </label>
                              {/* Show restore button when custom image exists but not selected */}
                              {formData.customImage &&
                                !formData.isCustomImage && (
                                  <button
                                    type="button"
                                    onClick={handleRestoreCustomImage}
                                    className="restore-button"
                                    style={{
                                      width: "100%",
                                      marginTop: "4px",
                                      padding: "4px 8px",
                                      background: "#3A6D8C",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "4px",
                                      fontSize: "10px",
                                      cursor: "pointer",
                                      transition: "all 0.2s ease",
                                    }}
                                    title="Restore previously uploaded custom image"
                                  >
                                    Restore
                                  </button>
                                )}
                            </div>
                          </div>

                          {/* Show existing custom image from database or newly uploaded custom image */}
                          {formData.isCustomImage && formData.selectedImage && (
                            <div className="col-md-2 col-sm-4 mb-3">
                              <div
                                className="image-option selected"
                                style={{ position: "relative" }}
                              >
                                <img
                                  src={formData.selectedImage}
                                  alt="Custom Image"
                                  className="img-fluid rounded"
                                  style={{
                                    width: "100%",
                                    height: "100px",
                                    objectFit: "cover",
                                    border: "3px solid #3A6D8C",
                                    borderRadius: "8px",
                                  }}
                                  onError={(e) => {
                                    console.error(
                                      "Error loading image:",
                                      formData.selectedImage
                                    );
                                    e.target.src =
                                      "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png";
                                  }}
                                />
                                <div className="selected-overlay">
                                  <IoCheckmarkCircle
                                    size={24}
                                    color="#3A6D8C"
                                  />
                                </div>
                                <div
                                  className="mt-1 text-muted small text-center"
                                  style={{
                                    fontSize: "11px",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {formData.customImage
                                    ? formData.customImage.name
                                    : "Custom Image"}
                                </div>
                                {/* Add remove button for custom images */}
                                <button
                                  type="button"
                                  onClick={handleRemoveCustomImage}
                                  style={{
                                    position: "absolute",
                                    top: "-2px",
                                    right: "1px",
                                    background: "#dc3545",
                                    color: "white",
                                    border: "2px solid white",
                                    borderRadius: "50%",
                                    width: "28px",
                                    height: "28px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    fontSize: "16px",
                                    fontWeight: "bold",
                                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                                    transition: "all 0.2s ease",
                                    zIndex: 10,
                                  }}
                                  title="Remove custom image"
                                  onMouseEnter={(e) => {
                                    e.target.style.background = "#c82333";
                                    e.target.style.transform = "scale(1.1)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.target.style.background = "#dc3545";
                                    e.target.style.transform = "scale(1)";
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Predefined Images */}
                          {[
                            {
                              id: 1,
                              src: "https://storage.googleapis.com/rejara-wallpaper/chapters/digital/1744382345528_Digital_1744382345528.png",
                              alt: "Assistant 1",
                            },
                            {
                              id: 2,
                              src: "https://storage.googleapis.com/rejara-wallpaper/chapters/insurance/1744382346101_Insurance_1744382346101.png",
                              alt: "Assistant 2",
                            },
                            {
                              id: 3,
                              src: "https://storage.googleapis.com/rejara-wallpaper/chapters/expenses/1744382346958_Expenses_1744382346958.png",
                              alt: "Assistant 3",
                            },
                          ].map((image) => (
                            <div
                              key={image.id}
                              className="col-md-2 col-sm-4 mb-3"
                            >
                              <div
                                className={`image-option ${
                                  formData.selectedImage === image.src &&
                                  !formData.isCustomImage
                                    ? "selected"
                                    : ""
                                }`}
                                onClick={() => handleImageSelect(image.src)}
                              >
                                <img
                                  src={image.src}
                                  alt={image.alt}
                                  className="img-fluid rounded"
                                  style={{
                                    width: "100%",
                                    height: "100px",
                                    objectFit: "cover",
                                    cursor: "pointer",
                                    border:
                                      formData.selectedImage === image.src &&
                                      !formData.isCustomImage
                                        ? "3px solid #3A6D8C"
                                        : "1px solid #e9ecef",
                                    borderRadius: "8px",
                                    transition: "all 0.3s ease",
                                  }}
                                />
                                {formData.selectedImage === image.src &&
                                  !formData.isCustomImage && (
                                    <div className="selected-overlay">
                                      <IoCheckmarkCircle
                                        size={24}
                                        color="#3A6D8C"
                                      />
                                    </div>
                                  )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {!formData.selectedImage && (
                        <div className="text-danger mt-1">
                          Please select an assistant image
                        </div>
                      )}
                    </FormGroup>
                    <FormGroup>
                       {/* Publish Status Section */}
                       <div className="row">
                        <div className="col-md-6">
                          <FormGroup className="mb-0">
                            <Label className="d-flex align-items-center mb-3">
                              
                              <span className="fw-bold">Publish Status</span>
                            </Label>
                            <div className="d-flex gap-4">
                              <div className="form-check form-check-inline">
                                <Input
                                  type="radio"
                                  name="publishStatus"
                                  value="Draft"
                                  className="form-check-input"
                                  id="publishStatusDraft"
                                  checked={formData.publishStatus === "Draft"}
                                  onChange={() => setFormData(prev => ({ ...prev, publishStatus: "Draft" }))}
                                  style={{
                                    width: "18px",
                                    height: "18px",
                                    marginTop: "2px"
                                  }}
                                />
                                <Label 
                                  check 
                                  className="form-check-label fw-medium text-dark ms-2"
                                  htmlFor="publishStatusDraft"
                                  style={{ cursor: "pointer" }}
                                >
                                  <Badge color="warning" className="me-1">Draft</Badge>
                                </Label>
                              </div>

                              <div className="form-check form-check-inline">
                                <Input
                                  type="radio"
                                  name="publishStatus"
                                  value="Published"
                                  className="form-check-input"
                                  id="publishStatusPublished"
                                  checked={formData.publishStatus === "Published"}
                                  onChange={() => setFormData(prev => ({ ...prev, publishStatus: "Published" }))}
                                  style={{
                                    width: "18px",
                                    height: "18px",
                                    marginTop: "2px"
                                  }}
                                />
                                <Label 
                                  check 
                                  className="form-check-label fw-medium text-dark ms-2"
                                  htmlFor="publishStatusPublished"
                                  style={{ cursor: "pointer" }}
                                >
                                  <Badge color="success" className="me-1">Published</Badge>
                                </Label>
                              </div>
                            </div>
                            <small className="text-muted mt-2 d-block">
                              Draft assistants are not visible to users. Publish when ready.
                            </small>
                          </FormGroup>
                        </div>
                        <div className="col-md-6" style={{ display: 'none' }}>
                          <FormGroup className="mb-0">
                            <Label className="d-flex align-items-center mb-2">
                              <span className="fw-bold">Goals</span>
                              <small className="text-muted ms-2">(Select multiple)</small>
                            </Label>
                            <GoalsMultiSelectDropdown
                              options={platformGoals}
                              selectedValues={formData.personaRules}
                              onChange={(newRules) => {
                                setFormData(prev => ({
                                  ...prev,
                                  personaRules: newRules
                                }));
                              }}
                              disabled={!formData.selectedPlatforms?.length}
                              loading={platformGoalsLoading}
                              placeholder={
                                !formData.selectedPlatforms?.length 
                                  ? "Select a platform first" 
                                  : "Select goals..."
                              }
                            />
                            {formData.personaRules.length > 0 && (
                              <small className="text-muted mt-1 d-block">
                                {formData.personaRules.length} goal(s) selected
                              </small>
                            )}
                          </FormGroup>
                        </div>
                      </div>
                    </FormGroup>
                    <FormGroup>
                      <Label for="firstMessage">
                        First Message for Assistant Chat  <span className="text-danger">*</span>
                      </Label>
                      <div style={{ position: "relative" }}>
                        <Input
                          innerRef={firstMessageTextareaRef}
                          className={`form-control-alternative ${
                            errors.firstMessage ? "is-invalid" : ""
                          }`}
                          type="textarea"
                          name="firstMessage"
                          id="firstMessage"
                          value={formData.firstMessage}
                          onChange={handleFirstMessageChange}
                          placeholder="Enter First Message"
                          maxLength={1000}
                          style={{
                            minHeight: "80px",
                            resize: "vertical",
                            paddingRight: "40px",
                          }}
                        />
                        <Button
                          type="button"
                          onClick={() => setShowFirstMessageEmojiPicker(!showFirstMessageEmojiPicker)}
                          style={{
                            position: "absolute",
                            right: "10px",
                            top: "10px",  
                            background: "transparent",
                            border: "none",
                            color: "#8898aa",
                            padding: "5px",
                            cursor: "pointer",
                            zIndex: 10,
                            boxShadow: "none",
                          }}
                          onMouseEnter={(e) => (e.target.style.color = "#3A6D8C")}
                          onMouseLeave={(e) => (e.target.style.color = "#8898aa")}
                        >
                          <BsEmojiSmile size={20} />
                        </Button>
                        {showFirstMessageEmojiPicker && (
                          <div
                            ref={firstMessageEmojiPickerRef}
                            style={{
                              position: "absolute",
                              right: "10px",
                              top: "50px",
                              zIndex: 1000,
                            }}
                          >
                            <EmojiPicker
                              onEmojiClick={handleFirstMessageEmojiClick}
                              theme="light"
                            />
                          </div>
                        )}
                      </div>
                      {errors.firstMessage && (
                        <div className="invalid-feedback d-block">
                          {errors.firstMessage}
                        </div>
                      )}
                      <div className="d-flex justify-content-between align-items-center mt-1">
                        <small className="form-text text-muted">
                          Maximum 1000 characters allowed
                        </small>
                        <small
                          className={`form-text ${
                            formData.firstMessage.length > 900
                              ? formData.firstMessage.length > 1000
                                ? "text-danger"
                                : "text-warning"
                              : "text-muted"
                          }`}
                        >
                          {formData.firstMessage.length}/1000
                        </small>
                      </div>
                    </FormGroup>
                    <FormGroup>
                      <Label for="callToAction">
                        Call To Action
                      </Label>
                      <Input
                        className={`form-control-alternative ${
                          errors.callToAction ? "is-invalid" : ""
                        }`}
                        type="textarea"
                        name="callToAction"
                        id="callToAction"
                        value={formData.callToAction}
                        onChange={handleCallToActionChange}
                        placeholder="Enter Call To Action"
                        maxLength={100}
                      />
                      {errors.callToAction && (
                        <div className="invalid-feedback d-block">
                          {errors.callToAction}
                        </div>
                      )}
                      <div className="d-flex justify-content-between align-items-center mt-1">
                        <small className="form-text text-muted">
                          Maximum 100 characters allowed
                        </small>
                        <small
                          className={`form-text ${
                            formData.callToAction.length > 90
                              ? formData.callToAction.length > 100
                                ? "text-danger"
                                : "text-warning"
                              : "text-muted"
                          }`}
                        >
                          {formData.callToAction.length}/100
                        </small>
                      </div>
                    </FormGroup>

                    <FormGroup>
                      <Label for="assistantDescription">
                        Assistant Description (Optional)
                        <span className="text-muted ml-2">
                          ({formData.assistantDescription.length}/
                          {MAX_DESCRIPTION_LENGTH} characters)
                        </span>
                      </Label>
                      <Input
                        className="form-control-alternative"
                        type="textarea"
                        name="assistantDescription"
                        id="assistantDescription"
                        value={formData.assistantDescription}
                        onChange={handleDescriptionChange}
                        placeholder="Enter Assistant Description"
                        maxLength={MAX_DESCRIPTION_LENGTH}
                        style={{
                          minHeight: "100px",
                          resize: "vertical",
                        }}
                      />
                      {formData.assistantDescription.length >=
                        MAX_DESCRIPTION_LENGTH && (
                        <small className="text-warning">
                          Maximum character limit reached
                        </small>
                      )}
                    </FormGroup>

                    <FormGroup style={{ display: 'none' }}>
                      <Label for="alternateName">
                        Alternate Name 
                      </Label>
                      <Input
                        className="form-control-alternative"
                        type="text"
                        name="alternateName"
                        id="alternateName"
                        value={formData.alternateName}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            alternateName: e.target.value,
                          }))
                        }
                        placeholder="Enter Alternate Name"
                      />
                    </FormGroup>

                    <FormGroup style={{ display: 'none' }}>
                      <Label for="alternateInfo">
                        Alternate Info 
                      </Label>
                      <Input
                        className="form-control-alternative"
                        type="textarea"
                        name="alternateInfo"
                        id="alternateInfo"
                        value={formData.alternateInfo}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            alternateInfo: e.target.value,
                          }))
                        }
                        placeholder="Enter Alternate Info"
                        style={{
                          minHeight: "80px",
                          resize: "vertical",
                        }}
                      />
                    </FormGroup>

                    <div className="step-actions">
                      <div></div>
                      <Button
                        color="primary"
                        onClick={handleNextStep}
                        className="d-flex align-items-center"
                        type="button"
                      >
                        Next Step <BsArrowRight className="ml-2" />
                      </Button>
                    </div>
                  </div>

                  {/* Step 2: Item Selection */}
                  <div
                    className={`form-step ${currentStep === 2 ? "active" : ""}`}
                  >
                    <div
                      className={`selection-container${
                        !basicDetailsComplete ? " disabled-section" : ""
                      }`}
                      style={{
                        pointerEvents: !basicDetailsComplete ? "none" : "auto",
                        opacity: !basicDetailsComplete ? 0.5 : 1,
                        cursor: !basicDetailsComplete ? "not-allowed" : "auto",
                      }}
                    >
                      <div className="selection-row">
                        <div className="selection-col col-md-4">
                          <div className="selection-box">
                            <div className="selection-header">
                              <h6 className="selection-title">Stories</h6>
                              <div className="d-flex align-items-center">
                                <span className="selection-count mr-1" style={{fontSize: "0.75rem",paddingLeft: "6px",paddingRight: "6px"}}>
                                  {selectedStories.length} selected
                                </span>
                                <Button
                                  color="link"
                                  style={{padding: "2px"}}
                                  size="sm"
                                  className="select-all-btn"
                                  onClick={
                                    selectedStories.length === stories.length
                                      ? handleUnselectAllStories
                                      : handleSelectAllStories
                                  }
                                >
                                  {selectedStories.length === stories.length
                                    ? "Unselect All"
                                    : "Select All"}
                                </Button>
                              </div>
                            </div>
                            <div className="selection-search">
                              <Input
                                type="text"
                                placeholder="Search stories..."
                                value={storySearch}
                                onChange={(e) => setStorySearch(e.target.value)}
                                className="form-control-sm"
                              />
                            </div>
                            <div className="selection-list">
                              {loading ? (
                                <div className="text-center py-3">
                                  <Spinner size="sm" color="primary" />
                                </div>
                              ) : filteredStories.length > 0 ? (
                                filteredStories.map((story) => (
                                  <div
                                    key={story.storyId}
                                    className="selection-item"
                                  >
                                    <Input
                                      type="checkbox"
                                      id={`story-${story.storyId}`}
                                      checked={selectedStories.includes(
                                        story.storyId.toString()
                                      )}
                                      onChange={(e) => {
                                        const newSelection = e.target.checked
                                          ? [
                                              ...selectedStories,
                                              story.storyId.toString(),
                                            ]
                                          : selectedStories.filter(
                                              (id) =>
                                                id !== story.storyId.toString()
                                            );
                                        handleStoryChange(newSelection);
                                      }}
                                    />
                                    <div className="selection-item-content">
                                      <Label for={`story-${story.storyId}`}>
                                        {story.storyName}
                                      </Label>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="selection-empty">
                                  {storySearch
                                    ? "No matching stories found"
                                    : "No stories available"}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="selection-col col-md-4">
                          <div className="selection-box">
                            <div className="selection-header">
                              <h6 className="selection-title">Chapters</h6>
                              <div className="d-flex align-items-center">
                                <span className="selection-count mr-1 " style={{fontSize: "12px",paddingLeft: "6px",paddingRight: "6px"}}>
                                  {selectedChapters.length} selected
                                </span>
                                <Button
                                  color="link"
                                  size="sm"
                                  style={{padding: "2px"}}
                                  className="select-all-btn"
                                  onClick={
                                    selectedChapters.length === chapters.length
                                      ? handleUnselectAllChapters
                                      : handleSelectAllChapters
                                  }
                                  disabled={!selectedStories.length}
                                >
                                  {selectedChapters.length === chapters.length
                                    ? "Unselect All"
                                    : "Select All"}
                                </Button>
                              </div>
                            </div>
                            <div className="selection-search">
                              <Input
                                type="text"
                                placeholder="Search chapters..."
                                value={chapterSearch}
                                onChange={(e) =>
                                  setChapterSearch(e.target.value)
                                }
                                className="form-control-sm"
                              />
                            </div>
                            <div className="selection-list">
                              {loading ? (
                                <div className="text-center py-3">
                                  <Spinner size="sm" color="primary" />
                                </div>
                              ) : filteredChapters.length > 0 ? (
                                filteredChapters.map((chapter) => (
                                  <div
                                    key={chapter.chapterId}
                                    className="selection-item"
                                  >
                                    <Input
                                      type="checkbox"
                                      id={`chapter-${chapter.chapterId}`}
                                      checked={(() => {
                                        const chapterIdStr = chapter.chapterId.toString();
                                        const isSelected = selectedChapters.includes(chapterIdStr);
                                        return isSelected;
                                      })()}
                                      onChange={(e) => {
                                        const newSelection = e.target.checked
                                          ? [
                                              ...selectedChapters,
                                              chapter.chapterId.toString(),
                                            ]
                                          : selectedChapters.filter(
                                              (id) =>
                                                id !==
                                                chapter.chapterId.toString()
                                            );
                                        handleChapterChange(newSelection);
                                      }}
                                      disabled={!selectedStories.length}
                                    />
                                    <div className="selection-item-content">
                                      <Label
                                        for={`chapter-${chapter.chapterId}`}
                                      >
                                        {chapter.chapterName}
                                      </Label>
                                      <div className="chapter-story-name">
                                        From: {chapter.storyName}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="selection-empty">
                                  {chapterSearch
                                    ? "No matching chapters found"
                                    : "No chapters available"}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="selection-col col-md-4">
                          <div className="selection-box">
                            <div className="selection-header">
                              <h6 className="selection-title">Items</h6>
                            </div>
                            <div className="selection-search">
                              <Input
                                type="text"
                                placeholder="Search items..."
                                value={itemSearch}
                                onChange={(e) => setItemSearch(e.target.value)}
                                className="form-control-sm"
                              />
                            </div>
                            <div className="selection-list">
                              {loading ? (
                                <div className="text-center py-3">
                                  <Spinner size="sm" color="primary" />
                                </div>
                              ) : filteredItems.length > 0 ? (
                                filteredItems.map((item) => (
                                  <div
                                    key={item.itemId}
                                    className="selection-item"
                                  >
                                    <div className="selection-item-content">
                                      <div className="d-flex justify-content-between align-items-center">
                                        <div>
                                          <strong>{item.itemName}</strong>
                                          <div className="text-muted small">
                                            {item.storyName} ›{" "}
                                            {item.chapterName}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          className="add-item-btn"
                                          style={{
                                            backgroundColor: "#3A6D8C",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "10%",
                                          }}
                                          onClick={() => handleAddItem(item)}
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="selection-empty">
                                  {itemSearch
                                    ? "No matching items found"
                                    : "No items available"}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {selectedItem && (
                        <Row className="mt-3">
                          <Col md={12}>
                            <FormGroup>
                              <Label>Question</Label>
                              <div className="mb-2">
                                <FormGroup check>
                                  <Label check>
                                    <Input
                                      type="radio"
                                      name="questionType"
                                      checked={!useCustomQuestion}
                                      onChange={() =>
                                        setUseCustomQuestion(false)
                                      }
                                    />
                                    Use Default Question
                                  </Label>
                                </FormGroup>
                                <FormGroup check>
                                  <Label check>
                                    <Input
                                      type="radio"
                                      name="questionType"
                                      checked={useCustomQuestion}
                                      onChange={() =>
                                        setUseCustomQuestion(true)
                                      }
                                    />
                                    Use Custom Question
                                  </Label>
                                </FormGroup>
                              </div>
                              {useCustomQuestion ? (
                                <Input
                                  type="textarea"
                                  value={itemQuestion}
                                  onChange={(e) =>
                                    setItemQuestion(e.target.value)
                                  }
                                  placeholder="Enter custom question"
                                />
                              ) : (
                                <div className="p-2 bg-light rounded">
                                  {itemQuestion || "No question available"}
                                </div>
                              )}
                            </FormGroup>
                          </Col>
                        </Row>
                      )}
                    </div>

                    {formData.selectedItems.length > 0 && (
                      <div className="selected-items mt-4">
                        <div className="font-bold text-black text-base">
                          Selected Items (Drag to reorder)
                        </div>

                        {/* Display custom question validation errors */}
                        {errors.customQuestions && (
                          <Alert color="danger" className="mt-2">
                            <i className="ni ni-alert-circle mr-2"></i>
                            {errors.customQuestions}
                          </Alert>
                        )}

                        <DragDropContext onDragEnd={handleDragEnd}>
                          <Droppable droppableId="selected-items">
                            {(provided) => (
                              <div
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                                style={{ minHeight: "50px" }}
                              >
                                {formData.selectedItems.map((item, index) => (
                                  <Draggable
                                    key={item.uniqueId}
                                    draggableId={item.uniqueId}
                                    index={index}
                                  >
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`selected-item ${
                                          snapshot.isDragging ? "dragging" : ""
                                        }`}
                                        style={{
                                          ...provided.draggableProps.style,
                                          backgroundColor: snapshot.isDragging
                                            ? "#f8f9fa"
                                            : "white",
                                        }}
                                      >
                                        <div
                                          {...provided.dragHandleProps}
                                          className="drag-handle"
                                        >
                                          <FaGripVertical />
                                        </div>
                                        <div className="selected-item-content">
                                          <div className="item-hierarchy">
                                            <span>{item.storyName}</span>
                                            <span className="item-hierarchy-separator">
                                              ›
                                            </span>
                                            <span>{item.chapterName}</span>
                                            <span className="item-hierarchy-separator">
                                              ›
                                            </span>
                                            <span>{item.itemName}</span>
                                          </div>
                                          <div
                                            className="item-header"
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "0.5rem",
                                            }}
                                          >
                                            <Badge color="primary">
                                              Sequence: {item.sequence}
                                            </Badge>
                                            {(() => {
                                              const cachedPolicies =
                                                policyCache[item.itemId];
                                              const policies =
                                                cachedPolicies ||
                                                item.policies ||
                                                [];
                                              const policyCount =
                                                policies.length;

                                              if (policyCount > 0) {
                                                return (
                                                  <Badge color="success">
                                                    {policyCount}{" "}
                                                    {policyCount === 1
                                                      ? "Policy"
                                                      : "Policies"}
                                                  </Badge>
                                                );
                                              } else {
                                                return (
                                                  <Badge color="secondary">
                                                    No Policies
                                                  </Badge>
                                                );
                                              }
                                            })()}
                                            {item.useCustomQuestion && (
                                              <Badge
                                                color="light"
                                                style={{
                                                  color: "#8898aa",
                                                  backgroundColor: "#f8f9fa",
                                                  fontSize: "0.8rem",
                                                  padding: "0.15rem 0.4rem",
                                                  lineHeight: "1",
                                                  fontWeight: "500",
                                                  fontStyle: "italic",
                                                  textTransform: "none",
                                                }}
                                              >
                                                Original:{" "}
                                                {item.originalQuestion}
                                              </Badge>
                                            )}
                                          </div>
                                          {/* <div className="item-question">
                                            {editingQuestionId ===
                                            item.uniqueId ? (
                                              <div className="edit-question-container">
                                                <Input
                                                  innerRef={(el) => {
                                                    if (el) {
                                                      textareaRefs.current[item.uniqueId] = el;
                                                    }
                                                  }}
                                                  onClick={(e) => {
                                                    const ref = textareaRefs.current[item.uniqueId];
                                                    if (ref && ref.selectionStart != null) {
                                                      setCaretPositions((prev) => ({
                                                        ...prev,
                                                        [item.uniqueId]: ref.selectionStart,
                                                      }));
                                                    }
                                                  }}
                                                  onKeyUp={(e) => {
                                                    const ref = textareaRefs.current[item.uniqueId];
                                                    if (ref && ref.selectionStart != null) {
                                                      setCaretPositions((prev) => ({
                                                        ...prev,
                                                        [item.uniqueId]: ref.selectionStart,
                                                      }));
                                                    }
                                                  }}
                                                  type="textarea"
                                                  value={editingQuestionValue}
                                                  autoFocus
                                                  onChange={(e) => {
                                                    setEditingQuestionValue(e.target.value);
                                                    const ref = textareaRefs.current[item.uniqueId];
                                                    if (ref && ref.selectionStart != null) {
                                                      setCaretPositions((prev) => ({
                                                        ...prev,
                                                        [item.uniqueId]: ref.selectionStart,
                                                      }));
                                                    }
                                                  }}
                                                  style={{
                                                    minHeight: 40,
                                                    marginBottom: "8px",
                                                  }}
                                                  placeholder="Enter your custom question"
                                                />
                                                <div className="edit-question-actions">
                                                  <Button
                                                    color="primary"
                                                    size="sm"
                                                    onClick={() =>
                                                      handleSaveEditQuestion(
                                                        item
                                                      )
                                                    }
                                                    className="mr-2"
                                                  >
                                                    Save
                                                  </Button>
                                                  <Button
                                                    color="secondary"
                                                    size="sm"
                                                    onClick={() => {
                                                      setEditingQuestionId(
                                                        null
                                                      );
                                                      setEditingQuestionValue(
                                                        ""
                                                      );
                                                    }}
                                                  >
                                                    Cancel
                                                  </Button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="question-display">
                                                <div className="d-flex justify-content-between align-items-start">
                                                  <div className="flex-grow-1">
                                                    <div
                                                      className="question-text"
                                                      style={{
                                                        cursor: "pointer",
                                                        padding: "8px",
                                                        borderRadius: "4px",
                                                        backgroundColor:
                                                          "#f8f9fa",
                                                        minHeight: "40px",
                                                        border:
                                                          item.useCustomQuestion &&
                                                          (!item.question ||
                                                            item.question.trim() ===
                                                              "")
                                                            ? "2px solid #dc3545"
                                                            : "1px solid #e9ecef",
                                                        borderStyle:
                                                          item.useCustomQuestion &&
                                                          (!item.question ||
                                                            item.question.trim() ===
                                                              "")
                                                            ? "dashed"
                                                            : "solid",
                                                      }}
                                                      onClick={() =>
                                                        handleStartEditQuestion(
                                                          item
                                                        )
                                                      }
                                                      title={
                                                        item.useCustomQuestion &&
                                                        (!item.question ||
                                                          item.question.trim() ===
                                                            "")
                                                          ? "Click to add custom question (required)"
                                                          : "Click to edit question"
                                                      }
                                                    >
                                                     
                                                      {item.question ? (
                                                        <span
                                                          dangerouslySetInnerHTML={{
                                                            __html: (item.question || "").replace(/\{(story_name|chapter_name|item_name)\}/g, '<span style="background-color:#fff3cd;color:#856404;padding:0 3px;border-radius:3px;">{$1}</span>')
                                                          }}
                                                        />
                                                      ) : (
                                                        <span
                                                          className={
                                                            item.useCustomQuestion
                                                              ? "text-danger"
                                                              : "text-muted"
                                                          }
                                                        >
                                                          {item.useCustomQuestion
                                                            ? "Custom question required (click to add)"
                                                            : "No question available (click to add)"}
                                                        </span>
                                                      )}
                                                      {item.useCustomQuestion && (
                                                        <Badge
                                                          color="warning"
                                                          className="ml-2"
                                                        >
                                                          Custom
                                                        </Badge>
                                                      )}
                                                    </div>
                                                    {item.useCustomQuestion &&
                                                      (!item.question ||
                                                        item.question.trim() ===
                                                          "") && (
                                                        <div className="text-danger mt-1 small">
                                                          Custom question cannot
                                                          be empty
                                                        </div>
                                                      )}
                                                    {item.useCustomQuestion && (
                                                      <div className="mt-2">
                                                        <Button
                                                          color="link"
                                                          size="sm"
                                                          className="p-0"
                                                          onClick={() =>
                                                            handleRevertQuestion(
                                                              item
                                                            )
                                                          }
                                                        >
                                                          Revert to Original
                                                        </Button>
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                          </div> */}
                                            <div className="item-question">
                                              {editingQuestionId === item.uniqueId ? (
                                                // Editing view
                                                <div className="edit-question-container">
                                                   <div
                                                     ref={(el) => (contentEditableRef.current[item.uniqueId] = el)}
                                                     className="form-control-alternative contenteditable-container"
                                                     contentEditable={true}
                                                     data-unique-id={item.uniqueId}
                                                     dangerouslySetInnerHTML={{ __html: stringToHtml(item.question) }}
                                                   ></div>
                                                  <div className="edit-question-actions mt-2">
                                                    <Button
                                                      color="primary"
                                                      size="sm"
                                                      onClick={() => handleSaveEditQuestion(item)}
                                                      className="mr-2"
                                                    >
                                                      Save
                                                    </Button>
                                                    <Button
                                                      color="secondary"
                                                      size="sm"
                                                      onClick={() => {
                                                        setEditingQuestionId(null);
                                                      }}
                                                    >
                                                      Cancel
                                                    </Button>
                                                  </div>
                                                </div>
                                              ) : (
                                                // Display view
                                                <div className="question-display">
                                                  <div
                                                    className="d-flex justify-content-between align-items-start"
                                                    style={{
                                                      border:
                                                        item.useCustomQuestion &&
                                                        (!item.question || item.question.trim() === "")
                                                          ? "2px dashed #dc3545"
                                                          : "1px solid #e9ecef",
                                                      borderRadius: "0.375rem",
                                                      padding: "0.75rem",
                                                      backgroundColor: "#f8f9fa",
                                                      cursor: "pointer",
                                                    }}
                                                    onClick={() => handleStartEditQuestion(item)}
                                                    title={item.useCustomQuestion ? "Click to edit" : "Click to add custom question"}
                                                  >
                                                    <div className="flex-grow-1">
                                                      <div
                                                        className="question-text"
                                                        dangerouslySetInnerHTML={{
                                                          __html: item.question ? stringToHtml(item.question) : "Click to add a custom question",
                                                        }}
                                                      ></div>
                                                    </div>
                                                    {/* Show a small Custom badge in place of the inline revert button */}
                                                    {item.useCustomQuestion && (
                                                      <Badge color="warning" className="ml-2">Custom</Badge>
                                                    )}
                                                  </div>
                                                  {/* Place the revert button below the question field for better layout */}
                                                  {item.useCustomQuestion && (
                                                    <div className="mt-2">
                                                      <Button
                                                        color="link"
                                                        size="sm"
                                                        className="p-0"
                                                        onClick={() => handleRevertQuestion(item)}
                                                      >
                                                        Revert to Original
                                                      </Button>
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                        </div>

                                        {/* Agent Actions Section */}
                                        <div className="function-flow-container mt-3">
                                          <div className="function-summary">
                                            <span className="function-count">
                                              {(item.functionFlow || []).length}{" "}
                                              function
                                              {(item.functionFlow || [])
                                                .length !== 1
                                                ? "s"
                                                : ""}{" "}
                                              configured
                                            </span>
                                          </div>

                                          <button
                                            type="button"
                                            className="function-flow-button"
                                            onClick={() =>
                                              openAgentFunctionsModal(index)
                                            }
                                            style={{ marginTop: "0.5rem" }}
                                          >
                                            <i className="fas fa-cog"></i>
                                            Agent Actions
                                          </button>
                                           <div className="mt-2">
                                             <select
                                               className="placeholder-select mb-1 bg-primary"
                                               value=""
                                               onChange={(e) => handleInsertPlaceholder(e, item)}
                                               aria-label="Insert Placeholder"
                                             >
                                               <option value="" disabled>
                                                 Insert Placeholder
                                               </option>
                                               <option value="storyName">Story Name</option>
                                               <option value="chapterName">Chapter Name</option>
                                               <option value="itemName"> Item Name</option> 
                                               <option value="subCategoryName"> Sub Category</option>
                                             </select>
                                           </div>
                                        </div>

                                        <div className="action-buttons">
                                          <div
                                            className="policy-button"
                                            onClick={() =>
                                              handlePolicyItem(
                                                formData.selectedItems[index]
                                                  .itemId,
                                                formData.selectedItems[index]
                                                  .itemName
                                              )
                                            }
                                            title="Policies"
                                          >
                                            <FaRegFileAlt
                                              size={16}
                                              style={{
                                                color: "#3A6D8C",
                                                cursor: "pointer",
                                              }}
                                            />
                                          </div>
                                          <div
                                            className="delete-button"
                                            onClick={() =>
                                              handleRemoveItem(index)
                                            }
                                            title="Remove Item"
                                          >
                                            <FaTrash size={16} />
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </DragDropContext>
                      </div>
                    )}

                    <div className="step-actions">
                      <div className="d-flex align-items-center">
                        <Button
                          color="secondary"
                          onClick={handlePrevStep}
                          type="button"
                          style={{borderColor: "#8898aa"}}                        >
                          <BsArrowLeft />  Previous Step
                        </Button>
                        
                        {/* Widget Creation Button */}
                        <div className="d-flex align-items-center ml-3">
                          <Button
                            color={formData.createAsWidget ? "primary" : "primary"}
                            className=" btn btn-primary"
                            onClick={() => {
                              if (!formData.createAsWidget) {
                                // Add Widget mode - set default name
                                setFormData((prev) => ({
                                  ...prev,
                                  widgetName: `${prev.assistantName} Progress`,
                                }));
                              }
                              setShowWidgetModal(true);
                            }}
                          >
                            {formData.createAsWidget ? (
                              <>
                                <i className="fas fa-edit mr-1"></i>
                                Edit Widget
                              </>
                            ) : (
                              <>
                                <i className="fas fa-plus mr-1"></i>
                                Add Widget
                              </>
                            )}
                          </Button>
                          
                          {/* Delete Widget Button - only show when editing existing widget */}
                          {formData.createAsWidget && (
                            <Button 
                              type="button"
                              style={{width: "40px", height: "43px", padding: "0", display: "flex", alignItems: "center", justifyContent: "center"}} 
                              className="btn delete-button"
                              onClick={handleRemoveWidget}
                              title="Remove widget configuration"
                            >
                               <FaTrash size={20} />
                            </Button>
                          )}  
                          
                          {/* Widget Status Indicator */}
                          {/* {formData.createAsWidget && (
                            <div className="ml-2">
                              <span className="badge badge-success">
                                <i className="fas fa-check mr-1"></i>
                                Widget: {formData.widgetName}
                              </span>
                            </div>
                          )} */}
                        </div>
                      </div>
                      
                      {!isViewer && (
                        <Button
                          className="btn-custom-primary"
                          type="submit"
                          disabled={formData.selectedItems.length === 0}
                        >
                          {isEditMode ? "Preview & Update" : "Preview & Submit"}
                        </Button>
                      )}
                    </div>
                  </div>
                </Form>
              </CardHeader>
            </Card>

            {/* Preview Modal */}
            <Modal
              isOpen={previewModal}
              toggle={() => setPreviewModal(false)}
              size="lg"
            >
              <ModalBody>
                <div className="mb-4">
                  <div className="font-bold text-black text-base">
                    Form Details
                  </div>
                  <Table bordered>
                    <tbody>
                      <tr>
                        <th width="30%">Assistant Name</th>
                        <td>{formData.assistantName}</td>
                      </tr>

                      <tr>
                        <th>Display Path</th>
                        <td>
                          {formData.displayPath
                            .map((path) => {
                              if (path === "Home_Recommendation")
                                return "Home Recommendations";
                              if (path === "Gather_Assist")
                                return "Gather Assist";
                              return path;
                            })
                            .join(", ")}
                        </td>
                      </tr>

                      <tr>
                        <th>First Message</th>
                        <td style={{ wordBreak: 'break-word',whiteSpace: "normal" }}>{formData.firstMessage}</td>
                      </tr>
                      <tr>
                        <th>Call To Action</th>
                        <td style={{ wordBreak: 'break-word',whiteSpace: "normal" }}>{formData.callToAction}</td>
                      </tr>

                      <tr>
                        <th>Widget Configuration</th>
                        <td>
                          {formData.createAsWidget ? (
                            <div>
                              {/* <span className="badge badge-success mb-2">Enabled as Widget</span> */}
                              <div className="mt-2">
                                <strong>Widget Name:</strong> {formData.widgetName || "Not specified"}
                              </div>
                              <div className="mt-1">
                                <strong>Display Location:</strong> {formData.widgetDisplayPath.section} - {formData.widgetDisplayPath.page}
                              </div>
                            </div>
                          ) : (
                            <span className="badge badge-secondary">Not configured as widget</span>
                          )}
                        </td>
                      </tr>

                      <tr>
                        <th>Expiry Date & Time</th>
                        <td>
                          {formData.expiryDate
                            ? new Date(formData.expiryDate).toLocaleString(
                                "en-US",
                                {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                }
                              )
                            : "Not set"}
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </div>

                <>
                  <div className="font-bold text-black text-base">
                    Selected Items
                  </div>
                  <div className="table-responsive">
                    <Table bordered hover>
                      <thead>
                        <tr>
                          <th>Sequence</th>
                          <th>Story Name</th>
                          <th>Chapter Name</th>
                          <th>Item Name</th>
                          <th>Question</th>
                          <th>Agent Actions</th>
                          <th>Policies</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.selectedItems.map((item, index) => (
                          <tr key={item.uniqueId}>
                            <td>{item.sequence}</td>
                            <td>{item.storyName}</td>
                            <td>{item.chapterName}</td>
                            <td>{item.itemName}</td>
                            <td>
                              {item.question}
                              {item.useCustomQuestion && (
                                <Badge color="warning" className="ml-2">
                                  Custom
                                </Badge>
                              )}
                            </td>
                            <td>
                              {(item.functionFlow || []).length > 0 ? (
                                <div>
                                  {item.functionFlow.map((func, funcIndex) => {
                                    const dynamicFunc = dynamicFunctions.find(
                                      (df) =>
                                        df.id === parseInt(func.functionId)
                                    );
                                    return (
                                      <div key={funcIndex} className="mb-1">
                                        <Badge color="primary" className="mr-1">
                                          {func.event === "before"
                                            ? "Before"
                                            : "After"}
                                        </Badge>
                                        <Badge
                                          color="secondary"
                                          className="mr-1"
                                        >
                                          Order: {func.order}
                                        </Badge>
                                        <Badge color="primary" className="mr-1">
                                          {func.displayType || "radio"}
                                        </Badge>
                                        <span className="small">
                                          {dynamicFunc
                                            ? dynamicFunc.name
                                            : "Unknown Function"}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-muted small">None</span>
                              )}
                            </td>
                            <td>
                              {(() => {
                                const cachedPolicies = policyCache[item.itemId];
                                const policies =
                                  cachedPolicies || item.policies || [];
                                const policyCount = policies.length;

                                if (policyCount > 0) {
                                  return (
                                    <div>
                                      <Badge color="success" className="mr-1">
                                        {policyCount}{" "}
                                        {policyCount === 1
                                          ? "Policy"
                                          : "Policies"}
                                      </Badge>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <Badge color="secondary" className="mr-1">
                                      No Policies
                                    </Badge>
                                  );
                                }
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="secondary"
                  onClick={() => setPreviewModal(false)}
                >
                  Cancel
                </Button>
                {!isViewer && (
                  <Button
                    color="primary"
                    onClick={handleConfirmSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        {isEditMode ? "Updating..." : "Submitting..."}
                      </>
                    ) : isEditMode ? (
                      "Confirm & Update"
                    ) : (
                      "Confirm & Submit"
                    )}
                  </Button>
                )}
              </ModalFooter>
            </Modal>

            {/* Add the Revert Confirmation Modal */}
            <Modal isOpen={revertModal.isOpen} toggle={handleRevertCancel}>
              <ModalHeader toggle={handleRevertCancel}>
                Revert Question
              </ModalHeader>
              <ModalBody className="pt-0">
                <p className="text-left mb-4">
                  Are you sure you want to revert to the original question? This
                  will discard your custom question.
                </p>
                <div className="d-flex justify-content-end gap-3">
                  <Button color="secondary" onClick={handleRevertCancel}>
                    Cancel
                  </Button>
                  <Button color="danger" onClick={handleRevertConfirm}>
                    Confirm
                  </Button>
                </div>
              </ModalBody>
            </Modal>

            {/* Agent Actions Modal */}
            <Modal
              isOpen={agentFunctionsModal.isOpen}
              toggle={closeAgentFunctionsModal}
              size="lg"
            >
              <ModalHeader toggle={closeAgentFunctionsModal}>
                <div className="d-flex align-items-center">
                  <i className="fas fa-cog mr-2"></i>
                  Agent Actions - {agentFunctionsModal.selectedItem?.itemName}
                </div>
              </ModalHeader>
              <ModalBody>
                {/* Add Agent Action Button */}
                <div className="text-center mb-4">
                  <Button
                    color="primary"
                    onClick={() =>
                      openAddFunctionModal(
                        agentFunctionsModal.selectedItemIndex
                      )
                    }
                  >
                    <i className="fas fa-plus mr-1"></i>
                    Add Agent Action
                  </Button>
                </div>

                <hr />

                {/* Functions List with Drag & Drop */}
                <div className="functions-overview">
                  <h4
                    className="mb-3"
                    style={{ fontWeight: 400, fontSize: "1.15rem" }}
                  >
                    Actions List
                  </h4>
                  <DragDropContext onDragEnd={handleFunctionDragEnd}>
                    <Droppable droppableId="functions-list">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`functions-droppable ${
                            snapshot.isDraggingOver ? "dragging-over" : ""
                          }`}
                          style={{
                            minHeight: "60px",
                            padding: "0.5rem",
                            border: "1px dashed #dee2e6",
                            borderRadius: "0.375rem",
                            backgroundColor: snapshot.isDraggingOver
                              ? "#f8f9fa"
                              : "transparent",
                          }}
                        >
                          {(
                            agentFunctionsModal.selectedItem?.functionFlow || []
                          ).map((func, funcIndex) => {
                            const dynamicFunc = dynamicFunctions.find(
                              (df) => df.id === parseInt(func.functionId)
                            );
                            return (
                              <Draggable
                                key={funcIndex}
                                draggableId={`function-${funcIndex}`}
                                index={funcIndex}
                              >
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`function-card ${
                                      snapshot.isDragging ? "dragging" : ""
                                    }`}
                                    style={{
                                      ...provided.draggableProps.style,
                                      padding: "0.75rem",
                                      marginBottom: "0.5rem",
                                      backgroundColor: snapshot.isDragging
                                        ? "#e3f2fd"
                                        : "white",
                                      border: "1px solid #e9ecef",
                                      borderRadius: "0.375rem",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                    }}
                                  >
                                    <div className="d-flex align-items-center">
                                      <FaGripVertical
                                        className="drag-handle mr-2"
                                        style={{
                                          color: "#8898aa",
                                          cursor: "grab",
                                        }}
                                      />
                                      <div>
                                        <div className="d-flex align-items-center mb-1">
                                          <Badge
                                            color={
                                              func.event === "before"
                                                ? "primary"
                                                : "success"
                                            }
                                            className="mr-2"
                                          >
                                            {func.event === "before"
                                              ? "Before"
                                              : "After"}
                                          </Badge>
                                          <Badge
                                            color="primary"
                                            className="mr-2 font-weight-bold"
                                          >
                                            Order: {func.order}
                                          </Badge>
                                          <Badge
                                            color="primary"
                                            className="mr-2"
                                          >
                                            {func.displayType || "radio"}
                                          </Badge>
                                        </div>
                                        <div className="function-name">
                                          {dynamicFunc
                                            ? dynamicFunc.name
                                            : "Unknown Function"}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="d-flex align-items-center">
                                      <button
                                        className="btn btn-sm btn-outline-primary mr-2"
                                        onClick={() =>
                                          openEditFunctionModal(
                                            agentFunctionsModal.selectedItemIndex,
                                            funcIndex
                                          )
                                        }
                                        title="Edit function"
                                      >
                                        <i className="fas fa-edit"></i>
                                      </button>
                                      <button
                                        className="btn btn-sm btn-outline-danger"
                                        onClick={() =>
                                          removeFunctionFromItem(funcIndex)
                                        }
                                        title="Remove function"
                                      >
                                        <i className="fas fa-times"></i>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                          {(
                            agentFunctionsModal.selectedItem?.functionFlow || []
                          ).length === 0 && (
                            <div className="text-center text-muted py-3">
                              No actions configured for this item
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="secondary" onClick={closeAgentFunctionsModal}>
                  Close
                </Button>
              </ModalFooter>
            </Modal>

            {/* Add Function Modal */}
            <Modal
              isOpen={addFunctionModal.isOpen}
              toggle={closeAddFunctionModal}
              size="md"
            >
              <ModalHeader toggle={closeAddFunctionModal}>
                <div className="d-flex align-items-center">
                  <i className="fas fa-plus mr-2"></i>
                  Add Agent Action
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="row">
                  <div className="col-md-6">
                    <FormGroup>
                      <Label>Event</Label>
                      <Input
                        type="select"
                        value={addFunctionModal.newFunctionData.event}
                        onChange={(e) =>
                          updateNewFunctionData("event", e.target.value)
                        }
                      >
                        <option value="before">Before Question</option>
                        <option value="after">After Question</option>
                      </Input>
                    </FormGroup>
                  </div>
                  <div className="col-md-6">
                    <FormGroup>
                      <Label>Agent Action</Label>
                      <Input
                        type="select"
                        value={addFunctionModal.newFunctionData.functionId}
                        onChange={(e) =>
                          updateNewFunctionData("functionId", e.target.value)
                        }
                      >
                        <option value="">Select Agent Action</option>
                        {dynamicFunctions.map((df) => (
                          <option key={df.id} value={df.id}>
                            {df.name}
                          </option>
                        ))}
                      </Input>
                    </FormGroup>
                  </div>
                  <div className="col-md-12">
                    <FormGroup>
                      <Label className="font-weight-bold">Display Type</Label>
                      <div className="mt-2">
                        <div className="d-flex flex-wrap gap-3">
                          <div className="display-type-simple">
                            <Input
                              type="radio"
                              name="displayType"
                              value="radio"
                              id="displayTypeRadio"
                              checked={
                                addFunctionModal.newFunctionData.displayType ===
                                "radio"
                              }
                              onChange={(e) =>
                                updateNewFunctionData(
                                  "displayType",
                                  e.target.value
                                )
                              }
                              className="me-2"
                            />
                            <Label className="mb-0" htmlFor="displayTypeRadio">
                              Radio
                            </Label>
                          </div>
                          <div className="display-type-simple">
                            <Input
                              type="radio"
                              name="displayType"
                              value="checkbox"
                              id="displayTypeCheckbox"
                              checked={
                                addFunctionModal.newFunctionData.displayType ===
                                "checkbox"
                              }
                              onChange={(e) =>
                                updateNewFunctionData(
                                  "displayType",
                                  e.target.value
                                )
                              }
                              className="me-2"
                            />
                            <Label
                              className="mb-0"
                              htmlFor="displayTypeCheckbox"
                            >
                              Checkbox
                            </Label>
                          </div>
                          <div className="display-type-simple">
                            <Input
                              type="radio"
                              name="displayType"
                              value="freeText"
                              id="displayTypeFreeText"
                              checked={
                                addFunctionModal.newFunctionData.displayType ===
                                "freeText"
                              }
                              onChange={(e) =>
                                updateNewFunctionData(
                                  "displayType",
                                  e.target.value
                                )
                              }
                              className="me-2"
                            />
                            <Label
                              className="mb-0"
                              htmlFor="displayTypeFreeText"
                            >
                              Free Text
                            </Label>
                          </div>
                        </div>
                      </div>
                    </FormGroup>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="secondary" onClick={closeAddFunctionModal}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onClick={addFunctionToItem}
                  disabled={!addFunctionModal.newFunctionData.functionId}
                >
                  Add Agent Action
                </Button>
              </ModalFooter>
            </Modal>

            {/* Edit Function Modal */}
            <Modal
              isOpen={editFunctionModal.isOpen}
              toggle={closeEditFunctionModal}
              size="md"
            >
              <ModalHeader toggle={closeEditFunctionModal}>
                <div className="d-flex align-items-center">
                  <i className="fas fa-edit mr-2"></i>
                  Edit Agent Action
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="row">
                  <div className="col-md-6">
                    <FormGroup>
                      <Label>Event</Label>
                      <Input
                        type="select"
                        value={editFunctionModal.functionData.event}
                        onChange={(e) =>
                          updateEditFunctionData("event", e.target.value)
                        }
                      >
                        <option value="before">Before Question</option>
                        <option value="after">After Question</option>
                      </Input>
                    </FormGroup>
                  </div>
                  <div className="col-md-6">
                    <FormGroup>
                      <Label>Agent Action</Label>
                      <Input
                        type="select"
                        value={editFunctionModal.functionData.functionId}
                        onChange={(e) =>
                          updateEditFunctionData("functionId", e.target.value)
                        }
                      >
                        <option value="">Select Agent Action</option>
                        {dynamicFunctions.map((df) => (
                          <option key={df.id} value={df.id}>
                            {df.name}
                          </option>
                        ))}
                      </Input>
                    </FormGroup>
                  </div>
                  <div className="col-md-12">
                    <FormGroup>
                      <Label className="font-weight-bold">Display Type</Label>
                      <div className="mt-2">
                        <div className="d-flex flex-wrap gap-3">
                          <div className="display-type-simple">
                            <Input
                              type="radio"
                              name="editDisplayType"
                              value="radio"
                              id="editDisplayTypeRadio"
                              checked={
                                editFunctionModal.functionData.displayType ===
                                "radio"
                              }
                              onChange={(e) =>
                                updateEditFunctionData(
                                  "displayType",
                                  e.target.value
                                )
                              }
                              className="me-2"
                            />
                            <Label
                              className="mb-0"
                              htmlFor="editDisplayTypeRadio"
                            >
                              Radio
                            </Label>
                          </div>
                          <div className="display-type-simple">
                            <Input
                              type="radio"
                              name="editDisplayType"
                              value="checkbox"
                              id="editDisplayTypeCheckbox"
                              checked={
                                editFunctionModal.functionData.displayType ===
                                "checkbox"
                              }
                              onChange={(e) =>
                                updateEditFunctionData(
                                  "displayType",
                                  e.target.value
                                )
                              }
                              className="me-2"
                            />
                            <Label
                              className="mb-0"
                              htmlFor="editDisplayTypeCheckbox"
                            >
                              Checkbox
                            </Label>
                          </div>
                          <div className="display-type-simple">
                            <Input
                              type="radio"
                              name="editDisplayType"
                              value="freeText"
                              id="editDisplayTypeFreeText"
                              checked={
                                editFunctionModal.functionData.displayType ===
                                "freeText"
                              }
                              onChange={(e) =>
                                updateEditFunctionData(
                                  "displayType",
                                  e.target.value
                                )
                              }
                              className="me-2"
                            />
                            <Label
                              className="mb-0"
                              htmlFor="editDisplayTypeFreeText"
                            >
                              Free Text
                            </Label>
                          </div>
                        </div>
                      </div>
                    </FormGroup>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="secondary" onClick={closeEditFunctionModal}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onClick={updateFunctionInItem}
                  disabled={!editFunctionModal.functionData.functionId}
                >
                  Update Agent Action
                </Button>
              </ModalFooter>
            </Modal>
          </div>
        </Row>
      </Container>

      {/* Add the policy modal to your JSX (add this before the closing Container tag) */}
      {renderPolicyModal()}
      {renderConditionModal()}
      <style>{policyStyles}</style>

      {/* Policy Functions Modal */}
      <Modal
        isOpen={policyFunctionsModal.isOpen}
        toggle={closePolicyFunctionsModal}
        size="lg"
      >
        <ModalHeader toggle={closePolicyFunctionsModal}>
          <div className="d-flex align-items-center">
            <i className="fas fa-cog mr-2"></i>
            Agent Actions - {policyFunctionsModal.selectedPolicy?.policy}
          </div>
        </ModalHeader>
        <ModalBody>
          {/* Add Agent Action Button */}
          <div className="text-center mb-4">
            <Button
              color="primary"
              onClick={() =>
                openAddPolicyFunctionModal(
                  policyFunctionsModal.selectedPolicyIndex
                )
              }
            >
              <i className="fas fa-plus mr-1"></i>
              Add Agent Action
            </Button>
          </div>

          <hr />

          {/* Functions List with Drag & Drop */}
          <div className="functions-overview">
            <h4
              className="mb-3"
              style={{ fontWeight: 400, fontSize: "1.15rem" }}
            >
              Actions List
            </h4>
            <DragDropContext onDragEnd={handlePolicyFunctionDragEnd}>
              <Droppable droppableId="policy-functions-list">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`functions-droppable ${
                      snapshot.isDraggingOver ? "dragging-over" : ""
                    }`}
                    style={{
                      minHeight: "60px",
                      padding: "0.5rem",
                      border: "1px dashed #dee2e6",
                      borderRadius: "0.375rem",
                      backgroundColor: snapshot.isDraggingOver
                        ? "#f8f9fa"
                        : "transparent",
                    }}
                  >
                    {(
                      policyFunctionsModal.selectedPolicy?.functionFlow || []
                    ).map((func, funcIndex) => {
                      const dynamicFunc = dynamicFunctions.find(
                        (df) => df.id === parseInt(func.functionId)
                      );
                      return (
                        <Draggable
                          key={funcIndex}
                          draggableId={`policy-function-${funcIndex}`}
                          index={funcIndex}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`function-card ${
                                snapshot.isDragging ? "dragging" : ""
                              }`}
                              style={{
                                ...provided.draggableProps.style,
                                padding: "0.75rem",
                                marginBottom: "0.5rem",
                                backgroundColor: snapshot.isDragging
                                  ? "#e3f2fd"
                                  : "white",
                                border: "1px solid #e9ecef",
                                borderRadius: "0.375rem",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <div className="d-flex align-items-center">
                                <FaGripVertical
                                  className="drag-handle mr-2"
                                  style={{ color: "#8898aa", cursor: "grab" }}
                                />
                                <div>
                                  <div className="d-flex align-items-center mb-1">
                                    <Badge
                                      color={
                                        func.event === "before"
                                          ? "primary"
                                          : "success"
                                      }
                                      className="mr-2"
                                    >
                                      {func.event === "before"
                                        ? "Before"
                                        : "After"}
                                    </Badge>
                                    <Badge
                                      color="primary"
                                      className="mr-2 font-weight-bold"
                                    >
                                      Order: {func.order}
                                    </Badge>
                                    <Badge color="primary" className="mr-2">
                                      {func.displayType || "radio"}
                                    </Badge>
                                  </div>
                                  <div className="function-name">
                                    {dynamicFunc
                                      ? dynamicFunc.name
                                      : "Unknown Function"}
                                  </div>
                                </div>
                              </div>
                              <div className="d-flex align-items-center">
                                <button
                                  className="btn btn-sm btn-outline-primary mr-2"
                                  onClick={() =>
                                    openEditPolicyFunctionModal(
                                      policyFunctionsModal.selectedPolicyIndex,
                                      funcIndex
                                    )
                                  }
                                  title="Edit function"
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() =>
                                    removeFunctionFromPolicy(funcIndex)
                                  }
                                  title="Remove function"
                                >
                                  <i className="fas fa-times"></i>
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                    {(policyFunctionsModal.selectedPolicy?.functionFlow || [])
                      .length === 0 && (
                      <div className="text-center text-muted py-3">
                        No actions configured for this policy
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={closePolicyFunctionsModal}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      {/* Add Policy Function Modal */}
      <Modal
        isOpen={addPolicyFunctionModal.isOpen}
        toggle={closeAddPolicyFunctionModal}
        size="md"
      >
        <ModalHeader toggle={closeAddPolicyFunctionModal}>
          <div className="d-flex align-items-center">
            <i className="fas fa-plus mr-2"></i>
            Add Agent Action to Policy
          </div>
        </ModalHeader>
        <ModalBody>
          <div className="row">
            <div className="col-md-6">
              <FormGroup>
                <Label>Event</Label>
                <Input
                  type="select"
                  value={addPolicyFunctionModal.newFunctionData.event}
                  onChange={(e) =>
                    updateNewPolicyFunctionData("event", e.target.value)
                  }
                >
                  <option value="before">Before Question</option>
                  <option value="after">After Question</option>
                </Input>
              </FormGroup>
            </div>
            <div className="col-md-6">
              <FormGroup>
                <Label>Agent Action</Label>
                <Input
                  type="select"
                  value={addPolicyFunctionModal.newFunctionData.functionId}
                  onChange={(e) =>
                    updateNewPolicyFunctionData("functionId", e.target.value)
                  }
                >
                  <option value="">Select Agent Action</option>
                  {dynamicFunctions.map((df) => (
                    <option key={df.id} value={df.id}>
                      {df.name}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </div>
            <div className="col-md-12">
              <FormGroup>
                <Label className="font-weight-bold">Display Type</Label>
                <div className="mt-2">
                  <div className="d-flex flex-wrap gap-3">
                    <div className="display-type-simple">
                      <Input
                        type="radio"
                        name="policyDisplayType"
                        value="radio"
                        id="policyDisplayTypeRadio"
                        checked={
                          addPolicyFunctionModal.newFunctionData.displayType ===
                          "radio"
                        }
                        onChange={(e) =>
                          updateNewPolicyFunctionData(
                            "displayType",
                            e.target.value
                          )
                        }
                        className="me-2"
                      />
                      <Label className="mb-0" htmlFor="policyDisplayTypeRadio">
                        Radio
                      </Label>
                    </div>
                    <div className="display-type-simple">
                      <Input
                        type="radio"
                        name="policyDisplayType"
                        value="checkbox"
                        id="policyDisplayTypeCheckbox"
                        checked={
                          addPolicyFunctionModal.newFunctionData.displayType ===
                          "checkbox"
                        }
                        onChange={(e) =>
                          updateNewPolicyFunctionData(
                            "displayType",
                            e.target.value
                          )
                        }
                        className="me-2"
                      />
                      <Label
                        className="mb-0"
                        htmlFor="policyDisplayTypeCheckbox"
                      >
                        Checkbox
                      </Label>
                    </div>
                    <div className="display-type-simple">
                      <Input
                        type="radio"
                        name="policyDisplayType"
                        value="freeText"
                        id="policyDisplayTypeFreeText"
                        checked={
                          addPolicyFunctionModal.newFunctionData.displayType ===
                          "freeText"
                        }
                        onChange={(e) =>
                          updateNewPolicyFunctionData(
                            "displayType",
                            e.target.value
                          )
                        }
                        className="me-2"
                      />
                      <Label
                        className="mb-0"
                        htmlFor="policyDisplayTypeFreeText"
                      >
                        Free Text
                      </Label>
                    </div>
                  </div>
                </div>
              </FormGroup>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={closeAddPolicyFunctionModal}>
            Cancel
          </Button>
          <Button
            color="primary"
            onClick={addFunctionToPolicy}
            disabled={!addPolicyFunctionModal.newFunctionData.functionId}
          >
            Add Agent Action
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit Policy Function Modal */}
      <Modal
        isOpen={editPolicyFunctionModal.isOpen}
        toggle={closeEditPolicyFunctionModal}
        size="md"
      >
        <ModalHeader toggle={closeEditPolicyFunctionModal}>
          <div className="d-flex align-items-center">
            <i className="fas fa-edit mr-2"></i>
            Edit Agent Action for Policy
          </div>
        </ModalHeader>
        <ModalBody>
          <div className="row">
            <div className="col-md-6">
              <FormGroup>
                <Label>Event</Label>
                <Input
                  type="select"
                  value={editPolicyFunctionModal.functionData.event}
                  onChange={(e) =>
                    updateEditPolicyFunctionData("event", e.target.value)
                  }
                >
                  <option value="before">Before Question</option>
                  <option value="after">After Question</option>
                </Input>
              </FormGroup>
            </div>
            <div className="col-md-6">
              <FormGroup>
                <Label>Agent Action</Label>
                <Input
                  type="select"
                  value={editPolicyFunctionModal.functionData.functionId}
                  onChange={(e) =>
                    updateEditPolicyFunctionData("functionId", e.target.value)
                  }
                >
                  <option value="">Select Agent Action</option>
                  {dynamicFunctions.map((df) => (
                    <option key={df.id} value={df.id}>
                      {df.name}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </div>
            <div className="col-md-12">
              <FormGroup>
                <Label className="font-weight-bold">Display Type</Label>
                <div className="mt-2">
                  <div className="d-flex flex-wrap gap-3">
                    <div className="display-type-simple">
                      <Input
                        type="radio"
                        name="editPolicyDisplayType"
                        value="radio"
                        id="editPolicyDisplayTypeRadio"
                        checked={
                          editPolicyFunctionModal.functionData.displayType ===
                          "radio"
                        }
                        onChange={(e) =>
                          updateEditPolicyFunctionData(
                            "displayType",
                            e.target.value
                          )
                        }
                        className="me-2"
                      />
                      <Label
                        className="mb-0"
                        htmlFor="editPolicyDisplayTypeRadio"
                      >
                        Radio
                      </Label>
                    </div>
                    <div className="display-type-simple">
                      <Input
                        type="radio"
                        name="editPolicyDisplayType"
                        value="checkbox"
                        id="editPolicyDisplayTypeCheckbox"
                        checked={
                          editPolicyFunctionModal.functionData.displayType ===
                          "checkbox"
                        }
                        onChange={(e) =>
                          updateEditPolicyFunctionData(
                            "displayType",
                            e.target.value
                          )
                        }
                        className="me-2"
                      />
                      <Label
                        className="mb-0"
                        htmlFor="editPolicyDisplayTypeCheckbox"
                      >
                        Checkbox
                      </Label>
                    </div>
                    <div className="display-type-simple">
                      <Input
                        type="radio"
                        name="editPolicyDisplayType"
                        value="freeText"
                        id="editPolicyDisplayTypeFreeText"
                        checked={
                          editPolicyFunctionModal.functionData.displayType ===
                          "freeText"
                        }
                        onChange={(e) =>
                          updateEditPolicyFunctionData(
                            "displayType",
                            e.target.value
                          )
                        }
                        className="me-2"
                      />
                      <Label
                        className="mb-0"
                        htmlFor="editPolicyDisplayTypeFreeText"
                      >
                        Free Text
                      </Label>
                    </div>
                  </div>
                </div>
              </FormGroup>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={closeEditPolicyFunctionModal}>
            Cancel
          </Button>
          <Button
            color="primary"
            onClick={updateFunctionInPolicy}
            disabled={!editPolicyFunctionModal.functionData.functionId}
          >
            Update Agent Action
          </Button>
        </ModalFooter>
      </Modal>

      {/* Policy Revert Confirmation Modal */}
      <Modal
        isOpen={policyRevertModal.isOpen}
        toggle={handlePolicyRevertCancel}
      >
        <ModalHeader toggle={handlePolicyRevertCancel}>
          Revert Policy Question
        </ModalHeader>
        <ModalBody className="pt-0">
          <p className="text-left mb-4">
            Are you sure you want to revert to the original question? This will
            discard your custom question.
          </p>
          <div className="d-flex justify-content-end gap-3">
            <Button color="secondary" onClick={handlePolicyRevertCancel}>
              Cancel
            </Button>
            <Button color="danger" onClick={handlePolicyRevertConfirm}>
              Confirm
            </Button>
          </div>
        </ModalBody>
      </Modal>

      {/* Platform Change Warning Modal */}
      <Modal
        isOpen={platformChangeWarningModal.isOpen}
        toggle={handlePlatformChangeWarningClose}
        centered
      >
        <ModalHeader toggle={handlePlatformChangeWarningClose}>
          <div className="d-flex align-items-center">
            <i className="fas fa-exclamation-triangle text-warning mr-2"></i>
            Cannot Change Platforms
          </div>
        </ModalHeader>
        <ModalBody className="pt-0">
          <div className="alert alert-warning mb-3">
            <i className="fas fa-exclamation-triangle mr-2"></i>
            <strong>Action Blocked:</strong> You have {platformChangeWarningModal.selectedItemsCount} selected item(s) that prevent platform changes.
          </div>
          <p className="text-left mb-4">
            To change platforms, you must first remove all selected items from your assistant. 
            This ensures that no data is lost when switching between different platforms.
          </p>
          <div className="d-flex justify-content-end">
            <Button 
              color="primary" 
              onClick={handlePlatformChangeWarningClose}
            >
              <i className="fas fa-check mr-1"></i>
              I Understand
            </Button>
          </div>
        </ModalBody>
      </Modal>

      {/* Widget Configuration Modal */}
      <Modal
        isOpen={showWidgetModal}
        toggle={() => setShowWidgetModal(false)}
        centered
        size="md"
      >
        <ModalHeader toggle={() => setShowWidgetModal(false)}>
          <i className="fas fa-puzzle-piece mr-2"></i>
          {formData.createAsWidget ? "Edit Widget Configuration" : "Add Widget Configuration"}
        </ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label for="widgetCategory">
              Widget Category <span className="text-danger">*</span>
            </Label>
            <Input
              data-toggle="tooltip" data-placement="top" title="Widget category assigned to the assistant widget"
              className="form-control-alternative"
              type="text"
              name="widgetCategory"
              id="widgetCategory"
              value={masterWidgetName}
              disabled
              style={{ backgroundColor: '#f8f9fa', cursor: 'not-allowed' }}
            />
          </FormGroup>

          <FormGroup>
            <Label for="widgetName"data-toggle="tooltip" data-placement="top" title="This is the widget name that will be shown in the frontend">
              Assistant Widget Name <span className="text-danger">*</span>
            </Label>
            <Input
              className="form-control-alternative"
              type="text"
              name="widgetName"
              id="widgetName"
              data-toggle="tooltip" data-placement="top" title="This is the widget name that will be shown in the frontend"
              value={formData.widgetName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  widgetName: e.target.value,
                }))
              }
              placeholder="Enter Assistant Widget Name"
              maxLength={50}
              required
            />
            <small className="form-text text-muted">
              {formData.widgetName.length}/50 characters
            </small>
          </FormGroup>

          <Row>
            <Col md={6}>
              <FormGroup>
                <Label for="widgetDisplayPage">
                  Display Page <span className="text-danger">*</span>
                </Label>
                <Input
                  type="select"
                  name="widgetDisplayPage"
                  id="widgetDisplayPage"
                  value={formData.widgetDisplayPath?.page || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      widgetDisplayPath: {
                        ...prev.widgetDisplayPath,
                        page: e.target.value,
                      },
                    }))
                  }
                  required
                >
                  <option value="">Select Page</option>
                  <option value="Home Screen">Home Screen</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label for="widgetDisplaySection">
                  Display Section <span className="text-danger">*</span>
                </Label>
                <Input
                  type="select"
                  name="widgetDisplaySection"
                  id="widgetDisplaySection"
                  value={formData.widgetDisplayPath?.section || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      widgetDisplayPath: {
                        ...prev.widgetDisplayPath,
                        section: e.target.value,
                      },
                    }))
                  }
                  required
                >
                  <option value="">Select Section</option>
                  <option value="Left Panel">Left Panel</option>
                  <option value="Right Panel">Right Panel</option>
                </Input>
              </FormGroup>
            </Col>
          </Row>

          <div className="d-flex justify-content-end mt-4">
            <Button
              color="secondary"
              onClick={() => {
                setShowWidgetModal(false);
                // Only reset widget data if we're in "Add" mode
                if (!formData.createAsWidget) {
                  setFormData((prev) => ({
                    ...prev,
                    widgetName: "",
                    widgetKey: "assistant_progress",
                    widgetDisplayPath: {
                      page: "Home Screen",
                      section: "Left Panel"
                    }
                  }));
                }
              }}
              className="mr-2"
            >
              Cancel
            </Button>
            <Button
              color="primary"
              onClick={() => {
                // Mark as widget created/edited
                setFormData((prev) => ({
                  ...prev,
                  createAsWidget: true,
                }));
                setShowWidgetModal(false);
              }}
              disabled={!formData.widgetName || !formData.widgetDisplayPath?.page || !formData.widgetDisplayPath?.section}
            >
              {formData.createAsWidget ? "Update Configuration" : "Create Widget"}
            </Button>
          </div>
        </ModalBody>
      </Modal>
    </>
  );
};

export default AssistantForm;
