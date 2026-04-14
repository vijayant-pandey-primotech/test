import React, { useState, useEffect, useMemo, useRef } from "react";
import { Toast, useToast } from "components/Toast";
import {
  Card,
  CardHeader,
  CardBody,
  Container,
  Row,
  Col,
  Table,
  Button,
  Input,
  InputGroup,
  InputGroupText,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Form,
  FormGroup,
  Label,
  Spinner,
  Pagination,
  PaginationItem,
  PaginationLink,
  CardFooter,
  Alert,
} from "reactstrap";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { FaGripVertical } from "react-icons/fa";
import platformService from "services/platformService";
import itemService from "services/itemService";
import assistantService from "services/assistantService";
import axiosInstance from "utils/axiosConfig";
import { getAuthToken } from "utils/authUtils";
import { useParams, Link } from "react-router-dom";

// meta_data can be: items array [{ itemId, answerType }] OR url object { url: string } OR assistant object { assistantId: number }; optional functionId in object forms
const isMetaDataUrl = (metaData) =>
  metaData && typeof metaData === "object" && !Array.isArray(metaData) && typeof metaData.url === "string";

const isMetaDataAssistant = (metaData) =>
  metaData && typeof metaData === "object" && !Array.isArray(metaData) && (metaData.assistantId != null || metaData.assistantId === 0);

const getTaskContentType = (task) => {
  const md = task?.meta_data;
  if (isMetaDataUrl(md)) return "url";
  if (Array.isArray(md) && md.length > 0) return "items";
  if (md && typeof md === "object" && Array.isArray(md.items) && md.items.length > 0) return "items";
  return "none";
};

const getTaskContentForDisplay = (task) => {
  const md = task?.meta_data;
  if (isMetaDataUrl(md)) return md;
  if (Array.isArray(md) && md.length > 0) return md;
  if (md && typeof md === "object" && Array.isArray(md.items) && md.items.length > 0) return md.items;
  return null;
};

