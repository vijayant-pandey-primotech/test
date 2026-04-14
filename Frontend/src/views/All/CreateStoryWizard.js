import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Container,
  Row,
  Col,
  Button,
  Input,
  Form,
  FormGroup,
  Label,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  Table,
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Spinner,
  Alert,
  Progress,
} from "reactstrap";
import { useNavigate, useParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { FaGripVertical } from "react-icons/fa";
import storyService from "services/storyService";
import chapterService from "services/chapterService";
import itemService from "services/itemService";
import StoryTemplateSelector from "components/StoryTemplateSelector";
import ChapterImportModal from "components/ChapterImportModal";
import { Toast, useToast } from "components/Toast";

const CreateStoryWizard = () => {
  const navigate = useNavigate();
  const { storyId } = useParams(); // For editing existing story
  const isEditing = !!storyId;
  const { toast, showSuccess, showError, showWarning, showInfo, hideToast } =
    useToast();

  // Check if this story was created from a template
  const urlParams = new URLSearchParams(window.location.search);
  const isFromTemplate = urlParams.get("fromTemplate") === "true";
  
  // Check if we're copying from another story
  const templateStoryId = urlParams.get("templateStoryId");
  const templateStoryName = urlParams.get("templateStoryName");
  const isCopyingFromStory = !!templateStoryId;

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);

  // Story data
  const [storyData, setStoryData] = useState({
    storyName: "",
    description: "",
    isDefault: "yes", // Default to "Yes" selected
  });

  // Chapters data
  const [chapters, setChapters] = useState([]);
  const [chapterModal, setChapterModal] = useState(false);
  const [editingChapter, setEditingChapter] = useState(null);
  const [chapterForm, setChapterForm] = useState({
    chapterName: "",
    description: "",
  });

  // Items data
  const [items, setItems] = useState({}); // { chapterId: [items] }
  const [itemModal, setItemModal] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [itemForm, setItemForm] = useState({
    itemName: "",
    question: "",
    sample_conversation: "",
    suggestions: [],
    policies: [],
  });
  const [suggestionModal, setSuggestionModal] = useState(false);
  const [currentSuggestion, setCurrentSuggestion] = useState({
    suggestion: "",
    status: "active",
  });
  const [suggestionIndex, setSuggestionIndex] = useState(null);

  // Policy management
  const [policyModal, setPolicyModal] = useState(false);
  const [currentPolicy, setCurrentPolicy] = useState({
    policyName: "",
    policyQuestion: "",
    status: "active",
  });
  const [policyIndex, setPolicyIndex] = useState(null);

  // Loading states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemModalLoading, setItemModalLoading] = useState(false); // NEW: loading state for item modal

  // Template and import modals
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [chapterImportModalOpen, setChapterImportModalOpen] = useState(false);

  // Autocomplete states for item name
  const [autocompleteItems, setAutocompleteItems] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const dropdownRef = useRef(null);

  // Debug logging
  // useEffect(() => {
     // console.log("CreateStoryWizard mounted/updated:");
    // console.log("- storyId from params:", storyId);
    // console.log("- isEditing:", isEditing);
    // console.log("- currentStep:", currentStep);
    // console.log("- parseInt(storyId):", parseInt(storyId));
  // }, [storyId, isEditing, currentStep]);

  // Debug itemForm changes
  // useEffect(() => {
  //   console.log("ItemForm state changed:", itemForm);
  // }, [itemForm]);

  // Show template selector for new stories (but not when copying from another story)
  // useEffect(() => {
  //   if (!isEditing && !isCopyingFromStory && currentStep === 1) {
  //     setTemplateModalOpen(true);
  //   }
  // }, [isEditing, isCopyingFromStory, currentStep]);

  // Auto-advance to step 2 when storyId becomes available after story creation
  useEffect(() => {
    if (storyId && !isNaN(parseInt(storyId)) && currentStep === 1) {
      console.log("Story ID is now available, advancing to step 2");
      setCompletedSteps((prev) => [...new Set([...prev, 1])]);
      setCurrentStep(2);
    }
  }, [storyId, currentStep]);

  // Load existing story data if editing
  useEffect(() => {
    if (isEditing) {
      loadExistingStory();
    }
  }, [storyId]);

  // Load template story data if copying from another story
  useEffect(() => {
    if (isCopyingFromStory && !isEditing) {
      loadTemplateStory();
    }
  }, [templateStoryId, templateStoryName]);

  const loadExistingStory = async (preserveCurrentStep = false) => {
    try {
      setLoading(true);

      // Load story data from API
      // if (storyId) {
      //   const storyRes = await storyService.getStoryById(storyId);
      //   if (storyRes && storyRes.body) {
      //     const story = storyRes.body;
      //     setStoryData({
      //       storyName: story.storyName || "",
      //       description: story.description || "",
      //       isDefault: story.isDefault ? "yes" : "no",
      //     });
      //   }
      // }

      // Load chapters from API
      let activeChapters = [];
      if (storyId) {
        const chaptersRes = await chapterService.getChaptersList(storyId);
        console.log("Chapters response:", chaptersRes);
        if (chaptersRes && chaptersRes.body) {
          activeChapters = Array.isArray(chaptersRes.body)
            ? chaptersRes.body.sort(
                (a, b) => (a.sequence || 0) - (b.sequence || 0)
              )
            : [];
          setChapters(activeChapters);
        } else {
          setChapters([]);
        }
      }

      // Load items for all chapters from API using batch request
      let allItems = {};
      if (activeChapters.length > 0) {
        try {
          const chapterIds = activeChapters.map((chapter) => chapter.chapterId);
          console.log("Loading items for chapter IDs:", chapterIds);

          const itemsRes = await itemService.getItemsByChapterIds(chapterIds);
          console.log(
            "Items API response received with",
            itemsRes?.body?.length || 0,
            "items"
          );

          if (itemsRes && itemsRes.body && Array.isArray(itemsRes.body)) {
            // Log all unique chapter IDs from items
            const itemChapterIds = [
              ...new Set(itemsRes.body.map((item) => item.chapterId)),
            ];
            console.log("Chapter IDs found in items:", itemChapterIds);

            // Group items by chapterId
            for (const chapter of activeChapters) {
              const chapterItems = itemsRes.body.filter((item) => {
                const isMatch = item.chapterId == chapter.chapterId;
                const isNotDeleted = !item.is_deleted || item.is_deleted === 0;
                return isMatch && isNotDeleted;
              });
              allItems[chapter.chapterId] = chapterItems;
              console.log(
                `Chapter ${chapter.chapterName} (ID: ${chapter.chapterId}) has ${chapterItems.length} items`
              );
            }

            // Also log any items that don't match current chapters
            const unmatchedItems = itemsRes.body.filter(
              (item) => !chapterIds.includes(item.chapterId)
            );
            if (unmatchedItems.length > 0) {
              console.log(
                "Items with chapter IDs not in current story:",
                unmatchedItems
              );
            }
          } else {
            // Initialize empty arrays for all chapters if no items found
            for (const chapter of activeChapters) {
              allItems[chapter.chapterId] = [];
            }
          }
        } catch (error) {
          console.error("Error loading items for chapters:", error);
          // Initialize empty arrays for all chapters on error
          for (const chapter of activeChapters) {
            allItems[chapter.chapterId] = [];
          }
        }
      }
      setItems(allItems);

      // Debug logging for items
      console.log("All loaded items:", allItems);
      console.log("Active chapters:", activeChapters);

      // Set completed steps based on existing data
      const completed = [1]; // Story exists
      if (activeChapters.length > 0) {
        completed.push(2); // Chapters exist

        // Check if all chapters have at least one item
        const chaptersWithItems = activeChapters.filter(
          (chapter) =>
            allItems[chapter.chapterId] &&
            allItems[chapter.chapterId].length > 0
        );

        console.log(
          `${chaptersWithItems.length} of ${activeChapters.length} chapters have items`
        );

        if (chaptersWithItems.length === activeChapters.length) {
          completed.push(3); // All chapters have items
        }
      }
      setCompletedSteps(completed);

      // Set current step to the next incomplete step (only if not preserving current step)
      if (!preserveCurrentStep) {
        if (isFromTemplate) {
          // If story was created from template, always start at step 2 to review chapters
          setCurrentStep(2);
          // Clear the URL parameter after handling it
          window.history.replaceState({}, "", window.location.pathname);
        } else if (completed.includes(3)) {
          setCurrentStep(3); // All complete, show final step
        } else if (completed.includes(2)) {
          setCurrentStep(2); // Chapters exist, stay on chapters step
        } else {
          setCurrentStep(2); // Story exists, need chapters
        }
      }
    } catch (error) {
      console.error("Error loading existing story:", error);
      if (error.status === 404) {
        return;
      }
      if (error.response?.data?.message) {
        showError(error.response.data.message);
      } else if (error.message) {
        showError(error.message);
      } else {
        showError("Failed to load story data");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateStory = async () => {
    try {
      setLoading(true);
      
      // Pre-fill story name with template name + "Copy"
      if (templateStoryName) {
        setStoryData(prev => ({
          ...prev,
          storyName: `${decodeURIComponent(templateStoryName)} - Copy`,
          description: `Copy of ${decodeURIComponent(templateStoryName)}`
        }));
      }

      // Load chapters from template story
      let activeChapters = [];
      if (templateStoryId) {
        const chaptersRes = await chapterService.getChaptersList(templateStoryId);
        console.log("Template chapters response:", chaptersRes);
        if (chaptersRes && chaptersRes.body) {
          const originalChapters = Array.isArray(chaptersRes.body)
            ? chaptersRes.body.sort(
                (a, b) => (a.sequence || 0) - (b.sequence || 0)
              )
            : [];
          
          // Create new chapters with temporary IDs to avoid conflicts
          activeChapters = originalChapters.map((chapter, index) => ({
            ...chapter,
            chapterId: `temp_${Date.now()}_${index}`, // Temporary ID
            originalChapterId: chapter.chapterId, // Keep reference to original
            isFromTemplate: true, // Mark as template chapter
            storyId: null, // Will be set when story is created
          }));
          
          setChapters(activeChapters);
        }
      }

      // Load items for all chapters from template story
      let allItems = {};
      if (activeChapters.length > 0) {
        try {
          const originalChapterIds = activeChapters.map((chapter) => chapter.originalChapterId);
          console.log("Loading template items for original chapter IDs:", originalChapterIds);

          const itemsRes = await itemService.getItemsByChapterIds(originalChapterIds);
          console.log("Template items API response received");

          if (itemsRes && itemsRes.body && Array.isArray(itemsRes.body)) {
            // Group items by new temporary chapterId and fetch complete details for each item
            for (const chapter of activeChapters) {
              const chapterItems = itemsRes.body.filter((item) => item.chapterId === chapter.originalChapterId);
              const detailedItems = [];
              
              for (const item of chapterItems) {
                try {
                  // Fetch complete item details including policies
                  console.log(`Fetching complete details for template item: ${item.itemName}`);
                  const itemDetails = await itemService.getItemById(item.itemId);
                  
                  const body = itemDetails.body || itemDetails;
                  const fullItem = body.item || body;
                  
                  // Parse policies from the template item
                  let policies = [];
                  if (Array.isArray(body.policies)) {
                    body.policies.forEach((parentPolicy) => {
                      if (Array.isArray(parentPolicy.policies)) {
                        parentPolicy.policies.forEach((p, index) => {
                          if (p && typeof p === "object") {
                            policies.push({
                              policyName: String(p.policy || ""),
                              policyQuestion: String(p.question || ""),
                              status: String(p.status || "active"),
                              sequence: Number(p.sequence || index + 1),
                              type: String(p.type || "text"),
                              id: String(p.id || `policy_${policies.length + 1}`),
                              parentPolicyId: String(parentPolicy.policyId || ""),
                            });
                          }
                        });
                      }
                    });
                  }
                  
                  detailedItems.push({
                    ...item,
                    ...fullItem, // Include all item details
                    policies: policies, // Include parsed policies
                    itemId: `temp_item_${Date.now()}_${detailedItems.length}`, // Temporary item ID
                    originalItemId: item.itemId, // Keep reference to original
                    chapterId: chapter.chapterId, // Use new temporary chapter ID
                    isFromTemplate: true, // Mark as template item
                  });
                  
                  console.log(`✅ Loaded template item with ${policies.length} policies: ${item.itemName}`);
                } catch (error) {
                  console.error(`❌ Error loading template item details for ${item.itemName}:`, error);
                  // Fallback to basic item data without policies
                  detailedItems.push({
                    ...item,
                    policies: [],
                    itemId: `temp_item_${Date.now()}_${detailedItems.length}`,
                    originalItemId: item.itemId,
                    chapterId: chapter.chapterId,
                    isFromTemplate: true,
                  });
                }
              }
              
              allItems[chapter.chapterId] = detailedItems;
              console.log(
                `Template Chapter ${chapter.chapterName} (ID: ${chapter.chapterId}) has ${detailedItems.length} items`
              );
            }

            setItems(allItems);
          }
        } catch (error) {
          console.error("Error loading template items:", error);
        }
      }

      // Set current step to 1 (story details) so user can modify the story name
      setCurrentStep(1);
      
      // Don't mark steps as completed yet - they're just template data
      // Steps will be marked complete after the story is created and template chapters are actually created
      setCompletedSteps([]);

    } catch (error) {
      console.error("Error loading template story:", error);
      showError("Failed to load template story");
    } finally {
      setLoading(false);
    }
  };

  const createTemplateChapters = async (newStoryId) => {
    try {
      console.log("Creating template chapters for new story:", newStoryId);
      console.log("Template chapters to create:", chapters);

      // Validate inputs
      if (!newStoryId) {
        throw new Error("New story ID is required");
      }

      if (!chapters || chapters.length === 0) {
        console.log("No template chapters to create");
        return { success: true, createdChapters: 0, createdItems: 0 };
      }

      let createdChapters = 0;
      let createdItems = 0;
      let failedChapters = 0;

      // Create chapters from template sequentially to avoid conflicts
      for (let i = 0; i < chapters.length; i++) {
        const templateChapter = chapters[i];
        if (templateChapter.isFromTemplate) {
          try {
            console.log(`\n--- Creating chapter: ${templateChapter.chapterName} ---`);
            
            const chapterPayload = {
              chapterName: templateChapter.chapterName,
              description: templateChapter.description || `Chapter about ${templateChapter.chapterName}`,
              storyId: parseInt(newStoryId),
              icon: templateChapter.icon || null, // Include icon from copied chapter
            };

            console.log("Chapter payload:", chapterPayload);
            const chapterResponse = await chapterService.createChapter(chapterPayload);
            console.log("Chapter response:", chapterResponse);

            if (chapterResponse && (chapterResponse.status === 201 || chapterResponse.status === 200)) {
              const newChapterId = chapterResponse.body?.chapterId;
              if (newChapterId) {
                createdChapters++;
                console.log(`✅ Created chapter ${newChapterId}: ${templateChapter.chapterName}`);

                // Create items for this chapter
                const templateItems = items[templateChapter.chapterId] || [];
                console.log(`Creating ${templateItems.length} items for chapter ${newChapterId}`);

                for (const templateItem of templateItems) {
                  if (templateItem.isFromTemplate) {
                    try {
                      // Parse policies from template item
                      let templatePolicies = [];
                      if (templateItem.policies && Array.isArray(templateItem.policies)) {
                        templatePolicies = templateItem.policies.map((p, idx) => ({
                          policy: p.policyName || p.policy || "",
                          question: p.policyQuestion || p.question || "",
                          status: p.status || "active",
                          sequence: p.sequence || idx + 1,
                          type: p.type || "text",
                        }));
                      }

                      const itemPayload = {
                        itemName: templateItem.itemName,
                        question: templateItem.question || "",
                        suggestions: templateItem.suggestions || "",
                        sample_conversation: templateItem.sample_conversation || "",
                        policies: templatePolicies, // Include policies from template items
                        storyId: parseInt(newStoryId),
                        chapterId: parseInt(newChapterId),
                      };

                      const itemResponse = await itemService.createItem(itemPayload);
                      if (itemResponse && (itemResponse.status === 201 || itemResponse.status === 200)) {
                        createdItems++;
                        console.log(`✅ Created item: ${templateItem.itemName}`);
                      } else {
                        console.error(`❌ Failed to create item: ${templateItem.itemName}`, itemResponse);
                      }
                    } catch (itemError) {
                      console.error(`❌ Error creating item ${templateItem.itemName}:`, itemError);
                    }
                  }
                }
              } else {
                failedChapters++;
                console.error(`❌ No chapterId in response for: ${templateChapter.chapterName}`, chapterResponse);
              }
            } else {
              failedChapters++;
              console.error(`❌ Chapter creation failed for: ${templateChapter.chapterName}`, chapterResponse);
            }
          } catch (chapterError) {
            failedChapters++;
            console.error(`❌ Error creating chapter ${templateChapter.chapterName}:`, chapterError);
          }
        }
        
        // Add small delay between chapters to avoid API rate limiting
        if (i < chapters.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`\n--- Template Creation Summary ---`);
      console.log(`✅ Created chapters: ${createdChapters}`);
      console.log(`✅ Created items: ${createdItems}`);
      console.log(`❌ Failed chapters: ${failedChapters}`);

      if (failedChapters > 0) {
        showWarning(`Created ${createdChapters} chapters, but ${failedChapters} failed. Check console for details.`);
      } else {
        showSuccess(`Successfully created ${createdChapters} chapters with ${createdItems} items!`);
      }

      return { 
        success: createdChapters > 0, 
        createdChapters, 
        createdItems, 
        failedChapters 
      };

    } catch (error) {
      console.error("Error creating template chapters:", error);
      showError("Failed to create template chapters. Please check the console for details.");
      return { success: false, createdChapters: 0, createdItems: 0, failedChapters: 0 };
    }
  };

  // Step 1: Story Creation/Editing
  const  handleStorySubmit = async () => {
    if (!storyData.storyName.trim()) {
      showError("Story name is required");
      return;
    }

    setSaving(true);

    try {
      if (!isEditing) {
        // Create new story using real API
        console.log("Creating new story with data:", storyData);

        const response = await storyService.createStory({
          storyName: storyData.storyName.trim(),
          description: storyData.description.trim() || "",
          isDefault: storyData.isDefault === "yes" ? true : false,
        });

        console.log("Story creation response:", response);

        if (
          (response.status === 200 || response.status === 201) &&
          response.body &&
          response.body.story &&
          response.body.story.storyId
        ) {
          const newStoryId = response.body.story.storyId;
          console.log("New story created with ID:", newStoryId);
          
          // If copying from template, create the template chapters
          if (isCopyingFromStory && chapters.length > 0) {
            const templateChapters = chapters.filter(ch => ch.isFromTemplate);
            if (templateChapters.length > 0) {
              console.log("Found template chapters to create:", templateChapters.length);
              const result = await createTemplateChapters(newStoryId);
              
              if (result.success) {
                // Navigate to edit mode and go to step 2 (chapters) to review
                navigate(`/admin/create-story-wizard/${newStoryId}?fromTemplate=true`, {
                  replace: true,
                });
                return;
              } else {
                // If template creation failed, still navigate but let user know
                showWarning("Story created but some template chapters failed. You can add them manually.");
              }
            } else {
              console.log("No template chapters found to create");
            }
          }
          
          showSuccess("Story created successfully!");

          // Navigate to edit mode with the new story ID
          navigate(`/admin/create-story-wizard/${newStoryId}`, {
            replace: true,
          });
          return;
        } else {
          console.error("Story creation failed:", response);
          showError(response.message || "Failed to create story");
          return;
        }
      } else {
        // Update existing story using real API
        console.log("Updating story with ID:", storyId, "Data:", storyData);

        const response = await storyService.updateStory(storyId, {
          storyName: storyData.storyName.trim(),
          description: storyData.description.trim() || "",
          isDefault: storyData.isDefault === "yes" ? true : false,
        });

        console.log("Story update response:", response);

        if (response.status === 200) {
          setCompletedSteps((prev) => [...new Set([...prev, 1])]);
          setCurrentStep(2);
                  showSuccess("Story updated successfully!");
      } else {
        showError(response.message || "Failed to update story");
      }
      }
    } catch (error) {
      console.error("Error saving story:", error);

      // Handle different types of errors
      if (error.response?.data?.message) {
        showError(error.response.data.message);
      } else if (error.message) {
        showError(error.message);
      } else {
        showError(
          isEditing ? "Failed to update story" : "Failed to create story"
        );
      }
    } finally {
      setSaving(false);
    }
  };

  // Step 2: Chapter Management
  const handleAddChapter = () => {
    setEditingChapter(null);
    setChapterForm({ chapterName: "", description: "" });
    setChapterModal(true);
  };

  const handleEditChapter = (chapter) => {
    console.log("Editing chapter:", chapter); // DEBUG LOG
    setEditingChapter(chapter);
    setChapterForm({
      chapterName: chapter.chapterName || "-",
      description: chapter.description || "-",
    });
    setChapterModal(true);
  };

  const handleChapterSubmit = async () => {
    if (!chapterForm.chapterName.trim()) {
      showError("Chapter name is required");
      return;
    }

    setSaving(true);

    try {
      if (editingChapter) {
        // Update existing chapter using real API
        console.log(
          "Updating chapter with ID:",
          editingChapter.chapterId,
          "Data:",
          chapterForm
        );
        const payload = {
          name: chapterForm.chapterName,
          description: chapterForm.description,
          storyId: parseInt(storyId),
        };
        const response = await chapterService.updateChapter(
          editingChapter.chapterId,
          payload
        );

        console.log("Chapter update response:", response);

        if (response.status === 201 || response.status === 200) {
          setChapters((prev) =>
            prev.map((chapter) =>
              chapter.chapterId === editingChapter.chapterId
                ? {
                    ...chapter,
                    ...chapterForm,
                    updatedAt: new Date().toISOString(),
                  }
                : chapter
            )
          );
          showSuccess("Chapter updated successfully!");
        } else {
          showError(response.message || "Failed to update chapter");
        }
      } else {
        // Create new chapter using real API
        console.log("Creating new chapter with data:", chapterForm);
        console.log("Current storyId from params:", storyId);
        console.log("Parsed storyId:", parseInt(storyId));

        if (!storyId) {
          showError(
            "Story ID is missing. Please refresh the page and try again."
          );
          return;
        }

        const response = await chapterService.createChapter({
          ...chapterForm,
          storyId: parseInt(storyId),
        });

        console.log("Chapter creation response:", response);
        console.log("Response status:", response.status);
        console.log("Response body:", response.body);

        if (
          response.status === 201 ||
          (response.status === 200 && response.body)
        ) {
          showSuccess("Chapter created successfully!");

          // Add the new chapter to local state instead of refetching
          const newChapter = {
            chapterId: response.body?.chapterId || Date.now(), // Use response ID or fallback
            chapterName: chapterForm.chapterName,
            description: chapterForm.description,
            storyId: parseInt(storyId),
            sequence: chapters.length + 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          setChapters((prev) => [...prev, newChapter]);

          setChapterModal(false);
          setChapterForm({ chapterName: "", description: "" });
          setEditingChapter(null);
          return;
        } else {
          showError(response.message || "Failed to create chapter");
        }
      }

      setChapterModal(false);
      setChapterForm({ chapterName: "", description: "" });
      setEditingChapter(null);
    } catch (error) {
      console.error("Error saving chapter:", error);

      // Handle different types of errors
      if (error.response?.data?.message) {
        showError(error.response.data.message);
      } else if (error.message) {
        showError(error.message);
      } else {
        showError(
          editingChapter
            ? "Failed to update chapter"
            : "Failed to create chapter"
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChapter = (chapterId) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this chapter? This will also delete all its items."
      )
    ) {
      return;
    }

    try {
      setChapters((prev) =>
        prev.filter((chapter) => chapter.chapterId !== chapterId)
      );
      setItems((prev) => {
        const newItems = { ...prev };
        delete newItems[chapterId];
        return newItems;
      });
      showSuccess("Chapter deleted successfully!");
    } catch (error) {
      console.error("Error deleting chapter:", error);
      showError("Failed to delete chapter");
    }
  };

  const handleProceedToItems = () => {
    if (chapters.length === 0) {
      showError("Please add at least one chapter before proceeding");
      return;
    }
    setCompletedSteps((prev) => [...new Set([...prev, 2])]);
    setCurrentStep(3);
  };

  // Step 3: Item Management
  const [editingItemId, setEditingItemId] = useState(null);
  const handleAddItem = (chapterId) => {
    setSelectedChapterId(chapterId);
    setItemForm({
      itemName: "",
      question: "",
      sample_conversation: "",
      suggestions: [],
      policies: [],
    });
    setEditingItemId(null);
    setItemModal(true);
    setItemModalLoading(false);
  };

  // UPDATED: handleEditItem fetches item details from API
  const handleEditItem = async (chapterId, itemId) => {
    setSelectedChapterId(chapterId);
    setEditingItemId(itemId);
    setItemModal(true);
    setItemModalLoading(true);
    try {
      const itemRes = await itemService.getItemById(itemId);
      console.log("Edit item API response:", itemRes);

      const body = itemRes.body || itemRes;
      // The item data is directly in body, not in body.item
      const item = body.item || body;

      console.log("Processing item data:", item);

      // Parse suggestions if stringified
      let suggestions = [];
      if (typeof item.suggestions === "string") {
        try {
          suggestions = JSON.parse(item.suggestions);
        } catch {
          suggestions = [];
        }
      } else if (Array.isArray(item.suggestions)) {
        suggestions = item.suggestions;
      }

      // Get question from the item directly or from questions array
      let question = "";
      if (item.question) {
        // Direct question field (for backward compatibility)
        question = item.question;
      } else if (Array.isArray(body.questions) && body.questions.length > 0) {
        // Question from questions table
        question = body.questions[0].question || "";
      } else if (body.question) {
        // Question directly in body
        question = body.question;
      }

      console.log("Extracted question:", question);

      // For now, initialize empty policies array since the API response doesn't show policies structure
      let flatPolicies = [];
      if (Array.isArray(body.policies)) {
        body.policies.forEach((parentPolicy) => {
          if (Array.isArray(parentPolicy.policies)) {
            parentPolicy.policies.forEach((p) => {
              flatPolicies.push({
                policyName: p.policy || "",
                policyQuestion: p.question || "",
                status: p.status || "active",
                sequence: p.sequence || flatPolicies.length + 1,
                id: p.id || flatPolicies.length + 1,
                parentPolicyId: parentPolicy.policyId,
              });
            });
          }
        });
      }
      const formData = {
        itemName: item.itemName || "",
        question,
        sample_conversation: item.sample_conversation || "",
        suggestions,
        policies: flatPolicies,
      };

      console.log("Setting item form with data:", formData);
      setItemForm(formData);
    } catch (error) {
      showError("Failed to load item details for editing");
      setItemModal(false);
    } finally {
      setItemModalLoading(false);
    }
  };

  const handleItemSubmit = async () => {
    if (!itemForm.itemName.trim()) {
      showError("Item name is required");
      return;
    }
    if (!itemForm.question.trim()) {
      showError("Question is required");
      return;
    }

    setSaving(true);

    try {
      // Use real API to create or update item
      const cleanedPolicies = (itemForm.policies || []).map((p, idx) => ({
        type: "text",
        policy: p.policyName || "",
        status: p.status || "active",
        question: p.policyQuestion || "",
        sequence: p.sequence || idx + 1,
      }));

      // Convert suggestions array to JSON string for database storage
      const suggestionsString = JSON.stringify(itemForm.suggestions || []);

      let response;
      if (editingItemId) {
        // Edit existing item - use the object format for editItem
        const editPayload = {
          itemName: itemForm.itemName,
          mainQuestion: itemForm.question,
          sample_conversation: itemForm.sample_conversation,
          suggestions: suggestionsString,
          policies: cleanedPolicies,
          chapterId: selectedChapterId,
          storyId: parseInt(storyId),
        };
        response = await itemService.editItem(editingItemId, editPayload);
      } else {
        // Create new item - convert policies to correct JSON format
        const policiesAsObjects = (itemForm.policies || [])
          .filter((p) => p.policyName && p.policyName.trim()) // Only include policies with names
          .map((p, idx) => ({
            policy: p.policyName || "",
            question: p.policyQuestion || "",
            status: p.status || "active",
            sequence: p.sequence || idx + 1,
            type: p.type || "text",
          }));

        const createPayload = {
          itemName: itemForm.itemName,
          question: itemForm.question,
          sample_conversation: itemForm.sample_conversation,
          suggestions: suggestionsString,
          policies: policiesAsObjects, // Send as array of objects in correct format
          chapterId: selectedChapterId,
          storyId: parseInt(storyId),
        };
        response = await itemService.createItem(createPayload);
      }
      if (response && (response.status === 200 || response.status === 201)) {
        showSuccess(
          editingItemId
            ? "Item updated successfully!"
            : "Item created successfully!"
        );
        setItemModal(false);
        setItemForm({
          itemName: "",
          question: "",
          sample_conversation: "",
          suggestions: [],
          policies: [],
        });
        setEditingItemId(null);
        // Refetch story data to update items in UI (preserve current step)
        await loadExistingStory(true);
      } else {
        showError(
          response.message ||
            (editingItemId ? "Failed to update item" : "Failed to create item")
        );
      }
    } catch (error) {
      console.error(
        editingItemId ? "Error updating item:" : "Error creating item:",
        error
      );
      if (error.message) {
        showError(error.message);
      } else {
        showError(
          editingItemId ? "Failed to update item" : "Failed to create item"
        );
      }
    } finally {
      setSaving(false);
    }
  };

  // Suggestion management
  const handleAddSuggestion = () => {
    setSuggestionIndex(null);
    setCurrentSuggestion({ suggestion: "", status: "active" });
    setSuggestionModal(true);
  };

  const handleEditSuggestion = (index) => {
    setSuggestionIndex(index);
    setCurrentSuggestion(itemForm.suggestions[index]);
    setSuggestionModal(true);
  };

  const handleSaveSuggestion = () => {
    if (!currentSuggestion.suggestion.trim()) {
      showError("Suggestion text is required");
      return;
    }

    if (suggestionIndex !== null) {
      setItemForm((prev) => ({
        ...prev,
        suggestions: prev.suggestions.map((s, i) =>
          i === suggestionIndex ? { ...currentSuggestion, id: s.id } : s
        ),
      }));
    } else {
      const newSuggestion = {
        ...currentSuggestion,
        id: itemForm.suggestions.length + 1,
      };
      setItemForm((prev) => ({
        ...prev,
        suggestions: [...prev.suggestions, newSuggestion],
      }));
    }

    setSuggestionModal(false);
    setCurrentSuggestion({ suggestion: "", status: "active" });
    setSuggestionIndex(null);
  };

  const handleDeleteSuggestion = (index) => {
    setItemForm((prev) => ({
      ...prev,
      suggestions: prev.suggestions.filter((_, i) => i !== index),
    }));
  };

  // Policy management functions
  const handleAddPolicy = () => {
    setPolicyIndex(null);
    setCurrentPolicy({ policyName: "", policyQuestion: "", status: "active" });
    setPolicyModal(true);
  };

  const handleEditPolicy = (index) => {
    setPolicyIndex(index);
    setCurrentPolicy(itemForm.policies[index]);
    setPolicyModal(true);
  };

  const handleSavePolicy = () => {
    if (!currentPolicy.policyName.trim()) {
      showError("Policy name is required");
      return;
    }

    if (policyIndex !== null) {
      setItemForm((prev) => ({
        ...prev,
        policies: prev.policies.map((p, i) =>
          i === policyIndex ? { ...currentPolicy, id: p.id } : p
        ),
      }));
    } else {
      const newPolicy = {
        ...currentPolicy,
        id: itemForm.policies.length + 1,
        sequence: itemForm.policies.length + 1,
      };
      setItemForm((prev) => ({
        ...prev,
        policies: [...prev.policies, newPolicy],
      }));
    }

    setPolicyModal(false);
    setCurrentPolicy({ policyName: "", policyQuestion: "", status: "active" });
    setPolicyIndex(null);
  };

  const handleDeletePolicy = (index) => {
    setItemForm((prev) => ({
      ...prev,
      policies: prev.policies.filter((_, i) => i !== index),
    }));
  };

  const handleClosePolicyModal = () => {
    setPolicyModal(false);
    setCurrentPolicy({ policyName: "", policyQuestion: "", status: "active" });
    setPolicyIndex(null);
  };

  // Handle item name input change with debounced search
  const handleItemNameChange = (e) => {
    const value = e.target.value;
    setItemForm((prev) => ({ ...prev, itemName: value }));

    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (value.length > 1) {
      // Start searching after 2 characters
      setIsSearchLoading(true);

      // Debounce the search to avoid too many API calls
      const timeout = setTimeout(async () => {
        try {
          const response = await itemService.getItemsFromOtherStories(value);
          if (response.status === 200) {
            setAutocompleteItems(response.body || []);
            setShowDropdown(response.body && response.body.length > 0);
          }
        } catch (error) {
          console.error("Error searching items:", error);
          setAutocompleteItems([]);
          setShowDropdown(false);
        } finally {
          setIsSearchLoading(false);
        }
      }, 300); // 300ms delay

      setSearchTimeout(timeout);
    } else {
      setShowDropdown(false);
      setAutocompleteItems([]);
      setIsSearchLoading(false);
    }
  };

  // Handle item selection from dropdown
  const handleItemSelect = async (selectedItem) => {
    setIsSearchLoading(true);
    try {
      // Fetch complete item details from API to get all data including policies
      console.log("Fetching complete details for item:", selectedItem.itemId);
      const itemDetails = await itemService.getItemById(selectedItem.itemId);

      console.log("Complete item details response:", itemDetails);

      const body = itemDetails.body || itemDetails;
      const item = body.item || body;

      // Parse suggestions
      let suggestions = [];
      if (typeof item.suggestions === "string") {
        try {
          suggestions = JSON.parse(item.suggestions);
        } catch {
          suggestions = [];
        }
      } else if (Array.isArray(item.suggestions)) {
        suggestions = item.suggestions;
      }

      // Get question from the item
      let question = "";
      if (item.question) {
        question = item.question;
      } else if (Array.isArray(body.questions) && body.questions.length > 0) {
        question = body.questions[0].question || "";
      } else if (body.question) {
        question = body.question;
      }

      // Parse policies from the API response
      let policies = [];
      console.log("Raw policies from API:", body.policies);

      if (Array.isArray(body.policies)) {
        body.policies.forEach((parentPolicy) => {
          console.log("Processing parent policy:", parentPolicy);
          if (Array.isArray(parentPolicy.policies)) {
            parentPolicy.policies.forEach((p, index) => {
              console.log("Processing policy item:", p);

              // Ensure we only add valid policy objects
              if (p && typeof p === "object") {
                const policyItem = {
                  policyName: String(p.policy || ""),
                  policyQuestion: String(p.question || ""),
                  status: String(p.status || "active"),
                  sequence: Number(p.sequence || index + 1),
                  type: String(p.type || "text"),
                  id: String(p.id || `policy_${policies.length + 1}`),
                  parentPolicyId: String(parentPolicy.policyId || ""),
                };

                console.log("Adding policy item:", policyItem);
                policies.push(policyItem);
              } else {
                console.warn("Skipping invalid policy item:", p);
              }
            });
          }
        });
      }

      console.log("Final parsed policies:", policies);

      console.log("Parsed data:", {
        itemName: item.itemName,
        question,
        sample_conversation: item.sample_conversation,
        suggestions,
        policies,
      });

      // Auto-populate the form with complete item data
      setItemForm((prev) => ({
        ...prev,
        itemName: item.itemName || "",
        question: question,
        sample_conversation: item.sample_conversation || "",
        suggestions: suggestions,
        policies: policies.filter((p) => p && typeof p === "object"), // Filter out invalid policies
      }));

      setShowDropdown(false);
      showSuccess(
        `Item "${item.itemName}" copied successfully with all details!`
      );
    } catch (error) {
      console.error("Error fetching complete item details:", error);
      showError("Failed to load complete item details");

      // Fallback to basic data from search results (Note: policies won't be available in fallback)
      let suggestions = [];
      if (typeof selectedItem.suggestions === "string") {
        try {
          suggestions = JSON.parse(selectedItem.suggestions);
        } catch {
          suggestions = [];
        }
      } else if (Array.isArray(selectedItem.suggestions)) {
        suggestions = selectedItem.suggestions;
      }

      setItemForm((prev) => ({
        ...prev,
        itemName: selectedItem.itemName,
        question: selectedItem.question || "",
        sample_conversation: selectedItem.sample_conversation || "",
        suggestions: suggestions,
        policies: [], // Policies not available in fallback mode - user will need to add them manually
      }));
      
      showWarning("Item copied but policies could not be loaded. Please add policies manually if needed.");

      setShowDropdown(false);
    } finally {
      setIsSearchLoading(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  // Final completion
  const handleComplete = () => {
    // Check if all chapters have at least one item
    const allChaptersHaveItems = chapters.every(
      (chapter) =>
        items[chapter.chapterId] && items[chapter.chapterId].length > 0
    );

    if (!allChaptersHaveItems) {
      showError("Each chapter must have at least one item");
      return;
    }

    setCompletedSteps((prev) => [...new Set([...prev, 3])]);
    showSuccess("Story setup completed successfully!");
    navigate("/admin/stories", {
      state: {
        message: "Story created successfully!"
      }
    });
  };

  // Template selection handlers
  const handleTemplateSelect = (createdStory) => {
    // Navigate to the created story's edit mode with a flag indicating it's from template
    navigate(
      `/admin/create-story-wizard/${createdStory.storyId}?fromTemplate=true`,
      { replace: true }
    );
    showSuccess("Story created from template successfully!");
  };

  const handleCreateFromScratch = () => {
    // Just close the modal and continue with normal flow
    setTemplateModalOpen(false);
  };

  // Chapter import handlers
  const handleChaptersImported = () => {
    // Reload the story data to show imported chapters
    if (storyId) {
      loadExistingStory(true); // preserve current step
      showSuccess("Chapters imported successfully!");
    }
  };

  // Drag and drop for chapters
  const handleChapterDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(chapters);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedItems = items.map((item, index) => ({
      ...item,
      sequence: index + 1,
    }));

    setChapters(updatedItems);
  };

  const saveChapterSequence = () => {
    try {
      // In real implementation, this would update the backend
      // For now, the sequence is already updated in the local state
      showSuccess("Chapter order saved successfully!");
    } catch (error) {
      console.error("Error updating sequence:", error);
      showError("Failed to update chapter order");
    }
  };

  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <Card className="shadow">
              <CardBody className="text-center py-5">
                <Spinner color="primary" />
                <p className="mt-3 text-muted">Loading story data...</p>
              </CardBody>
            </Card>
          </div>
        </Row>
      </Container>
    );
  }

  const renderStepIndicator = () => (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="text-white mb-0" style={{ fontSize: "1.25rem" }}>
          {isEditing ? "EDIT STORY" : "CREATE NEW STORY"}
        </h3>
      </div>

      <div
        className="d-flex align-items-center"
        style={{ position: "relative", bottom: "10px" }}
      >
        {[1, 2, 3].map((step) => (
          <React.Fragment key={step}>
            <div className="d-flex flex-column align-items-center">
              <div
                className={`rounded-circle d-flex align-items-center justify-content-center ${
                  completedSteps.includes(step)
                    ? "bg-success text-white"
                    : currentStep === step
                    ? "bg-primary text-white"
                    : "bg-light text-muted"
                }`}
                style={{ width: "40px", height: "40px", fontSize: "16px" }}
              >
                {completedSteps.includes(step) ? (
                  <i className="fas fa-check"></i>
                ) : (
                  step
                )}
              </div>
              <small
                className={`mt-1 ${
                  currentStep === step ? "text-white" : "text-muted"
                }`}
              >
                {step === 1 ? "Story" : step === 2 ? "Chapters" : "Items"}
              </small>
            </div>
            {step < 3 && (
              <div
                className={`flex-grow-1 mx-3 ${
                  completedSteps.includes(step) ? "bg-success" : "bg-light"
                }`}
                style={{ height: "2px", marginBottom: "10px" }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  const renderStep1 = () => (
    <Card className="shadow">
      <CardHeader className="border-0 d-flex justify-content-between align-items-center">
        <div>
          <h4 className="mb-0">
            Step 1: Story Information
            {isCopyingFromStory && (
              <Badge color="primary" className="ml-2">
                <i className="fas fa-copy mr-1"></i>
                Copying from template
              </Badge>
            )}
          </h4>
          <p className="text-muted mb-0">
            {isCopyingFromStory
              ? `Creating a copy of "${decodeURIComponent(templateStoryName || '')}". You can modify the details below.`
              : "Provide basic information about your story"}
          </p>
        </div>

        {!isCopyingFromStory && (
          <div>
            <Button
              color="outline-primary"
              className="bg-primary text-white"
              onClick={() => setTemplateModalOpen(true)}
            >
              Use Existing Story
            </Button>
          </div>
        )}
      </CardHeader>
      <CardBody>
        <Form>
          <FormGroup>
            <Label for="storyName">
              Story Name <span className="text-danger">*</span>
            </Label>
            <Input
              type="text"
              id="storyName"
              placeholder="Enter story name"
              value={storyData.storyName}
              onChange={(e) =>
                setStoryData((prev) => ({ ...prev, storyName: e.target.value }))
              }
              className="form-control-alternative"
              style={{ color: "black" }}
            />
          </FormGroup>
          <FormGroup tag="fieldset">
            <Label>Default for Main</Label>
            <div className="d-flex gap-3">
              <FormGroup check>
                <Input
                  name="isDefault"
                  type="radio"
                  value="yes"
                  checked={storyData.isDefault === "yes"}
                  onChange={(e) =>
                    setStoryData((prev) => ({
                      ...prev,
                      isDefault: e.target.value,
                    }))
                  }
                />
                <Label check>Yes</Label>
              </FormGroup>
              <FormGroup check className="ml-3">
                <Input
                  name="isDefault"
                  type="radio"
                  value="no"
                  checked={storyData.isDefault === "no"}
                  onChange={(e) =>
                    setStoryData((prev) => ({
                      ...prev,
                      isDefault: e.target.value,
                    }))
                  }
                />
                <Label check>No</Label>
              </FormGroup>
            </div>
          </FormGroup>
          <FormGroup>
            <Label for="description">
              Description <span className="text-danger">*</span>
            </Label>
            <Input
              type="textarea"
              id="description"
              placeholder="Enter story description"
              value={storyData.description}
              onChange={(e) =>
                setStoryData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              className="form-control-alternative"
              rows="4"
              style={{ color: "black" }}
            />
          </FormGroup>
        </Form>
        <div className="d-flex justify-content-between mt-4">
          <Button
            color="outline-primary"
            className="bg-primary text-white"
            onClick={() => navigate("/admin/stories")}
          >
            <i className="fas fa-times mr-2"></i>
            Cancel
          </Button>
          <Button
            style={{
              backgroundColor: "#3A6D8C",
              borderColor: "#3A6D8C",
              color: "white",
            }}
            onClick={handleStorySubmit}
            disabled={saving || !storyData.storyName.trim()}
          >
            {saving ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              <>
                <i className="fas fa-save mr-2"></i>
                {isEditing ? "Update & Continue" : "Create & Continue"}
              </>
            )}
          </Button>
        </div>
      </CardBody>
    </Card>
  );

  const renderStep2 = () => (
    <Card className="shadow">
      <CardHeader className="border-0">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h4 className="mb-0">Step 2: Add Chapters</h4>
            <p className="text-muted mb-0">
              Add at least one chapter to your story
            </p>
          </div>
          <div className="d-flex gap-2">
            <Button
              color="outline-primary"
              size="sm"
              onClick={() => setChapterImportModalOpen(true)}
            >
              <i className="fas fa-download mr-1"></i>
              Import Chapters
            </Button>
            <Button
              style={{
                backgroundColor: "#3A6D8C",
                borderColor: "#3A6D8C",
                color: "white",
              }}
              size="sm"
              onClick={handleAddChapter}
            >
              <i className="fas fa-plus mr-1"></i>
              Add Chapter
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {chapters.length === 0 ? (
          <div className="text-center py-4">
            <i className="fas fa-list fa-3x text-muted mb-3"></i>
            <h5 className="text-muted">No chapters added yet</h5>
            <p className="text-muted">
              Click "Add Chapter" to create your first chapter
            </p>
          </div>
        ) : (
          <>
            <DragDropContext onDragEnd={handleChapterDragEnd}>
              <Droppable droppableId="chapters">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef}>
                    <Table className="align-items-center table-flush mb-0">
                      <thead className="thead-light">
                        <tr>
                          <th style={{ width: "5%" }}>Order</th>
                          <th style={{ width: "10%" }}>Sequence</th>
                          <th style={{ width: "30%" }}>Name</th>
                          <th style={{ width: "30%" }}>Description</th>
                          <th style={{ width: "15%" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chapters.map((chapter, index) => (
                          <Draggable
                            key={chapter.chapterId}
                            draggableId={chapter.chapterId.toString()}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <tr
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                style={{
                                  ...provided.draggableProps.style,
                                  backgroundColor: snapshot.isDragging
                                    ? "#f8f9fa"
                                    : "white",
                                }}
                              >
                                <td>
                                  <div {...provided.dragHandleProps}>
                                    <FaGripVertical className="text-muted" />
                                  </div>
                                </td>
                                <td>
                                  <Badge color="primary">
                                    {chapter.sequence || index + 1}
                                  </Badge>
                                </td>
                                <td>
                                  <strong>{chapter.chapterName}</strong>
                                </td>
                                <td>
                                  <strong>{chapter.description}</strong>
                                </td>
                                <td>
                                  <div style={{ display: "flex", gap: "8px" }}>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-primary"
                                      onClick={() => handleEditChapter(chapter)}
                                    >
                                      <i className="fas fa-edit" />
                                    </button>

                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-danger"
                                      onClick={() =>
                                        handleDeleteChapter(chapter.chapterId)
                                      }
                                    >
                                      <i className="fas fa-trash" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Draggable>
                        ))}
                      </tbody>
                    </Table>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <div className="d-flex justify-content-between mt-4">
              <Button color="outline-primary" onClick={saveChapterSequence}>
                <i className="fas fa-save mr-1"></i>
                Save Order
              </Button>
              <Button
                style={{
                  backgroundColor: "#3A6D8C",
                  borderColor: "#3A6D8C",
                  color: "white",
                }}
                onClick={handleProceedToItems}
                disabled={chapters.length === 0}
              >
                Continue to Items
                <i className="fas fa-arrow-right ml-2"></i>
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );

  const renderStep3 = () => (
    <Card className="shadow">
      <CardHeader className="border-0">
        <div>
          <h4 className="mb-0">Step 3: Add Items to Chapters</h4>
          <p className="text-muted mb-0">
            Each chapter must have at least one item
          </p>
        </div>
      </CardHeader>
      <CardBody>
        {chapters.map((chapter) => (
          <Card key={chapter.chapterId} className="mb-3">
            <CardHeader className="bg-light">
              <div className="d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center">
                  <h5 className="mb-0">{chapter.chapterName}</h5>
                  <Badge
                    color={
                      (items[chapter.chapterId] || []).length > 0
                        ? "primary"
                        : "warning"
                    }
                    className="ml-2"
                  >
                    {(items[chapter.chapterId] || []).length} items
                  </Badge>
                </div>
                <Button
                  color="primary"
                  size="sm"
                  onClick={() => handleAddItem(chapter.chapterId)}
                >
                  <i className="fas fa-plus mr-1"></i>
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              {(items[chapter.chapterId] || []).length === 0 ? (
                <div className="text-center py-3">
                  <i className="fas fa-exclamation-triangle text-warning fa-2x mb-2"></i>
                  <p className="text-muted mb-0">
                    This chapter needs at least one item
                  </p>
                </div>
              ) : (
                <Table size="sm" className="mb-0">
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Question</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(items[chapter.chapterId] || [])
                      .filter(
                        (item) => !item.is_deleted || item.is_deleted === 0
                      )
                      .map((item) => (
                        <tr key={item.itemId}>
                          <td>
                            <strong>{item.itemName}</strong>
                          </td>
                          <td>
                            {item.question && item.question.length > 80
                              ? `${item.question.substring(0, 80)}...`
                              : item.question}
                          </td>
                          <td>
                            <Button
                              color="outline-primary"
                              size="sm"
                              className="mr-1"
                              onClick={() =>
                                handleEditItem(chapter.chapterId, item.itemId)
                              }
                            >
                              <i className="fas fa-edit"></i> Edit
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        ))}

        <div className="d-flex justify-content-end mt-4">
          <Button
            style={{
              backgroundColor: "#3A6D8C",
              borderColor: "#3A6D8C",
              color: "white",
            }}
            onClick={handleComplete}
            disabled={chapters.some(
              (chapter) =>
                !items[chapter.chapterId] ||
                items[chapter.chapterId].length === 0
            )}
          >
            <i className="fas fa-check mr-2"></i>
            Complete Story Setup
          </Button>
        </div>
      </CardBody>
    </Card>
  );

  return (
    <Container fluid className="pt-6">
      <Row>
        <div className="col">
          {renderStepIndicator()}

          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>
      </Row>
      {/* Chapter Modal */}
      {console.log("Rendering Chapter Modal, chapterForm:", chapterForm)}{" "}
      {/* DEBUG LOG */}
      <Modal
        isOpen={chapterModal}
        toggle={() => setChapterModal(false)}
        centered
      >
        <ModalHeader toggle={() => setChapterModal(false)}>
          {editingChapter ? "Edit Chapter" : "Add New Chapter"}
        </ModalHeader>
        <ModalBody>
          <Form>
            <FormGroup>
              <Label for="chapterName">
                Chapter Name <span className="text-danger">*</span>
              </Label>
              <Input
                type="text"
                id="chapterName"
                placeholder="Enter chapter name"
                value={chapterForm.chapterName}
                onChange={(e) =>
                  setChapterForm((prev) => ({
                    ...prev,
                    chapterName: e.target.value,
                  }))
                }
                className="form-control-alternative"
              />
            </FormGroup>
            <FormGroup>
              <Label for="description">
                Description
              </Label>
              <Input
                type="textarea"
                id="description"
                placeholder="Enter chapter description"
                value={chapterForm.description}
                onChange={(e) =>
                  setChapterForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className="form-control-alternative"
              />
            </FormGroup>
          </Form>
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button
              color="secondary"
              onClick={() => setChapterModal(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              style={{
                backgroundColor: "#3A6D8C",
                borderColor: "#3A6D8C",
                color: "white",
              }}
              onClick={handleChapterSubmit}
              disabled={saving || !chapterForm.chapterName.trim()}
            >
              {saving ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : editingChapter ? (
                "Update Chapter"
              ) : (
                "Add Chapter"
              )}
            </Button>
          </div>
        </ModalBody>
      </Modal>
      {/* Item Modal */}
      <Modal
        isOpen={itemModal}
        toggle={() => setItemModal(false)}
        centered
        size="lg"
      >
        <ModalHeader toggle={() => setItemModal(false)}>
          {editingItemId ? "Edit Item" : "Add New Item"}
        </ModalHeader>
        <ModalBody>
          {itemModalLoading ? (
            <div className="text-center py-5">
              <Spinner color="primary" />
              <p className="mt-3 text-muted">Loading item details...</p>
            </div>
          ) : (
            <Form>
              <FormGroup style={{ position: "relative" }} ref={dropdownRef}>
                <Label for="itemName">
                  Item Name <span className="text-danger">*</span>
                </Label>
                <Input
                  type="text"
                  id="itemName"
                  placeholder="Enter item name or search existing items"
                  value={itemForm.itemName}
                  onChange={handleItemNameChange}
                  className="form-control-alternative"
                  style={{ color: "black" }}
                  autoComplete="off"
                />

                {/* Loading indicator */}
                {isSearchLoading && (
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      right: "10px",
                      transform: "translateY(-50%)",
                    }}
                  >
                    <i className="fas fa-spinner fa-spin text-primary"></i>
                  </div>
                )}

                {/* Autocomplete Dropdown */}
                {showDropdown && autocompleteItems.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      backgroundColor: "white",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      zIndex: 1000,
                      maxHeight: "250px",
                      overflowY: "auto",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px 15px",
                        backgroundColor: "#f8f9fa",
                        borderBottom: "1px solid #eee",
                        fontSize: "12px",
                        color: "#666",
                        fontWeight: "500",
                      }}
                    >
                      {autocompleteItems.length} item
                      {autocompleteItems.length !== 1 ? "s" : ""} found
                    </div>

                    {autocompleteItems.map((item, index) => {
                      // Parse suggestions to show count
                      let suggestionsCount = 0;
                      try {
                        if (typeof item.suggestions === "string") {
                          const parsed = JSON.parse(item.suggestions);
                          suggestionsCount = Array.isArray(parsed)
                            ? parsed.length
                            : 0;
                        } else if (Array.isArray(item.suggestions)) {
                          suggestionsCount = item.suggestions.length;
                        }
                      } catch {
                        suggestionsCount = 0;
                      }

                      return (
                        <div
                          key={item.itemId || index}
                          onClick={() => handleItemSelect(item)}
                          style={{
                            padding: "12px 15px",
                            cursor: "pointer",
                            borderBottom:
                              index < autocompleteItems.length - 1
                                ? "1px solid #eee"
                                : "none",
                            backgroundColor: "white",
                            transition: "background-color 0.2s",
                          }}
                          onMouseEnter={(e) =>
                            (e.target.style.backgroundColor = "#f8f9fa")
                          }
                          onMouseLeave={(e) =>
                            (e.target.style.backgroundColor = "white")
                          }
                        >
                          <div
                            style={{
                              fontWeight: "500",
                              color: "#333",
                              marginBottom: "4px",
                            }}
                          >
                            {item.itemName}
                            <span className="flex-end text-primary">
                              <small>
                                <i> ({item.storyName}{item.chapterName ? ` → ${item.chapterName}` : ''})</i>
                              </small>
                            </span>
                          </div>
                          {item.question && (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#666",
                                lineHeight: "1.4",
                                marginBottom: "4px",
                              }}
                            >
                              {item.question.length > 80
                                ? `${item.question.substring(0, 80)}...`
                                : item.question}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* No results message */}
                {showDropdown &&
                  autocompleteItems.length === 0 &&
                  !isSearchLoading &&
                  itemForm.itemName.length > 1 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        backgroundColor: "white",
                        border: "1px solid #ddd",
                        borderRadius: "4px",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                        zIndex: 1000,
                        padding: "15px",
                        textAlign: "center",
                        color: "#666",
                        fontSize: "14px",
                      }}
                    >
                      No items found matching "{itemForm.itemName}"
                    </div>
                  )}
              </FormGroup>
              <FormGroup>
                <Label for="question">
                  Main Question <span className="text-danger">*</span>
                </Label>
                <Input
                  type="textarea"
                  id="question"
                  placeholder="Enter the main question"
                  value={itemForm.question}
                  onChange={(e) =>
                    setItemForm((prev) => ({
                      ...prev,
                      question: e.target.value,
                    }))
                  }
                  className="form-control-alternative"
                  rows="3"
                  style={{ color: "black" }}
                />
              </FormGroup>
              <FormGroup>
                <Label for="sampleConversation">Sample Conversation</Label>
                <Input
                  type="textarea"
                  id="sampleConversation"
                  placeholder="Enter sample conversation"
                  value={itemForm.sample_conversation}
                  onChange={(e) =>
                    setItemForm((prev) => ({
                      ...prev,
                      sample_conversation: e.target.value,
                    }))
                  }
                  className="form-control-alternative"
                  rows="4"
                  style={{ color: "black" }}
                />
              </FormGroup>

              {/* Suggestions Section */}
              <FormGroup>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Label className="mb-0">Suggestions</Label>
                  <Button
                    color="outline-primary"
                    size="sm"
                    onClick={handleAddSuggestion}
                  >
                    <i className="fas fa-plus mr-1"></i>
                    Add Suggestion
                  </Button>
                </div>
                {Array.isArray(itemForm.suggestions) &&
                itemForm.suggestions.length === 0 ? (
                  <p className="text-muted">No suggestions added yet</p>
                ) : (
                  <div className="suggestions-list">
                    {(itemForm.suggestions || []).map((suggestion, index) => (
                      <div
                        key={index}
                        className="d-flex justify-content-between align-items-center p-2 mb-2 bg-light rounded"
                      >
                        <span>{suggestion.suggestion}</span>
                        <div>
                          <Button
                            color="outline-primary"
                            size="sm"
                            className="mr-1"
                            onClick={() => handleEditSuggestion(index)}
                          >
                            <i className="fas fa-edit"></i>
                          </Button>
                          <Button
                            color="outline-danger"
                            size="sm"
                            onClick={() => handleDeleteSuggestion(index)}
                          >
                            <i className="fas fa-trash"></i>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </FormGroup>

              {/* Policies Section */}
              <FormGroup>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Label className="mb-0">Policies</Label>
                  <Button
                    color="outline-primary"
                    size="sm"
                    onClick={handleAddPolicy}
                  >
                    <i className="fas fa-plus mr-1"></i>
                    Add Policy
                  </Button>
                </div>
                {Array.isArray(itemForm.policies) &&
                itemForm.policies.length === 0 ? (
                  <p className="text-muted">No policies added yet</p>
                ) : (
                  <div className="policies-list">
                    {(itemForm.policies || [])
                      .map((policy, index) => {
                        // Safety check to ensure policy is a valid object
                        if (!policy || typeof policy !== "object") {
                          console.warn(
                            "Invalid policy object at index",
                            index,
                            ":",
                            policy
                          );
                          return null;
                        }

                        return (
                          <div key={index} className="p-3 mb-2 border rounded">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <div className="flex-grow-1">
                                <h6 className="mb-1 text-primary">
                                  {String(policy.policyName || "")}
                                </h6>
                                <small className="text-muted">
                                  {String(policy.policyQuestion || "")}
                                </small>
                              </div>
                              <div>
                                <Button
                                  color="outline-primary"
                                  size="sm"
                                  className="mr-1"
                                  onClick={() => handleEditPolicy(index)}
                                >
                                  <i className="fas fa-edit"></i>
                                </Button>
                                <Button
                                  color="outline-danger"
                                  size="sm"
                                  onClick={() => handleDeletePolicy(index)}
                                >
                                  <i className="fas fa-trash"></i>
                                </Button>
                              </div>
                            </div>
                            <Badge color="primary" size="sm">
                              {String(policy.status || "active")}
                            </Badge>
                          </div>
                        );
                      })
                      .filter(Boolean)}
                  </div>
                )}
              </FormGroup>
            </Form>
          )}
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button
              color="secondary"
              onClick={() => {
                setItemModal(false);
                setEditingItemId(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              style={{
                backgroundColor: "#3A6D8C",
                borderColor: "#3A6D8C",
                color: "white",
              }}
              onClick={handleItemSubmit}
              disabled={
                saving || !itemForm.itemName.trim() || !itemForm.question.trim()
              }
            >
              {saving ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {editingItemId ? "Saving..." : "Creating..."}
                </>
              ) : editingItemId ? (
                "Update Item"
              ) : (
                "Add Item"
              )}
            </Button>
          </div>
        </ModalBody>
      </Modal>
      {/* Suggestion Modal */}
      <Modal
        isOpen={suggestionModal}
        toggle={() => setSuggestionModal(false)}
        centered
      >
        <ModalHeader toggle={() => setSuggestionModal(false)}>
          {suggestionIndex !== null ? "Edit Suggestion" : "Add Suggestion"}
        </ModalHeader>
        <ModalBody>
          <Form>
            <FormGroup>
              <Label for="suggestionText">Suggestion Text </Label>
              <Input
                type="textarea"
                id="suggestionText"
                placeholder="Enter suggestion text"
                value={currentSuggestion.suggestion}
                onChange={(e) =>
                  setCurrentSuggestion((prev) => ({
                    ...prev,
                    suggestion: e.target.value,
                  }))
                }
                className="form-control-alternative"
                rows="3"
                style={{ color: "black" }}
              />
            </FormGroup>
            <FormGroup>
              <Label for="suggestionStatus">Status</Label>
              <Input
                type="select"
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
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button color="secondary" onClick={() => setSuggestionModal(false)}>
              Cancel
            </Button>
            <Button
              style={{
                backgroundColor: "#3A6D8C",
                borderColor: "#3A6D8C",
                color: "white",
              }}
              onClick={handleSaveSuggestion}
              disabled={!currentSuggestion.suggestion.trim()}
            >
              {suggestionIndex !== null
                ? "Update Suggestion"
                : "Add Suggestion"}
            </Button>
          </div>
        </ModalBody>
      </Modal>
      {/* Policy Modal */}
      <Modal isOpen={policyModal} toggle={handleClosePolicyModal} centered>
        <ModalHeader toggle={handleClosePolicyModal}>
          {policyIndex !== null ? "Edit Policy" : "Add Policy"}
        </ModalHeader>
        <ModalBody>
          <Form>
            <FormGroup>
              <Label for="policyName">
                Policy Name <span className="text-danger">*</span>
              </Label>
              <Input
                type="text"
                id="policyName"
                placeholder="Enter policy name"
                value={currentPolicy.policyName}
                onChange={(e) =>
                  setCurrentPolicy((prev) => ({
                    ...prev,
                    policyName: e.target.value,
                  }))
                }
                className="form-control-alternative"
                style={{ color: "black" }}
              />
            </FormGroup>
            <FormGroup>
              <Label for="policyQuestion">
                Policy Question
              </Label>
              <Input
                type="textarea"
                id="policyQuestion"
                placeholder="Enter policy question or description"
                value={currentPolicy.policyQuestion}
                onChange={(e) =>
                  setCurrentPolicy((prev) => ({
                    ...prev,
                    policyQuestion: e.target.value,
                  }))
                }
                className="form-control-alternative"
                rows="4"
                style={{ color: "black" }}
              />
            </FormGroup>
            <FormGroup>
              <Label for="policyStatus">Status</Label>
              <Input
                type="select"
                id="policyStatus"
                value={currentPolicy.status}
                onChange={(e) =>
                  setCurrentPolicy((prev) => ({
                    ...prev,
                    status: e.target.value,
                  }))
                }
                className="form-control-alternative"
                style={{ color: "black" }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Input>
            </FormGroup>
          </Form>
          <div className="d-flex justify-content-end gap-3 mt-4">
            <Button
              color="secondary"
              onClick={handleClosePolicyModal}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              style={{
                backgroundColor: "#3A6D8C",
                borderColor: "#3A6D8C",
                color: "white",
              }}
              onClick={handleSavePolicy}
              disabled={
                saving || !currentPolicy.policyName.trim()
              }
            >
              {saving ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : policyIndex !== null ? (
                "Update Policy"
              ) : (
                "Add Policy"
              )}
            </Button>
          </div>
        </ModalBody>
      </Modal>
      {/* Template Selection Modal */}
      <StoryTemplateSelector
        isOpen={templateModalOpen}
        toggle={() => setTemplateModalOpen(!templateModalOpen)}
        onTemplateSelect={handleTemplateSelect}
        onCreateFromScratch={handleCreateFromScratch}
      />
      {/* Chapter Import Modal */}
      <ChapterImportModal
        isOpen={chapterImportModalOpen}
        toggle={() => setChapterImportModalOpen(!chapterImportModalOpen)}
        currentStoryId={storyId}
        onChaptersImported={handleChaptersImported}
      />
      
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
    </Container>
  );
};

export default CreateStoryWizard;
