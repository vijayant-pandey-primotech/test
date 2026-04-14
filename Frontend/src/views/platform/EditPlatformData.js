import React, { useState, useEffect } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  CardHeader,
  CardBody,
  Button,
  Spinner,
  FormGroup,
  Label,
  Input,
  Alert,
  Badge,
  InputGroup,
  InputGroupText,
  ButtonGroup,
  Collapse,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "reactstrap";
import assistantService from "../../services/assistantService";
import itemService from "../../services/itemService";
import platformService from "../../services/platformService";
import axios from "axios";
import { getAuthToken } from "utils/authUtils";
import { Toast, useToast } from "components/Toast";
import { useNavigate, useParams } from "react-router-dom";
// Replace with actual platform ID from props or route params
const API_URL = process.env.REACT_APP_PLATFORM_API_URL;

const EditPlatformData = () => {
  const { toast, showSuccess, showError, showWarning, showInfo, hideToast } = useToast();
  // State for data
  const [stories, setStories] = useState([]);
  const [chapters, setChapters] = useState({});
  const [items, setItems] = useState({});
  const [platformName, setPlatformName] = useState(""); // Convert to state variable
  const navigate = useNavigate();
  const { platformId } = useParams();
  // State for selections - simplified approach
  const [selectedContent, setSelectedContent] = useState({
    stories: [], // [{ id, name, mode: 'full' | 'chapters', selectedChapters: [] }]
    chapters: [], // [{ id, name, storyId, mode: 'full' | 'items', selectedItems: [] }]
    items: [], // [{ id, name, chapterId }]
  });

  // State for existing platform mappings
  const [existingMappings, setExistingMappings] = useState([]);
  const [loadingExistingMappings, setLoadingExistingMappings] = useState(false);
  const [pendingMappingsToApply, setPendingMappingsToApply] = useState(null);

  // State for UI
  const [loadingStories, setLoadingStories] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState({});
  const [loadingItems, setLoadingItems] = useState({});
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedStories, setExpandedStories] = useState([]);
  const [expandedChapters, setExpandedChapters] = useState([]);

  // Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("preview"); // 'preview' or 'submit'
  const [pendingSave, setPendingSave] = useState(false);

  // Preview modal collapse state
  const [previewExpandedStories, setPreviewExpandedStories] = useState([]);
  const [previewExpandedChapters, setPreviewExpandedChapters] = useState([]);

  // State for clearing all
  const [clearingAll, setClearingAll] = useState(false);

  // Fetch stories on mount
  useEffect(() => {
    setLoadingStories(true);
    assistantService
      .getStoriesList()
      .then((data) => {
        const storiesArr =
          data && data.body
            ? data.body
            : data && data.data && data.data.body
            ? data.data.body
            : data;
        // Filter out deleted stories
        const activeStories = Array.isArray(storiesArr)
          ? storiesArr.filter(
              (story) =>
                !story.isDeleted &&
                story.status !== "deleted" &&
                story.isPublished === 1
            )
          : [];
        // console.log("Loaded stories:", activeStories);
        setStories(activeStories);
        setLoadingStories(false);

        // Preload all chapters and items for search functionality
        preloadAllItems();
      })
      .catch((error) => {
        console.error("Error fetching stories:", error);
        setLoadingStories(false);
        setAlert({ type: "danger", msg: "Failed to load stories." });
      });
  }, []);

  // Preload chapters and items when stories are loaded
  useEffect(() => {
    if (stories.length > 0) {
      // console.log("Stories loaded, now preloading chapters and items");
      preloadAllItems();
    }
  }, [stories]);

  // Function to preload all chapters and items for search functionality
  const preloadAllItems = async () => {
    try {
      // console.log("Starting preloadAllItems with stories:", stories);

      if (!stories || stories.length === 0) {
        // console.log("No stories available to preload");
        return;
      }

      // First, preload all chapters for all stories
      const chapterPromises = stories.map(async (story) => {
        try {
          const res = await assistantService.getChaptersList(story.storyId);
          const chaptersArr =
            res && res.body
              ? res.body
              : res && res.data && res.data.body
              ? res.data.body
              : res;
          // Filter out deleted chapters
          const activeChapters = Array.isArray(chaptersArr)
            ? chaptersArr.filter(
                (chapter) => !chapter.isDeleted && chapter.status !== "deleted"
              )
            : [];
          // console.log(
          //   `Loaded ${activeChapters.length} chapters for story ${story.storyId}`
          // );
          return { storyId: story.storyId, chapters: activeChapters };
        } catch (error) {
          console.error(
            `Error loading chapters for story ${story.storyId}:`,
            error
          );
          return { storyId: story.storyId, chapters: [] };
        }
      });

      const chapterResults = await Promise.all(chapterPromises);
      const chaptersByStory = {};
      chapterResults.forEach(({ storyId, chapters: storyChapters }) => {
        chaptersByStory[storyId] = storyChapters;
      });
      // console.log("Final chapters by story:", chaptersByStory);
      setChapters(chaptersByStory);

      // Then preload all items
      const data = await itemService.getItemsList();
      const itemsArr = data && data.body ? data.body : data;
      // console.log("Raw items data:", itemsArr);

      if (Array.isArray(itemsArr)) {
        // Group items by chapterId
        const itemsByChapter = {};
        itemsArr.forEach((item) => {
          if (item.chapterId && !item.isDeleted && item.status !== "deleted") {
            if (!itemsByChapter[item.chapterId]) {
              itemsByChapter[item.chapterId] = [];
            }
            itemsByChapter[item.chapterId].push(item);
          }
        });

        // console.log("Final items by chapter:", itemsByChapter);
        setItems(itemsByChapter);
      }
    } catch (error) {
      console.error("Error preloading data:", error);
    }
  };

  // Fetch existing platform mappings on mount
  useEffect(() => {
    loadExistingPlatformMappings();
  }, []);

  // Apply pending mappings once chapters and items are loaded
  useEffect(() => {
    if (
      pendingMappingsToApply &&
      stories.length > 0 &&
      Object.keys(chapters).length > 0 &&
      Object.keys(items).length > 0
    ) {
      applyMappingsToSelection(pendingMappingsToApply);
      setPendingMappingsToApply(null);
    }
  }, [pendingMappingsToApply, chapters, items, stories]);

  // Auto-upgrade chapter selections to "full" when all items are selected
  useEffect(() => {
    if (clearingAll) return;

    setSelectedContent((prev) => {
      let hasChanges = false;
      const newChapters = prev.chapters.map((chapter) => {
        if (chapter.mode === "items" && items[chapter.id]) {
          const availableItems = (items[chapter.id] || []).filter(
            (item) => item.is_deleted !== 1 && item.status !== "deleted"
          );
          const selectedItemIds = chapter.selectedItems || [];

          // Check if all available items are selected
          if (
            availableItems.length > 0 &&
            selectedItemIds.length === availableItems.length &&
            availableItems.every((item) =>
              selectedItemIds.includes(item.id || item.itemId)
            )
          ) {
            hasChanges = true;
            return { ...chapter, mode: "full" };
          }
        }
        return chapter;
      });

      if (hasChanges) {
        return { ...prev, chapters: newChapters };
      }
      return prev;
    });
  }, [selectedContent.chapters, items, clearingAll]);

  // Auto-upgrade story selections to "full" when all chapters are selected and all are in "full" mode
  useEffect(() => {
    if (clearingAll) return;

    setSelectedContent((prev) => {
      let hasChanges = false;
      const newStories = prev.stories.map((story) => {
        if (story.mode === "chapters" && chapters[story.id]) {
          const availableChapters = chapters[story.id] || [];
          const selectedChapterIds = story.selectedChapters || [];

          // Check if all chapters are selected
          if (
            availableChapters.length > 0 &&
            selectedChapterIds.length === availableChapters.length
          ) {
            // Check if all selected chapters are in "full" mode
            const allChaptersAreFull = selectedChapterIds.every((chapterId) => {
              const chapterSelection = prev.chapters.find(
                (c) => c.id === chapterId
              );
              return chapterSelection && chapterSelection.mode === "full";
            });

            if (allChaptersAreFull) {
              hasChanges = true;
              return { ...story, mode: "full" };
            }
          }
        }
        return story;
      });

      if (hasChanges) {
        return { ...prev, stories: newStories };
      }
      return prev;
    });
  }, [
    selectedContent.stories,
    selectedContent.chapters,
    chapters,
    clearingAll,
  ]);

  // Function to load existing platform mappings
  const loadExistingPlatformMappings = async () => {
    setLoadingExistingMappings(true);
    try {
      const response = await platformService.getPlatformMappings(platformId);

      // Extract platformName from the correct path in the response
      if (response?.body?.platformName) {
        setPlatformName(response.body.platformName);
      }

      // Handle different response structures
      const mappings = response?.data || response?.mappings || response || [];
      setExistingMappings(Array.isArray(mappings) ? mappings : []);

      // Show success message if mappings found
      if (mappings.length > 0) {
        setAlert({
          type: "info",
          msg: `Loaded ${mappings.length} existing mappings for this platform.`,
        });
      }

      // Store the response body to apply later when data is loaded
      if (response?.body) {
        // console.log("Setting pending mappings to apply:", response.body);
        setPendingMappingsToApply(response.body);
      }
    } catch (error) {
      console.error("Error loading existing platform mappings:", error);

      // Don't show error for 404 (no existing mappings)
      if (error.response?.status !== 404) {
        setAlert({
          type: "warning",
          msg: "Could not load existing platform mappings. You can still create new ones.",
        });
      }

      setExistingMappings([]);
    } finally {
      setLoadingExistingMappings(false);
    }
  };

  // Add this function to parse backend mappings and set selectedContent
  const applyMappingsToSelection = (mappingBody) => {
    if (!mappingBody || !mappingBody.stories) {
      return;
    }

    const selectedStories = [];
    const selectedChapters = [];

    mappingBody.stories.forEach((story) => {
      const selectedChapterIds = [];
      let allChaptersAreFull = true;
      const storyChapters = chapters[story.storyId] || [];

      story.chapters.forEach((chapter) => {
        selectedChapterIds.push(chapter.chapterId);

        // Get all available items for this chapter
        const availableItems = items[chapter.chapterId] || [];
        const selectedItemIds = (chapter.items || []).map(
          (item) => item.itemId
        );

        // Check if all items in the chapter are selected
        const allItemsSelected =
          availableItems.length > 0 &&
          availableItems.every((item) =>
            selectedItemIds.includes(item.id || item.itemId)
          );

        // Determine chapter mode
        const chapterMode = allItemsSelected ? "full" : "items";

        if (chapterMode !== "full") {
          allChaptersAreFull = false;
        }

        selectedChapters.push({
          id: chapter.chapterId,
          name: chapter.chapterName,
          storyId: story.storyId,
          mode: chapterMode,
          selectedItems: selectedItemIds,
        });
      });

      // Check if all chapters in the story are selected
      const allChaptersSelected =
        storyChapters.length > 0 &&
        selectedChapterIds.length === storyChapters.length;

      // Determine story mode
      const storyMode =
        allChaptersSelected && allChaptersAreFull ? "full" : "chapters";

      selectedStories.push({
        id: story.storyId,
        name: story.storyName,
        mode: storyMode,
        selectedChapters: selectedChapterIds,
      });
    });

    setSelectedContent({
      stories: selectedStories,
      chapters: selectedChapters,
      items: [],
    });
  };

  // Auto-fetch chapters for expanded stories
  useEffect(() => {
    if (clearingAll) return;
    expandedStories.forEach((storyId) => {
      if (!chapters[storyId] && !loadingChapters[storyId]) {
        setLoadingChapters((prev) => ({ ...prev, [storyId]: true }));
        assistantService
          .getChaptersList(storyId)
          .then((res) => {
            const chaptersArr =
              res && res.body
                ? res.body
                : res && res.data && res.data.body
                ? res.data.body
                : res;
            // Filter out deleted chapters
            const activeChapters = Array.isArray(chaptersArr)
              ? chaptersArr.filter(
                  (chapter) =>
                    !chapter.isDeleted && chapter.status !== "deleted"
                )
              : [];
            setChapters((prev) => ({
              ...prev,
              [storyId]: activeChapters,
            }));
            setLoadingChapters((prev) => ({ ...prev, [storyId]: false }));
          })
          .catch(() => {
            setLoadingChapters((prev) => ({ ...prev, [storyId]: false }));
            setAlert({
              type: "danger",
              msg: `Failed to load chapters for story ${storyId}`,
            });
          });
      }
    });
  }, [expandedStories, clearingAll]);

  // Auto-fetch items for expanded chapters
  useEffect(() => {
    if (clearingAll) return;
    expandedChapters.forEach((chapterId) => {
      if (!items[chapterId] && !loadingItems[chapterId]) {
        setLoadingItems((prev) => ({ ...prev, [chapterId]: true }));
        itemService
          .getItemsList()
          .then((data) => {
            const itemsArr = data && data.body ? data.body : data;
            // Filter out deleted items and match chapter ID
            const filtered = (itemsArr || []).filter(
              (item) =>
                item.chapterId === chapterId &&
                item.is_deleted !== 1 &&
                item.status !== "deleted"
            );
            setItems((prev) => ({ ...prev, [chapterId]: filtered }));
            setLoadingItems((prev) => ({ ...prev, [chapterId]: false }));
          })
          .catch(() => {
            setLoadingItems((prev) => ({ ...prev, [chapterId]: false }));
            setAlert({
              type: "danger",
              msg: `Failed to load items for chapter ${chapterId}`,
            });
          });
      }
    });
  }, [expandedChapters, clearingAll]);

  // Update chapter selections when items are loaded for chapters in "full" mode
  useEffect(() => {
    if (clearingAll) return;
    selectedContent.chapters.forEach((chapter) => {
      if (chapter.mode === "full" && items[chapter.id]) {
        const chapterItems = items[chapter.id] || [];
        const allItemIds = chapterItems.map((item) => item.id || item.itemId);

        // Only update if the selectedItems don't match all items
        if (
          JSON.stringify(chapter.selectedItems.sort()) !==
          JSON.stringify(allItemIds.sort())
        ) {
          setSelectedContent((prev) => {
            const chapterIndex = prev.chapters.findIndex(
              (c) => c.id === chapter.id
            );
            if (chapterIndex >= 0) {
              const newChapters = [...prev.chapters];
              newChapters[chapterIndex].selectedItems = allItemIds;
              return { ...prev, chapters: newChapters };
            }
            return prev;
          });
        }
      }
    });
  }, [items, selectedContent.chapters, clearingAll]);

  // Update story selections when chapters are loaded for stories in "full" mode
  useEffect(() => {
    if (clearingAll) return;
    selectedContent.stories.forEach((story) => {
      if (story.mode === "full" && chapters[story.id]) {
        const storyChapters = chapters[story.id] || [];
        const allChapterIds = storyChapters.map((chapter) => chapter.chapterId);

        // Only update if the selectedChapters don't match all chapters and we have chapters loaded
        if (
          allChapterIds.length > 0 &&
          JSON.stringify(story.selectedChapters.sort()) !==
            JSON.stringify(allChapterIds.sort())
        ) {
          setSelectedContent((prev) => {
            const storyIndex = prev.stories.findIndex((s) => s.id === story.id);
            if (storyIndex >= 0 && prev.stories[storyIndex].mode === "full") {
              const newStories = [...prev.stories];
              newStories[storyIndex].selectedChapters = allChapterIds;
              return { ...prev, stories: newStories };
            }
            return prev;
          });
        }

        // Auto-load items for all chapters in full story mode
        if (story.mode === "full") {
          storyChapters.forEach((chapter) => {
            if (!items[chapter.chapterId] && !loadingItems[chapter.chapterId]) {
              setLoadingItems((prev) => ({
                ...prev,
                [chapter.chapterId]: true,
              }));
              itemService
                .getItemsList()
                .then((data) => {
                  const itemsArr = data && data.body ? data.body : data;
                  // Filter out deleted items and match chapter ID
                  const filtered = (itemsArr || []).filter(
                    (item) =>
                      item.chapterId === chapter.chapterId &&
                      !item.isDeleted &&
                      item.status !== "deleted"
                  );
                  setItems((prev) => ({
                    ...prev,
                    [chapter.chapterId]: filtered,
                  }));
                  setLoadingItems((prev) => ({
                    ...prev,
                    [chapter.chapterId]: false,
                  }));
                })
                .catch(() => {
                  setLoadingItems((prev) => ({
                    ...prev,
                    [chapter.chapterId]: false,
                  }));
                  setAlert({
                    type: "danger",
                    msg: `Failed to load items for chapter ${chapter.chapterId}`,
                  });
                });
            }
          });
        }
      }
    });
  }, [chapters, selectedContent.stories, clearingAll]);

  // Auto-load items for selected chapters (both from stories and individual selections)
  useEffect(() => {
    if (clearingAll) return;
    const allSelectedChapterIds = new Set();

    // Collect chapter IDs from selected stories
    selectedContent.stories.forEach((story) => {
      story.selectedChapters?.forEach((chapterId) => {
        allSelectedChapterIds.add(chapterId);
      });
    });

    // Collect chapter IDs from individual chapter selections
    selectedContent.chapters.forEach((chapter) => {
      allSelectedChapterIds.add(chapter.id);
    });

    // Load items for all selected chapters
    allSelectedChapterIds.forEach((chapterId) => {
      if (!items[chapterId] && !loadingItems[chapterId]) {
        setLoadingItems((prev) => ({ ...prev, [chapterId]: true }));
        itemService
          .getItemsList()
          .then((data) => {
            const itemsArr = data && data.body ? data.body : data;
            // Filter out deleted items and match chapter ID
            const filtered = (itemsArr || []).filter(
              (item) =>
                item.chapterId === chapterId &&
                !item.isDeleted &&
                item.status !== "deleted"
            );
            setItems((prev) => ({ ...prev, [chapterId]: filtered }));
            setLoadingItems((prev) => ({ ...prev, [chapterId]: false }));
          })
          .catch(() => {
            setLoadingItems((prev) => ({ ...prev, [chapterId]: false }));
            setAlert({
              type: "danger",
              msg: `Failed to load items for chapter ${chapterId}`,
            });
          });
      }
    });
  }, [
    selectedContent.stories,
    selectedContent.chapters,
    items,
    loadingItems,
    clearingAll,
  ]);

  // Helper functions - Unified search across stories, chapters, and items
  const getFilteredContent = () => {
    if (!searchTerm.trim()) {
      return { stories: stories, shouldShowAll: false };
    }

    const searchLower = searchTerm.toLowerCase();
    const filteredStories = [];
    const matchingStoryIds = new Set();
    const matchingChapterIds = new Set();

    // Search through all stories, chapters, and items
    stories.forEach((story) => {
      let storyMatches = story.storyName.toLowerCase().includes(searchLower);
      let hasMatchingChapters = false;
      let hasMatchingItems = false;

      // Check chapters for this story
      const storyChapters = chapters[story.storyId] || [];
      storyChapters.forEach((chapter) => {
        let chapterMatches = chapter.chapterName
          .toLowerCase()
          .includes(searchLower);
        let chapterHasMatchingItems = false;

        // Check items for this chapter - now items should be preloaded
        const chapterItems = items[chapter.chapterId] || [];
        chapterItems.forEach((item) => {
          if (
            item.itemName &&
            item.itemName.toLowerCase().includes(searchLower)
          ) {
            hasMatchingItems = true;
            chapterHasMatchingItems = true;
            matchingChapterIds.add(chapter.chapterId);
          }
        });

        if (chapterMatches || chapterHasMatchingItems) {
          hasMatchingChapters = true;
          matchingChapterIds.add(chapter.chapterId);
        }
      });

      // Include story if it matches or has matching children
      if (storyMatches || hasMatchingChapters || hasMatchingItems) {
        filteredStories.push(story);
        matchingStoryIds.add(story.storyId);
      }
    });

    return {
      stories: filteredStories,
      shouldShowAll: true,
      matchingStoryIds,
      matchingChapterIds,
    };
  };

  const {
    stories: filteredStories,
    shouldShowAll,
    matchingStoryIds,
    matchingChapterIds,
  } = getFilteredContent();

  // Auto-expand stories and chapters when search matches are found
  useEffect(() => {
    if (searchTerm.trim() && shouldShowAll) {
      // Auto-expand stories that have matches
      if (matchingStoryIds && matchingStoryIds.size > 0) {
        setExpandedStories((prev) => {
          const newExpanded = new Set(prev);
          matchingStoryIds.forEach((storyId) => newExpanded.add(storyId));
          return Array.from(newExpanded);
        });
      }

      // Auto-expand chapters that have matches
      if (matchingChapterIds && matchingChapterIds.size > 0) {
        setExpandedChapters((prev) => {
          const newExpanded = new Set(prev);
          matchingChapterIds.forEach((chapterId) => newExpanded.add(chapterId));
          return Array.from(newExpanded);
        });
      }
    }
  }, [searchTerm, shouldShowAll, matchingStoryIds, matchingChapterIds]);

  // Helper function to highlight matching text
  const highlightText = (text, searchTerm) => {
    if (!searchTerm.trim() || !text) return text;

    const regex = new RegExp(
      `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    );
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <span
          key={index}
          style={{
            backgroundColor: "#fff3cd",
            fontWeight: "bold",
            padding: "1px 2px",
            borderRadius: "2px",
          }}
        >
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  const getTotalSelections = () => {
    let total = 0;
    selectedContent.stories.forEach((story) => {
      if (story.mode === "full") {
        total += 1; // Count as 1 full story
      } else {
        total += story.selectedChapters.length;
      }
    });
    selectedContent.chapters.forEach((chapter) => {
      if (chapter.mode === "full") {
        total += 1; // Count as 1 full chapter
      } else {
        total += chapter.selectedItems.length;
      }
    });
    return total;
  };

  // Handlers
  const handleStorySelection = (story, mode) => {
    setSelectedContent((prev) => {
      const existingIndex = prev.stories.findIndex(
        (s) => s.id === story.storyId
      );
      const newStories = [...prev.stories];
      let newChapters = [...prev.chapters];

      if (existingIndex >= 0) {
        if (mode === "remove") {
          newStories.splice(existingIndex, 1);
          // Remove all chapters associated with this story
          const storyChapters = chapters[story.storyId] || [];
          const storyChapterIds = storyChapters.map(
            (chapter) => chapter.chapterId
          );
          newChapters = newChapters.filter(
            (chapter) => !storyChapterIds.includes(chapter.id)
          );
          // Close the story when removed
          setExpandedStories((exp) => exp.filter((id) => id !== story.storyId));
        } else {
          // Get all chapters for this story
          const storyChapters = chapters[story.storyId] || [];
          const allChapterIds = storyChapters.map(
            (chapter) => chapter.chapterId
          );

          newStories[existingIndex] = {
            ...newStories[existingIndex],
            mode,
            selectedChapters: allChapterIds, // Always use all available chapters
          };
        }
      } else if (mode !== "remove") {
        // Get all chapters for this story
        const storyChapters = chapters[story.storyId] || [];
        const allChapterIds = storyChapters.map((chapter) => chapter.chapterId);

        newStories.push({
          id: story.storyId,
          name: story.storyName,
          mode,
          selectedChapters: allChapterIds, // Always use all available chapters
        });
      }

      return { ...prev, stories: newStories, chapters: newChapters };
    });

    // Auto-expand when selecting chapters mode or full story mode to load chapters
    if (mode === "chapters" || mode === "full") {
      setExpandedStories((prev) =>
        prev.includes(story.storyId) ? prev : [...prev, story.storyId]
      );
    }
  };

  const handleChapterSelection = (chapter, storyId, mode) => {
    setSelectedContent((prev) => {
      const existingIndex = prev.chapters.findIndex(
        (c) => c.id === chapter.chapterId
      );
      const newChapters = [...prev.chapters];
      let newStories = [...prev.stories];

      if (existingIndex >= 0) {
        if (mode === "remove") {
          newChapters.splice(existingIndex, 1);
          // Close the chapter when removed
          setExpandedChapters((exp) =>
            exp.filter((id) => id !== chapter.chapterId)
          );
          // Also remove from story's selectedChapters if present
          const storyIdx = newStories.findIndex((s) => s.id === storyId);
          if (storyIdx >= 0) {
            newStories[storyIdx] = {
              ...newStories[storyIdx],
              selectedChapters: newStories[storyIdx].selectedChapters.filter(
                (id) => id !== chapter.chapterId
              ),
            };
          }
        } else {
          // Get all items for this chapter
          const chapterItems = items[chapter.chapterId] || [];
          const allItemIds = chapterItems.map((item) => item.id || item.itemId);

          newChapters[existingIndex] = {
            ...newChapters[existingIndex],
            mode,
            selectedItems:
              mode === "full"
                ? allItemIds
                : newChapters[existingIndex].selectedItems,
          };
          // If mode is 'full', ensure chapter is checked in story's selectedChapters
          if (mode === "full") {
            const storyIdx = newStories.findIndex((s) => s.id === storyId);
            if (storyIdx >= 0) {
              if (
                !newStories[storyIdx].selectedChapters.includes(
                  chapter.chapterId
                )
              ) {
                newStories[storyIdx] = {
                  ...newStories[storyIdx],
                  mode: "chapters",
                  selectedChapters: [
                    ...newStories[storyIdx].selectedChapters,
                    chapter.chapterId,
                  ],
                };
              }
            } else {
              // Story not selected, add it in chapters mode
              newStories.push({
                id: storyId,
                name:
                  stories.find((s) => s.storyId === storyId)?.storyName ||
                  storyId,
                mode: "chapters",
                selectedChapters: [chapter.chapterId],
              });
            }
          }
        }
      } else if (mode !== "remove") {
        // Get all items for this chapter
        const chapterItems = items[chapter.chapterId] || [];
        const allItemIds = chapterItems.map((item) => item.id || item.itemId);

        newChapters.push({
          id: chapter.chapterId,
          name: chapter.chapterName,
          storyId,
          mode,
          selectedItems: mode === "full" ? allItemIds : [],
        });
        // If mode is 'full', ensure chapter is checked in story's selectedChapters
        if (mode === "full") {
          const storyIdx = newStories.findIndex((s) => s.id === storyId);
          if (storyIdx >= 0) {
            if (
              !newStories[storyIdx].selectedChapters.includes(chapter.chapterId)
            ) {
              newStories[storyIdx] = {
                ...newStories[storyIdx],
                mode: "chapters",
                selectedChapters: [
                  ...newStories[storyIdx].selectedChapters,
                  chapter.chapterId,
                ],
              };
            }
          } else {
            // Story not selected, add it in chapters mode
            newStories.push({
              id: storyId,
              name:
                stories.find((s) => s.storyId === storyId)?.storyName ||
                storyId,
              mode: "chapters",
              selectedChapters: [chapter.chapterId],
            });
          }
        }
      }

      return { ...prev, chapters: newChapters, stories: newStories };
    });

    // Auto-expand/collapse based on mode
    if (mode === "items") {
      // Auto-expand when selecting items mode
      setExpandedChapters((prev) =>
        prev.includes(chapter.chapterId) ? prev : [...prev, chapter.chapterId]
      );
    } else if (mode === "full") {
      // Auto-collapse when selecting full chapter mode
      setExpandedChapters((prev) =>
        prev.filter((id) => id !== chapter.chapterId)
      );
    }
  };

  const handleItemSelection = (item, chapterId) => {
    // Use the correct item ID field
    const itemId = item.id || item.itemId;

    setSelectedContent((prev) => {
      const chapterIndex = prev.chapters.findIndex((c) => c.id === chapterId);
      let newChapters = [...prev.chapters];
      let newStories = [...prev.stories];

      if (chapterIndex >= 0) {
        // Chapter already exists, update its items
        const selectedItems = newChapters[chapterIndex].selectedItems || [];

        if (selectedItems.includes(itemId)) {
          // If in 'full' mode, switch to 'items' mode and remove the item
          if (newChapters[chapterIndex].mode === "full") {
            newChapters[chapterIndex].mode = "items";
            newChapters[chapterIndex].selectedItems = (items[chapterId] || [])
              .map((item) => item.id || item.itemId)
              .filter((id) => id !== itemId);
          } else {
            // Remove this specific item
            newChapters[chapterIndex].selectedItems = selectedItems.filter(
              (id) => id !== itemId
            );
          }

          // AUTO-UNCHECK LOGIC: If no items are selected, remove the chapter
          if (newChapters[chapterIndex].selectedItems.length === 0) {
            // Remove chapter from individual chapters selection
            newChapters.splice(chapterIndex, 1);

            // Also remove from story's selectedChapters if present
            const storyId = newChapters[chapterIndex]?.storyId;
            if (storyId) {
              const storyIndex = newStories.findIndex((s) => s.id === storyId);
              if (storyIndex >= 0) {
                newStories[storyIndex] = {
                  ...newStories[storyIndex],
                  selectedChapters: newStories[
                    storyIndex
                  ].selectedChapters.filter((id) => id !== chapterId),
                };

                // If story has no chapters selected, remove the story too
                if (newStories[storyIndex].selectedChapters.length === 0) {
                  newStories.splice(storyIndex, 1);
                }
              }
            }
          }
        } else {
          // Add this specific item
          const newSelected = [...selectedItems, itemId];
          // If all items are now selected, switch to 'full' mode
          if (newSelected.length === (items[chapterId] || []).length) {
            newChapters[chapterIndex].mode = "full";
            newChapters[chapterIndex].selectedItems = (
              items[chapterId] || []
            ).map((item) => item.id || item.itemId);
          } else {
            newChapters[chapterIndex].mode = "items";
            newChapters[chapterIndex].selectedItems = newSelected;
          }
        }

        // Auto-expand the chapter when an item is selected
        setExpandedChapters((prev) =>
          prev.includes(chapterId) ? prev : [...prev, chapterId]
        );

        return { ...prev, chapters: newChapters, stories: newStories };
      } else {
        // Chapter doesn't exist, we need to find the chapter info and add it
        // Let's find the chapter from the chapters state
        let foundChapter = null;
        let storyId = null;

        for (const [storyKey, chapterList] of Object.entries(chapters)) {
          const chapter = chapterList.find((ch) => ch.chapterId === chapterId);
          if (chapter) {
            foundChapter = chapter;
            storyId = storyKey;
            break;
          }
        }

        if (foundChapter) {
          const newChapters = [
            ...prev.chapters,
            {
              id: chapterId,
              name: foundChapter.chapterName,
              storyId: storyId,
              mode: "items",
              selectedItems: [itemId],
            },
          ];

          // Auto-expand the chapter when an item is selected
          setExpandedChapters((prev) =>
            prev.includes(chapterId) ? prev : [...prev, chapterId]
          );

          return { ...prev, chapters: newChapters, stories: newStories };
        }
      }
      return prev;
    });
  };

  const handleBulkStorySelection = (mode) => {
    const newSelections = filteredStories.map((story) => ({
      id: story.storyId,
      name: story.storyName,
      mode,
      selectedChapters:
        mode === "chapters" || mode === "full"
          ? (chapters[story.storyId] || []).map((ch) => ch.chapterId)
          : [],
    }));

    setSelectedContent((prev) => ({
      ...prev,
      stories: mode === "remove" ? [] : newSelections,
    }));

    // Auto-expand stories when selecting chapters mode or full mode
    if (mode === "chapters" || mode === "full") {
      const storyIds = filteredStories.map((story) => story.storyId);
      setExpandedStories((prev) => {
        const newExpanded = [...prev];
        storyIds.forEach((id) => {
          if (!newExpanded.includes(id)) {
            newExpanded.push(id);
          }
        });
        return newExpanded;
      });
    }
  };

  const handleSelectAllChaptersInStory = (storyId) => {
    const storyChapters = chapters[storyId] || [];
    const allChapterIds = storyChapters.map((chapter) => chapter.chapterId);
    setSelectedContent((prev) => {
      const storyIndex = prev.stories.findIndex((s) => s.id === storyId);
      let newStories = [...prev.stories];
      if (storyIndex >= 0) {
        newStories[storyIndex] = {
          ...newStories[storyIndex],
          mode: "full",
          selectedChapters: allChapterIds,
        };
      } else {
        // Story not selected yet, add it with all chapters
        const story = stories.find((s) => s.storyId === storyId);
        if (story) {
          newStories = [
            ...prev.stories,
            {
              id: storyId,
              name: story.storyName,
              mode: "full",
              selectedChapters: allChapterIds,
            },
          ];
        }
      }
      // Add all chapters to selectedContent.chapters in 'full' mode
      const newChapters = [
        ...prev.chapters.filter((c) => c.storyId !== storyId),
        ...storyChapters.map((chapter) => ({
          id: chapter.chapterId,
          name: chapter.chapterName,
          storyId,
          mode: "full",
          selectedItems: (items[chapter.chapterId] || []).map(
            (item) => item.id || item.itemId
          ),
        })),
      ];
      return { ...prev, stories: newStories, chapters: newChapters };
    });
  };

  const handleClearAllChaptersInStory = (storyId) => {
    setSelectedContent((prev) => {
      const storyIndex = prev.stories.findIndex((s) => s.id === storyId);
      let newStories = [...prev.stories];
      if (storyIndex >= 0) {
        newStories[storyIndex] = {
          ...newStories[storyIndex],
          selectedChapters: [],
          mode: "chapters",
        };
      }
      // Remove all chapters of this story from selectedContent.chapters
      const newChapters = prev.chapters.filter((c) => c.storyId !== storyId);
      return { ...prev, stories: newStories, chapters: newChapters };
    });
  };

  const handleChapterSelectionInStory = (chapterId, storyId) => {
    setSelectedContent((prev) => {
      const storyIndex = prev.stories.findIndex((s) => s.id === storyId);
      let newChapters = [...prev.chapters];
      if (storyIndex >= 0) {
        const newStories = [...prev.stories];
        const selectedChapters = newStories[storyIndex].selectedChapters || [];
        const allChapterIds = (chapters[storyId] || []).map(
          (ch) => ch.chapterId
        );
        let isChecked = selectedChapters.includes(chapterId);
        if (isChecked) {
          // If in 'full' mode, switch to 'chapters' mode and remove the chapter
          if (newStories[storyIndex].mode === "full") {
            newStories[storyIndex].mode = "chapters";
            newStories[storyIndex].selectedChapters = allChapterIds.filter(
              (id) => id !== chapterId
            );
          } else {
            // Remove this specific chapter
            newStories[storyIndex].selectedChapters = selectedChapters.filter(
              (id) => id !== chapterId
            );
          }
          // Also clear mode in chapters if present
          const chapterIdx = newChapters.findIndex((c) => c.id === chapterId);
          if (chapterIdx >= 0) {
            newChapters.splice(chapterIdx, 1);
          }
        } else {
          // Add this specific chapter and select all its items
          const newSelected = [...selectedChapters, chapterId];
          // If all chapters are now selected, switch to 'full' mode
          if (newSelected.length === allChapterIds.length) {
            newStories[storyIndex].mode = "full";
            newStories[storyIndex].selectedChapters = allChapterIds;
          } else {
            newStories[storyIndex].mode = "chapters";
            newStories[storyIndex].selectedChapters = newSelected;
          }

          // Add the chapter to individual chapters with all items selected
          const chapterItems = items[chapterId] || [];
          const allItemIds = chapterItems.map((item) => item.id || item.itemId);
          const chapterInfo = (chapters[storyId] || []).find(
            (ch) => ch.chapterId === chapterId
          );

          const chapterIdx = newChapters.findIndex((c) => c.id === chapterId);
          if (chapterIdx >= 0) {
            // Update existing chapter
            newChapters[chapterIdx] = {
              ...newChapters[chapterIdx],
              mode: "full",
              selectedItems: allItemIds,
            };
          } else {
            // Add new chapter
            newChapters.push({
              id: chapterId,
              name: chapterInfo?.chapterName || `Chapter ${chapterId}`,
              storyId,
              mode: "full",
              selectedItems: allItemIds,
            });
          }
        }
        // Ensure story is in "chapters" mode when not full
        if (
          newStories[storyIndex].selectedChapters.length < allChapterIds.length
        ) {
          newStories[storyIndex].mode = "chapters";
        }
        return { ...prev, stories: newStories, chapters: newChapters };
      } else {
        // Story not selected yet, add it with this chapter
        const story = stories.find((s) => s.storyId === storyId);
        if (story) {
          // Get all items for this chapter
          const chapterItems = items[chapterId] || [];
          const allItemIds = chapterItems.map((item) => item.id || item.itemId);
          const chapterInfo = (chapters[storyId] || []).find(
            (ch) => ch.chapterId === chapterId
          );

          // Add chapter to individual chapters with all items selected
          newChapters.push({
            id: chapterId,
            name: chapterInfo?.chapterName || `Chapter ${chapterId}`,
            storyId,
            mode: "full",
            selectedItems: allItemIds,
          });

          const newStories = [
            ...prev.stories,
            {
              id: storyId,
              name: story.storyName,
              mode: "chapters",
              selectedChapters: [chapterId],
            },
          ];
          return { ...prev, stories: newStories, chapters: newChapters };
        }
      }
      return prev;
    });
  };

  const handleExpandStory = (storyId) => {
    setExpandedStories((prev) =>
      prev.includes(storyId)
        ? prev.filter((id) => id !== storyId)
        : [...prev, storyId]
    );
  };

  const handleExpandChapter = (chapterId) => {
    setExpandedChapters((prev) =>
      prev.includes(chapterId)
        ? prev.filter((id) => id !== chapterId)
        : [...prev, chapterId]
    );
  };

  // Show preview modal
  const handlePreviewMappings = () => {
    setModalMode("preview");
    setPreviewModalOpen(true);
    // Reset preview collapse states to start collapsed
    setPreviewExpandedStories([]);
    setPreviewExpandedChapters([]);
  };
  // Show submit modal
  const handleSave = () => {
    setModalMode("submit");
    setPreviewModalOpen(true);
    setPendingSave(true);
  };
  // Actually save after confirmation
  const handleConfirmSave = async () => {
    setSaving(true);
    setPreviewModalOpen(false);
    setPendingSave(false);

    try {
      // Transform selections to the new format
      const { itemIds, chapterIds } = transformSelectionsToIds();

      // Create the payload in your requested format
      const payload = {
        platformId: platformId, // You can make this dynamic based on your needs
      };
      if (itemIds.length > 0) payload.itemIds = itemIds;
      if (chapterIds.length > 0) payload.chapterIds = chapterIds;

      // console.log("Sending data to backend:", payload);

      // Call the new backend API endpoint
      const response = await platformService.savePlatformMappings(payload);
      console.log("Backend response:", response);
      if (response.status === 200 || response.status === 201) {
        showSuccess("Training data configuration saved successfully!");
        navigate("/admin/platforms", {
          state: {
            message: "Training data configuration saved successfully!",
            type: "success",
          },
        });
      } else {
        showError(
          response.message || "Failed to save configuration. Please try again."
        );
      }

      setSaving(false);

      // Optional: Clear selections after successful save
      // setSelectedContent({ stories: [], chapters: [], items: [] });
    } catch (error) {
      console.error("Error saving platform mappings:", error);
      setSaving(false);

      // Handle different types of errors
      let errorMessage = "Failed to save configuration. Please try again.";

      if (error.response) {
        // Server responded with error status
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401) {
          errorMessage = "Authentication failed. Please log in again.";
        } else if (status === 403) {
          errorMessage =
            "You don't have permission to save platform configurations.";
        } else if (status === 400) {
          errorMessage =
            data.message ||
            "Invalid data provided. Please check your selections.";
        } else if (status >= 500) {
          errorMessage = "Server error occurred. Please try again later.";
        }
      } else if (error.request) {
        // Network error
        errorMessage =
          "Network error. Please check your connection and try again.";
      }

      showError(errorMessage);
    }
  };

  const handleClearAll = () => {
    setClearingAll(true);
    setSelectedContent({
      stories: [], // This will clear all story selections including nested chapter selections
      chapters: [], // This will clear all individual chapter selections including nested item selections
      items: [], // This will clear all individual item selections
    });

    // Also clear any expanded states to reset the UI
    setExpandedStories([]);
    setExpandedChapters([]);

    // Clear search term
    setSearchTerm("");

    setTimeout(() => {
      setClearingAll(false);
    }, 100); // 100ms is enough to skip one render cycle
    showInfo("All selections cleared.");
  };

  const isStorySelected = (storyId) => {
    const isSelected = selectedContent.stories.some((s) => s.id === storyId);
    // console.log(
    //   `isStorySelected(${storyId}):`,
    //   isSelected,
    //   "stories:",
    //   selectedContent.stories
    // );
    return isSelected;
  };

  const getStorySelectionMode = (storyId) => {
    const story = selectedContent.stories.find((s) => s.id === storyId);
    return story?.mode || null;
  };

  const isChapterSelected = (chapterId) => {
    return selectedContent.chapters.some((c) => c.id === chapterId);
  };

  const getChapterSelectionMode = (chapterId) => {
    const chapter = selectedContent.chapters.find((c) => c.id === chapterId);
    return chapter?.mode || null;
  };

  const isChapterSelectedInStory = (chapterId, storyId) => {
    const story = selectedContent.stories.find((s) => s.id === storyId);
    const isInStorySelection =
      story?.selectedChapters?.includes(chapterId) || false;

    // Check if this chapter has specific item selections
    const individualChapter = selectedContent.chapters.find(
      (c) => c.id === chapterId
    );

    // If chapter is in story selection, return true
    if (isInStorySelection) {
      return true;
    }

    // If chapter has individual selection and it's in "full" mode, also return true
    if (individualChapter && individualChapter.mode === "full") {
      return true;
    }

    return false;
  };

  const isChapterPartiallySelected = (chapterId, storyId) => {
    const individualChapter = selectedContent.chapters.find(
      (c) => c.id === chapterId
    );

    // Chapter is partially selected if it has individual item selections (not full mode)
    return (
      individualChapter &&
      individualChapter.mode === "items" &&
      individualChapter.selectedItems &&
      individualChapter.selectedItems.length > 0
    );
  };

  const getSelectedChaptersCount = (storyId) => {
    const story = selectedContent.stories.find((s) => s.id === storyId);

    if (story?.mode === "full") {
      // For full story mode, count all available chapters
      const storyChapters = chapters[storyId] || [];
      // console.log(
      //   `getSelectedChaptersCount(${storyId}) - Full mode:`,
      //   storyChapters.length,
      //   "chapters:",
      //   storyChapters
      // );
      return storyChapters.length;
    } else {
      // For chapters mode, count selected chapters
      const count = story?.selectedChapters?.length || 0;
      // console.log(
      //   `getSelectedChaptersCount(${storyId}) - Chapters mode:`,
      //   count,
      //   "selectedChapters:",
      //   story?.selectedChapters
      // );
      return count;
    }
  };

  const isItemSelected = (item, chapterId) => {
    const itemId = item.id || item.itemId;

    // Check if item is selected through individual chapter selection
    const chapter = selectedContent.chapters.find((c) => c.id === chapterId);
    if (chapter) {
      if (chapter.mode === "full") {
        return true; // All items in full chapter are selected
      } else if (chapter.mode === "items") {
        return chapter.selectedItems?.includes(itemId) || false;
      }
    }

    // Check if item is selected through story selection
    // Find which story this chapter belongs to
    let storyId = null;
    for (const [sId, chapterList] of Object.entries(chapters)) {
      if (chapterList.some((ch) => ch.chapterId === chapterId)) {
        storyId = sId;
        break;
      }
    }

    if (storyId) {
      const story = selectedContent.stories.find((s) => s.id === storyId);
      if (story && story.selectedChapters?.includes(chapterId)) {
        // Chapter is selected through story, check if it's full mode or if we have specific item selections
        const individualChapter = selectedContent.chapters.find(
          (c) => c.id === chapterId
        );
        if (individualChapter && individualChapter.mode === "items") {
          // Has specific item selections
          return individualChapter.selectedItems?.includes(itemId) || false;
        } else {
          // Full chapter is selected through story
          return true;
        }
      }
    }

    return false;
  };

  const getSelectedItemsCount = (chapterId) => {
    // Only count selected items that are not deleted
    const chapterItems = (items[chapterId] || []).filter(
      (item) => item.is_deleted !== 1 && item.status !== "deleted"
    );

    // Check if chapter is selected through individual chapter selection
    const chapter = selectedContent.chapters.find((c) => c.id === chapterId);
    if (chapter) {
      if (chapter.mode === "full") {
        return chapterItems.length;
      } else if (chapter.mode === "items") {
        return chapter.selectedItems
          ? chapter.selectedItems.filter((itemId) =>
              chapterItems.some((item) => (item.id || item.itemId) === itemId)
            ).length
          : 0;
      }
    }

    // Check if chapter is selected through story selection
    // Find which story this chapter belongs to
    let storyId = null;
    for (const [sId, chapterList] of Object.entries(chapters)) {
      if (chapterList.some((ch) => ch.chapterId === chapterId)) {
        storyId = sId;
        break;
      }
    }

    if (storyId) {
      const story = selectedContent.stories.find((s) => s.id === storyId);
      if (story && story.selectedChapters?.includes(chapterId)) {
        // Chapter is selected through story, check if it has specific item selections
        const individualChapter = selectedContent.chapters.find(
          (c) => c.id === chapterId
        );
        if (individualChapter && individualChapter.mode === "items") {
          // Has specific item selections
          return individualChapter.selectedItems
            ? individualChapter.selectedItems.filter((itemId) =>
                chapterItems.some((item) => (item.id || item.itemId) === itemId)
              ).length
            : 0;
        } else {
          // Full chapter is selected through story
          return chapterItems.length;
        }
      }
    }

    return 0;
  };

  const getTotalMappings = () => {
    return transformSelectionsToMapping().length;
  };

  const getTotalItemsInStory = (storyId) => {
    const storyChapters = chapters[storyId] || [];
    let totalItems = 0;
    storyChapters.forEach((chapter) => {
      const chapterItems = items[chapter.chapterId] || [];
      totalItems += chapterItems.length;
    });
    return totalItems;
  };

  const getTotalItemsInChapter = (chapterId) => {
    const chapterItems = items[chapterId] || [];
    return chapterItems.length;
  };

  // Helper functions for preview modal
  const handlePreviewExpandStory = (storyId) => {
    setPreviewExpandedStories((prev) =>
      prev.includes(storyId)
        ? prev.filter((id) => id !== storyId)
        : [...prev, storyId]
    );
  };

  const handlePreviewExpandChapter = (chapterId) => {
    setPreviewExpandedChapters((prev) =>
      prev.includes(chapterId)
        ? prev.filter((id) => id !== chapterId)
        : [...prev, chapterId]
    );
  };

  // Get structured preview data based on actual selections
  const getStructuredPreview = () => {
    const previewData = [];

    // Process selected stories
    selectedContent.stories.forEach((story) => {
      const storyChapters = chapters[story.id] || [];
      let storyData = {
        id: story.id,
        name: story.name,
        mode: story.mode,
        chapters: [],
        totalChapters: storyChapters.length,
        selectedChaptersCount: story.selectedChapters?.length || 0,
      };

      if (story.mode === "full") {
        // Full story - show all chapters with all their items
        storyChapters.forEach((chapter) => {
          const chapterItems = (items[chapter.chapterId] || []).filter(
            (item) => item.is_deleted !== 1 && item.status !== "deleted"
          );
          storyData.chapters.push({
            id: chapter.chapterId,
            name: chapter.chapterName,
            mode: "full",
            items: chapterItems.map((item) => ({
              id: item.id || item.itemId,
              name: item.name || item.itemName,
            })),
            totalItems: chapterItems.length,
            selectedItemsCount: chapterItems.length,
          });
        });
      } else if (story.mode === "chapters") {
        // Selected chapters only - check if they have specific item selections
        story.selectedChapters.forEach((chapterId) => {
          const chapter = storyChapters.find(
            (ch) => ch.chapterId === chapterId
          );
          if (chapter) {
            const chapterItems = (items[chapter.chapterId] || []).filter(
              (item) => item.is_deleted !== 1 && item.status !== "deleted"
            );

            // Check if this chapter has specific item selections
            const individualChapter = selectedContent.chapters.find(
              (c) => c.id === chapterId
            );

            if (individualChapter && individualChapter.mode === "items") {
              // Chapter has specific item selections
              storyData.chapters.push({
                id: chapter.chapterId,
                name: chapter.chapterName,
                mode: "items", // Specific items selected
                items: chapterItems
                  .filter((item) =>
                    individualChapter.selectedItems?.includes(
                      item.id || item.itemId
                    )
                  )
                  .map((item) => ({
                    id: item.id || item.itemId,
                    name: item.name || item.itemName,
                  })),
                totalItems: chapterItems.length,
                selectedItemsCount:
                  individualChapter.selectedItems?.length || 0,
              });
            } else {
              // Entire chapter is selected
              storyData.chapters.push({
                id: chapter.chapterId,
                name: chapter.chapterName,
                mode: "full", // Entire chapter is selected
                items: chapterItems.map((item) => ({
                  id: item.id || item.itemId,
                  name: item.name || item.itemName,
                })),
                totalItems: chapterItems.length,
                selectedItemsCount: chapterItems.length,
              });
            }
          }
        });
      }

      previewData.push(storyData);
    });

    // Process individually selected chapters (not part of story selections)
    selectedContent.chapters.forEach((chapter) => {
      // Check if this chapter is already included in a story selection
      const isInStorySelection = selectedContent.stories.some((story) =>
        story.selectedChapters?.includes(chapter.id)
      );

      if (!isInStorySelection) {
        const chapterItems = (items[chapter.id] || []).filter(
          (item) => item.is_deleted !== 1 && item.status !== "deleted"
        );
        let chapterData = {
          id: chapter.id,
          name: chapter.name,
          mode: chapter.mode,
          storyId: chapter.storyId,
          storyName: getStoryName(chapter.storyId),
          items: [],
          totalItems: chapterItems.length,
          selectedItemsCount: 0,
        };

        if (chapter.mode === "full") {
          chapterData.items = chapterItems.map((item) => ({
            id: item.id || item.itemId,
            name: item.name || item.itemName,
          }));
          chapterData.selectedItemsCount = chapterItems.length;
        } else if (chapter.mode === "items") {
          // Only show the specifically selected items, not all items in the chapter
          chapterData.items = chapterItems
            .filter((item) =>
              chapter.selectedItems?.includes(item.id || item.itemId)
            )
            .map((item) => ({
              id: item.id || item.itemId,
              name: item.name || item.itemName,
            }));
          chapterData.selectedItemsCount = chapter.selectedItems?.length || 0;
        }

        // Find if we already have this story in preview data
        let existingStory = previewData.find(
          (story) => story.id === chapter.storyId
        );
        if (existingStory) {
          existingStory.chapters.push(chapterData);
        } else {
          // Create a new story entry for this individual chapter
          previewData.push({
            id: chapter.storyId,
            name: chapterData.storyName,
            mode: "individual_chapters",
            chapters: [chapterData],
            totalChapters: (chapters[chapter.storyId] || []).length,
            selectedChaptersCount: 1,
          });
        }
      }
    });

    return previewData;
  };
  // Helper to get names from IDs
  const getStoryName = (storyId) => {
    const story = stories.find((s) => s.storyId === storyId);
    return story?.storyName || `Story ID: ${storyId}`;
  };

  const getChapterName = (chapterId) =>
    Object.values(chapters)
      .flat()
      .find((c) => c.chapterId === chapterId)?.chapterName ||
    `Chapter ID: ${chapterId}`;
  const getItemName = (itemId) =>
    Object.values(items)
      .flat()
      .find((i) => (i.id || i.itemId) === itemId)?.name ||
    Object.values(items)
      .flat()
      .find((i) => (i.id || i.itemId) === itemId)?.itemName ||
    `Item ID: ${itemId}`;

  const handleSelectAllItemsInChapter = (chapterId) => {
    const chapterItems = (items[chapterId] || []).filter(
      (item) => item.is_deleted !== 1 && item.status !== "deleted"
    );
    const allItemIds = chapterItems.map((item) => item.id || item.itemId);
    setSelectedContent((prev) => {
      const chapterIndex = prev.chapters.findIndex((c) => c.id === chapterId);
      if (chapterIndex >= 0) {
        const newChapters = [...prev.chapters];
        newChapters[chapterIndex].selectedItems = allItemIds;
        newChapters[chapterIndex].mode = "full";
        return { ...prev, chapters: newChapters };
      } else {
        // Add the chapter if not present
        // Find chapter info from chapters state
        let foundChapter = null;
        let storyId = null;
        for (const [storyKey, chapterList] of Object.entries(chapters)) {
          const chapter = chapterList.find((ch) => ch.chapterId === chapterId);
          if (chapter) {
            foundChapter = chapter;
            storyId = storyKey;
            break;
          }
        }
        if (foundChapter) {
          const newChapters = [
            ...prev.chapters,
            {
              id: chapterId,
              name: foundChapter.chapterName,
              storyId: storyId,
              mode: "full",
              selectedItems: allItemIds,
            },
          ];
          return { ...prev, chapters: newChapters };
        }
      }
      return prev;
    });
  };

  const handleClearAllItemsInChapter = (chapterId) => {
    setSelectedContent((prev) => {
      let newChapters = [...prev.chapters];
      let newStories = [...prev.stories];

      const chapterIndex = prev.chapters.findIndex((c) => c.id === chapterId);
      if (chapterIndex >= 0) {
        // Remove the chapter from individual selections
        newChapters = newChapters.filter((c) => c.id !== chapterId);
      }

      // Also remove the chapter from any story selections
      newStories = newStories.map((story) => {
        if (
          story.selectedChapters &&
          story.selectedChapters.includes(chapterId)
        ) {
          return {
            ...story,
            selectedChapters: story.selectedChapters.filter(
              (id) => id !== chapterId
            ),
          };
        }
        return story;
      });

      // Remove stories that have no chapters selected
      newStories = newStories.filter(
        (story) =>
          story.mode === "full" ||
          (story.selectedChapters && story.selectedChapters.length > 0)
      );

      return { ...prev, chapters: newChapters, stories: newStories };
    });
  };

  // Transform selections to the new format
  const transformSelectionsToMapping = () => {
    const mappingItems = [];
    const processedChapters = new Set(); // Track chapters we've already processed

    // Handle full stories (entire story mapped)
    selectedContent.stories.forEach((story) => {
      if (story.mode === "full") {
        // For full story, we need to get all chapters in that story
        const storyChapters = chapters[story.id] || [];
        storyChapters.forEach((chapter) => {
          // Check if this chapter has specific item overrides
          const individualChapter = selectedContent.chapters.find(
            (c) => c.id === chapter.chapterId
          );

          if (individualChapter && individualChapter.mode === "items") {
            // Chapter has specific item selections - only include selected items
            individualChapter.selectedItems.forEach((itemId) => {
              const item = (items[chapter.chapterId] || []).find(
                (i) => (i.id || i.itemId) === itemId
              );
              if (item) {
                mappingItems.push({
                  chapter_id: chapter.chapterId,
                  story_id: story.id,
                  item_id: itemId,
                  is_active: true,
                });
              }
            });
          } else {
            // Full chapter - include all items
            const chapterItems = (items[chapter.chapterId] || []).filter(
              (item) => item.is_deleted !== 1 && item.status !== "deleted"
            );
            if (chapterItems.length > 0) {
              // Add each item individually
              chapterItems.forEach((item) => {
                mappingItems.push({
                  chapter_id: chapter.chapterId,
                  story_id: story.id,
                  item_id: item.id || item.itemId,
                  is_active: true,
                });
              });
            } else {
              // If no items, add chapter-level mapping
              mappingItems.push({
                chapter_id: chapter.chapterId,
                story_id: story.id,
                item_id: null, // null means entire chapter
                is_active: true,
              });
            }
          }
          processedChapters.add(chapter.chapterId);
        });
      } else if (story.mode === "chapters") {
        // Handle individual chapter selections within stories
        story.selectedChapters.forEach((chapterId) => {
          // Check if this chapter has specific item selections
          const individualChapter = selectedContent.chapters.find(
            (c) => c.id === chapterId
          );

          if (individualChapter && individualChapter.mode === "items") {
            // Chapter has specific item selections - only include selected items
            individualChapter.selectedItems.forEach((itemId) => {
              const item = (items[chapterId] || []).find(
                (i) => (i.id || i.itemId) === itemId
              );
              if (item) {
                mappingItems.push({
                  chapter_id: chapterId,
                  story_id: story.id,
                  item_id: itemId,
                  is_active: true,
                });
              }
            });
          } else {
            // Full chapter is selected - include all items
            const chapterItems = (items[chapterId] || []).filter(
              (item) => item.is_deleted !== 1 && item.status !== "deleted"
            );
            if (chapterItems.length > 0) {
              // Add each item individually
              chapterItems.forEach((item) => {
                mappingItems.push({
                  chapter_id: chapterId,
                  story_id: story.id,
                  item_id: item.id || item.itemId,
                  is_active: true,
                });
              });
            } else {
              // If no items, add chapter-level mapping
              mappingItems.push({
                chapter_id: chapterId,
                story_id: story.id,
                item_id: null, // null means entire chapter
                is_active: true,
              });
            }
          }
          processedChapters.add(chapterId);
        });
      }
    });

    // Handle individual chapter selections (only if not already processed through story selections)
    selectedContent.chapters.forEach((chapter) => {
      if (processedChapters.has(chapter.id)) {
        return; // Skip chapters already processed through story selections
      }

      if (chapter.mode === "full") {
        // Full chapter mapped - add all items in this chapter
        const chapterItems = (items[chapter.id] || []).filter(
          (item) => item.is_deleted !== 1 && item.status !== "deleted"
        );
        if (chapterItems.length > 0) {
          chapterItems.forEach((item) => {
            mappingItems.push({
              chapter_id: chapter.id,
              story_id: chapter.storyId,
              item_id: item.id || item.itemId,
              is_active: true,
            });
          });
        } else {
          // If no items, add chapter-level mapping
          mappingItems.push({
            chapter_id: chapter.id,
            story_id: chapter.storyId,
            item_id: null, // null means entire chapter
            is_active: true,
          });
        }
      } else if (chapter.mode === "items") {
        // Individual items mapped
        chapter.selectedItems.forEach((itemId) => {
          const item = (items[chapter.id] || []).find(
            (i) => (i.id || i.itemId) === itemId
          );
          if (item) {
            mappingItems.push({
              chapter_id: chapter.id,
              story_id: chapter.storyId,
              item_id: itemId,
              is_active: true,
            });
          }
        });
      }
    });

    return mappingItems;
  };

  // Transform selections to the new format
  const transformSelectionsToIds = () => {
    const itemIds = new Set();
    const chapterIds = new Set();
    const processedChapters = new Set(); // Track chapters we've already processed

    // Handle full stories (entire story mapped)
    selectedContent.stories.forEach((story) => {
      if (story.mode === "full") {
        // For full story, get all chapters in that story
        const storyChapters = chapters[story.id] || [];
        storyChapters.forEach((chapter) => {
          // Check if this chapter has specific item overrides
          const individualChapter = selectedContent.chapters.find(
            (c) => c.id === chapter.chapterId
          );

          if (individualChapter && individualChapter.mode === "items") {
            // Chapter has specific item selections - only include selected items
            individualChapter.selectedItems.forEach((itemId) => {
              const item = (items[chapter.chapterId] || []).find(
                (i) => (i.id || i.itemId) === itemId
              );
              if (item) {
                itemIds.add(itemId);
              }
            });
          } else {
            // Full chapter - include all items
            const chapterItems = (items[chapter.chapterId] || []).filter(
              (item) => item.is_deleted !== 1 && item.status !== "deleted"
            );
            if (chapterItems.length > 0) {
              chapterItems.forEach((item) => {
                itemIds.add(item.id || item.itemId);
              });
            } else {
              chapterIds.add(chapter.chapterId);
            }
          }
          processedChapters.add(chapter.chapterId);
        });
      } else if (story.mode === "chapters") {
        // Individual chapter selections within stories
        story.selectedChapters.forEach((chapterId) => {
          // Check if this chapter has specific item selections
          const individualChapter = selectedContent.chapters.find(
            (c) => c.id === chapterId
          );

          if (individualChapter && individualChapter.mode === "items") {
            // Chapter has specific item selections - only include selected items
            individualChapter.selectedItems.forEach((itemId) => {
              const item = (items[chapterId] || []).find(
                (i) => (i.id || i.itemId) === itemId
              );
              if (item) {
                itemIds.add(itemId);
              }
            });
          } else {
            // Full chapter is selected - include all items
            const chapterItems = (items[chapterId] || []).filter(
              (item) => item.is_deleted !== 1 && item.status !== "deleted"
            );
            if (chapterItems.length > 0) {
              chapterItems.forEach((item) => {
                itemIds.add(item.id || item.itemId);
              });
            } else {
              chapterIds.add(chapterId);
            }
          }
          processedChapters.add(chapterId);
        });
      }
    });

    // Handle individual chapter selections (only if not already processed through story selections)
    selectedContent.chapters.forEach((chapter) => {
      if (processedChapters.has(chapter.id)) {
        return; // Skip chapters already processed through story selections
      }

      if (chapter.mode === "full") {
        const chapterItems = (items[chapter.id] || []).filter(
          (item) => item.is_deleted !== 1 && item.status !== "deleted"
        );
        if (chapterItems.length > 0) {
          chapterItems.forEach((item) => {
            itemIds.add(item.id || item.itemId);
          });
        } else {
          chapterIds.add(chapter.id);
        }
      } else if (chapter.mode === "items") {
        chapter.selectedItems.forEach((itemId) => {
          const item = (items[chapter.id] || []).find(
            (i) => (i.id || i.itemId) === itemId
          );
          if (item) {
            itemIds.add(itemId);
          }
        });
      }
    });

    return {
      itemIds: Array.from(itemIds),
      chapterIds: Array.from(chapterIds),
    };
  };

  return (
    <>
      {/* Preview/Submit Modal */}
      <Modal
        isOpen={previewModalOpen}
        toggle={() => {
          setPreviewModalOpen(false);
          setPendingSave(false);
        }}
        size="lg"
      >
        <ModalHeader
          toggle={() => {
            setPreviewModalOpen(false);
            setPendingSave(false);
          }}
        >
          {modalMode === "preview"
            ? "Preview Mappings"
            : "Confirm & Save Mappings"}
        </ModalHeader>
        <ModalBody>
          {getTotalMappings() === 0 ? (
            <div className="text-center text-muted">
              No selections to preview.
            </div>
          ) : (
            <div>
              <h5>
                Platform:{" "}
                <span className="text-primary">
                  {platformName.toUpperCase()}
                </span>
              </h5>
              <div style={{ maxHeight: 500, overflowY: "auto" }}>
                {getStructuredPreview().map((story) => (
                  <Card key={story.id} className="mb-3 border">
                    <CardHeader className="py-2 bg-light">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center">
                          <Button
                            color="link"
                            size="sm"
                            className="p-0 mr-2"
                            onClick={() => handlePreviewExpandStory(story.id)}
                          >
                            <i
                              className={`fas fa-chevron-${
                                previewExpandedStories.includes(story.id)
                                  ? "down"
                                  : "right"
                              }`}
                            ></i>
                          </Button>
                          <div>
                            <strong className="text-primary">
                              <i className="fas fa-book mr-2"></i>
                              {story.name}
                            </strong>
                          </div>
                        </div>
                        <div className="d-flex align-items-center">
                          <Badge
                            color={
                              story.mode === "full" ? "primary" : "primary"
                            }
                            className="mr-2"
                          >
                            {story.mode === "full"
                              ? `Full Story (${story.totalChapters} chapters)`
                              : `${story.selectedChaptersCount} of ${story.totalChapters} chapters`}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>

                    <Collapse
                      isOpen={previewExpandedStories.includes(story.id)}
                    >
                      <CardBody className="pt-2">
                        {story.chapters.map((chapter) => (
                          <Card
                            key={chapter.id}
                            className="mb-2 border-left-primary"
                          >
                            <CardBody className="py-2">
                              <div className="d-flex justify-content-between align-items-center">
                                <div className="d-flex align-items-center">
                                  <Button
                                    color="link"
                                    size="sm"
                                    className="p-0 mr-2"
                                    onClick={() =>
                                      handlePreviewExpandChapter(chapter.id)
                                    }
                                  >
                                    <i
                                      className={`fas fa-chevron-${
                                        previewExpandedChapters.includes(
                                          chapter.id
                                        )
                                          ? "down"
                                          : "right"
                                      }`}
                                    ></i>
                                  </Button>
                                  <div>
                                    <strong className="text-primary">
                                      <i className="fas fa-folder mr-2"></i>
                                      {chapter.name}
                                    </strong>
                                  </div>
                                </div>
                                <div>
                                  <Badge
                                    color={
                                      chapter.mode === "full"
                                        ? "primary"
                                        : "warning"
                                    }
                                    size="sm"
                                  >
                                    {chapter.mode === "full"
                                      ? `Full Chapter (${chapter.totalItems} items)`
                                      : `${chapter.selectedItemsCount} of ${chapter.totalItems} items`}
                                  </Badge>
                                </div>
                              </div>

                              <Collapse
                                isOpen={previewExpandedChapters.includes(
                                  chapter.id
                                )}
                              >
                                <div className="mt-2 ml-4">
                                  {chapter.items.length > 0 ? (
                                    <Row>
                                      {chapter.items.map((item) => (
                                        <Col
                                          md="6"
                                          key={item.id}
                                          className="mb-1"
                                        >
                                          <div className="d-flex align-items-center">
                                            <i className="fas fa-cube mr-2 text-primary"></i>
                                            <small className="text-dark">
                                              {item.name}
                                            </small>
                                          </div>
                                        </Col>
                                      ))}
                                    </Row>
                                  ) : (
                                    <div className="text-center text-muted">
                                      <small>No items in this chapter</small>
                                    </div>
                                  )}
                                </div>
                              </Collapse>
                            </CardBody>
                          </Card>
                        ))}

                        {story.chapters.length === 0 && (
                          <div className="text-center text-muted">
                            <small>No chapters selected in this story</small>
                          </div>
                        )}
                      </CardBody>
                    </Collapse>
                  </Card>
                ))}
              </div>

              <div className="mt-3 d-flex justify-content-between align-items-center">
                <div>
                  {/* <Badge color="primary" className="mr-2">
                    {getTotalMappings()} items will be mapped
                  </Badge> */}
                  <Badge color="primary" className="mr-2">
                    {selectedContent.stories.length} stories selected
                  </Badge>
                  <Badge color="primary" style={{ fontWeight: 600 }}>
                    {selectedContent.chapters.length} individual chapters
                  </Badge>
                </div>
                <div>
                  <Button
                    color="outline-primary"
                    size="sm"
                    onClick={() => {
                      // Expand all stories
                      const allStoryIds = getStructuredPreview().map(
                        (s) => s.id
                      );
                      setPreviewExpandedStories(allStoryIds);
                      // Expand all chapters
                      const allChapterIds = getStructuredPreview()
                        .flatMap((s) => s.chapters)
                        .map((c) => c.id);
                      setPreviewExpandedChapters(allChapterIds);
                    }}
                    className="mr-2"
                  >
                    <i className="fas fa-expand-alt mr-1"></i>
                    Expand All
                  </Button>
                  <Button
                    color="outline-secondary"
                    size="sm"
                    onClick={() => {
                      setPreviewExpandedStories([]);
                      setPreviewExpandedChapters([]);
                    }}
                  >
                    <i className="fas fa-compress-alt mr-1"></i>
                    Collapse All
                  </Button>
                </div>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            color="secondary"
            onClick={() => {
              setPreviewModalOpen(false);
              setPendingSave(false);
            }}
          >
            Close
          </Button>
          {modalMode === "submit" && (
            <Button
              color="primary"
              onClick={handleConfirmSave}
              disabled={saving}
            >
              {saving ? (
                <Spinner size="sm" color="light" className="mr-2" />
              ) : (
                <i className="fas fa-save mr-2"></i>
              )}
              Confirm & Save
            </Button>
          )}
        </ModalFooter>
      </Modal>
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              {platformName ? `${platformName.toUpperCase()} - TRAINING DATA MANAGER` : "TRAINING DATA MANAGER"}
            </h3>

            {/* Quick Actions & Search */}
            <Card className="shadow mb-4">
              <CardHeader className="border-0">
                <Row className="align-items-center">
                  <div className="col">
                    <h4 className="mb-0">Quick Actions</h4>
                    <p className="text-muted mb-0" style={{ fontSize: "1rem" }}>
                      Bulk operations and search functionality
                    </p>
                  </div>
                  <div className="col-auto">
                    {existingMappings.length > 0 && (
                      <Badge color="primary" className="mr-2">
                        {existingMappings.length} existing mappings
                      </Badge>
                    )}
                    {getTotalMappings() > 0 && (
                      <Badge color="primary" className="mr-2">
                        {getTotalMappings()} new mappings will be created
                      </Badge>
                    )}
                  </div>
                </Row>
              </CardHeader>
              <CardBody>
                <Row className="align-items-center">
                  <Col md="4">
                    <InputGroup>
                      <InputGroupText>
                        <i className="fas fa-search"></i>
                      </InputGroupText>
                      <Input
                      className="pl-1"
                        placeholder="Search stories, chapters, and items..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {searchTerm && (
                        <Button
                          color="outline-secondary"
                          size="sm"
                          onClick={() => setSearchTerm("")}
                          style={{
                            borderLeft: "none",
                            borderTopLeftRadius: 0,
                            borderBottomLeftRadius: 0,
                          }}
                        >
                          <i className="fas fa-times"></i>
                        </Button>
                      )}
                    </InputGroup>
                  </Col>
                  <Col md="8">
                    <div className="d-flex justify-content-end">
                      <ButtonGroup className="mr-3">
                        <Button
                          color="primary"
                          size="sm"
                          className="mr-2"
                          onClick={() => handleBulkStorySelection("full")}
                        >
                          <i className="fas fa-check-double mr-1"></i>
                          Select All Stories (Full)
                        </Button>
                        {/* <Button
                          color="primary"
                          size="sm"
                          className="mr-2"
                          onClick={() => handleBulkStorySelection("chapters")}
                        >
                          <i className="fas fa-list mr-1"></i>
                          Select All Stories (Chapters)
                        </Button> */}
                        <Button
                          color="secondary"
                          size="sm"
                          onClick={handleClearAll}
                        >
                          <i className="fas fa-times mr-1"></i>
                          Clear All
                        </Button>
                      </ButtonGroup>
                    </div>
                  </Col>
                </Row>
              </CardBody>
            </Card>

            {/* Content Selection */}
            <Card className="shadow mb-4">
              <CardHeader className="border-0">
                <Row className="align-items-center">
                  <div className="col">
                    <h4 className="mb-0">Content Selection</h4>
                    <p className="text-muted mb-0" style={{ fontSize: "1rem" }}>
                      {searchTerm.trim() ? (
                        <>
                          Showing {filteredStories.length} result
                          {filteredStories.length !== 1 ? "s" : ""} for "
                          {searchTerm}"
                          {filteredStories.length > 0 && (
                            <small className="d-block mt-1">
                              <i className="fas fa-lightbulb mr-1"></i>
                              Matching content is automatically expanded and
                              highlighted
                            </small>
                          )}
                        </>
                      ) : (
                        "Browse and select stories, chapters, and items for training"
                      )}
                    </p>
                  </div>
                </Row>
              </CardHeader>
              <CardBody>
                {loadingStories ? (
                  <div className="text-center py-4">
                    <Spinner color="primary" />
                    <p className="mt-2 text-muted">Loading stories...</p>
                  </div>
                ) : (
                  <div>
                    {filteredStories.map((story) => (
                      <Card key={story.storyId} className="mb-3 border">
                        <CardHeader className="py-3 bg-light">
                          <div className="d-flex justify-content-between align-items-center flex-wrap">
                            <div className="d-flex align-items-center">
                              <Button
                                color="link"
                                size="sm"
                                className="p-0"
                                onClick={() => handleExpandStory(story.storyId)}
                                style={{
                                  minWidth: "28px",
                                  minHeight: "28px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  marginRight: "10px",
                                }}
                              >
                                <i
                                  className={`fas fa-chevron-${
                                    expandedStories.includes(story.storyId)
                                      ? "down"
                                      : "right"
                                  }`}
                                  style={{
                                    fontSize: "15px",
                                    color: "#2d3748",
                                    fontWeight: "600",
                                  }}
                                ></i>
                              </Button>
                              <div>
                                <h6
                                  className="mb-0"
                                  style={{
                                    fontSize: "0.9rem",
                                    letterSpacing: "0.01em",
                                    fontWeight: "800",
                                    color: "#1a365d",
                                    marginBottom: "4px",
                                  }}
                                >
                                  <i className="fas fa-book mr-2 text-primary"></i>
                                  {highlightText(story.storyName, searchTerm)}
                                </h6>
                                <small
                                  style={{
                                    color: "#4a5568",
                                    fontSize: "0.9rem",
                                    fontWeight: "500",
                                    display: "block",
                                    marginTop: "2px",
                                  }}
                                >
                                  {/* {story.description ||
                                    "No description available"} */}
                                </small>
                              </div>
                            </div>
                            <div className="d-flex justify-content-end align-items-center mt-2 mt-md-0">
                              {isStorySelected(story.storyId) && (
                                <Badge color="primary" className="mr-2">
                                  {getStorySelectionMode(story.storyId) ===
                                  "full"
                                    ? `${getSelectedChaptersCount(
                                        story.storyId
                                      )} Chapters (Full Story)`
                                    : `${getSelectedChaptersCount(
                                        story.storyId
                                      )} Chapters`}
                                </Badge>
                              )}
                              <ButtonGroup size="sm">
                                <Button
                                  className="mr-2"
                                  color={
                                    getStorySelectionMode(story.storyId) ===
                                    "full"
                                      ? "primary"
                                      : "outline-primary"
                                  }
                                  onClick={() =>
                                    handleStorySelection(story, "full")
                                  }
                                >
                                  <i className="fas fa-check-double mr-1"></i>
                                  Full Story
                                </Button>
                                <Button
                                  className="mr-2"
                                  color={
                                    getStorySelectionMode(story.storyId) ===
                                    "chapters"
                                      ? "primary"
                                      : "outline-primary"
                                  }
                                  onClick={() =>
                                    handleStorySelection(story, "chapters")
                                  }
                                >
                                  <i className="fas fa-list mr-1"></i>
                                  Select Chapters
                                </Button>
                                {isStorySelected(story.storyId) && (
                                  <Button
                                    color="outline-danger"
                                    onClick={() =>
                                      handleStorySelection(story, "remove")
                                    }
                                  >
                                    <i className="fas fa-times"></i>
                                  </Button>
                                )}
                              </ButtonGroup>
                            </div>
                          </div>
                        </CardHeader>

                        {/* Chapters Section */}
                        <Collapse
                          isOpen={expandedStories.includes(story.storyId)}
                        >
                          <CardBody className="pt-0">
                            {loadingChapters[story.storyId] ? (
                              <div className="text-center py-3">
                                <Spinner color="primary" size="sm" />
                                <span className="ml-2 text-muted">
                                  Loading chapters...
                                </span>
                              </div>
                            ) : (
                              <div className="ml-4">
                                <div className="d-flex justify-content-between align-items-center mb-3 pt-2">
                                  <h6
                                    className="mb-0"
                                    style={{
                                      color: "#4a5568",
                                      fontSize: "0.75rem",
                                      fontWeight: "600",
                                    }}
                                  >
                                    <i className="fas fa-folder mr-1"></i>
                                    Chapters in{" "}
                                    {highlightText(story.storyName, searchTerm)}
                                    {getSelectedChaptersCount(story.storyId) >
                                      0 && (
                                      <Badge color="primary" className="ml-2">
                                        {getSelectedChaptersCount(
                                          story.storyId
                                        )}{" "}
                                        selected
                                      </Badge>
                                    )}
                                  </h6>
                                  <div>
                                    <Button
                                      color="primary"
                                      size="sm"
                                      onClick={() =>
                                        handleSelectAllChaptersInStory(
                                          story.storyId
                                        )
                                      }
                                      className="mr-1"
                                    >
                                      <i className="fas fa-check-double mr-1"></i>
                                      Select All Chapters
                                    </Button>
                                    <Button
                                      color="secondary"
                                      size="sm"
                                      onClick={() =>
                                        handleClearAllChaptersInStory(
                                          story.storyId
                                        )
                                      }
                                    >
                                      <i className="fas fa-times mr-1"></i>
                                      Clear All Chapters
                                    </Button>
                                  </div>
                                </div>
                                {(chapters[story.storyId] || []).map(
                                  (chapter) => (
                                    <Card
                                      key={chapter.chapterId}
                                      className={`mb-2 border-left-primary ${
                                        isChapterSelectedInStory(
                                          chapter.chapterId,
                                          story.storyId
                                        )
                                          ? "border-primary bg-light"
                                          : ""
                                      }`}
                                    >
                                      <CardBody className="py-2">
                                        <div className="d-flex justify-content-between align-items-center">
                                          <div className="d-flex align-items-center">
                                            <Button
                                              color="link"
                                              size="sm"
                                              className="p-0"
                                              onClick={() =>
                                                handleExpandChapter(
                                                  chapter.chapterId
                                                )
                                              }
                                              style={{
                                                minWidth: "28px",
                                                minHeight: "32px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                marginRight: "8px",
                                              }}
                                            >
                                              <i
                                                className={`fas fa-chevron-${
                                                  expandedChapters.includes(
                                                    chapter.chapterId
                                                  )
                                                    ? "down"
                                                    : "right"
                                                }`}
                                                style={{
                                                  fontSize: "14px",
                                                  color: "#4a5568",
                                                }}
                                              ></i>
                                            </Button>
                                            <FormGroup
                                              check
                                              className="mr-3 mb-0"
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                minHeight: "32px",
                                              }}
                                            >
                                              <Input
                                                type="checkbox"
                                                checked={isChapterSelectedInStory(
                                                  chapter.chapterId,
                                                  story.storyId
                                                )}
                                                onChange={() =>
                                                  handleChapterSelectionInStory(
                                                    chapter.chapterId,
                                                    story.storyId
                                                  )
                                                }
                                                style={{
                                                  width: "16px",
                                                  height: "16px",
                                                  margin: "0",
                                                  opacity:
                                                    isChapterPartiallySelected(
                                                      chapter.chapterId,
                                                      story.storyId
                                                    )
                                                      ? 0.6
                                                      : 1,
                                                }}
                                              />
                                            </FormGroup>
                                            <div
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                minHeight: "32px",
                                              }}
                                            >
                                              <strong
                                                style={{
                                                  fontSize: "0.85rem",
                                                  color: "#2c3e50",
                                                  fontWeight: "600",
                                                  lineHeight: "1.2",
                                                  marginLeft: "5px",
                                                }}
                                              >
                                                {highlightText(
                                                  chapter.chapterName,
                                                  searchTerm
                                                )}
                                              </strong>
                                            </div>
                                          </div>
                                          <div className="d-flex align-items-center">
                                            {(isChapterSelected(
                                              chapter.chapterId
                                            ) ||
                                              isChapterSelectedInStory(
                                                chapter.chapterId,
                                                story.storyId
                                              ) ||
                                              isChapterPartiallySelected(
                                                chapter.chapterId,
                                                story.storyId
                                              ) ||
                                              isChapterPartiallySelected(
                                                chapter.chapterId,
                                                story.storyId
                                              )) && (
                                              <Badge
                                                color="primary"
                                                className="mr-2"
                                                style={{
                                                  minHeight: "20px",
                                                  display: "flex",
                                                  alignItems: "center",
                                                }}
                                              >
                                                {isChapterPartiallySelected(
                                                  chapter.chapterId,
                                                  story.storyId
                                                )
                                                  ? `${getSelectedItemsCount(
                                                      chapter.chapterId
                                                    )} items selected`
                                                  : "Full Chapter"}
                                              </Badge>
                                            )}
                                            <ButtonGroup size="sm">
                                              <Button
                                                color={
                                                  // Chapter is in "full" mode if:
                                                  // 1. Selected via Full Chapter button, OR
                                                  // 2. Selected via checkbox (story selection)
                                                  getChapterSelectionMode(
                                                    chapter.chapterId
                                                  ) === "full" ||
                                                  isChapterSelectedInStory(
                                                    chapter.chapterId,
                                                    story.storyId
                                                  )
                                                    ? "primary"
                                                    : "outline-primary"
                                                }
                                                onClick={() =>
                                                  handleChapterSelection(
                                                    chapter,
                                                    story.storyId,
                                                    "full"
                                                  )
                                                }
                                                style={{
                                                  minHeight: "32px",
                                                  marginRight: "10px",
                                                }}
                                              >
                                                <i className="fas fa-check-double mr-1"></i>
                                                Full Chapter
                                              </Button>
                                              <Button
                                                color={
                                                  getChapterSelectionMode(
                                                    chapter.chapterId
                                                  ) === "items"
                                                    ? "primary"
                                                    : "outline-primary"
                                                }
                                                onClick={() =>
                                                  handleChapterSelection(
                                                    chapter,
                                                    story.storyId,
                                                    "items"
                                                  )
                                                }
                                                style={{ minHeight: "32px" }}
                                              >
                                                <i className="fas fa-cube mr-1"></i>
                                                Select Items
                                              </Button>
                                            </ButtonGroup>
                                          </div>
                                        </div>

                                        {/* Items Section */}
                                        <Collapse
                                          isOpen={expandedChapters.includes(
                                            chapter.chapterId
                                          )}
                                        >
                                          <div className="mt-3 ml-4">
                                            {loadingItems[chapter.chapterId] ? (
                                              <div className="text-center py-2">
                                                <Spinner
                                                  color="primary"
                                                  size="sm"
                                                />
                                                <span className="ml-2 text-muted">
                                                  Loading items...
                                                </span>
                                              </div>
                                            ) : (
                                              <div>
                                                <div className="d-flex justify-content-between align-items-center mb-2">
                                                  <h6
                                                    className="mb-0"
                                                    style={{
                                                      color: "#4a5568",
                                                      fontSize: "0.7rem",
                                                      fontWeight: "600",
                                                    }}
                                                  >
                                                    <i className="fas fa-cube mr-1"></i>
                                                    Items in{" "}
                                                    {highlightText(
                                                      chapter.chapterName,
                                                      searchTerm
                                                    )}
                                                    {getSelectedItemsCount(
                                                      chapter.chapterId
                                                    ) > 0 && (
                                                      <Badge
                                                        color="primary"
                                                        style={{ fontSize: "0.6rem" }}
                                                        className="ml-2"
                                                      >
                                                        {getSelectedItemsCount(
                                                          chapter.chapterId
                                                        )}{" "}
                                                        selected
                                                      </Badge>
                                                    )}
                                                  </h6>
                                                  <div>
                                                    <Button
                                                      color="primary"
                                                      size="sm"
                                                      onClick={() =>
                                                        handleSelectAllItemsInChapter(
                                                          chapter.chapterId
                                                        )
                                                      }
                                                      className="mr-1"
                                                    >
                                                      <i className="fas fa-check-double mr-1"></i>
                                                      Select All Items
                                                    </Button>
                                                    <Button
                                                      color="secondary"
                                                      size="sm"
                                                      onClick={() =>
                                                        handleClearAllItemsInChapter(
                                                          chapter.chapterId
                                                        )
                                                      }
                                                    >
                                                      <i className="fas fa-times mr-1"></i>
                                                      Clear All
                                                    </Button>
                                                  </div>
                                                </div>
                                                <Row>
                                                  {(
                                                    items[chapter.chapterId] ||
                                                    []
                                                  )
                                                    .filter(
                                                      (item) =>
                                                        item.is_deleted !== 1
                                                    ) // <-- Filter out deleted items
                                                    .map((item) => (
                                                      <Col
                                                        md="6"
                                                        key={
                                                          item.id || item.itemId
                                                        }
                                                        className="mb-2"
                                                      >
                                                        <div
                                                          className={`border rounded p-2 ${
                                                            isItemSelected(
                                                              item,
                                                              chapter.chapterId
                                                            )
                                                              ? "bg-primary text-white"
                                                              : "bg-light"
                                                          }`}
                                                        >
                                                          <div className="d-flex align-items-center justify-content-between">
                                                            <div>
                                                              <strong
                                                                style={{
                                                                  fontSize:
                                                                    "0.8rem",
                                                                  fontWeight:
                                                                    "600",
                                                                  color:
                                                                    isItemSelected(
                                                                      item,
                                                                      chapter.chapterId
                                                                    )
                                                                      ? "#ffffff"
                                                                      : "#2d3748",
                                                                }}
                                                              >
                                                                {highlightText(
                                                                  item.name ||
                                                                    item.itemName,
                                                                  searchTerm
                                                                )}
                                                              </strong>
                                                              <br />
                                                              <small
                                                                className={
                                                                  isItemSelected(
                                                                    item,
                                                                    chapter.chapterId
                                                                  )
                                                                    ? "text-white-50"
                                                                    : "text-muted"
                                                                }
                                                                style={{
                                                                  fontSize:
                                                                    "0.75rem",
                                                                  fontWeight:
                                                                    "600",
                                                                }}
                                                              >
                                                                {item.question ||
                                                                  "No question"}
                                                              </small>
                                                            </div>
                                                            <FormGroup
                                                              check
                                                              className="mb-0"
                                                            >
                                                              <Input
                                                                type="checkbox"
                                                                checked={isItemSelected(
                                                                  item,
                                                                  chapter.chapterId
                                                                )}
                                                                onChange={() =>
                                                                  handleItemSelection(
                                                                    item,
                                                                    chapter.chapterId
                                                                  )
                                                                }
                                                                style={{
                                                                  verticalAlign:
                                                                    "middle",
                                                                  marginTop:
                                                                    "-2px",
                                                                }}
                                                              />
                                                            </FormGroup>
                                                          </div>
                                                        </div>
                                                      </Col>
                                                    ))}
                                                </Row>

                                                {(
                                                  items[chapter.chapterId] || []
                                                ).length === 0 && (
                                                  <div className="text-center py-2">
                                                    <small className="text-muted">
                                                      No items found in this
                                                      chapter
                                                    </small>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </Collapse>
                                      </CardBody>
                                    </Card>
                                  )
                                )}
                                {(chapters[story.storyId] || []).length ===
                                  0 && (
                                  <div className="text-center py-2">
                                    <small className="text-muted">
                                      No chapters found in this story
                                    </small>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardBody>
                        </Collapse>
                      </Card>
                    ))}

                    {filteredStories.length === 0 && (
                      <div className="text-center py-4">
                        <i className="fas fa-search fa-2x text-muted mb-2"></i>
                        <p className="text-muted">
                          {searchTerm
                            ? "No stories, chapters, or items found matching your search"
                            : "No stories available"}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Action Buttons */}
            <Card className="shadow">
              <CardBody>
                <div className="d-flex flex-wrap justify-content-between align-items-center">
                  <div className="mb-2 mb-md-0">
                    {getTotalMappings() > 0 && (
                      <small className="text-muted">
                        <i className="fas fa-primary-circle mr-1"></i>
                        Ready to create {getTotalMappings()} mappings for{" "}
                        <strong>{platformName.toUpperCase()}</strong>
                      </small>
                    )}
                  </div>
                  <div className="d-flex flex-wrap">
                    {/* <Button
                      color="primary"
                      onClick={handlePreviewMappings}
                      disabled={saving || getTotalMappings() === 0}
                      className="mr-2 mb-2"
                    >
                      <i className="fas fa-eye mr-1"></i>
                      Preview
                    </Button> */}
                    {/* <Button
                      color="secondary"
                      onClick={handleClearAll}
                      disabled={saving}
                      className="mr-2 mb-2"
                    >
                      <i className="fas fa-times mr-1"></i>
                      Clear All
                    </Button> */}
                    <Button
                      color="primary"
                      onClick={handleSave}
                      disabled={saving || getTotalMappings() === 0}
                      className="mb-2"
                    >
                      {saving ? (
                        <>
                          <Spinner size="sm" color="light" className="mr-2" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-save mr-2"></i>
                          Save Configuration
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </Row>
      </Container>

      {/* Custom Toast Component */}
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        position={toast.position}
        onClose={hideToast}
        autoHide={true}
        autoHideDelay={2000}
      />
    </>
  );
};

export default EditPlatformData;
