import React, { useState, useEffect } from "react";
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
  Table,
  Container,
  Row,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Spinner,
  Alert,
  Form,
  FormGroup,
  Input,
  Label,
} from "reactstrap";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
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
  saveSequenceMode,
  loadSequenceMode,
  clearSequenceMode,
} from "utils/filterUtils";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { FaGripVertical } from "react-icons/fa";
import assistantService from "services/assistantService";
import platformService from "services/platformService";
import { PiNewspaperLight } from "react-icons/pi";

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

  /* Suggestions styles */
  .suggestions-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .suggestion-item {
    background: #f8f9fa;
    transition: all 0.2s;
  }

  .suggestion-item:hover {
    background: #e9ecef;
  }

  .suggestion-item .btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }
`;

// Add this line after the messageStyles constant
const styles = messageStyles + dropdownStyles + filterBadgeStyles;

const SeedData = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [apiMessage, setApiMessage] = useState({ content: "", type: "" });
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState(null);
  const [editItemName, setEditItemName] = useState("");
  const [editSampleConversation, setEditSampleConversation] = useState("");
  const [editMainQuestion, setEditMainQuestion] = useState("");
  const [editIsHidden, setEditIsHidden] = useState("false");
  const [editLoading, setEditLoading] = useState(false);
  const [editConfirmModalOpen, setEditConfirmModalOpen] = useState(false);
  const [filters, setFilters] = useState(() =>
    loadFilters("seedData", {
      itemName: "",
      storyName: "",
      chapterName: "",
      platformName: "",
    })
  );
  const [platforms, setPlatforms] = useState([]);
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "ascending",
  });
  const [reorderedItems, setReorderedItems] = useState(null);
  const [isSavingSequence, setIsSavingSequence] = useState(false);
  const [showSequenceConfirm, setShowSequenceConfirm] = useState(false);
  const [isSequenceMode, setIsSequenceMode] = useState(() => {
    const savedState = loadSequenceMode("seedData", {
      isSequenceMode: false,
      showAllItems: false,
    });
    return savedState.isSequenceMode;
  });
  const [createItemModal, setCreateItemModal] = useState(false);
  const [itemFormData, setItemFormData] = useState({
    itemName: "",
    storyId: "",
    chapterId: "",
    question: "",
    suggestions: [],
    sample_conversation: "",
    isHidden: "false",
  });
  const [stories, setStories] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [suggestionModal, setSuggestionModal] = useState(false);
  const [currentSuggestion, setCurrentSuggestion] = useState({
    suggestion: "",
    status: "active",
  });
  const [suggestionIndex, setSuggestionIndex] = useState(null); // for editing suggestions
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [showAllItems, setShowAllItems] = useState(() => {
    const savedState = loadSequenceMode("seedData", {
      isSequenceMode: false,
      showAllItems: false,
    });
    return savedState.showAllItems;
  });
  const [isPlatformFiltered, setIsPlatformFiltered] = useState(false);
  const [storyTemplateModal, setStoryTemplateModal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isSuperAdmin = localStorage.getItem("userRole") === "admin";
  const isViewer = localStorage.getItem("userRole") === "viewer";

  // Monitor chapters state changes
  useEffect(() => {}, [chapters]);

  // Monitor create item modal and form data
  useEffect(() => {
    if (createItemModal) {
    }
  }, [createItemModal, itemFormData, chapters]);

  // Initial data fetch when component mounts
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      if (isMounted) {
        await fetchItems();
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle navigation state changes (like returning from other pages)
  useEffect(() => {
    // Set page from navigation state if available
    if (location.state?.page) {
      setCurrentPage(location.state.page);
    }
    
    // Handle preFilters from navigation state
    if (location.state?.preFilters) {
      const { storyName, chapterName } = location.state.preFilters;
      
      // Update filters with the preFilters
      const newFilters = {
        ...filters,
        storyName: storyName || filters.storyName,
        chapterName: chapterName || filters.chapterName
      };
      
      setFilters(newFilters);
      
      // Save the filters
      saveFilters(newFilters);
      
      // Clear the navigation state to prevent re-applying on re-renders
      // Use window.history.replaceState to avoid triggering navigation
      window.history.replaceState({}, document.title, location.pathname);
      
      // Show a message to indicate filters have been applied
      setApiMessage({
        content: `Filters applied: ${storyName ? `Story: ${storyName}` : ''} ${chapterName ? `Chapter: ${chapterName}` : ''}`,
        type: "success",
      });
      
      // Clear the message after 3 seconds
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 3000);
    }
  }, [location.state]);

  // Note: Removed the useEffect that was refetching data on filter changes
  // since filtering is done client-side and doesn't require API calls

  // Fetch stories, chapters, and platforms for item creation
  useEffect(() => {
    const fetchStoriesAndChapters = async () => {
      try {
        // Fetch stories
        const storiesResponse = await assistantService.getStoriesList();
        if (storiesResponse.status === 200) {
          const storiesData = storiesResponse.data.body || [];
          setStories(storiesData);
        }
      } catch (error) {
        console.error("Error fetching stories:", error);
      }
    };

    const fetchPlatforms = async () => {
      try {
        const platformsResponse = await platformService.getAllPlatforms();
        if (platformsResponse.status === 200) {
          const platformsData = platformsResponse.body || [];
          setPlatforms(platformsData);
        }
      } catch (error) {
        console.error("Error fetching platforms:", error);
      }
    };

    fetchStoriesAndChapters();
    fetchPlatforms();
  }, []);

  // Apply saved platform filter after platforms are loaded
  useEffect(() => {
    let isMounted = true;

    if (platforms.length > 0 && filters.platformName && !isPlatformFiltered) {
      // Apply the saved platform filter
      const selectedPlatform = platforms.find(
        (platform) =>
          (platform.name && platform.name === filters.platformName) ||
          (platform.platformName &&
            platform.platformName === filters.platformName)
      );

      if (selectedPlatform) {
        // Apply the platform filter
        const applyPlatformFilter = async () => {
          try {
            if (isMounted) {
              setLoading(true);
              const platformId =
                selectedPlatform.id || selectedPlatform.platformId;
              const response = await platformService.filterItemsByPlatform(
                platformId
              );

              if (response.status === 200 && response.body && isMounted) {
                setItems(response.body);
                setIsPlatformFiltered(true);
              }
            }
          } catch (error) {
            console.error("Error applying saved platform filter:", error);
            // If there's an error, just fetch all items
            if (isMounted) {
              await fetchItems();
            }
          } finally {
            if (isMounted) {
              setLoading(false);
            }
          }
        };

        applyPlatformFilter();
      }
    }

    return () => {
      isMounted = false;
    };
  }, [platforms, filters.platformName, isPlatformFiltered]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null); // Clear any previous errors
      const response = await itemService.getItemsList();
      if (response.status === 200) {
        setItems(response.body);
        // Reset platform filtering state when fetching all items
        setIsPlatformFiltered(false);
      } else {
        setError("Failed to fetch items");
      }
    } catch (err) {
      setError(err.message || "An error occurred while fetching items");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US");
  };

  const handleViewDetails = (item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedItem(null);
  };

  const handleViewPolicies = async (itemId) => {
    try {
      // Find the item details
      const item = items.find((item) => item.itemId === itemId);

      console.log("🚀 Navigating to Policies from Seed Data:", {
        itemId: item.itemId,
        itemName: item.itemName,
        storyId: item.storyId,
        chapterId: item.chapterId,
        fullItemData: item,
      });

      // Always navigate to policies page, regardless of whether policies exist
      navigate(`/admin/training-data-hub/policies/${itemId}`, {
        state: {
          itemName: item.itemName,
          currentPage: currentPage,
          itemData: item, // Pass the full item object
        },
      });
    } catch (err) {
      console.error("❌ Error navigating to policies:", err);
      setApiMessage({
        content:
          err.message || "An error occurred while navigating to policies",
        type: "error",
      });
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 3000);
    }
  };

  const handleViewSuggestions = async (item) => {
    try {
      const response = await itemService.getSuggestionsList(item.itemId);
      if (response.status === 200) {
        const activeSuggestions = response.body.filter(
          (suggestion) => suggestion.status === "active"
        );
        if (activeSuggestions.length === 0) {
          setApiMessage({
            content: "No active suggestions found for this item",
            type: "error",
          });
          setTimeout(() => {
            setApiMessage({ content: "", type: "" });
          }, 7000);
          return;
        }
        navigate(`/admin/training-data-hub/suggestions/${item.itemId}`, {
          state: {
            itemName: item.itemName,
            currentPage: currentPage,
          },
        });
      } else {
        setApiMessage({
          content: response.message || "Failed to fetch suggestions",
          type: "error",
        });
        setTimeout(() => {
          setApiMessage({ content: "", type: "" });
        }, 7000);
      }
    } catch (err) {
      setApiMessage({
        content: err.message || "An error occurred while fetching suggestions",
        type: "error",
      });
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    }
  };

  const handleDeleteClick = (itemId) => {
    setItemToDelete(itemId);
    setDeleteModalOpen(true);
  };

  const handleCreateItem = async () => {
    // Pre-fill story and chapter based on current filters
    const preFilledData = {
      itemName: "",
      storyId: "",
      chapterId: "",
      question: "",
      suggestions: [],
      sample_conversation: "",
      isHidden: "false",
    };

    // If filters are set for story and chapter, try to find matching IDs
    if (filters.storyName && filters.chapterName) {
      // Find the story ID
      const matchingStory = stories.find(
        (story) =>
          story.storyName &&
          story.storyName.trim().toLowerCase() ===
            filters.storyName.trim().toLowerCase()
      );

      if (matchingStory) {
        const storyId = matchingStory.storyId || matchingStory.id;
        preFilledData.storyId = storyId;

        // Load chapters for this story immediately
        try {
          setChaptersLoading(true);

          const chaptersResponse = await assistantService.getChaptersList(
            storyId
          );

          if (chaptersResponse.status === 200) {
            const chaptersData = chaptersResponse.data.body || [];
            setChapters(chaptersData);
            // Find the matching chapter ID
            const matchingChapter = chaptersData.find(
              (chapter) =>
                chapter.chapterName &&
                chapter.chapterName.trim().toLowerCase() ===
                  filters.chapterName.trim().toLowerCase()
            );

            if (matchingChapter) {
              preFilledData.chapterId =
                matchingChapter.chapterId || matchingChapter.id;
            }
          }
        } catch (error) {
          console.error("Error loading chapters for pre-fill:", error);
          setChapters([]);
        } finally {
          setChaptersLoading(false);
        }
      }
    }

    // Set both form data and chapters state, then open modal
    setItemFormData(preFilledData);
    setCreateItemModal(true);
  };

  // Handle Create Item modal
  const handleCloseCreateItem = () => {
    setCreateItemModal(false);
    setItemFormData({
      itemName: "",
      storyId: "",
      chapterId: "",
      question: "",
      suggestions: [],
      sample_conversation: "",
      isHidden: "false",
    });
    // Reset chapters when closing modal
    setChapters([]);
  };

  // Handle story selection
  const handleStoryChange = async (e) => {
    const storyId = e.target.value;

    setItemFormData((prev) => ({
      ...prev,
      storyId,
      chapterId: "", // Reset chapter when story changes
    }));

    // Fetch chapters for the selected story
    if (storyId) {
      try {
        setChaptersLoading(true);

        const chaptersResponse = await assistantService.getChaptersList(
          storyId
        );

        if (chaptersResponse.status === 200) {
          const chaptersData = chaptersResponse.data.body || [];
          setChapters(chaptersData);
        } else {
          console.error(
            "Chapters API returned non-200 status:",
            chaptersResponse.status
          );
        }
      } catch (error) {
        console.error("Error fetching chapters:", error);
        console.error("Error details:", error.response?.data);
        console.error("Error status:", error.response?.status);
        setChapters([]);
      } finally {
        setChaptersLoading(false);
      }
    } else {
      setChapters([]);
    }
  };

  // Handle suggestion operations
  const handleAddSuggestion = () => {
    setSuggestionIndex(null);
    setCurrentSuggestion({ suggestion: "", status: "active" });
    setSuggestionModal(true);
  };

  const handleEditSuggestion = (index) => {
    setSuggestionIndex(index);
    setCurrentSuggestion(itemFormData.suggestions[index]);
    setSuggestionModal(true);
  };

  const handleDeleteSuggestion = (index) => {
    setItemFormData((prev) => ({
      ...prev,
      suggestions: prev.suggestions.filter((_, i) => i !== index),
    }));
  };

  const handleSaveSuggestion = () => {
    if (!currentSuggestion.suggestion.trim()) {
      setApiMessage({
        content: "Suggestion text is required",
        type: "error",
      });
      return;
    }

    if (suggestionIndex !== null) {
      setItemFormData((prev) => {
        const updatedSuggestions = prev.suggestions.map((s, i) =>
          i === suggestionIndex ? { ...currentSuggestion, id: s.id } : s
        );
        return {
          ...prev,
          suggestions: updatedSuggestions,
        };
      });
    } else {
      const newSuggestion = {
        ...currentSuggestion,
        id: itemFormData.suggestions.length + 1,
      };

      setItemFormData((prev) => ({
        ...prev,
        suggestions: [...prev.suggestions, newSuggestion],
      }));
    }

    setSuggestionModal(false);
    setCurrentSuggestion({ suggestion: "", status: "active" });
    setSuggestionIndex(null);
  };

  const handleCloseSuggestionModal = () => {
    setSuggestionModal(false);
    setCurrentSuggestion({ suggestion: "", status: "active" });
    setSuggestionIndex(null);
  };

  // Handle item form submission
  const handleItemSubmit = async () => {
    if (!itemFormData.itemName.trim()) {
      setApiMessage({
        content: "Item name is required",
        type: "error",
      });
      return;
    }
    if (!itemFormData.storyId) {
      setApiMessage({
        content: "Please select a story",
        type: "error",
      });
      return;
    }
    if (!itemFormData.chapterId) {
      setApiMessage({
        content: "Please select a chapter",
        type: "error",
      });
      return;
    }
    if (!itemFormData.question.trim()) {
      setApiMessage({
        content: "Question is required",
        type: "error",
      });
      return;
    }

    try {
      setLoading(true);
      const itemPayload = {
        itemName: itemFormData.itemName,
        storyId: parseInt(itemFormData.storyId),
        chapterId: parseInt(itemFormData.chapterId),
        question: itemFormData.question,
        suggestions: JSON.stringify(itemFormData.suggestions || []), // Convert array to JSON string
        sample_conversation: itemFormData.sample_conversation,
        sequence: 1,
        isCustom: 1,
        isHidden: itemFormData.isHidden === "true" ? 1 : 0,
      };

      const response = await itemService.createItem(itemPayload);
      console.log("handleItemSubmit - Success response:", response);
      if (response.status === 200 || response.status === 201) {
        setApiMessage({
          content: "Item created successfully",
          type: "success",
        });
        handleCloseCreateItem();
        fetchItems(); // Refresh the items list
      } else {
        setApiMessage({
          content: response.body.message || "Failed to create item",
          type: "error",
        });
      }
    } catch (error) {
      console.log("handleItemSubmit - Error caught:", error);
      setApiMessage({
        content:
          error.message ||
          error.response?.data?.message ||
          "Failed to create item",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      const response = await itemService.deleteItem(itemToDelete);
      if (response.status === 200) {
        setItems((prevItems) =>
          prevItems.filter((item) => item.itemId !== itemToDelete)
        );
        setApiMessage({
          content: "Item deleted successfully",
          type: "success",
        });
      } else {
        setApiMessage({
          content: response.message || "Failed to delete item",
          type: "error",
        });
      }
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    } catch (err) {
      setApiMessage({
        content: err.message || "An error occurred while deleting the item",
        type: "error",
      });
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    } finally {
      setDeleteModalOpen(false);
      setItemToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const handleEditClick = (item) => {
    setItemToEdit(item);
    setEditItemName(item.itemName);
    setEditSampleConversation(item.sample_conversation || "");
    setEditMainQuestion(item.question || "");
    setEditIsHidden(item.isHidden === 1 ? "true" : "false");
    setEditModalOpen(true);
  };

  const handleEditClose = () => {
    setEditModalOpen(false);
    setItemToEdit(null);
    setEditItemName("");
    setEditSampleConversation("");
    setEditMainQuestion("");
    setEditIsHidden("false");
  };

  const handleEditSubmit = async () => {
    if (!itemToEdit || !editItemName.trim()) return;

    // Add validation for main question
    if (!editMainQuestion.trim()) {
      setApiMessage({
        content: "Main question is required",
        type: "error",
      });
      return;
    }

    try {
      setEditLoading(true);
      const response = await itemService.editItem(itemToEdit.itemId, {
        itemName: editItemName.trim(),
        sample_conversation: editSampleConversation.trim(),
        mainQuestion: editMainQuestion.trim(),
        isHidden: editIsHidden === "true" ? 1 : 0,
      });

      if (response.status === 200) {
        // Update the item in the items array with the new updatedAt
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.itemId === itemToEdit.itemId
              ? {
                  ...item,
                  itemName: editItemName.trim(),
                  sample_conversation: editSampleConversation.trim(),
                  question: editMainQuestion.trim(),
                  isHidden: editIsHidden === "true" ? 1 : 0,
                  updatedAt: new Date().toISOString(), // Update the timestamp
                }
              : item
          )
        );

        setApiMessage({
          content: "Item updated successfully",
          type: "success",
        });
        handleEditClose();
      } else {
        setApiMessage({
          content: response.message || "Failed to update item",
          type: "error",
        });
      }
    } catch (err) {
      setApiMessage({
        content: err.message || "An error occurred while updating the item",
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

  // Sort items based on current sort configuration
  const sortedItems = [...items].sort((a, b) => {
    if (!sortConfig.key) return 0;

    if (sortConfig.key === "sequence") {
      const seqA = a.sequence ?? 0;
      const seqB = b.sequence ?? 0;
      return sortConfig.direction === "ascending" ? seqA - seqB : seqB - seqA;
    }

    if (sortConfig.key === "itemName") {
      const nameA = (a.itemName || "").toLowerCase();
      const nameB = (b.itemName || "").toLowerCase();
      return sortConfig.direction === "ascending"
        ? nameA.localeCompare(nameB)
        : nameB.localeCompare(nameA);
    }

    if (sortConfig.key === "storyName") {
      const storyA = (a.storyName || "").toLowerCase();
      const storyB = (b.storyName || "").toLowerCase();
      return sortConfig.direction === "ascending"
        ? storyA.localeCompare(storyB)
        : storyB.localeCompare(storyA);
    }

    if (sortConfig.key === "chapterName") {
      const chapterA = (a.chapterName || "").toLowerCase();
      const chapterB = (b.chapterName || "").toLowerCase();
      return sortConfig.direction === "ascending"
        ? chapterA.localeCompare(chapterB)
        : chapterB.localeCompare(chapterA);
    }

    if (sortConfig.key === "platformName") {
      const platformA = (a.platformName || "").toLowerCase();
      const platformB = (b.platformName || "").toLowerCase();
      return sortConfig.direction === "ascending"
        ? platformA.localeCompare(platformB)
        : platformB.localeCompare(platformA);
    }

    return 0;
  });

  // Filter items based on search criteria
  const filteredItems = sortedItems.filter((item) => {
    const itemNameMatch =
      filters.itemName === "" ||
      (item.itemName &&
        item.itemName.toLowerCase().includes(filters.itemName.toLowerCase()));

    const storyNameMatch =
      filters.storyName === "" ||
      (item.storyName &&
        item.storyName.toLowerCase().includes(filters.storyName.toLowerCase()));

    const chapterNameMatch =
      filters.chapterName === "" ||
      (item.chapterName &&
        item.chapterName
          .toLowerCase()
          .includes(filters.chapterName.toLowerCase()));

    // Platform filtering is handled by API when platformName filter is applied
    // So we only do client-side platform filtering when no platform filter is set
    const platformNameMatch =
      filters.platformName === "" ||
      (item.platformName &&
        item.platformName
          .toLowerCase()
          .includes(filters.platformName.toLowerCase()));

    return (
      itemNameMatch && storyNameMatch && chapterNameMatch && platformNameMatch
    );
  });

  // Calculate pagination for filtered results
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords = showAllItems
    ? filteredItems
    : filteredItems.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = showAllItems
    ? 1
    : Math.ceil(filteredItems.length / recordsPerPage);

  const handleFilterChange = async (e) => {
    const { name, value } = e.target;

    // If clearing story or chapter filters while in sequence mode
    if (
      isSequenceMode &&
      (name === "storyName" || name === "chapterName") &&
      !value
    ) {
      // Keep show all mode but clear sequence mode
      setIsSequenceMode(false);
      setReorderedItems(null);
      // Clear sequence mode state
      clearSequenceMode("seedData");
      setApiMessage({
        content:
          "Filters cleared. Sequence mode disabled. You can still view all items.",
        type: "info",
      });
    }

    // Handle platform filter change with API call
    if (name === "platformName") {
      try {
        if (value) {
          // Find the platform ID from the platforms array
          const selectedPlatform = platforms.find(
            (platform) =>
              (platform.name && platform.name === value) ||
              (platform.platformName && platform.platformName === value)
          );

          if (selectedPlatform) {
            setLoading(true);
            const platformId =
              selectedPlatform.id || selectedPlatform.platformId;
            console.log("🔍 Filtering by platform:", {
              value,
              platformId,
              selectedPlatform,
            });
            const response = await platformService.filterItemsByPlatform(
              platformId
            );

            console.log("📡 Platform filter API response:", response);
            if (response.status === 200 && response.body) {
              // Update items with filtered results from API
              setItems(response.body);
              setIsPlatformFiltered(true);
              console.log(
                "✅ Platform filtering successful, items updated:",
                response.body.length
              );
              // setApiMessage({
              //   content: `Filtered by platform: ${value} (${response.body.length} items)`,
              //   type: "success",
              // });
            } else {
              // If API doesn't return expected format, fall back to original items
              await fetchItems();
              setIsPlatformFiltered(false);
              // setApiMessage({
              //   content: "Platform filter applied (client-side)",
              //   type: "info",
              // });
            }
          } else {
            // Platform not found, fall back to original items
            await fetchItems();
            setIsPlatformFiltered(false);
          }
        } else {
          // Clear platform filter - reload all items
          await fetchItems();
          setIsPlatformFiltered(false);
          setApiMessage({
            content: "Platform filter cleared",
            type: "info",
          });
        }
      } catch (error) {
        console.error("Error filtering by platform:", error);
        // Fall back to original items on error
        await fetchItems();
        setIsPlatformFiltered(false);
        setApiMessage({
          content: "Error filtering by platform. Showing all items.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    }

    const newFilters = {
      ...filters,
      [name]: value,
    };
    setFilters(newFilters);
    saveFilters("seedData", newFilters);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    // Don't clear sequence mode when changing pages - keep it active
  };

  // Handle records per page change
  const handleRecordsPerPageChange = (e) => {
    const newRecordsPerPage = parseInt(e.target.value);
    setRecordsPerPage(newRecordsPerPage);
    setCurrentPage(1); // Reset to first page
    // Don't turn off show all items if in sequence mode
    if (!isSequenceMode) {
      setShowAllItems(false);
    }
  };

  // Handle show all items toggle
  const handleShowAllItemsToggle = () => {
    setShowAllItems(!showAllItems);
    // Clear sequence mode when manually toggling
    if (showAllItems) {
      setIsSequenceMode(false);
      // Clear sequence mode state
      clearSequenceMode("seedData");
      // Also clear any pending reordered items when switching back to paginated view
      if (reorderedItems) {
        setReorderedItems(null);
        setApiMessage({
          content:
            "Switched to paginated view. Any unsaved sequence changes have been cleared.",
          type: "info",
        });
      }
    }
    setCurrentPage(1); // Reset to first page
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
    if (showAllItems) {
      return { start: 1, end: filteredItems.length };
    }
    const start = indexOfFirstRecord + 1;
    const end = Math.min(indexOfLastRecord, filteredItems.length);
    return { start, end };
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
    conversationCell: {
      whiteSpace: "normal",
      padding: "8px 4px",
      textAlign: "left",
      fontSize: "0.875rem",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minHeight: "32px",
      lineHeight: "1.4",
      verticalAlign: "middle",
      wordBreak: "break-word",
      maxWidth: "200px",
    },
    questionCell: {
      whiteSpace: "normal",
      padding: "8px 4px",
      textAlign: "left",
      fontSize: "0.875rem",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minHeight: "32px",
      lineHeight: "1.4",
      verticalAlign: "middle",
      wordBreak: "break-word",
      maxWidth: "200px",
    },
  };

  const TableSkeleton = () => {
    return (
      <Card className="shadow">
        <Table
          className="align-items-center table-flush mb-0"
          style={tableStyles.table}
        >
          <thead className="thead-light">
            <tr>
              <th style={{ ...tableStyles.th, width: "6%" }}>ID</th>
              <th style={{ ...tableStyles.th, width: "6%" }}>SEQUENCE</th>
              <th style={{ ...tableStyles.th, width: "16%" }}>ITEM NAME</th>
              <th style={{ ...tableStyles.th, width: "12%" }}>STORY NAME</th>
              <th style={{ ...tableStyles.th, width: "12%" }}>CHAPTER NAME</th>
              <th style={{ ...tableStyles.th, width: "12%" }}>PLATFORM</th>
              <th style={{ ...tableStyles.th, width: "12%" }}>MAIN QUESTION</th>
              <th style={{ ...tableStyles.th, width: "12%" }}>
                SAMPLE CONVERSATION
              </th>
              <th style={{ ...tableStyles.th, width: "10%" }}>UPDATED AT</th>
              <th style={{ ...tableStyles.th, width: "12%" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(10)].map((_, index) => (
              <tr key={index} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ ...tableStyles.td, width: "6%" }}>
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
                <td style={{ ...tableStyles.td, width: "6%" }}>
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
                <td style={{ ...tableStyles.td, width: "16%" }}>
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
                      width: "128px",
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
                      width: "128px",
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
                      width: "128px",
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
                      width: "128px",
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
                      width: "128px",
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

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    // Get all draggable items (across all pages when not in show all mode)
    const draggableItems = getAllDraggableItems();

    // Only reorder if both source and destination are in draggableItems
    if (
      result.source.index < 0 ||
      result.destination.index < 0 ||
      result.source.index >= draggableItems.length ||
      result.destination.index >= draggableItems.length
    ) {
      return;
    }

    const reordered = Array.from(draggableItems);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // Update the UI first
    setItems((prev) => {
      let reorderedIndex = 0;
      return prev.map((item) => {
        if (isItemDraggable(item)) {
          return reordered[reorderedIndex++];
        }
        return item;
      });
    });

    // Store the reordered items for later API call
    setReorderedItems(reordered);
  };

  const handleSaveSequence = async () => {
    if (!reorderedItems || reorderedItems.length === 0) {
      setApiMessage({
        content: "No items have been sequenced",
        type: "error",
      });
      return;
    }

    try {
      setIsSavingSequence(true);

      // Get storyId and chapterId from the first reordered item
      const { storyId, chapterId } = reorderedItems[0];

      if (!storyId || !chapterId) {
        setApiMessage({
          content: "Items must belong to a story and chapter to save sequence",
          type: "error",
        });
        return;
      }

      // Prepare the items array for the API with sequence numbers
      const itemsForApi = reorderedItems.map((item, index) => ({
        itemId: item.itemId,
        sequence: index + 1, // 1-based sequence numbers
      }));

      // Call the API to update the sequence
      await itemService.updateItemSequence(storyId, chapterId, itemsForApi);

      // Fetch the updated items list
      await fetchItems();

      // Show success message
      setApiMessage({
        content: "Item sequence updated successfully",
        type: "success",
      });

      // Clear the reordered items state
      setReorderedItems(null);
      setIsSequenceMode(false);
      setShowAllItems(false); // Reset to paginated view after saving
      // Clear sequence mode state
      clearSequenceMode("seedData");
    } catch (error) {
      // Show error message
      setApiMessage({
        content: error.message || "Failed to update item sequence",
        type: "error",
      });

      // Revert the UI changes if the API call fails
      setItems((prev) => {
        let reorderedIndex = 0;
        return prev.map((item) => {
          if (isItemDraggable(item)) {
            return filteredItems.filter(isItemDraggable)[reorderedIndex++];
          }
          return item;
        });
      });
    } finally {
      setIsSavingSequence(false);
    }
  };

  const isItemDraggable = (item) => {
    return (
      isSequenceMode && // Only allow drag and drop when in sequence mode
      filters.storyName &&
      filters.chapterName &&
      item.storyName &&
      item.chapterName &&
      item.storyName.trim().toLowerCase() ===
        filters.storyName.trim().toLowerCase() &&
      item.chapterName.trim().toLowerCase() ===
        filters.chapterName.trim().toLowerCase()
    );
  };

  // Get all draggable items (not just current page)
  const getAllDraggableItems = () => {
    return filteredItems.filter(isItemDraggable);
  };

  // Cancel sequence changes and return to normal view
  const handleCancelSequence = async () => {
    // Clear reordered items
    setReorderedItems(null);
    // Return to normal paginated view
    setShowAllItems(false);
    // Clear sequence mode
    setIsSequenceMode(false);
    // Clear sequence mode state
    clearSequenceMode("seedData");
    // Clear all filters
    const clearedFilters = {
      itemName: "",
      storyName: "",
      chapterName: "",
      platformName: "",
    };
    setFilters(clearedFilters);
    clearFilters("seedData");

    // If platform was filtered via API, reload all items
    if (isPlatformFiltered) {
      try {
        setLoading(true);
        await fetchItems();
        setIsPlatformFiltered(false);
      } catch (error) {
        console.error("Error reloading items:", error);
      } finally {
        setLoading(false);
      }
    }

    // Reset to first page
    setCurrentPage(1);

    setApiMessage({
      content:
        "Sequence mode cancelled. Returned to normal paginated view with cleared filters.",
      type: "info",
    });
  };

  const handleSetFiltersToRow = (item) => {
    setFilters({
      ...filters,
      storyName: item.storyName || "",
      chapterName: item.chapterName || "",
    });
    // Enable "Show All" mode for better sequence management
    setShowAllItems(true);
    // Set sequence mode
    setIsSequenceMode(true);
    // Save sequence mode state
    saveSequenceMode("seedData", { isSequenceMode: true, showAllItems: true });
    // Reset pagination to first page
    setCurrentPage(1);
    // Save filters if you use persistent filters
    saveFilters("seedData", {
      ...filters,
      storyName: item.storyName || "",
      chapterName: item.chapterName || "",
    });

    // Show a helpful message
    setApiMessage({
      content: `Switched to "Show All" mode for ${item.storyName} → ${item.chapterName}. You can now easily reorder all items.`,
      type: "info",
    });
  };

  useEffect(() => {
    if (apiMessage.content) {
      setTimeout(() => {
        setApiMessage({ content: "", type: "" });
      }, 7000);
    }
  }, [apiMessage.content]);

  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-2 text-white" style={{ fontSize: "1.25rem" }}>
              TRAINING DATA HUB
            </h3>
            <nav aria-label="breadcrumb">
              <ol
                className="breadcrumb bg-transparent mb-4"
                style={{ padding: "0" }}
              >
                {/* <li className="breadcrumb-item active text-white" aria-current="page">Training Data Hub</li> */}
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
              TRAINING DATA HUB
            </h3>
            <nav aria-label="breadcrumb">
              <ol
                className="breadcrumb bg-transparent mb-4"
                style={{ padding: "0" }}
              >
                {/* <li className="breadcrumb-item active text-white" aria-current="page">Training Data Hub</li> */}
              </ol>
            </nav>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="mt-3">
                  <div className="col-md-12 d-flex flex-wrap justify-content-between align-items-center">
                    <div style={{ minWidth: "120px" }}>
                      {isSequenceMode && !isViewer && (
                        <div className="d-flex gap-2">
                          {reorderedItems && (
                            <Button
                              color="primary"
                              size="sm"
                              onClick={() => setShowSequenceConfirm(true)}
                              disabled={isSavingSequence}
                              className="btn-custom-primary"
                              style={{ fontSize: "0.875rem", padding: "9px" }}
                            >
                              {isSavingSequence ? (
                                <>
                                  <Spinner size="sm" className="mr-2" />
                                  Saving Sequence...
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-save mr-2" />
                                  Save Sequence
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            color="secondary"
                            size="sm"
                            onClick={handleCancelSequence}
                            disabled={isSavingSequence}
                            className="btn-custom-secondary"
                            style={{ fontSize: "0.875rem", padding: "9px" }}
                          >
                            <i className="fas fa-times mr-2" />
                            Cancel Sequence
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="d-flex align-items-center">
                      {/* Pagination Controls */}
                      <div className="mr-1 d-flex align-items-center">
                        <span
                          className="text-muted mr-2"
                          style={{ fontSize: "0.875rem" }}
                        >
                          Show:
                        </span>
                        <Input
                          type="select"
                          value={recordsPerPage}
                          onChange={handleRecordsPerPageChange}
                          style={{ width: "80px", fontSize: "0.875rem" }}
                          disabled={showAllItems}
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </Input>
                        {/* <span
                          className="text-muted ml-2"
                          style={{ fontSize: "0.875rem" }}
                        >
                          per page
                        </span> */}
                      </div>

                      {/* Show All Items Toggle */}
                      {/* <div className="mr-3">
                        <Button
                          color={
                            showAllItems
                              ? isSequenceMode
                                ? "success"
                                : "primary"
                              : "secondary"
                          }
                          size="sm"
                          onClick={handleShowAllItemsToggle}
                          disabled={isViewer}
                          style={{
                            fontSize: "0.875rem",
                            padding: "9px",
                            minWidth: "140px",
                            height: "38px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            ...(isSequenceMode &&
                              showAllItems && {
                                backgroundColor: "#3A6D8C ",
                                borderColor: "#3A6D8C ",
                                fontWeight: "bold",
                              }),
                          }}
                          title={
                            isViewer
                              ? "Viewers cannot manage sequences"
                              : showAllItems
                              ? isSequenceMode
                                ? "Currently in sequence management mode"
                                : "Switch to paginated view"
                              : "Show all items for better sequence management"
                          }
                        >
                          <i
                            className={`fas ${
                              showAllItems ? "fa-list" : "fa-th-large"
                            } mr-1`}
                          />
                          {showAllItems
                            ? isSequenceMode
                              ? "Sequence Mode"
                              : "Paginated View"
                            : "Show All"}
                          {isSequenceMode && showAllItems && (
                            <i
                              className="fas fa-arrow-up ml-1"
                              style={{ fontSize: "0.75rem" }}
                            ></i>
                          )}
                        </Button>
                      </div> */}

                      {/* Platform Filter */}
                      <div className="mr-3 d-flex align-items-center ">
                        <span
                          className="text-muted mr-2"
                          style={{ fontSize: "0.875rem" }}
                        >
                          Platform:
                        </span>
                        <Input
                          type="select"
                          name="platformName"
                          value={filters.platformName}
                          onChange={handleFilterChange}
                          style={{
                            width: "180px",
                            fontSize: "0.875rem",
                            height: "38px",
                          }}
                          className="form-control-alternative"
                        >
                          <option value="">All Platforms</option>
                          {platforms.map((platform) => (
                            <option
                              key={platform.id || platform.platformId}
                              value={platform.name || platform.platformName}
                            >
                              {platform.name || platform.platformName}
                            </option>
                          ))}
                        </Input>
                      </div>

                      {!isViewer && (
                        <div className="mr-2 d-flex gap-2">
                          <Button
                            color="outline-primary"
                            size="sm"
                            onClick={() => navigate("/admin/stories", {
                              state: {
                                message: "Navigated from Training Data Hub. You can now manage your stories and chapters."
                              }
                            })}
                            style={{ fontSize: "0.875rem", padding: "9px" }}
                            title="Manage stories and chapters"
                          >
                            <i className="fas fa-book mr-2" />
                            Manage Stories
                          </Button>
                          <Button
                            color="primary"
                            size="sm"
                            onClick={() => handleCreateItem()}
                            className="btn-custom-primary"
                            style={{ fontSize: "0.875rem", padding: "9px" }}
                            title={
                              filters.storyName && filters.chapterName
                                ? `Will pre-fill: ${filters.storyName} → ${filters.chapterName}`
                                : "Create a new item"
                            }
                          >
                            <i className="fas fa-plus mr-2" />
                            Create Item
                            {filters.storyName && filters.chapterName && (
                              <i
                                className="fas fa-magic ml-1"
                                style={{ fontSize: "0.75rem" }}
                              ></i>
                            )}
                          </Button>
                        </div>
                      )}
                      <div className="ml-auto">
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
                                  placeholder="Filter by Item Name"
                                  type="text"
                                  name="itemName"
                                  value={filters.itemName}
                                  onChange={handleFilterChange}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const dropdownToggle =
                                        document.querySelector(
                                          ".filter-button"
                                        );
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
                                  placeholder="Filter by Story Name"
                                  type="text"
                                  name="storyName"
                                  value={filters.storyName}
                                  onChange={handleFilterChange}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const dropdownToggle =
                                        document.querySelector(
                                          ".filter-button"
                                        );
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
                                  placeholder="Filter by Chapter Name"
                                  type="text"
                                  name="chapterName"
                                  value={filters.chapterName}
                                  onChange={handleFilterChange}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const dropdownToggle =
                                        document.querySelector(
                                          ".filter-button"
                                        );
                                      if (dropdownToggle) {
                                        dropdownToggle.click();
                                      }
                                    }
                                  }}
                                  autoComplete="off"
                                />
                              </FormGroup>
                              {/* <FormGroup>
                                <Input
                                  className="form-control-alternative"
                                  type="select"
                                  name="platformName"
                                  value={filters.platformName}
                                  onChange={handleFilterChange}
                                >
                                  <option value="">All Platforms</option>
                                  {platforms.map((platform) => (
                                    <option
                                      key={platform.platformId || platform.id}
                                      value={platform.platformName}
                                    >
                                      {platform.platformName}
                                    </option>
                                  ))}
                                </Input>
                              </FormGroup> */}
                              <div className="d-flex justify-content-end mt-3">
                                <Button
                                  color="secondary"
                                  size="sm"
                                  className="clear-filters-btn"
                                  onClick={async () => {
                                    const clearedFilters = {
                                      itemName: "",
                                      storyName: "",
                                      chapterName: "",
                                      platformName: "",
                                    };
                                    setFilters(clearedFilters);
                                    clearFilters("seedData");

                                    // If platform was filtered via API, reload all items
                                    if (isPlatformFiltered) {
                                      try {
                                        setLoading(true);
                                        await fetchItems();
                                        setIsPlatformFiltered(false);
                                      } catch (error) {
                                        console.error(
                                          "Error reloading items:",
                                          error
                                        );
                                      } finally {
                                        setLoading(false);
                                      }
                                    }

                                    // If in sequence mode, clear it but keep show all
                                    if (isSequenceMode) {
                                      setIsSequenceMode(false);
                                      setReorderedItems(null);
                                      // Clear sequence mode state
                                      clearSequenceMode("seedData");
                                      setApiMessage({
                                        content:
                                          "Filters cleared. Sequence mode disabled. You can still view all items.",
                                        type: "info",
                                      });
                                    } else {
                                      setApiMessage({
                                        content: "All filters cleared",
                                        type: "info",
                                      });
                                    }
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
                    </div>
                  </div>
                </Row>
              </CardHeader>
              <Table
                className="align-items-center table-flush mb-0"
                style={tableStyles.table}
              >
                <thead className="thead-light">
                  <tr>
                    <th style={{ ...tableStyles.th, width: "6%" }}>ID</th>
                    <th
                      style={{
                        ...tableStyles.th,
                        width: "6%",
                        cursor: "pointer",
                      }}
                      onClick={() => handleSort("sequence")}
                    >
                      SEQ NO. {getSortIcon("sequence")}
                    </th>
                    <th
                      style={{
                        ...tableStyles.th,
                        width: "16%",
                        cursor: "pointer",
                      }}
                      onClick={() => handleSort("itemName")}
                    >
                      ITEM NAME {getSortIcon("itemName")}
                    </th>
                    <th
                      style={{
                        ...tableStyles.th,
                        width: "12%",
                        cursor: "pointer",
                      }}
                      onClick={() => handleSort("storyName")}
                    >
                      STORY NAME {getSortIcon("storyName")}
                    </th>
                    <th
                      style={{
                        ...tableStyles.th,
                        width: "12%",
                        cursor: "pointer",
                      }}
                      onClick={() => handleSort("chapterName")}
                    >
                      CHAPTER NAME {getSortIcon("chapterName")}
                    </th>
                    <th
                      style={{
                        ...tableStyles.th,
                        width: "12%",
                        cursor: "pointer",
                      }}
                      onClick={() => handleSort("platformName")}
                    >
                      PLATFORM {getSortIcon("platformName")}
                    </th>
                    <th style={{ ...tableStyles.th, width: "12%" }}>
                      MAIN QUESTION
                    </th>
                    <th style={{ ...tableStyles.th, width: "12%" }}>
                      SAMPLE CONVERSATION
                    </th>
                    <th style={{ ...tableStyles.th, width: "10%" }}>
                      UPDATED AT
                    </th>
                    <th style={{ ...tableStyles.th, width: "12%" }}>ACTIONS</th>
                  </tr>
                  {showAllItems && (
                    <tr>
                      <td
                        colSpan="10"
                        className="text-center py-2"
                        style={{
                          backgroundColor: isSequenceMode
                            ? "#d4edda"
                            : "#e8f5e8",
                          color: isSequenceMode ? "#155724" : "#155724",
                          fontSize: "0.875rem",
                          fontWeight: isSequenceMode ? "bold" : "normal",
                        }}
                      >
                        <i
                          className={`fas ${
                            isSequenceMode ? "fa-arrow-up" : "fa-info-circle"
                          } mr-2`}
                        />
                        {isSequenceMode
                          ? filters.storyName && filters.chapterName
                            ? `Sequence Management Mode: All items for "${filters.storyName} → ${filters.chapterName}" are visible. Drag and drop to reorder items.`
                            : "Sequence Management Mode: Please select a story and chapter to enable drag and drop sequencing."
                          : "All items are visible for better sequence management. You can drag and drop items across the entire list."}
                      </td>
                    </tr>
                  )}
                </thead>
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="items">
                    {(provided) => (
                      <tbody
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                      >
                        {currentRecords
                          .filter((item) => item.is_deleted !== 1)
                          .map((item, index) => {
                            // Unique key per row: same item can appear multiple times (once per platform) when "All Platforms" is selected
                            const rowKey = `${item.itemId}-${item.platformId ?? "unmapped"}-${index}`;
                            // Only allow drag if both filters are set and this row matches the filter
                            const draggable = isItemDraggable(item);
                            return draggable ? (
                              <Draggable
                                key={rowKey}
                                draggableId={rowKey}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <tr
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    style={{
                                      ...provided.draggableProps.style,
                                      background: snapshot.isDragging
                                        ? "#f8f9fa"
                                        : undefined,
                                    }}
                                  >
                                    <td
                                      style={{ ...tableStyles.td, width: "6%" }}
                                    >
                                      <span
                                        style={{
                                          cursor: "grab",
                                          marginRight: 8,
                                        }}
                                      >
                                        <FaGripVertical />
                                      </span>
                                      {indexOfFirstRecord + index + 1}
                                    </td>
                                    <td
                                      style={{ ...tableStyles.td, width: "6%" }}
                                    >
                                      {item.sequence || "-"}
                                    </td>
                                    <td
                                      style={{
                                        ...tableStyles.td,
                                        width: "16%",
                                      }}
                                    >
                                      {item.itemName}
                                    </td>
                                    <td
                                      style={{
                                        ...tableStyles.td,
                                        width: "12%",
                                      }}
                                    >
                                      {item.storyName || "-"}
                                    </td>
                                    <td
                                      style={{
                                        ...tableStyles.td,
                                        width: "12%",
                                      }}
                                    >
                                      {item.chapterName || "-"}
                                    </td>
                                    <td
                                      style={{
                                        ...tableStyles.td,
                                        width: "12%",
                                      }}
                                    >
                                      {item.platformName || "-"}
                                    </td>
                                    <td
                                      style={{
                                        ...tableStyles.questionCell,
                                        width: "12%",
                                      }}
                                    >
                                      {item.question || "-"}
                                    </td>
                                    <td
                                      style={{
                                        ...tableStyles.conversationCell,
                                        width: "12%",
                                      }}
                                    >
                                      {item.sample_conversation || "-"}
                                    </td>
                                    <td
                                      style={{
                                        ...tableStyles.td,
                                        width: "10%",
                                      }}
                                    >
                                      {formatDate(item.updatedAt)}
                                    </td>
                                    <td
                                      style={{
                                        ...tableStyles.td,
                                        width: "12%",
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
                                                handleViewPolicies(item.itemId)
                                              }
                                              style={{
                                                color: "#8898aa",
                                                display: "flex",
                                                alignItems: "center",
                                              }}
                                            >
                                              <i className="fas fa-list-alt text-info mr-2" />
                                              <span>Policies</span>
                                            </DropdownItem>
                                            <DropdownItem
                                              onClick={() =>
                                                handleViewSuggestions(item)
                                              }
                                              style={{
                                                color: "#8898aa",
                                                display: "flex",
                                                alignItems: "center",
                                              }}
                                            >
                                              <i className="fas fa-lightbulb text-info mr-2" />
                                              <span>Suggestions</span>
                                            </DropdownItem>
                                            {!isViewer && (
                                              <>
                                                <DropdownItem
                                                  onClick={() =>
                                                    handleSetFiltersToRow(item)
                                                  }
                                                  style={{
                                                    color: "#8898aa",
                                                    display: "flex",
                                                    alignItems: "center",
                                                  }}
                                                >
                                                  <i className="fa fa-list-ol text-info mr-2" />
                                                  <span>Change Sequence</span>
                                                </DropdownItem>
                                                <DropdownItem
                                                  onClick={() =>
                                                    handleEditClick(item)
                                                  }
                                                  style={{
                                                    color: "#8898aa",
                                                    display: "flex",
                                                    alignItems: "center",
                                                  }}
                                                >
                                                  <i className="fas fa-pencil-alt text-info mr-2" />
                                                  <span>Edit Item</span>
                                                </DropdownItem>
                                                <DropdownItem
                                                  onClick={() =>
                                                    handleDeleteClick(
                                                      item.itemId
                                                    )
                                                  }
                                                  style={{
                                                    color: "#8898aa",
                                                    display: "flex",
                                                    alignItems: "center",
                                                  }}
                                                >
                                                  <i className="fas fa-trash-alt text-danger mr-2" />
                                                  <span>Delete Item</span>
                                                </DropdownItem>
                                              </>
                                            )}
                                          </DropdownMenu>,
                                          document.body
                                        )}
                                      </UncontrolledDropdown>
                                    </td>
                                  </tr>
                                )}
                              </Draggable>
                            ) : (
                              <tr key={rowKey}>
                                <td style={{ ...tableStyles.td, width: "6%" }}>
                                  {indexOfFirstRecord + index + 1}
                                </td>
                                <td style={{ ...tableStyles.td, width: "6%" }}>
                                  {item.sequence || "-"}
                                </td>
                                <td style={{ ...tableStyles.td, width: "16%" }}>
                                  {item.itemName}
                                </td>
                                <td style={{ ...tableStyles.td, width: "12%" }}>
                                  {item.storyName || "-"}
                                </td>
                                <td style={{ ...tableStyles.td, width: "12%" }}>
                                  {item.chapterName || "-"}
                                </td>
                                <td style={{ ...tableStyles.td, width: "12%" }}>
                                  {item.platformName || "-"}
                                </td>
                                <td
                                  style={{
                                    ...tableStyles.questionCell,
                                    width: "12%",
                                  }}
                                >
                                  {item.question || "-"}
                                </td>
                                <td
                                  style={{
                                    ...tableStyles.conversationCell,
                                    width: "12%",
                                  }}
                                >
                                  {item.sample_conversation || "-"}
                                </td>
                                <td style={{ ...tableStyles.td, width: "10%" }}>
                                  {formatDate(item.updatedAt)}
                                </td>
                                <td style={{ ...tableStyles.td, width: "12%" }}>
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
                                        {!isViewer && (
                                          <DropdownItem
                                            onClick={() =>
                                              handleEditClick(item)
                                            }
                                            style={{
                                              color: "#8898aa",
                                              display: "flex",
                                              alignItems: "center",
                                            }}
                                          >
                                            <i className="fas fa-pencil-alt text-info mr-2" />
                                            <span>Edit Item</span>
                                          </DropdownItem>
                                        )}
                                        <DropdownItem
                                          onClick={() =>
                                            handleViewPolicies(item.itemId)
                                          }
                                          style={{
                                            color: "#8898aa",
                                            display: "flex",
                                            alignItems: "center",
                                          }}
                                        >
                                          <i className="fas fa-list-alt text-info mr-2" />
                                          <span>Policies</span>
                                        </DropdownItem>
                                        <DropdownItem
                                          onClick={() =>
                                            handleViewSuggestions(item)
                                          }
                                          style={{
                                            color: "#8898aa",
                                            display: "flex",
                                            alignItems: "center",
                                          }}
                                        >
                                          <i className="fas fa-lightbulb text-info mr-2" />
                                          <span>Suggestions</span>
                                        </DropdownItem>
                                        {!isViewer && (
                                          <>
                                            <DropdownItem
                                              onClick={() =>
                                                handleSetFiltersToRow(item)
                                              }
                                              style={{
                                                color: "#8898aa",
                                                display: "flex",
                                                alignItems: "center",
                                              }}
                                            >
                                              <i className="fa fa-list-ol text-info mr-2" />
                                              <span>Change Sequence</span>
                                            </DropdownItem>
                                            <DropdownItem
                                              onClick={() =>
                                                handleDeleteClick(item.itemId)
                                              }
                                              style={{
                                                color: "#8898aa",
                                                display: "flex",
                                                alignItems: "center",
                                              }}
                                            >
                                              <i className="fas fa-trash-alt text-danger mr-2" />
                                              <span>Delete Item</span>
                                            </DropdownItem>
                                          </>
                                        )}
                                      </DropdownMenu>,
                                      document.body
                                    )}
                                  </UncontrolledDropdown>
                                </td>
                              </tr>
                            );
                          })}
                        {provided.placeholder}
                      </tbody>
                    )}
                  </Droppable>
                </DragDropContext>
              </Table>
              <CardFooter className="py-4">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="text-muted">
                    {showAllItems
                      ? `Showing all ${filteredItems.length} entries`
                      : `Showing ${getEntryRange().start} to ${
                          getEntryRange().end
                        } of ${filteredItems.length} entries`}
                    {showAllItems && (
                      <span className="ml-2 text-primary">
                        <i className="fas fa-info-circle mr-1" />
                        All items visible for sequence management
                      </span>
                    )}
                    {/* {isPlatformFiltered && (
                      <span className="ml-2 text-success">
                        <i className="fas fa-filter mr-1" />
                        Platform filtered via API
                      </span>
                    )} */}
                  </div>
                  {!showAllItems && filteredItems.length > recordsPerPage && (
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
      </Container>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} toggle={handleDeleteCancel} centered>
        <ModalHeader className="border-0 pb-0" toggle={handleDeleteCancel}>
          Delete Item?
        </ModalHeader>
        <ModalBody className="pt-0">
          <p className="text-left mb-4">
            Are you sure you want to delete this item?
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
          Edit Item
        </ModalHeader>
        <ModalBody className="pt-0">
          <Form>
            <FormGroup>
              <label htmlFor="itemName" className="form-control-label">
                Item Name
              </label>
              <Input
                className="form-control-alternative"
                id="itemName"
                placeholder="Enter item name"
                type="text"
                value={editItemName}
                onChange={(e) => setEditItemName(e.target.value)}
                maxLength={50}
                autoComplete="off"
              />
              <small className="text-muted">
                {(editItemName || "").length}/50 characters
              </small>
            </FormGroup>
            <FormGroup>
              <label
                htmlFor="sampleConversation"
                className="form-control-label"
              >
                Sample Conversation
              </label>
              <Input
                className="form-control-alternative"
                id="sampleConversation"
                placeholder="Enter sample conversation"
                type="textarea"
                rows="3"
                value={editSampleConversation}
                onChange={(e) => setEditSampleConversation(e.target.value)}
                maxLength={1000}
                autoComplete="off"
              />
              <small className="text-muted">
                {(editSampleConversation || "").length}/1000 characters
              </small>
            </FormGroup>
            <FormGroup>
              <label htmlFor="mainQuestion" className="form-control-label">
                Main Question <span className="text-danger">*</span>
              </label>
              <Input
                className="form-control-alternative"
                id="mainQuestion"
                placeholder="Enter main question"
                type="textarea"
                rows="3"
                value={editMainQuestion}
                onChange={(e) => setEditMainQuestion(e.target.value)}
                autoComplete="off"
              />
            </FormGroup>

            <FormGroup tag="fieldset">
              <Label className="form-label">
                Hide from Frontend <span className="text-danger">*</span>
              </Label>
              <div className="d-flex gap-3">
                <FormGroup check className="mr-1">
                  <Label check>
                    <Input
                      type="radio"
                      name="editIsHidden"
                      value="true"
                      checked={editIsHidden === "true"}
                      onChange={(e) => setEditIsHidden(e.target.value)}
                      className="form-control-alternative"
                      style={{ color: "black" }}
                    />
                    Yes
                  </Label>
                </FormGroup>

                <FormGroup check>
                  <Label check>
                    <Input
                      type="radio"
                      name="editIsHidden"
                      value="false"
                      checked={editIsHidden === "false"}
                      onChange={(e) => setEditIsHidden(e.target.value)}
                      className="form-control-alternative"
                      style={{ color: "black" }}
                    />
                    No
                  </Label>
                </FormGroup>
              </div>
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
            disabled={
              editLoading || !editItemName.trim() || !editMainQuestion.trim()
            }
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
          Edit Item?
        </ModalHeader>
        <ModalBody className="pt-0">
          <p className="text-left mb-4">
            Are you sure you want to update this item?
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

      {/* Modal for item details */}
      <Modal isOpen={modalOpen} toggle={handleCloseModal} size="lg">
        <ModalHeader toggle={handleCloseModal}>Item Details</ModalHeader>
        <ModalBody>
          {selectedItem && (
            <div>
              <h5>Policies</h5>
              <p>This is a dummy policy section.</p>
              <hr />
              <h5>Questions</h5>
              <p>{selectedItem.questions}</p>
              <hr />
              <h5>Sample Conversation</h5>
              <p>{selectedItem.sample_conversation}</p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={handleCloseModal}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      {/* Sequence Confirmation Modal */}
      <Modal
        isOpen={showSequenceConfirm}
        toggle={() => setShowSequenceConfirm(false)}
        centered
      >
        <ModalHeader
          className="border-0 pb-0"
          toggle={() => setShowSequenceConfirm(false)}
        >
          Confirm Save Sequence
        </ModalHeader>
        <ModalBody className="pt-0">
          <p className="text-left mb-4">
            Are you sure you want to save the new sequence?
          </p>
          <div className="d-flex justify-content-end gap-3">
            <Button
              color="secondary"
              onClick={() => setShowSequenceConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              color="primary"
              onClick={async () => {
                setShowSequenceConfirm(false);
                await handleSaveSequence();
              }}
              disabled={isSavingSequence}
              className="btn-custom-primary"
            >
              {isSavingSequence ? (
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

      {/* Create Item Modal */}
      <Modal isOpen={createItemModal} toggle={handleCloseCreateItem} size="lg">
        <ModalHeader toggle={handleCloseCreateItem}>
          Create New Item
          {filters.storyName && filters.chapterName && (
            <small className="text-muted ml-2">
              (Pre-filled for {filters.storyName} → {filters.chapterName})
            </small>
          )}
        </ModalHeader>
        <ModalBody>
          {/* Show pre-fill notification if applicable */}
          {/* {filters.storyName && filters.chapterName && (
            <Alert color="info" className="mb-3">
              <i className="fas fa-lightbulb mr-2"></i>
              <strong>Smart Pre-fill:</strong> Story and Chapter have been automatically selected based on your current filters. 
              You can change them if needed.
            </Alert>
          )} */}

          <Form>
            <FormGroup>
              <Label for="itemName">
                Item Name <span className="text-danger">*</span>
              </Label>
              <Input
                className="form-control-alternative"
                type="text"
                name="itemName"
                id="itemName"
                value={itemFormData.itemName}
                onChange={(e) =>
                  setItemFormData((prev) => ({
                    ...prev,
                    itemName: e.target.value,
                  }))
                }
                placeholder="Enter Item Name"
                maxLength={50}
                required
              />
              <small className="text-muted">
                {(itemFormData.itemName || "").length}/50 characters
              </small>
            </FormGroup>

            <FormGroup>
              <Label for="storyId">
                Story <span className="text-danger">*</span>
              </Label>
              <Input
                type="select"
                name="storyId"
                id="storyId"
                value={itemFormData.storyId}
                onChange={handleStoryChange}
                className="form-control-alternative"
                required
              >
                <option value="">Select a Story</option>
                {stories.map((story) => (
                  <option
                    key={story.storyId || story.id}
                    value={story.storyId || story.id}
                  >
                    {story.storyName}
                  </option>
                ))}
              </Input>
              {/* {itemFormData.storyId && filters.storyName && 
               stories.find(s => (s.storyId || s.id) == itemFormData.storyId)?.storyName === filters.storyName && (
                <small className="form-text text-info">
                  <i className="fas fa-info-circle mr-1"></i>
                  Pre-filled from current filter: {filters.storyName}
                </small>
              )} */}
            </FormGroup>

            <FormGroup>
              <Label for="chapterId">
                Chapter <span className="text-danger">*</span>
              </Label>
              <Input
                type="select"
                name="chapterId"
                id="chapterId"
                value={itemFormData.chapterId}
                onChange={(e) => {
                  const chapterId = e.target.value;

                  setItemFormData((prev) => ({
                    ...prev,
                    chapterId: chapterId,
                  }));
                }}
                className="form-control-alternative"
                required
                disabled={!itemFormData.storyId || chaptersLoading}
              >
                <option value="">
                  {!itemFormData.storyId
                    ? "Select a Story first"
                    : chaptersLoading
                    ? "Loading chapters..."
                    : chapters.length === 0
                    ? "No chapters available"
                    : "Select a Chapter"}
                </option>
                {chapters.map((chapter) => (
                  <option
                    key={chapter.chapterId || chapter.id}
                    value={chapter.chapterId || chapter.id}
                  >
                    {chapter.chapterName}
                  </option>
                ))}
              </Input>
              {chaptersLoading && (
                <small className="form-text text-muted">
                  <i className="fas fa-spinner fa-spin mr-1"></i>
                  Loading chapters...
                </small>
              )}
              {/* {itemFormData.chapterId && filters.chapterName && 
               chapters.find(c => (c.chapterId || c.id) == itemFormData.chapterId)?.chapterName === filters.chapterName && (
                <small className="form-text text-info">
                  <i className="fas fa-info-circle mr-1"></i>
                  Pre-filled from current filter: {filters.chapterName}
                </small>
              )} */}
            </FormGroup>

            <FormGroup>
              <Label for="question">
                Question <span className="text-danger">*</span>
              </Label>
              <Input
                className="form-control-alternative"
                type="textarea"
                name="question"
                id="question"
                value={itemFormData.question}
                onChange={(e) =>
                  setItemFormData((prev) => ({
                    ...prev,
                    question: e.target.value,
                  }))
                }
                placeholder="Enter the question for this item"
                maxLength={200}
                required
              />
              <small className="text-muted">
                {(itemFormData.question || "").length}/200 characters
              </small>
            </FormGroup>
            <FormGroup>
              <Label for="sampleConversation" className="form-control-label">
                Sample Conversation
              </Label>
              <Input
                className="form-control-alternative"
                type="textarea"
                name="sampleConversation"
                id="sampleConversation"
                value={itemFormData.sample_conversation}
                onChange={(e) =>
                  setItemFormData((prev) => ({
                    ...prev,
                    sample_conversation: e.target.value,
                  }))
                }
                maxLength={1000}
              />
              <small className="text-muted">
                {(itemFormData.sample_conversation || "").length}/1000 characters
              </small>
            </FormGroup>

            <FormGroup tag="fieldset">
              <Label className="form-label">
                Hide from Frontend <span className="text-danger">*</span>
              </Label>
              <div className="d-flex gap-3">
                <FormGroup check className="mr-1">
                  <Label check>
                    <Input
                      type="radio"
                      name="isHidden"
                      value="true"
                      checked={itemFormData.isHidden === "true"}
                      onChange={(e) =>
                        setItemFormData((prev) => ({
                          ...prev,
                          isHidden: e.target.value,
                        }))
                      }
                      className="form-control-alternative"
                      style={{ color: "black" }}
                    />
                    Yes
                  </Label>
                </FormGroup>

                <FormGroup check>
                  <Label check>
                    <Input
                      type="radio"
                      name="isHidden"
                      value="false"
                      checked={itemFormData.isHidden === "false"}
                      defaultChecked={!itemFormData.isHidden || itemFormData.isHidden === "false"}
                      onChange={(e) =>
                        setItemFormData((prev) => ({
                          ...prev,
                          isHidden: e.target.value,
                        }))
                      }
                      className="form-control-alternative"
                      style={{ color: "black" }}
                    />
                    No
                  </Label>
                </FormGroup>
              </div>
            </FormGroup>

            <FormGroup>
              <Label>Suggestions</Label>
              <div className="mb-3">
                <Button
                  color="primary"
                  size="sm"
                  onClick={handleAddSuggestion}
                  className="mb-2"
                >
                  <i className="fas fa-plus mr-1" />
                  Add Suggestion
                </Button>

                {itemFormData.suggestions.length > 0 && (
                  <div className="suggestions-list">
                    {itemFormData.suggestions.map((suggestion, index) => (
                      <div
                        key={suggestion.id}
                        className="suggestion-item d-flex align-items-center justify-content-between p-2 border rounded mb-2"
                      >
                        <div className="flex-grow-1">
                          <strong>Suggestion {index + 1}:</strong>{" "}
                          {suggestion.suggestion}
                          <br />
                          <small className="text-muted">
                            Status: {suggestion.status}
                          </small>
                        </div>
                        <div className="ml-2">
                          <Button
                            color="primary"
                            size="sm"
                            onClick={() => handleEditSuggestion(index)}
                            className="mr-1"
                          >
                            <i className="fas fa-edit" />
                          </Button>
                          <Button
                            color="danger"
                            size="sm"
                            onClick={() => handleDeleteSuggestion(index)}
                          >
                            <i className="fas fa-trash" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={handleCloseCreateItem}>
            Cancel
          </Button>
          <Button
            color="primary"
            onClick={handleItemSubmit}
            disabled={loading}
            className="btn-custom-primary"
          >
            {loading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creating...
              </>
            ) : (
              "Create Item"
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Suggestion Modal */}
      <Modal
        isOpen={suggestionModal}
        toggle={handleCloseSuggestionModal}
        size="md"
      >
        <ModalHeader toggle={handleCloseSuggestionModal}>
          {suggestionIndex !== null ? "Edit Suggestion" : "Add Suggestion"}
        </ModalHeader>
        <ModalBody>
          <Form>
            <FormGroup>
              <Label for="suggestionText">
                Suggestion Text <span className="text-danger">*</span>
              </Label>
              <Input
                className="form-control-alternative"
                type="textarea"
                name="suggestionText"
                id="suggestionText"
                value={currentSuggestion.suggestion}
                onChange={(e) =>
                  setCurrentSuggestion((prev) => ({
                    ...prev,
                    suggestion: e.target.value,
                  }))
                }
                placeholder="Enter suggestion text"
                required
              />
            </FormGroup>

            <FormGroup>
              <Label for="suggestionStatus">Status</Label>
              <Input
                type="select"
                name="suggestionStatus"
                id="suggestionStatus"
                value={currentSuggestion.status}
                onChange={(e) =>
                  setCurrentSuggestion((prev) => ({
                    ...prev,
                    status: e.target.value,
                  }))
                }
                className="form-control-alternative"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Input>
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={handleCloseSuggestionModal}>
            Cancel
          </Button>
          <Button
            color="primary"
            onClick={handleSaveSuggestion}
            className="btn-custom-primary"
          >
            {suggestionIndex !== null ? "Update" : "Add"} Suggestion
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default SeedData;