const PlatformTasks = () => {
  const { toast, showSuccess, showError, hideToast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [tasks, setTasks] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [activities, setActivities] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const recordsPerPage = 10;
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    platformId: "",
    activityId: "",
    contentType: "", // 'items' | 'url' | 'assistant'
    url: "",
    assistantId: "",
    items: [{ itemId: "", answerType: "", itemName: "" }],
    title: "",
    taskOrder: 0,
    isMandatory: false,
    status: "active",
    functionId: "", // optional: link to Activity (function) from Activity model, stored in meta_data
  });
  const [assistants, setAssistants] = useState([]);
  const [assistantsLoading, setAssistantsLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [functions, setFunctions] = useState([]); // Activity model list (functions)
  const [functionsLoading, setFunctionsLoading] = useState(false);
  const [isSequenceMode, setIsSequenceMode] = useState(false);
  const [reorderedTasks, setReorderedTasks] = useState(null);
  const [isSavingSequence, setIsSavingSequence] = useState(false);

  // Item autosearch (like story copy page)
  const [activeItemRowIndex, setActiveItemRowIndex] = useState(null);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [autocompleteItems, setAutocompleteItems] = useState([]);
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [isItemSearchLoading, setIsItemSearchLoading] = useState(false);
  const itemSearchTimeoutRef = useRef(null);
  const { ActivityId } = useParams();
  // Table styles
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
  };

  // Fetch platforms
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

  // Fetch assistants (for content type "assistant")
  useEffect(() => {
    const fetchAssistants = async () => {
      setAssistantsLoading(true);
      try {
        const response = await assistantService.getAssistantsList("all");
        if (response.status === 200 && response.body) {
          const list = (response.body || []).map((a) => ({
            id: a.id,
            name: a.assistantName || a.name || `Assistant ${a.id}`,
          }));
          setAssistants(list);
        }
      } catch (err) {
        console.error("Error fetching assistants:", err);
        setAssistants([]);
      } finally {
        setAssistantsLoading(false);
      }
    };
    fetchAssistants();
  }, []);

  // Fetch activities (TaskMaster entries)
  useEffect(() => {
    const fetchActivities = async () => {
      setActivitiesLoading(true);
      try {
        const API_URL = process.env.REACT_APP_PLATFORM_API_URL;
        const response = await axiosInstance.get(`${API_URL}/onboarding-tasks`, {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`,
          },
        });
        if (response.data && response.data.status === 200) {
          setActivities(response.data.body || []);
        }
      } catch (error) {
        console.error("Error fetching activities:", error);
        setActivities([]);
      } finally {
        setActivitiesLoading(false);
      }
    };
    fetchActivities();
  }, []);

  // Fetch functions (Activity model) for selected platform when in create/edit flow
  useEffect(() => {
    const platformId = formData.platformId && formData.platformId !== "" ? formData.platformId : null;
    if (!platformId) {
      setFunctions([]);
      return;
    }
    const fetchFunctions = async () => {
      setFunctionsLoading(true);
      try {
        const API_URL = process.env.REACT_APP_API_URL;
        const response = await axiosInstance.get(`${API_URL}/${platformId}/activities`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        if (response.data && response.data.status === 200) {
          setFunctions(response.data.body || []);
        } else {
          setFunctions([]);
        }
      } catch (error) {
        console.error("Error fetching functions (activities):", error);
        setFunctions([]);
      } finally {
        setFunctionsLoading(false);
      }
    };
    fetchFunctions();
  }, [formData.platformId]);

  // Fetch items
  useEffect(() => {
    const fetchItems = async () => {
      setItemsLoading(true);
      try {
        const response = await itemService.getItemsList();
        if (response.status === 200) {
          // Get unique items by itemId
          const uniqueItems = [];
          const itemMap = new Map();
          (response.body || []).forEach((item) => {
            if (!itemMap.has(item.itemId)) {
              itemMap.set(item.itemId, item);
              uniqueItems.push(item);
            }
          });
          setItems(uniqueItems);
        }
      } catch (error) {
        console.error("Error fetching items:", error);
        setItems([]);
      } finally {
        setItemsLoading(false);
      }
    };
    fetchItems();
  }, []);

  // Cleanup item search timeout on unmount
  useEffect(() => {
    return () => {
      if (itemSearchTimeoutRef.current) clearTimeout(itemSearchTimeoutRef.current);
    };
  }, []);

  // Fetch platform tasks
  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      try {
        const platformId = selectedPlatform !== "all" ? selectedPlatform : null;
        const response = await platformService.getPlatformTasks(platformId, ActivityId);
        if (response.status === 200) {
          // Sort tasks by taskOrder to maintain order
          const sortedTasks = (response.body || []).sort((a, b) => 
            (a.taskOrder || 0) - (b.taskOrder || 0)
          );
          setTasks(sortedTasks);
        } else {
          setError("Failed to load platform tasks");
        }
      } catch (err) {
        setError("Failed to load platform tasks");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [selectedPlatform, ActivityId]);

  const handleCreateClick = () => {
    setFormData({
      platformId: selectedPlatform !== "all" ? selectedPlatform : "",
      activityId: ActivityId ? String(ActivityId) : "",
      contentType: "",
      url: "",
      assistantId: "",
      items: [{ itemId: "", answerType: "", itemName: "" }],
      title: "",
      taskOrder: 0,
      isMandatory: false,
      status: "active",
      description: "",
      functionId: "",
    });
    setEditingItem(null);
    setCreateModalOpen(true);
    setActiveItemRowIndex(null);
    setShowItemDropdown(false);
    setItemSearchQuery("");
  };

  const handleEditClick = (task) => {
    setEditingItem(task);
    const raw = task.meta_data;
    // Coerce IDs to string so select value matches option value (HTML uses string)
    const platformIdStr = task.platformId != null ? String(task.platformId) : "";
    const activityIdStr = task.activityId != null ? String(task.activityId) : "";
    const functionIdStr = raw && typeof raw === "object" && !Array.isArray(raw) && raw.functionId != null ? String(raw.functionId) : "";
    const baseFields = {
      platformId: platformIdStr,
      activityId: activityIdStr,
      title: task.title ?? "",
      taskOrder: task.taskOrder ?? 0,
      isMandatory: task.isMandatory ?? false,
      status: task.status ?? "active",
      description: task.description ?? "",
      functionId: functionIdStr,
    };
    if (isMetaDataUrl(raw)) {
      setFormData({
        ...baseFields,
        contentType: "url",
        url: raw.url || "",
        assistantId: "",
        items: [{ itemId: "", answerType: "", itemName: "" }],
      });
    } else if (isMetaDataAssistant(raw)) {
      const aid = raw.assistantId != null ? String(raw.assistantId) : "";
      setFormData({
        ...baseFields,
        contentType: "",
        url: "",
        assistantId: aid,
        items: [{ itemId: "", answerType: "", itemName: "" }],
        title: task.title ?? "",
      });
    } else {
      const rawItems = Array.isArray(raw) ? raw : (raw && typeof raw === "object" && Array.isArray(raw.items) ? raw.items : []);
      const rows = rawItems.length > 0
        ? rawItems.map((e) => {
            const isObj = e && typeof e === "object" && (e.itemId != null || e.answerType);
            const itemId = isObj ? String(e.itemId ?? "") : (e != null ? String(e) : "");
            return {
              itemId,
              answerType: isObj && e.answerType ? e.answerType : "",
              itemName: itemId ? (items.find((i) => i.itemId === parseInt(itemId, 10))?.itemName || "") : "",
            };
          })
        : [{ itemId: "", answerType: "", itemName: "" }];
      setFormData({
        ...baseFields,
        contentType: "items",
        url: "",
        assistantId: "",
        items: rows,
        description: task.description ?? "",
      });
    }
    setEditModalOpen(true);
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      const response = await platformService.deletePlatformTask(itemToDelete.id);
      if (response.status === 200) {
        setTasks((prev) =>
          prev.filter((item) => item.id !== itemToDelete.id)
        );
        showSuccess(response.message || "Platform task deleted successfully!");
        setDeleteModalOpen(false);
        setItemToDelete(null);
      } else {
        showError(response.message || "Failed to delete platform task");
      }
    } catch (error) {
      console.error("Error deleting platform task:", error);
      showError(
        error.response?.data?.message || "Failed to delete platform task"
      );
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const handleFormSubmit = async () => {
    if (!formData.platformId) {
      showError("Platform is required");
      return;
    }
    if (!formData.activityId) {
      showError("Activity is required");
      return;
    }
    const validContentTypes = ["items", "url", ];
    if (!formData.contentType || !validContentTypes.includes(formData.contentType)) {
      showError("Content type is required. Please select a type.");
      return;
    }

    const isUrlContent = formData.contentType === "url";
    let metaDataPayload = null;

    const functionIdNum = formData.functionId && formData.functionId !== "" ? parseInt(formData.functionId, 10) : null;
    const hasFunctionId = functionIdNum != null && !isNaN(functionIdNum);

    if (isUrlContent) {
      const urlVal = (formData.url || "").trim();
      if (!urlVal) {
        showError("URL is required when content type is Link.");
        return;
      }
      metaDataPayload = { type: "url", url: urlVal };
      if (hasFunctionId) metaDataPayload.functionId = functionIdNum;
    } else {
      const formItems = formData.items ?? [{ itemId: "", answerType: "" }];
      const hasIncompleteItem = formItems.some(
        (row) => (row.itemId && !row.answerType) || (!row.itemId && row.answerType)
      );
      if (hasIncompleteItem) {
        showError("Each selected item must have an answer type, and each answer type must have an item.");
        return;
      }
      const itemsArray = (formData.items ?? [{ itemId: "", answerType: "" }])
        .filter((row) => row.itemId && row.answerType)
        .map((row) => ({ itemId: parseInt(row.itemId), answerType: row.answerType }));
      metaDataPayload = itemsArray.length > 0 ? itemsArray : null;
      if (metaDataPayload && hasFunctionId) {
        metaDataPayload = { items: metaDataPayload, functionId: functionIdNum };
      }
    }

    setFormLoading(true);
    try {
      const titleForPayload = formData.title.trim() ||"";
      const payload = {
        platformId: parseInt(formData.platformId),
        activityId: parseInt(formData.activityId),
        meta_data: metaDataPayload,
        title: titleForPayload,
        taskOrder: parseInt(formData.taskOrder) || 0,
        isMandatory: formData.isMandatory,
        status: formData.status,
        description: formData.description != null ? String(formData.description) : "",
      };

      let response;
      if (editingItem) {
        response = await platformService.updatePlatformTask(editingItem.id, payload);
      } else {
        response = await platformService.createPlatformTask(payload);
      }

      if (response.status === 200 || response.status === 201) {
        showSuccess(
          response.message ||
            `Platform task ${editingItem ? "updated" : "created"} successfully!`
        );
        // Refresh the list (keep same filters: platform + ActivityId)
        const platformId = selectedPlatform !== "all" ? selectedPlatform : null;
        const refreshResponse = await platformService.getPlatformTasks(platformId, ActivityId);
        if (refreshResponse.status === 200) {
          setTasks(refreshResponse.body || []);
        }
        handleFormCancel();
      } else {
        showError(response.message || "Failed to save platform task");
      }
    } catch (error) {
      console.error("Error saving platform task:", error);
      showError(
        error.response?.data?.message || "Failed to save platform task"
      );
    } finally {
      setFormLoading(false);
    }
  };

  const handleFormCancel = () => {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    setEditingItem(null);
    setFormData({
      platformId: "",
      activityId: "",
      contentType: "",
      url: "",
      assistantId: "",
      items: [{ itemId: "", answerType: "", itemName: "" }],
      title: "",
      taskOrder: 0,
      isMandatory: false,
      status: "active",
      description: "",
      functionId: "",
    });
    setActiveItemRowIndex(null);
    setShowItemDropdown(false);
    setItemSearchQuery("");
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const defaultItems = [{ itemId: "", answerType: "", itemName: "" }];

  const addItemRow = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...(Array.isArray(prev.items) ? prev.items : defaultItems), { itemId: "", answerType: "", itemName: "" }],
    }));
  };

  const removeItemRow = (index) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.items) ? prev.items : defaultItems;
      return {
        ...prev,
        items: current.length > 1 ? current.filter((_, i) => i !== index) : defaultItems,
      };
    });
  };

  const updateItemRow = (index, field, value) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.items) ? prev.items : defaultItems;
      return {
        ...prev,
        items: current.map((row, i) =>
          i === index ? { ...row, [field]: value } : row
        ),
      };
    });
  };

  // Item autosearch: focus on a row's item input
  const handleItemSearchFocus = (index) => {
    const rows = formData.items ?? defaultItems;
    const row = rows[index];
    setActiveItemRowIndex(index);
    setItemSearchQuery(row?.itemName || (row?.itemId ? getItemName(parseInt(row.itemId, 10)) : "") || "");
    setShowItemDropdown(false);
  };

  // Item autosearch: debounced search by name (like story copy page)
  const handleItemSearchChange = (index, value) => {
    setActiveItemRowIndex(index);
    setItemSearchQuery(value);
    if (value.trim() === "") {
      setFormData((prev) => {
        const current = Array.isArray(prev.items) ? prev.items : defaultItems;
        return {
          ...prev,
          items: current.map((row, i) =>
            i === index ? { ...row, itemId: "", itemName: "" } : row
          ),
        };
      });
    }
    if (itemSearchTimeoutRef.current) clearTimeout(itemSearchTimeoutRef.current);
    if (value.length > 1) {
      setIsItemSearchLoading(true);
      itemSearchTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await itemService.getItemsFromOtherStories(value.trim(), { onboardingOnly: true });
          if (response.status === 200) {
            setAutocompleteItems(response.body || []);
            setShowItemDropdown(true);
          } else {
            setAutocompleteItems([]);
            setShowItemDropdown(false);
          }
        } catch (err) {
          console.error("Error searching items:", err);
          setAutocompleteItems([]);
          setShowItemDropdown(false);
        } finally {
          setIsItemSearchLoading(false);
        }
      }, 300);
    } else {
      setAutocompleteItems([]);
      setShowItemDropdown(false);
      setIsItemSearchLoading(false);
    }
  };

  // Item autosearch: select an item from dropdown
  const handleItemSearchSelect = (index, item) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.items) ? prev.items : defaultItems;
      return {
        ...prev,
        items: current.map((row, i) =>
          i === index ? { ...row, itemId: String(item.itemId), itemName: item.itemName || "" } : row
        ),
      };
    });
    setItemSearchQuery("");
    setShowItemDropdown(false);
    setActiveItemRowIndex(null);
  };

  // Onboarding chapter items only (for Items content type select)
  const onboardingItems = useMemo(
    () =>
      (items || []).filter(
        (i) => String(i.chapterName || "").toLowerCase().trim() === "onboarding"
      ),
    [items]
  );

  const handleItemSelect = (index, itemId) => {
    const itemIdStr = itemId ? String(itemId) : "";
    const selected = onboardingItems.find((it) => String(it.itemId) === itemIdStr);
    setFormData((prev) => {
      const current = Array.isArray(prev.items) ? prev.items : defaultItems;
      return {
        ...prev,
        items: current.map((row, i) =>
          i === index
            ? { ...row, itemId: itemIdStr, itemName: selected ? selected.itemName || "" : "" }
            : row
        ),
      };
    });
  };

  // Filter and pagination - use useMemo to prevent recalculation
  const filteredItems = useMemo(() => {
    return tasks.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        Object.values(item).some(
          (value) =>
            value &&
            value.toString().toLowerCase().includes(searchTerm.toLowerCase())
        );
      return matchesSearch;
    });
  }, [tasks, searchTerm]);

  const totalPages = Math.ceil(filteredItems.length / recordsPerPage);
  const paginatedItems = useMemo(() => {
    return isSequenceMode
      ? filteredItems
      : filteredItems.slice(
          (currentPage - 1) * recordsPerPage,
          currentPage * recordsPerPage
        );
  }, [filteredItems, isSequenceMode, currentPage, recordsPerPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedPlatform]);

  const getPlatformName = (platformId) => {
    const platform = platforms.find((p) => p.id === platformId);
    return platform ? platform.name : "-";
  };

  const getActivityName = (activityId) => {
    const activity = activities.find((a) => a.taskId === activityId);
    return activity ? activity.task_type || `Task ${activityId}` : "-";
  };

  const getItemName = (itemId) => {
    if (itemId == null) return "-";
    const id = Array.isArray(itemId) ? itemId[0] : itemId;
    const item = (items || []).find((i) => i.itemId === id || i.itemId === parseInt(id, 10));
    return item ? item.itemName : "-";
  };

  // Format itemId JSON as "Item A (radio), Item B (checkbox)". Supports [{ itemId, answerType }] or legacy [id].
  const formatItemsWithAnswerType = (itemIdJson) => {
    if (!itemIdJson) return "-";
    const arr = Array.isArray(itemIdJson) ? itemIdJson : [];
    if (arr.length === 0) return "-";
    return arr
      .map((e) => {
        if (e == null) return null;
        const isObj = typeof e === "object" && e !== null;
        const id = isObj && e.itemId != null ? e.itemId : e;
        const name = id != null ? getItemName(id) : "-";
        const type = isObj && e.answerType ? e.answerType : "";
        return type ? `${name} (${type})` : name;
      })
      .filter(Boolean)
      .join(", ") || "-";
  };

  // Drag and drop functionality
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;

    // Get current filtered items (what's displayed) - use current tasks state
    const currentFiltered = tasks.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        Object.values(item).some(
          (value) =>
            value &&
            value.toString().toLowerCase().includes(searchTerm.toLowerCase())
        );
      return matchesSearch;
    });

    // Reorder the filtered items
    const items = Array.from(currentFiltered);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update task order numbers based on new position
    const updatedItems = items.map((item, index) => ({
      ...item,
      taskOrder: index + 1,
    }));

    // Store reordered items for saving
    setReorderedTasks(updatedItems);

    // Update the tasks state - replace filtered items with reordered ones
    const reorderedMap = new Map(updatedItems.map(item => [item.id, item]));
    const filteredIds = new Set(currentFiltered.map(item => item.id));
    
    setTasks(prevTasks => {
      const updatedTasks = prevTasks.map(task => {
        if (filteredIds.has(task.id)) {
          return reorderedMap.get(task.id) || task;
        }
        return task;
      });
      // Sort by taskOrder to maintain visual order
      return updatedTasks.sort((a, b) => (a.taskOrder || 0) - (b.taskOrder || 0));
    });
  };

  const handleSaveSequence = async () => {
    if (!reorderedTasks || reorderedTasks.length === 0) {
      showError("No tasks to save");
      return;
    }

    setIsSavingSequence(true);
    try {
      // Prepare tasks with new order numbers - ensure IDs are integers
      const tasksWithOrder = reorderedTasks.map((task, index) => ({
        id: parseInt(task.id),
        taskOrder: index + 1
      })).filter(task => task.id && !isNaN(task.id)); // Filter out invalid IDs

      if (tasksWithOrder.length === 0) {
        showError("No valid tasks to save");
        setIsSavingSequence(false);
        return;
      }

      console.log("Saving task order:", tasksWithOrder);
      const response = await platformService.updatePlatformTaskOrder(tasksWithOrder);
      
      if (response.status === 200) {
        showSuccess("Task order saved successfully!");
        setIsSequenceMode(false);
        setReorderedTasks(null);
        
        // Refresh the list (keep same filters)
        const platformId = selectedPlatform !== "all" ? selectedPlatform : null;
        const refreshResponse = await platformService.getPlatformTasks(platformId, ActivityId);
        if (refreshResponse.status === 200) {
          setTasks(refreshResponse.body || []);
        }
      } else {
        showError(response.error || response.message || "Failed to save task order");
      }
    } catch (error) {
      console.error("Error saving task order:", error);
      const errorMessage = error.response?.data?.error || 
                           error.response?.data?.message || 
                           error.message || 
                           "Error saving task order";
      showError(errorMessage);
      // Revert changes
      const platformId = selectedPlatform !== "all" ? selectedPlatform : null;
      const refreshResponse = await platformService.getPlatformTasks(platformId, ActivityId);
      if (refreshResponse.status === 200) {
        setTasks(refreshResponse.body || []);
      }
    } finally {
      setIsSavingSequence(false);
    }
  };

  const handleCancelSequence = () => {
    setIsSequenceMode(false);
    setReorderedTasks(null);
    // Reload original order (keep same filters)
    const platformId = selectedPlatform !== "all" ? selectedPlatform : null;
    platformService.getPlatformTasks(platformId, ActivityId).then((response) => {
      if (response.status === 200) {
        // Sort tasks by taskOrder to maintain order
        const sortedTasks = (response.body || []).sort((a, b) => 
          (a.taskOrder || 0) - (b.taskOrder || 0)
        );
        setTasks(sortedTasks);
      }
    });
  };

  // Exit sequence mode if platform changes to "all"
  useEffect(() => {
    if (selectedPlatform === "all" && isSequenceMode) {
      setIsSequenceMode(false);
      setReorderedTasks(null);
    }
  }, [selectedPlatform, isSequenceMode]);

  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <Col>
            <Card className="shadow">
              <CardBody className="text-center py-5">
                <Spinner color="primary" />
                <p className="mt-3">Loading platform tasks...</p>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <>
      <Container fluid className="pt-6">
        <Row>
          <Col>
            <h3 className="mb-4 text-white" style={{ fontSize: "1.25rem" }}>
              Platform Tasks
            </h3>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="align-items-center">
                  <Col md="4">
                    <InputGroup>
                      <InputGroupText>
                        <i className="fas fa-search" />
                      </InputGroupText>
                      <Input
                        type="text"
                        placeholder="Search tasks..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </InputGroup>
                  </Col>
                  <Col md="4">
                    <Input
                      type="select"
                      value={selectedPlatform}
                      onChange={(e) => setSelectedPlatform(e.target.value)}
                    >
                      <option value="all">All Platforms</option>
                      {(platforms || []).map((platform) => (
                        <option key={platform.id} value={platform.id}>
                          {platform.name}
                        </option>
                      ))}
                    </Input>
                  </Col>
                  <Col md="4" className="text-right">
                    {isSequenceMode ? (
                      <>
                        <Button
                          color="primary"
                          onClick={handleSaveSequence}
                          disabled={isSavingSequence || !reorderedTasks}
                          className="mr-2"
                        >
                          {isSavingSequence ? (
                            <>
                              <Spinner size="sm" className="mr-2" />
                              Saving...
                            </>
                          ) : (
                            <>
                              
                              Save Sequence
                            </>
                          )}
                        </Button>
                        <Button
                          color="secondary"
                          onClick={handleCancelSequence}
                          disabled={isSavingSequence}
                        >
                          <i className="fas fa-times mr-2" />
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                      {tasks.length > 0 && (
                        <Button
                          color="primary"
                          onClick={() => setIsSequenceMode(true)}
                          className={`mr-2 ${selectedPlatform === "all" ? "d-none" : ""}`}
                          // disabled={selectedPlatform === "all"}
                          title={selectedPlatform === "all" ? "Please select a platform to reorder tasks" : "Reorder tasks for the selected platform"}
                        >
                          Change Sequence
                        </Button>
                      )}
                        <Button
                          color="primary"
                          onClick={handleCreateClick}
                          className="btn-custom-primary"
                        >
                          <i className="fas fa-plus mr-2" />
                          Create New
                        </Button>
                      </>
                    )}
                  </Col>
                </Row>
              </CardHeader>
              <CardBody className="px-0">
                {error ? (
                  <Alert color="danger" className="m-3">
                    {error}
                  </Alert>
                ) : selectedPlatform === "all" && isSequenceMode ? (
                  <Alert color="warning" className="m-3">
                    <i className="fas fa-exclamation-triangle mr-2" />
                    Please select a specific platform to reorder tasks. Sequence mode is only available when a platform is selected.
                  </Alert>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-muted">No platform tasks found</p>
                  </div>
                ) : (
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Table className="align-items-center table-flush" style={tableStyles.table}>
                      <thead className="thead-light">
                        <tr>
                          {isSequenceMode && (
                            <th style={{ ...tableStyles.th, width: "5%" }}>DRAG</th>
                          )}
                          <th style={{ ...tableStyles.th, width: "5%" }}>ID</th>
                          <th style={{ ...tableStyles.th, width: "12%" }}>TASK NAME</th>
                          <th style={{ ...tableStyles.th, width: "12%" }}>PLATFORM</th>
                          <th style={{ ...tableStyles.th, width: "12%" }}>ACTIVITY</th>
                          <th style={{ ...tableStyles.th, width: "18%" }}>METADATA</th>
                          <th style={{ ...tableStyles.th, width: "8%" }}>ORDER</th>
                          <th style={{ ...tableStyles.th, width: "8%" }}>MANDATORY</th>
                          <th style={{ ...tableStyles.th, width: "8%" }}>STATUS</th>
                          {!isSequenceMode && (
                            <th style={{ ...tableStyles.th, width: "20%" }}>ACTIONS</th>
                          )}
                        </tr>
                      </thead>
                      <Droppable droppableId="platform-tasks">
                        {(provided) => (
                          <tbody {...provided.droppableProps} ref={provided.innerRef}>
                            {(paginatedItems || []).map((item, index) => (
                              <Draggable
                                key={item.id}
                                draggableId={item.id.toString()}
                                index={index}
                                isDragDisabled={!isSequenceMode}
                              >
                                {(providedDraggable, snapshot) => (
                                  <tr
                                    ref={providedDraggable.innerRef}
                                    {...providedDraggable.draggableProps}
                                    style={{
                                      ...providedDraggable.draggableProps.style,
                                      backgroundColor: snapshot.isDragging
                                        ? "#f8f9fa"
                                        : "white",
                                    }}
                                  >
                                    {isSequenceMode && (
                                      <td style={tableStyles.td}>
                                        <div {...providedDraggable.dragHandleProps}>
                                          <FaGripVertical className="text-muted" />
                                        </div>
                                      </td>
                                    )}
                                    <td style={tableStyles.td}>{item.id}</td>
                                    <td style={tableStyles.td}>{item.title}</td>
                                    <td style={tableStyles.td}>
                                      {getPlatformName(item.platformId)}
                                    </td>
                                    <td style={tableStyles.td}>
                                      {getActivityName(item.activityId)}
                                    </td>
                                    <td style={tableStyles.td}>
                                      {getTaskContentType(item) === "url" ? (
                                        (() => {
                                          const u = item.meta_data?.url;
                                          if (!u) return "-";
                                          const isExternal = /^https?:\/\//i.test(u);
                                          const label = u.length > 50 ? `${u.slice(0, 47)}...` : u;
                                          return isExternal ? (
                                            <a href={u} target="_blank" rel="noopener noreferrer" title={u}>{label}</a>
                                          ) : (
                                            <Link to={u} title={u}>{label}</Link>
                                          );
                                        })()
                                      ) : getTaskContentType(item) === "items" ? (
                                        formatItemsWithAnswerType(getTaskContentForDisplay(item))
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                    <td style={tableStyles.td}>
                                      <Badge color="primary">{item.taskOrder}</Badge>
                                    </td>
                                    <td style={tableStyles.td}>
                                      <Badge color={item.isMandatory ? "primary" : "secondary"}>
                                        {item.isMandatory ? "Yes" : "No"}
                                      </Badge>
                                    </td>
                                    <td style={tableStyles.td}>
                                      <Badge color={item.status === "active" ? "success" : "secondary"}>
                                        {item.status}
                                      </Badge>
                                    </td>
                                    {!isSequenceMode && (
                                      <td style={tableStyles.td}>
                                        <Button
                                          color="link"
                                          size="sm"
                                          onClick={() => handleEditClick(item)}
                                          className="mr-2"
                                        >
                                          <i className="fas fa-edit text-primary" />
                                        </Button>
                                        <Button
                                          color="link"
                                          size="sm"
                                          onClick={() => handleDeleteClick(item)}
                                        >
                                          <i className="fas fa-trash text-danger" />
                                        </Button>
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
                    </Table>
                  </DragDropContext>
                )}
              </CardBody>
              {totalPages > 1 && !isSequenceMode && (
                <CardFooter className="py-4">
                  <nav aria-label="...">
                    <Pagination
                      className="pagination justify-content-end mb-0"
                      listClassName="justify-content-end mb-0"
                    >
                      <PaginationItem disabled={currentPage === 1}>
                        <PaginationLink
                          href="#pablo"
                          onClick={(e) => {
                            e.preventDefault();
                            handlePageChange(currentPage - 1);
                          }}
                        >
                          <i className="fas fa-angle-left" />
                        </PaginationLink>
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (page) => (
                          <PaginationItem key={page} active={currentPage === page}>
                            <PaginationLink
                              href="#pablo"
                              onClick={(e) => {
                                e.preventDefault();
                                handlePageChange(page);
                              }}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      )}
                      <PaginationItem disabled={currentPage === totalPages}>
                        <PaginationLink
                          href="#pablo"
                          onClick={(e) => {
                            e.preventDefault();
                            handlePageChange(currentPage + 1);
                          }}
                        >
                          <i className="fas fa-angle-right" />
                        </PaginationLink>
                      </PaginationItem>
                    </Pagination>
                  </nav>
                </CardFooter>
              )}
            </Card>
          </Col>
        </Row>
      </Container>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={createModalOpen || editModalOpen}
        toggle={handleFormCancel}
        centered
        size="lg"
      >
        <ModalHeader toggle={handleFormCancel}>
          {editingItem ? "Edit Platform Task" : "Create Platform Task"}
        </ModalHeader>
        <ModalBody style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <Form onSubmit={(e) => { e.preventDefault(); handleFormSubmit(); }}>
          <FormGroup>
              <Label>Task Name <span className="text-danger">*</span></Label>
              <Input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange("title", e.target.value)}
                placeholder="Enter task name (e.g., Goal Selection)"
              />
            </FormGroup>
            <FormGroup>
              <Label>Platform *</Label>
              <Input
                type="select"
                value={formData.platformId}
                onChange={(e) => handleInputChange("platformId", e.target.value)}
                disabled={!!editingItem}
              >
                <option value="">Select Platform</option>
                {(platforms || []).map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name}
                  </option>
                ))}
              </Input>
              {!formData.platformId && (
                <small className="text-muted d-block mt-1">Select a platform first to load Activity and Function options.</small>
              )}
            </FormGroup>

            <FormGroup>
              <Label>Activity(Plan) <span className="text-danger">*</span></Label>
              {!formData.platformId ? (
                <Input type="select" disabled value="">
                  <option value="">Select platform first</option>
                </Input>
              ) : activitiesLoading ? (
                <Spinner size="sm" />
              ) : (
                <Input
                  type="select"
                  disabled={!!editingItem || !!ActivityId}
                  value={formData.activityId || activities.filter((activity) => activity.taskId === ActivityId)}

                  onChange={(e) => handleInputChange("activityId", e.target.value)}
                >
                  <option value="">Select Activity</option>
                  {(activities || []).map((activity) => (
                    <option key={activity.taskId} value={activity.taskId}>
                      {activity.task_type || `Task ${activity.taskId}`}
                    </option>
                  ))}
                </Input>
              )}
            </FormGroup>
            <FormGroup>
              <Label>Select Function</Label>
              {!formData.platformId ? (
                <Input type="select" disabled value="">
                  <option value="">Select platform first</option>
                </Input>
              ) : functionsLoading ? (
                <Spinner size="sm" />
              ) : (
                <Input
                  type="select"
                  value={formData.functionId || ""}
                  onChange={(e) => handleInputChange("functionId", e.target.value)}
                >
                  <option value="">None</option>
                  {(functions || []).map((fn) => (
                    <option key={fn.id} value={fn.id}>
                      {fn.activityName || `Function ${fn.id}`}
                    </option>
                  ))}
                </Input>
              )}
            </FormGroup>
            <FormGroup>
              <Label>Content type <span className="text-danger">*</span></Label>
              <Input
                type="select"
                value={formData.contentType}
                onChange={(e) => {
                  const v = e.target.value;
                  handleInputChange("contentType", v);
                }}
              >
                <option value="">Select Type</option>
                {(items || []).some((i) => String(i.chapterName || "").toLowerCase().trim() === "onboarding") && (
                  <option value="items">Items (questions)</option>
                )}
                <option value="url">Link (URL)</option>
              </Input>
            </FormGroup>
            {formData.contentType === "url" ? (
              <FormGroup>
                <Label>URL *</Label>
                <Input
                  type="text"
                  value={formData.url}
                  onChange={(e) => handleInputChange("url", e.target.value)}
                  placeholder="/community or https://example.com or /gather-assist/chat-screen/..."
                />
                <small className="text-muted">Internal path (e.g. /community) or full URL (https://...)</small>
              </FormGroup>
            ) : formData.contentType === "items" ? (
              <FormGroup>
                <Label>Items (optional, multiple)</Label>
                <small className="d-block text-muted mb-2">Select from Onboarding chapter items.</small>
                {(Array.isArray(formData.items) ? formData.items : defaultItems).map((row, index) => (
                  <div key={index} className="d-flex align-items-center mb-2 gap-2">
                    <Input
                      type="select"
                      value={row.itemId || ""}
                      onChange={(e) => handleItemSelect(index, e.target.value)}
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <option value="">Select item</option>
                      {onboardingItems.map((it) => (
                        <option key={it.itemId} value={it.itemId}>
                          {it.itemName}
                        </option>
                      ))}
                    </Input>
                    <Input
                      type="select"
                      value={row.answerType || ""}
                      onChange={(e) => updateItemRow(index, "answerType", e.target.value)}
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <option value="">Answer type</option>
                      <option value="radio">Radio</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="multiselect">Multiselect</option>
                    </Input>
                    <Button
                      type="button"
                      color="link"
                      size="sm"
                      className="text-danger p-0"
                      onClick={() => removeItemRow(index)}
                      title="Remove row"
                    >
                      <i className="fas fa-times" />
                    </Button>
                  </div>
                ))}
                <Button type="button" color="secondary" size="sm" onClick={addItemRow}>
                  <i className="fas fa-plus mr-1" /> Add item
                </Button>
              </FormGroup>
            ) : null}
            <FormGroup>
              <Label>Task Description</Label>
              <Input
                type="textarea"
                rows="3"
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                placeholder="Enter task description"
              />
            </FormGroup>
            <FormGroup check>
              <Label check>
                <Input
                  type="checkbox"
                  checked={formData.isMandatory}
                  onChange={(e) => handleInputChange("isMandatory", e.target.checked)}
                />
                Is Mandatory
              </Label>
            </FormGroup>
            <FormGroup>
              <Label>Status *</Label>
              <Input
                type="select"
                value={formData.status}
                onChange={(e) => handleInputChange("status", e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Input>
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button type="button" color="secondary" onClick={handleFormCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            color="primary"
            onClick={handleFormSubmit}
            disabled={
              formLoading ||
              !formData.platformId ||
              !formData.activityId ||
              !formData.contentType ||
              !formData.title.trim() ||
              (formData.contentType === "url"
                ? !(formData.url || "").trim()
                : (formData.items ?? []).some((row) => (row && row.itemId && !row.answerType) || (row && !row.itemId && row.answerType)))
            }
          >
            {formLoading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : editingItem ? (
              "Update"
            ) : (
              "Create"
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} toggle={handleDeleteCancel} centered>
        <ModalHeader toggle={handleDeleteCancel}>
          Delete Platform Task?
        </ModalHeader>
        <ModalBody>
          <p>
            Are you sure you want to delete "{itemToDelete?.title}"? This action
            cannot be undone.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={handleDeleteCancel}>
            Cancel
          </Button>
          <Button color="danger" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </ModalFooter>
      </Modal>

      {/* Toast */}
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

export default PlatformTasks;
