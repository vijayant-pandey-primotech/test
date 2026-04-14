import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Form,
  FormGroup,
  Label,
  Input,
  Row,
  Col,
  Card,
  CardBody,
  Alert,
  Spinner,
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem
} from "reactstrap";
import { FaPlus, FaTrash, FaGripVertical } from "react-icons/fa";
import { Message } from "rsuite";
import { IoWarningOutline } from "react-icons/io5";
import { SiTicktick } from "react-icons/si";
import "rsuite/dist/rsuite.min.css";
import taskService from "services/taskService";
import platformService from "services/platformService";

const CreateTaskModal = ({ isOpen, toggle, task, onSuccess }) => {
  const [formData, setFormData] = useState({
    task_type: "",
    description: "",
    platform_id: "",
    story_id: "",
    fields: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [existingTasks, setExistingTasks] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [apiMessage, setApiMessage] = useState({ content: "", type: "" });
  const [platforms, setPlatforms] = useState([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);
  const [stories, setStories] = useState([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const modalBodyRef = useRef(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);

  // Default column configurations
  const defaultColumns = {
    priority: {
      label: "Priority",
      type: "select",
      required: false,
      options: [
        { id: 1, label: "High" },
        { id: 2, label: "Medium" },
        { id: 3, label: "Low" }
      ],
      placeholder: ""
    },
    description: {
      label: "Description",
      type: "textarea",
      required: false,
      options: [],
      placeholder: "Enter task description"
    }
  };

  const fieldTypes = [
    { value: "text", label: "Text Column" },
    { value: "textarea", label: "Text Area" },
    { value: "number", label: "Number Input" },
    { value: "email", label: "Email Input" },
    { value: "date", label: "Date Input" },
    { value: "time", label: "Time Input" },
    { value: "checkbox", label: "Checkbox" },
    { value: "radio", label: "Radio Buttons" },
    { value: "select", label: "Dropdown Select" },
    // { value: "file", label: "File Upload" }
  ];

  const displayTypes = [
    { value: "", label: "Select Display Type" },
    { value: "item_name", label: "Item Name" },
    { value: "item_description", label: "Item Description" }
  ];

  useEffect(() => {
    if (task) {
      // Normalize field data to use consistent naming
      const normalizedFields = (task.fields || []).map(field => {
        // If chapter_id exists but item_id is null/undefined, treat it as "all"
        const itemId = field.item_id || field.itemId;
        const chapterId = field.chapter_id || field.chapterId;
        // If chapter exists but no item_id, it means "all items"
        const normalizedItemId = (chapterId && !itemId) ? "all" : (itemId || "");
        
        return {
          ...field,
          story_id: field.story_id || field.storyId || "",
          chapter_id: chapterId || "",
          item_id: normalizedItemId,
          show_item_description: field.show_item_description,
          allowMultiple: field.allowMultiple !== undefined ? field.allowMultiple : false // Default to false for backward compatibility
        };
      });

      setFormData({
        task_type: task.task_type || "",
        description: task.description || "",
        platform_id: task.platform_id || "",
        story_id: task.story_id || "",
        fields: normalizedFields
      });
      
      // If editing and platform is selected, fetch stories
      const platformId = task.platform_id;
      if (platformId) {
        fetchStoriesForPlatform(platformId);
      }
      
      // If editing and fields have story/chapter selections, populate dropdowns
      if (normalizedFields && normalizedFields.length > 0) {
        populateFieldDropdowns(normalizedFields, platformId);
      }
    } else {
      setFormData({
        task_type: "",
        description: "",
        platform_id: "",
        story_id: "",
        fields: []
      });
    }
    setError(null);
  }, [task, isOpen]);

  // Fetch existing tasks for autocomplete
  useEffect(() => {
    const fetchExistingTasks = async () => {
      try {
        const response = await taskService.getAllTasks();
        setExistingTasks(response.data || []);
      } catch (err) {
        console.error('Error fetching existing tasks:', err);
      }
    };

    const fetchPlatforms = async () => {
      try {
        setPlatformsLoading(true);
        const response = await platformService.getAllPlatforms();
        setPlatforms(response.body || []);
      } catch (err) {
        console.error('Error fetching platforms:', err);
      } finally {
        setPlatformsLoading(false);
      }
    };

    if (isOpen) {
      fetchExistingTasks();
      fetchPlatforms();
    }
  }, [isOpen]);

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.form-group')) {
        setShowAutocomplete(false);
      }
    };

    if (showAutocomplete) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showAutocomplete]);

  // Handle auto-scroll when a new field is added
  useEffect(() => {
    if (shouldScrollToBottom) {
      // Find the scrollable container - try multiple selectors
      const findScrollableContainer = () => {
        // Try the modal body ref first
        if (modalBodyRef.current) {
          return modalBodyRef.current;
        }
        
        // Try to find the modal body by class
        const modalBody = document.querySelector('.modal-body');
        if (modalBody) {
          return modalBody;
        }
        
        // Try to find any scrollable container in the modal
        const modal = document.querySelector('.modal');
        if (modal) {
          const scrollable = modal.querySelector('[style*="overflow"]') || modal.querySelector('.scrollable-modal-body');
          if (scrollable) {
            return scrollable;
          }
        }
        
        return null;
      };
      
      const scrollToBottom = () => {
        const container = findScrollableContainer();
        if (container) {
          // Force scroll to bottom
          container.scrollTop = container.scrollHeight;
          
          // Also try smooth scroll
          if (container.scrollTo) {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: 'smooth'
            });
          }
        }
      };
      
      // Try multiple times with different delays
      scrollToBottom();
      setTimeout(scrollToBottom, 100);
      setTimeout(scrollToBottom, 300);
      setTimeout(scrollToBottom, 500);
      
      // Reset the flag
      setShouldScrollToBottom(false);
    }
  }, [shouldScrollToBottom]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Convert platform_id to number or null
    const processedValue = name === 'platform_id' ? (value === '' ? null : parseInt(value)) : value;

    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));

    // Handle autocomplete for task type
    if (name === 'task_type') {
      if (value.trim().length >= 3) {
        const filtered = existingTasks.filter(existingTask =>
          existingTask.task_type.toLowerCase().includes(value.toLowerCase()) &&
          (!task || existingTask.taskId !== task.taskId) // Exclude current task if editing
        );
        setFilteredTasks(filtered);
        setShowAutocomplete(filtered.length > 0);
      } else {
        setFilteredTasks([]);
        setShowAutocomplete(false);
      }
    }

    // Handle platform change - fetch stories
    if (name === 'platform_id') {
      if (value) {
        fetchStoriesForPlatform(parseInt(value));
      } else {
        setStories([]);
        setFormData(prev => ({ ...prev, story_id: "" }));
      }
    }
  };

  const fetchStoriesForPlatform = async (platformId) => {
    try {
      setStoriesLoading(true);
      // Convert platform ID to string as API expects string array
      const response = await platformService.getStoriesByPlatforms([platformId.toString()], false);
      if (response.status === 200 && response.body) {
        setStories(response.body);
      } else {
        setStories([]);
      }
    } catch (err) {
      console.error('Error fetching stories:', err);
      setStories([]);
    } finally {
      setStoriesLoading(false);
    }
  };

  const fetchChaptersForStories = async (storyIds, platformId) => {
    try {
      // Convert IDs to strings as API expects string arrays
      const stringStoryIds = storyIds.map(id => id.toString());
      const stringPlatformIds = [platformId.toString()];
      const response = await platformService.getChaptersByPlatform(stringStoryIds, stringPlatformIds);
      if (response.status === 200 && response.body) {
        return response.body;
      }
      return [];
    } catch (err) {
      console.error('Error fetching chapters:', err);
      return [];
    }
  };

  const fetchItemsForChapters = async (chapterIds, platformId) => {
    try {
      // Convert IDs to strings as API expects string arrays
      const stringChapterIds = chapterIds.map(id => id.toString());
      const stringPlatformIds = [platformId.toString()];
      const response = await platformService.getItemsByPlatform(stringChapterIds, stringPlatformIds);
      if (response.status === 200 && response.body) {
        return response.body;
      }
      return [];
    } catch (err) {
      console.error('Error fetching items:', err);
      return [];
    }
  };

  const populateFieldDropdowns = async (fields, platformId) => {
    if (!platformId) return;

    // Process each field that has story/chapter selections
    for (const field of fields) {
      const storyId = field.story_id || field.storyId;
      const chapterId = field.chapter_id || field.chapterId;
      
      if (storyId) {
        try {
          // Fetch chapters for this story
          const chapters = await fetchChaptersForStories([storyId.toString()], platformId);
          
          // Update the field with available chapters
          setFormData(prev => ({
            ...prev,
            fields: prev.fields.map(f =>
              f.id === field.id ? { ...f, availableChapters: chapters } : f
            )
          }));

          // If chapter is also selected, fetch items
          if (chapterId) {
            const items = await fetchItemsForChapters([chapterId.toString()], platformId);
            
            // Update the field with available items
            setFormData(prev => ({
              ...prev,
              fields: prev.fields.map(f =>
                f.id === field.id ? { ...f, availableItems: items } : f
              )
            }));
          }
        } catch (err) {
          console.error('Error populating dropdowns for field:', field.id, err);
        }
      }
    }
  };

  const selectExistingTask = (selectedTask) => {
    setFormData({
      task_type: selectedTask.task_type || "",
      description: selectedTask.description || "",
      platform_id: selectedTask.platform_id || "",
      story_id: selectedTask.story_id || "",
      fields: selectedTask.fields ? [...selectedTask.fields] : []
    });
    setShowAutocomplete(false);
    setFilteredTasks([]);
  };

  const addDefaultColumn = (columnType) => {
    // Check if the default column already exists
    const existingField = formData.fields.find(field => 
      field.label.toLowerCase() === defaultColumns[columnType].label.toLowerCase()
    );
    
    if (existingField) {
      showMessage(`${defaultColumns[columnType].label} column already exists`, "error");
      return;
    }

    const newField = {
      id: Date.now(),
      label: defaultColumns[columnType].label,
      type: defaultColumns[columnType].type,
      required: defaultColumns[columnType].required,
      options: [...defaultColumns[columnType].options],
      placeholder: defaultColumns[columnType].placeholder,
      story_id: "",
      chapter_id: "",
      item_id: "",
      show_item_description: undefined, // No default selection initially
      isHide: 'true',
      depends_on: 'no',
      dependent_field_id: "",
      dependent_on: 'story',
      allowMultiple: false // Default to single selection
    };
    
    setFormData(prev => ({
      ...prev,
      fields: [...prev.fields, newField]
    }));
    
    // Trigger auto-scroll after state update
    setShouldScrollToBottom(true);
    
    // Also try a direct approach as backup
    setTimeout(() => {
      const lastFieldCard = document.querySelector('.card:last-child');
      if (lastFieldCard) {
        lastFieldCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 200);
  };

  const addField = () => {
    // Check if user has reached the limit of 5 additional columns (excluding default ones)
    const nonDefaultFields = formData.fields.filter(field => 
      !Object.values(defaultColumns).some(defaultCol => 
        defaultCol.label.toLowerCase() === field.label.toLowerCase()
      )
    );
    
    if (nonDefaultFields.length >= 5) {
      showMessage("You can add a maximum of 5 additional columns beyond the default ones", "error");
      return;
    }

    const newField = {
      id: Date.now(),
      label: "",
      type: "text",
      required: false,
      options: [],
      placeholder: "",
      story_id: "",
      chapter_id: "",
      item_id: "",
      show_item_description: undefined, // No default selection initially
      depends_on: 'no',
      isHide: 'true',
      dependent_field_id: "",
      dependent_on: 'story',
      allowMultiple: false // Default to single selection
    };
    setFormData(prev => ({
      ...prev,
      fields: [...prev.fields, newField]
    }));
    
    // Trigger auto-scroll after state update
    setShouldScrollToBottom(true);
    
    // Also try a direct approach as backup
    setTimeout(() => {
      const lastFieldCard = document.querySelector('.card:last-child');
      if (lastFieldCard) {
        lastFieldCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 200);
  };

  const removeField = (fieldId) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.filter(field => field.id !== fieldId)
    }));
  };

  const updateField = async (fieldId, updates) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map(field =>
        field.id === fieldId ? { ...field, ...updates } : field
      )
    }));

    // Handle dependent selections
    if (updates.story_id !== undefined) {
      const field = formData.fields.find(f => f.id === fieldId);
      if (updates.story_id && formData.platform_id) {
        // Fetch chapters for the selected story
        const chapters = await fetchChaptersForStories([updates.story_id], formData.platform_id);
        // Update the field with available chapters
        setFormData(prev => ({
          ...prev,
          fields: prev.fields.map(f =>
            f.id === fieldId ? { ...f, ...updates, availableChapters: chapters } : f
          )
        }));
      } else {
        // Clear chapters and items if story is cleared
        setFormData(prev => ({
          ...prev,
          fields: prev.fields.map(f =>
            f.id === fieldId ? { ...f, ...updates, chapter_id: "", item_id: "", availableChapters: [], availableItems: [] } : f
          )
        }));
      }
    }

    if (updates.chapter_id !== undefined) {
      const field = formData.fields.find(f => f.id === fieldId);
      if (updates.chapter_id && formData.platform_id) {
        // Fetch items for the selected chapter
        const items = await fetchItemsForChapters([updates.chapter_id], formData.platform_id);
        // Update the field with available items
        setFormData(prev => ({
          ...prev,
          fields: prev.fields.map(f =>
            f.id === fieldId ? { ...f, ...updates, availableItems: items } : f
          )
        }));
      } else {
        // Clear items if chapter is cleared
        setFormData(prev => ({
          ...prev,
          fields: prev.fields.map(f =>
            f.id === fieldId ? { ...f, ...updates, item_id: "", availableItems: [] } : f
          )
        }));
      }
    }
  };

  const addOption = (fieldId) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map(field =>
        field.id === fieldId
          ? { ...field, options: [...field.options, { id: Date.now(), label: "" }] }
          : field
      )
    }));
  };

  const removeOption = (fieldId, optionId) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map(field =>
        field.id === fieldId
          ? { ...field, options: field.options.filter(option => option.id !== optionId) }
          : field
      )
    }));
  };

  const updateOption = (fieldId, optionId, label) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map(field =>
        field.id === fieldId
          ? {
            ...field,
            options: field.options.map(option =>
              option.id === optionId ? { ...option, label } : option
            )
          }
          : field
      )
    }));
  };

  const showMessage = (content, type = "success") => {
    setApiMessage({ content, type });
    setTimeout(() => setApiMessage({ content: "", type: "" }), 5000);
  };

  const handleSubmit = async () => {
    if (!formData.task_type.trim()) {
      showMessage("Task type is required", "error");
      return;
    }

    if (!formData.platform_id) {
      showMessage("Platform is required", "error");
      return;
    }

    // Check column limit (5 additional columns beyond default ones)
    const nonDefaultFields = formData.fields.filter(field => 
      !Object.values(defaultColumns).some(defaultCol => 
        defaultCol.label.toLowerCase() === field.label.toLowerCase()
      )
    );
    
    if (nonDefaultFields.length > 5) {
      showMessage("You can add a maximum of 5 additional columns beyond the default ones", "error");
      return;
    }

    // Validate fields
    for (let field of formData.fields) {
      if (!field.label.trim()) {
        showMessage("All columns must have a label", "error");
        return;
      }

      // For dropdown select, check if options are needed
      if (field.type === "select" && field.options.length === 0) {
        // If story, chapter, and item are selected (including "all"), options are not required
        const hasValidItemSelection = field.item_id && (field.item_id === "all" || !isNaN(parseInt(field.item_id)));
        if (!field.story_id || !field.chapter_id || !hasValidItemSelection) {
          showMessage(`${field.label} must have at least one option or select story, chapter, and item`, "error");
          return;
        }
      }
      
      // For checkbox and radio, options are always required
      if (["checkbox", "radio"].includes(field.type) && field.options.length === 0) {
        showMessage(`${field.label} must have at least one option`, "error");
        return;
      }

      // Validate dependent selections
      // Allow "all" as a valid item_id selection (which means fetch all items)
      const hasValidItemSelection = field.item_id && (field.item_id === "all" || !isNaN(parseInt(field.item_id)));
      
      if (field.story_id && (!field.chapter_id || !hasValidItemSelection)) {
        showMessage(`Column "${field.label}": If story is selected, both chapter and item must also be selected`, "error");
        return;
      }

      if (field.chapter_id && !hasValidItemSelection) {
        showMessage(`Column "${field.label}": If chapter is selected, item must also be selected`, "error");
        return;
      }
    }

    // Check for duplicate task type
    const isDuplicate = existingTasks.some(existingTask =>
      existingTask.task_type.toLowerCase() === formData.task_type.toLowerCase() &&
      (!task || existingTask.taskId !== task.taskId) // Exclude current task if editing
    );

    if (isDuplicate) {
      showMessage("A task with this type already exists. Please enter a different name.", "error");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Clean the form data before sending
      const cleanedFormData = {
        task_type: formData.task_type,
        description: formData.description,
        platform_id: formData.platform_id,
        story_id: formData.story_id ? parseInt(formData.story_id) : null,
        fields: formData.fields.map(field => ({
          id: field.id,
          label: field.label,
          type: field.type,
          required: field.required,
          options: field.options,
          placeholder: field.placeholder,
          story_id: field.story_id ? parseInt(field.story_id) : null,
          chapter_id: field.chapter_id ? parseInt(field.chapter_id) : null,
          // Convert "all" to null, or parse integer if it's a valid number
          item_id: field.item_id === "all" ? null : (field.item_id ? parseInt(field.item_id) : null),
          show_item_description: field.show_item_description !== undefined ? field.show_item_description : true,
          isHide: field.isHide !== undefined ? field.isHide : 'true',
          depends_on: field.depends_on !== undefined ? field.depends_on : 'no',
          dependent_field_id: field.dependent_field_id !== undefined && field.dependent_field_id !== '' ? parseInt(field.dependent_field_id) : null,
          dependent_on: field.dependent_on || 'story',
          allowMultiple: field.allowMultiple !== undefined ? field.allowMultiple : false
        }))
      };

      if (task) {
        await taskService.updateTask(task.taskId, cleanedFormData);
        showMessage("Task template updated successfully!");
      } else {
        await taskService.createTask(cleanedFormData);
        showMessage("Task template created successfully!");
      }

      onSuccess();
    } catch (err) {
      showMessage(err.response?.data?.message || "Error saving task", "error");
    } finally {
      setLoading(false);
    }
  };

  const renderFieldOptions = (field) => {
    if (!["checkbox", "radio", "select"].includes(field.type)) {
      return null;
    }

    // For dropdown select with story/chapter/item selected, show info message
    // "all" means all items will be fetched, which is valid
    const hasValidItemSelection = field.item_id && (field.item_id === "all" || !isNaN(parseInt(field.item_id)));
    if (field.type === "select" && field.story_id && field.chapter_id && hasValidItemSelection) {
      const itemMessage = field.item_id === "all" 
        ? "Options will be automatically populated from all items in the selected chapter."
        : "Options will be automatically populated from the selected item. Manual options are not required.";
      return (
        <div className="mt-2">
          <div className="alert alert-info" style={{ fontSize: '12px', padding: '8px 12px' }}>
            <i className="fas fa-info-circle mr-1"></i>
            {itemMessage}
          </div>
        </div>
      );
    }

    return (
      <div className="mt-2">
        <Label className="form-control-label">Options</Label>
        {field.options.map((option) => (
          <Row key={option.id} className="mb-2">
            <Col>
              <Input
                type="text"
                placeholder="Option label"
                value={option.label}
                onChange={(e) => updateOption(field.id, option.id, e.target.value)}
              />
            </Col>
            <Col xs="auto">
              <Button
                color="danger"
                size="sm"
                onClick={() => removeOption(field.id, option.id)}
              >
                <FaTrash />
              </Button>
            </Col>
          </Row>
        ))}
        <Button
          color="info"
          size="sm"
          onClick={() => addOption(field.id)}
          className="ml-2"
        >
          <FaPlus className="mr-1" />
          Add Option
        </Button>
      </div>
    );
  };

  return (
    <>
      <style>
        {`
          .fixed-modal-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 10 !important;
            background: white !important;
            border-bottom: 1px solid #dee2e6 !important;
            margin-bottom: 0 !important;
          }
          .fixed-modal-footer {
            position: sticky !important;
            bottom: 0 !important;
            z-index: 10 !important;
            background: white !important;
            border-top: 1px solid #dee2e6 !important;
            margin-top: 0 !important;
          }
          .scrollable-modal-body {
            max-height: 60vh !important;
            overflow-y: auto !important;
            padding: 1rem !important;
            position: relative !important;
          }
          .create-task-modal .modal-content {
            display: flex !important;
            flex-direction: column !important;
            height: 80vh !important;
          }
          .create-task-modal .modal-dialog {
            display: flex !important;
            align-items: center !important;
            min-height: 100vh !important;
            margin: 0 auto !important;
            padding: 20px !important;
            max-width: 800px !important;
            width: 100% !important;
          }
          .create-task-modal .modal-dialog.modal-lg {
            max-width: 800px !important;
            width: 100% !important;
          }
          .create-task-modal .modal {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
        `}
      </style>
      <Modal isOpen={isOpen} toggle={toggle} size="lg" centered className="create-task-modal">
        <ModalHeader toggle={toggle} className="fixed-modal-header">
          {task ? "Edit Plan Template" : "Create New Plan Template"}
        </ModalHeader>
        <ModalBody ref={modalBodyRef} className="scrollable-modal-body">
          {error && (
            <Alert color="danger" className="mb-3">
              {error}
            </Alert>
          )}

          <Form>
            <Row>
              <Col md="12">
                <FormGroup style={{ position: 'relative' }}>
                  <Label className="form-control-label" for="type">
                    Plan Type <span style={{ color: 'red' }}>*</span>
                  </Label>
                  <Input
                    id="task_type"
                    name="task_type"
                    type="text"
                    value={formData.task_type}
                    onChange={handleInputChange}
                    placeholder="Enter plan type"
                    autoComplete="off"
                  />
                  {showAutocomplete && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        maxHeight: '200px',
                        overflowY: 'auto'
                      }}
                    >
                      {filteredTasks.map((existingTask, index) => (
                        <div
                          key={existingTask.taskId}
                          onClick={() => selectExistingTask(existingTask)}
                          style={{
                            padding: '10px 15px',
                            cursor: 'pointer',
                            borderBottom: index < filteredTasks.length - 1 ? '1px solid #eee' : 'none',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                          <div style={{ fontWeight: 'bold', color: '#333' }}>
                            {existingTask.task_type}
                          </div>
                          {existingTask.description && (
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                              {existingTask.description.length > 50
                                ? `${existingTask.description.substring(0, 50)}...`
                                : existingTask.description}
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                            {existingTask.fields?.length || 0} columns
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </FormGroup>
              </Col>
            </Row>

            <Row>
              <Col md="12">
                <FormGroup>
                  <Label className="form-control-label" for="description">
                    Description
                  </Label>
                  <Input
                    id="description"
                    name="description"
                    type="textarea"
                    rows="3"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Enter plan description"
                  />
                </FormGroup>
              </Col>
            </Row>

            <Row>
              <Col md="12">
                <FormGroup>
                  <Label className="form-control-label" for="platform_id">
                    Platform <span style={{ color: 'red' }}>*</span>
                  </Label>
                  <Input
                    id="platform_id"
                    name="platform_id"
                    type="select"
                    value={formData.platform_id || ""}
                    onChange={handleInputChange}
                    disabled={platformsLoading}
                  >
                    <option value="">Select a platform</option>
                    {platforms.map((platform) => (
                      <option key={platform.id} value={platform.id}>
                        {platform.name}
                      </option>
                    ))}
                  </Input>
                  {platformsLoading && (
                    <small className="text-muted">
                      <Spinner size="sm" className="mr-1" />
                      Loading platforms...
                    </small>
                  )}
                </FormGroup>
              </Col>
            </Row>

            <Row>
              <Col md="12">
                <FormGroup>
                  <Label className="form-control-label" for="story_id">
                    Story
                  </Label>
                  <Input
                    id="story_id"
                    name="story_id"
                    type="select"
                    value={formData.story_id || ""}
                    onChange={handleInputChange}
                    disabled={!formData.platform_id || storiesLoading}
                  >
                    <option value="">Select a story</option>
                    {stories.map((story) => (
                      <option key={story.storyId} value={story.storyId}>
                        {story.storyName}
                      </option>
                    ))}
                  </Input>
                  {storiesLoading && (
                    <small className="text-muted">
                      <Spinner size="sm" className="mr-1" />
                      Loading stories...
                    </small>
                  )}
                  {!formData.platform_id && (
                    <small className="text-muted">
                      Please select a platform first to see available stories
                    </small>
                  )}
                </FormGroup>
              </Col>
            </Row>

            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <Label className="form-control-label mb-0">Plan Columns</Label>
                <div className="d-flex gap-2">
                  <UncontrolledDropdown>
                    <DropdownToggle color="primary" size="sm" caret>
                      <FaPlus className="mr-1" />
                      Add Default Column
                    </DropdownToggle>
                    <DropdownMenu>
                      <DropdownItem onClick={() => addDefaultColumn('priority')}>
                        Priority
                      </DropdownItem>
                      <DropdownItem onClick={() => addDefaultColumn('description')}>
                        Description
                      </DropdownItem>
                    </DropdownMenu>
                  </UncontrolledDropdown>
                  <Button color="primary" size="sm" onClick={addField}>
                    <FaPlus className="mr-1" />
                    Add Column
                  </Button>
                </div>
              </div>
              {formData.fields.length > 0 && (
                <div className="alert alert-info" style={{ fontSize: '12px', padding: '8px 12px' }}>
                  <i className="fas fa-info-circle mr-1"></i>
                  {formData.fields.length} column(s) loaded. You can modify these columns or add new ones.
                  {(() => {
                    const nonDefaultFields = formData.fields.filter(field => 
                      !Object.values(defaultColumns).some(defaultCol => 
                        defaultCol.label.toLowerCase() === field.label.toLowerCase()
                      )
                    );
                    return nonDefaultFields.length > 0 && (
                      <span className="ml-2">
                        ({nonDefaultFields.length}/5 additional columns used)
                      </span>
                    );
                  })()}
                </div>
              )}

              {formData.fields.length === 0 ? (
                <Card className="bg-light">
                  <CardBody className="text-center text-muted">
                    No columns added yet. Click "Add Column" to get started.
                  </CardBody>
                </Card>
              ) : (
                formData.fields.map((field, index) => (
                  <Card key={field.id} className="mb-3">
                    <CardBody>
                      <Row>
                        <Col md="4">
                          <FormGroup>
                            <Label className="form-control-label">Column Label <span style={{ color: 'red' }}>*</span></Label>
                            <Input
                              type="text"
                              value={field.label}
                              onChange={(e) => updateField(field.id, { label: e.target.value })}
                              placeholder="Enter column label"
                            />
                          </FormGroup>
                        </Col>
                        <Col md="3">
                          <FormGroup>
                            <Label className="form-control-label">Column Type</Label>
                            <Input
                              type="select"
                              value={field.type}
                              onChange={(e) => updateField(field.id, { type: e.target.value })}
                            >
                              {fieldTypes.map(type => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </Input>
                          </FormGroup>
                        </Col>
                        <Col md="2">
                          <FormGroup>
                            <Label className="form-control-label">Required</Label>
                            <div className="custom-control custom-checkbox">
                              <Input
                                type="checkbox"
                                checked={field.required}
                                onChange={(e) => updateField(field.id, { required: e.target.checked })}
                              />
                            </div>
                          </FormGroup>
                        </Col>
                        {field.type === "select" && (
                          <Col md="2">
                            <FormGroup>
                              <Label className="form-control-label">Allow Multiple</Label>
                              <div className="custom-control custom-checkbox">
                                <Input
                                  type="checkbox"
                                  checked={field.allowMultiple || false}
                                  onChange={(e) => updateField(field.id, { allowMultiple: e.target.checked })}
                                />
                              </div>
                            </FormGroup>
                          </Col>
                        )}
                        <Col md={field.type === "select" ? "1" : "2"}>
                          <FormGroup>
                            {/* <Label className="form-control-label">Actions</Label> */}
                            <Button
                              color="danger"
                              size="sm"
                              onClick={() => removeField(field.id)}
                            >
                              <FaTrash />
                            </Button>
                          </FormGroup>
                        </Col>
                      </Row>

                      {/* Story, Chapter, Item Selection Row */}
                      <Row className="mt-3">
                        <Col md="4">
                          <FormGroup>
                            <Label className="form-control-label">Story</Label>
                            <Input
                              type="select"
                              value={field.story_id || ""}
                              onChange={(e) => updateField(field.id, { story_id: e.target.value })}
                              disabled={!formData.platform_id}
                            >
                              <option value="">Select a story</option>
                              {stories.map((story) => (
                                <option key={story.storyId} value={story.storyId}>
                                  {story.storyName}
                                </option>
                              ))}
                            </Input>
                            {!formData.platform_id && (
                              <small className="text-muted">Select platform first</small>
                            )}
                          </FormGroup>
                        </Col>
                        <Col md="4">
                          <FormGroup>
                            <Label className="form-control-label">Chapter</Label>
                            <Input
                              type="select"
                              value={field.chapter_id || ""}
                              onChange={(e) => updateField(field.id, { chapter_id: e.target.value })}
                              disabled={!field.story_id}
                            >
                              <option value="">Select a chapter</option>
                              {(field.availableChapters || []).map((chapter) => (
                                <option key={chapter.chapterId} value={chapter.chapterId}>
                                  {chapter.chapterName}
                                </option>
                              ))}
                            </Input>
                            {!field.story_id && (
                              <small className="text-muted">Select story first</small>
                            )}
                          </FormGroup>
                        </Col>
                        <Col md="4">
                          <FormGroup>
                            <Label className="form-control-label">Item</Label>
                            <Input
                              type="select"
                              value={field.item_id || ""}
                              onChange={(e) => updateField(field.id, { item_id: e.target.value })}
                              disabled={!field.chapter_id}
                            >
                              <option value="">Select an item</option>
                              <option value="all">All Items</option>
                              {(field.availableItems || []).map((item) => (
                                <option key={item.itemId} value={item.itemId}>
                                  {item.itemName}
                                </option>
                              ))}
                            </Input>
                            {!field.chapter_id && (
                              <small className="text-muted">Select chapter first</small>
                            )}
                          </FormGroup>
                        </Col>
                      </Row>

                      {/* Placeholder field - only for certain types */}
                      {["text", "textarea", "number", "email"].includes(field.type) && (
                        <Row>
                          <Col md="6">
                            <FormGroup>
                              <Label className="form-control-label">Placeholder</Label>
                              <Input
                                type="text"
                                value={field.placeholder || ""}
                                onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                                placeholder={`Enter placeholder text for ${field.type} field`}
                              />
                            </FormGroup>
                          </Col>
                          <Col md="6">
                            <FormGroup>
                              <Label className="form-control-label">Display Type</Label>
                              <Input
                                type="select"
                                value={field.show_item_description === undefined ? "" : (field.show_item_description ? "item_description" : "item_name")}
                                onChange={(e) => updateField(field.id, { show_item_description: e.target.value === "" ? undefined : e.target.value === "item_description" })}
                              >
                                {displayTypes.map(type => (
                                  <option key={type.value} value={type.value}>
                                    {type.label}
                                  </option>
                                ))}
                              </Input>
                            </FormGroup>
                          </Col>
                        </Row>
                      )}

                      {/* Display Type field - for all other types */}
                      {!["text", "textarea", "number", "email"].includes(field.type) && (
                        <Row>
                          <Col md="6">
                            <FormGroup>
                              <Label className="form-control-label">Display Type</Label>
                              <Input
                                type="select"
                                value={field.show_item_description === undefined ? "" : (field.show_item_description ? "item_description" : "item_name")}
                                onChange={(e) => updateField(field.id, { show_item_description: e.target.value === "" ? undefined : e.target.value === "item_description" })}
                              >
                                {displayTypes.map(type => (
                                  <option key={type.value} value={type.value}>
                                    {type.label}
                                  </option>
                                ))}
                              </Input>
                            </FormGroup>
                          </Col>
                        </Row>
                      )}

                      {/* Dependency settings - shown for all types */}
                      <Row>
                        <Col md="6">
                          <FormGroup>
                            <Label className="form-control-label mb-1">Depends On</Label>
                            <div className="d-flex align-items-center" style={{ gap: '16px' }}>
                              <div className="custom-control custom-radio d-flex align-items-center" style={{ gap: '8px' }}>
                                <Input
                                  type="radio"
                                  id={`depends_on_no_${field.id}`}
                                  name={`depends_on_${field.id}`}
                                  checked={(field.depends_on || 'no') !== 'yes'}
                                  onChange={() => updateField(field.id, { depends_on: 'no', dependent_field_id: '' })}
                                />
                                <Label className="form-control-label mb-0" htmlFor={`depends_on_no_${field.id}`}>No</Label>
                              </div>
                              <div className="custom-control custom-radio d-flex align-items-center" style={{ gap: '8px' }}>
                                <Input
                                  type="radio"
                                  id={`depends_on_yes_${field.id}`}
                                  name={`depends_on_${field.id}`}
                                  checked={field.depends_on === 'yes'}
                                  onChange={() => updateField(field.id, { depends_on: 'yes' })}
                                />
                                <Label className="form-control-label mb-0" htmlFor={`depends_on_yes_${field.id}`}>Yes</Label>
                              </div>
                            </div>
                          </FormGroup>
                        </Col>
                        <Col md="6">
                          <FormGroup>
                            <Label className="form-control-label mb-1">Hide On Tile</Label>
                            <div className="d-flex align-items-center" style={{ gap: '16px' }}>
                              <div className="custom-control custom-radio d-flex align-items-center" style={{ gap: '8px' }}>
                                <Input
                                  type="radio"
                                  id={`isHide${field.id}`}
                                  name={`isHide${field.id}`}
                                  checked={(field.isHide || 'false') !== 'true'}
                                  onChange={() => updateField(field.id, { isHide: 'false'})}
                                />
                                <Label className="form-control-label mb-0" htmlFor={`isHide_no${field.id}`}>No</Label>
                              </div>
                              <div className="custom-control custom-radio d-flex align-items-center" style={{ gap: '8px' }}>
                                <Input
                                  type="radio"
                                  id={`isHide_yes${field.id}`}
                                  name={`isHide${field.id}`}
                                  checked={field.isHide === 'true'}
                                  onChange={() => updateField(field.id, { isHide: 'true' })}
                                />
                                <Label className="form-control-label mb-0" htmlFor={`isHide_yes${field.id}`}>Yes</Label>
                              </div>
                            </div>
                          </FormGroup>
                        </Col>

                        {field.depends_on === 'yes' && (
                          <>
                            <Col md="6">
                              <FormGroup>
                                <Label className="form-control-label">Parent Field</Label>
                                <Input
                                  type="select"
                                  value={field.dependent_field_id || ''}
                                  onChange={(e) => {
                                    const selectedParentId = e.target.value;
                                    const selectedParent = formData.fields.find(f => String(f.id) === String(selectedParentId));
                                    
                                    // Warn if parent field allows multiple selection
                                    if (selectedParent && selectedParent.allowMultiple === true) {
                                      const confirmMessage = `Warning: The selected parent field "${selectedParent.label}" allows multiple selection. Dependent fields will show options matching ANY of the selected parent values. Continue?`;
                                      if (!window.confirm(confirmMessage)) {
                                        return; // Don't update if user cancels
                                      }
                                    }
                                    
                                    updateField(field.id, { dependent_field_id: selectedParentId });
                                  }}
                                >
                                  <option value="">Select a parent field</option>
                                  {formData.fields
                                    .filter((f) => f.id !== field.id && (f.label || '').trim() !== '')
                                    .map((f) => {
                                      const isMultiSelect = f.type === 'select' && f.allowMultiple === true;
                                      return (
                                        <option key={f.id} value={f.id}>
                                          {f.label}{isMultiSelect ? ' (Multi-select)' : ''}
                                        </option>
                                      );
                                    })}
                                </Input>
                                {(() => {
                                  const selectedParentId = field.dependent_field_id;
                                  const selectedParent = formData.fields.find(f => String(f.id) === String(selectedParentId));
                                  if (selectedParent && selectedParent.allowMultiple === true) {
                                    return (
                                      <small className="text-warning d-block mt-1">
                                        <i className="fas fa-exclamation-triangle mr-1"></i>
                                        Parent allows multiple selection. Dependent field will show options matching any selected parent value.
                                      </small>
                                    );
                                  }
                                  return null;
                                })()}
                              </FormGroup>
                            </Col>
                            <Col md="6">
                              <FormGroup>
                                <Label className="form-control-label">Depends by</Label>
                                <Input
                                  type="select"
                                  value={field.dependent_on || 'story'}
                                  onChange={(e) => updateField(field.id, { dependent_on: e.target.value })}
                                >
                                  <option value="story">Story</option>
                                  {/* <option value="chapter">Chapter</option> */}
                                  <option value="item">Item</option>
                                </Input>
                              </FormGroup>
                            </Col>
                          </>
                        )}
                      </Row>

                      {renderFieldOptions(field)}
                    </CardBody>
                  </Card>
                ))
              )}
            </div>
          </Form>
        </ModalBody>
        <ModalFooter className="fixed-modal-footer">
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancel
          </Button>
          <Button color="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? <Spinner size="sm" /> : (task ? "Update" : "Create")}
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
    </>
  );
};

export default CreateTaskModal; 