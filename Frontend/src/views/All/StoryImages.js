import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Container,
  Row,
  Col,
  Button,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Toast,
  Badge,
  Alert,
  Input,
  Label,
  FormGroup,
  Table,
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane
} from 'reactstrap';
import { useNavigate } from 'react-router-dom';
import storyImageService from 'services/storyImageService';
import classnames from 'classnames';
import assistantService from 'services/assistantService';
// Custom styles
const styles = `
  /* Typography System */
  :root {
    --font-family-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --font-size-xs: 0.75rem;      /* 12px */
    --font-size-sm: 0.875rem;     /* 14px */
    --font-size-base: 1rem;       /* 16px */
    --font-size-lg: 1.125rem;     /* 18px */
    --font-size-xl: 1.25rem;      /* 20px */
    --font-size-2xl: 1.5rem;      /* 24px */
    --font-size-3xl: 1.875rem;    /* 30px */
    --font-size-4xl: 2.25rem;     /* 36px */
    
    --font-weight-normal: 400;
    --font-weight-medium: 500;
    --font-weight-semibold: 600;
    --font-weight-bold: 700;
    
    --color-text-primary: #2d3748;
    --color-text-secondary: #4a5568;
    --color-text-muted: #718096;
    --color-text-light: #a0aec0;
    --color-text-white: #ffffff;
    --color-text-success: #2dce89;
    --color-text-error: #f5365c;
    --color-text-warning: #fb6340;
    --color-text-info: #3A6D8C;
  }

  /* Base Typography */
  .text-xs { font-size: var(--font-size-xs); }
  .text-sm { font-size: var(--font-size-sm); }
  .text-base { font-size: var(--font-size-base); }
  .text-lg { font-size: var(--font-size-lg); }
  .text-xl { font-size: var(--font-size-xl); }
  .text-2xl { font-size: var(--font-size-2xl); }
  .text-3xl { font-size: var(--font-size-3xl); }
  .text-4xl { font-size: var(--font-size-4xl); }

  .font-normal { font-weight: var(--font-weight-normal); }
  .font-medium { font-weight: var(--font-weight-medium); }
  .font-semibold { font-weight: var(--font-weight-semibold); }
  .font-bold { font-weight: var(--font-weight-bold); }

  .text-primary { color: var(--color-text-primary); }
  .text-secondary { color: var(--color-text-secondary); }
  .text-muted { color: var(--color-text-muted); }
  .text-light { color: var(--color-text-light); }
  .text-white { color: var(--color-text-white); }
  .text-success { color: var(--color-text-success); }
  .text-error { color: var(--color-text-error); }
  .text-warning { color: var(--color-text-warning); }
  .text-info { color: var(--color-text-info); }

  .story-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
    margin-top: 2rem;
  }
  
  .story-card {
    border: 1px solid #e9ecef;
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.3s ease;
    background: white;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  }
  
  .story-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
    border-color: #3A6D8C;
  }
  
  .story-header {
    background: linear-gradient(135deg, #3A6D8C 0%, #2d5670 100%);
    color: var(--color-text-white);
    padding: 12px;
    text-align: center;
  }
  
  .story-title {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    margin: 0;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    color: var(--color-text-white);
    font-family: var(--font-family-primary);
  }
  
  .story-subtitle {
    font-size: var(--font-size-sm);
    opacity: 0.9;
    margin-top: 0.5rem;
    color: var(--color-text-white);
    font-family: var(--font-family-primary);
  }
  
  .story-image-section {
    padding: 1.5rem;
    background: #f8f9fa;
    position: relative;
  }
  
  .story-image-container {
    position: relative;
    width: 100%;
    height: 200px;
    border-radius: 12px;
    overflow: hidden;
    background: white;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    margin-bottom: 1rem;
  }
  
  .story-image-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
  }
  
  .story-image-container:hover .story-image-preview {
    transform: scale(1.05);
  }
  
  .story-image-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  
  .story-image-container:hover .story-image-overlay {
    opacity: 1;
  }
  
  .no-image-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    font-family: var(--font-family-primary);
  }
  
  .no-image-placeholder i {
    font-size: var(--font-size-3xl);
    margin-bottom: 0.5rem;
    opacity: 0.5;
  }

  .no-image-placeholder p {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    margin: 0;
    color: var(--color-text-muted);
  }
  
  .btn-custom-primary {
    background-color: #3A6D8C;
    border-color: #3A6D8C;
    color: var(--color-text-white);
    border-radius: 8px;
    padding: 0.75rem 1.5rem;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-base);
    font-family: var(--font-family-primary);
    transition: all 0.3s ease;
  }
  
  .btn-custom-primary:hover {
    background-color: #2d5670;
    border-color: #2d5670;
    color: var(--color-text-white);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(58, 109, 140, 0.3);
  }
  
  .btn-custom-success {
    background-color: #2dce89;
    border-color: #2dce89;
    color: var(--color-text-white);
    border-radius: 8px;
    padding: 0.75rem 1.5rem;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-base);
    font-family: var(--font-family-primary);
    transition: all 0.3s ease;
  }
  
  .btn-custom-success:hover {
    background-color: #24a46b;
    border-color: #24a46b;
    color: var(--color-text-white);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(45, 206, 137, 0.3);
  }
  
  .btn-custom-secondary {
    background-color: #6c757d;
    border-color: #6c757d;
    color: var(--color-text-white);
    border-radius: 8px;
    padding: 0.75rem 1.5rem;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-base);
    font-family: var(--font-family-primary);
    transition: all 0.3s ease;
  }
  
  .btn-custom-secondary:hover {
    background-color: #5a6268;
    border-color: #5a6268;
    color: var(--color-text-white);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(108, 117, 125, 0.3);
  }
  
  .action-buttons {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .image-status {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
    border-radius: 20px;
    padding: 0.25rem 0.75rem;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    font-family: var(--font-family-primary);
  }

  .requirement-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    font-weight: var(--font-weight-normal);
    font-family: var(--font-family-primary);
  }
  
  .search-section {
    background: white;
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    margin-bottom: 2rem;
  }

  .search-label {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    font-family: var(--font-family-primary);
    margin-bottom: 1rem;
  }
  
  .search-input {
    border-radius: 12px;
    border: 2px solid #e9ecef;
    padding: 0.75rem 1rem;
    font-size: var(--font-size-base);
    font-family: var(--font-family-primary);
    transition: all 0.3s ease;
  }
  
  .search-input:focus {
    border-color: #3A6D8C;
    box-shadow: 0 0 0 0.2rem rgba(58, 109, 140, 0.25);
  }

  .search-input::placeholder {
    color: var(--color-text-light);
    font-family: var(--font-family-primary);
  }
  
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
  
  .loading-pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }
  
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--color-text-muted);
    font-family: var(--font-family-primary);
  }
  
  .empty-state i {
    font-size: var(--font-size-4xl);
    margin-bottom: 1rem;
    opacity: 0.3;
  }
  
  .empty-state h5 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    margin-bottom: 0.5rem;
    color: var(--color-text-primary);
  }
  
  .empty-state p {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-normal);
    opacity: 0.7;
    color: var(--color-text-secondary);
  }
  
  .tab-nav {
    background: white;
    border-radius: 16px;
    padding: 0.5rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    margin-bottom: 2rem;
    cursor: pointer;
  }
  
  .tab-nav .nav-link {
    border: none;
    margin: 0 5px;
    border-radius: 12px;
    padding: 12px;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-base);
    color: var(--color-text-muted);
    font-family: var(--font-family-primary);
    transition: all 0.3s ease;
  }
  
  .tab-nav .nav-link.active {
    background: linear-gradient(135deg, #3A6D8C 0%, #2d5670 100%);
    color: var(--color-text-white);
    box-shadow: 0 4px 12px rgba(58, 109, 140, 0.3);
  }
  
  .tab-nav .nav-link:hover:not(.active) {
    background: #f8f9fa;
    color: var(--color-text-info);
  }

  .page-title {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-white);
    font-family: var(--font-family-primary);
    margin-bottom: 1.5rem;
  }

  .alert-info-icon {
    font-size: var(--font-size-2xl);
    color: var(--color-text-white);
  }

  .alert-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-white);
    font-family: var(--font-family-primary);
    margin-bottom: 0.25rem;
  }

  .alert-text {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-normal);
    color: var(--color-text-white);
    font-family: var(--font-family-primary);
    margin-bottom: 0;
  }

  .toast-icon {
    font-size: var(--font-size-2xl);
  }

  .toast-message {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    line-height: 1.5;
    font-family: var(--font-family-primary);
  }

  .toast-close {
    font-size: var(--font-size-xl);
    color: var(--color-text-light);
  }

  .modal-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    font-family: var(--font-family-primary);
  }

  .modal-button {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    font-family: var(--font-family-primary);
  }
`;

const StoryImages = () => {
  const navigate = useNavigate();
  const isViewer = localStorage.getItem("userRole") === "viewer";
  const [activeTab, setActiveTab] = useState('1');
  const [stories, setStories] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingStories, setEditingStories] = useState({});
  const [editingChapters, setEditingChapters] = useState({});
  const [loadingStates, setLoadingStates] = useState({}); // Individual loading states
  const fileInputRefs = useRef(new Map());
  
  const [toast, setToast] = useState({
    isOpen: false,
    message: "",
    type: "success",
    position: "top",
  });

  // Show toast function
  const showToast = (message, type = "success", position = "top") => {
    setToast({
      isOpen: true,
      message,
      type,
      position,
    });
    setTimeout(() => {
      setToast({
        isOpen: false,
        message: "",
        type: "success",
        position: "top",
      });
    }, 5000);
  };

  // Helper function to set loading state for specific item
  const setItemLoading = (identifier, isLoading) => {
    setLoadingStates(prev => ({
      ...prev,
      [identifier]: isLoading
    }));
  };

  // Helper function to get loading state for specific item
  const getItemLoading = (identifier) => {
    return loadingStates[identifier] || false;
  };

  // Fetch data on component mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const storiesResponse = await storyImageService.getStoriesWithImages();
      setStories(storiesResponse.body || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch data');
      setLoading(false);
    }
  };

  // Handle file selection for stories
  const handleStoryFileSelect = (files, storyIdentifier) => {
    const file = files[0];
    if (!file) {
      showToast('No file selected', 'error');
      return;
    }

    // COMMENTED OUT: Image type validation temporarily disabled
    // const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    // if (!validTypes.includes(file.type)) {
    //   showToast('Please select a valid image file (JPEG, PNG, WebP, SVG)', 'error');
    //   return;
    // }

    // COMMENTED OUT: File size validation temporarily disabled
    // if (file.size > 5 * 1024 * 1024) {
    //   showToast('Image size should be less than 5MB', 'error');
    //   return;
    // }

    // Show loading state during validation
    setItemLoading(storyIdentifier, true);

    // COMMENTED OUT: Image dimension validation temporarily disabled
    // const img = new Image();
    // const url = URL.createObjectURL(file);
    
    // Add timeout to prevent hanging
    // const timeout = setTimeout(() => {
    //   URL.revokeObjectURL(url);
    //   setItemLoading(storyIdentifier, false);
    //   showToast('Image validation timed out. Please try again.', 'error');
    // }, 10000); // 10 second timeout

    // img.onload = () => {
    //   clearTimeout(timeout);
    //   URL.revokeObjectURL(url);
    //   setItemLoading(storyIdentifier, false);
      
    //   const requiredWidth = 325;
    //   const requiredHeight = 358;
      
    //   if (img.width !== requiredWidth || img.height !== requiredHeight) {
    //     showToast(`Image dimensions must be exactly ${requiredWidth}x${requiredHeight} pixels. Current dimensions: ${img.width}x${img.height}`, 'error');
    //     return;
    //   }

      // Proceed with the upload (validation temporarily disabled)
      const previewUrl = URL.createObjectURL(file);
      
      setStories(prev => {
        const updatedStories = prev.map(story => {
          const currentStoryIdentifier = story.subCategoryId || story.id || `story_${story.subCategoryName}`;
          if (currentStoryIdentifier === storyIdentifier) {
            return { 
              ...story, 
              tempImage: {
                file: file,
                url: previewUrl,
                name: file.name,
                size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`
              }
            };
          }
          return story;
        });
        return updatedStories;
      });

      setEditingStories(prev => ({ ...prev, [storyIdentifier]: true }));
      setItemLoading(storyIdentifier, false);
      showToast('Custom image selected. Click Save to apply or Cancel to revert.', 'success');
      
      // Clear the file input to allow re-selecting the same file
      const fileInput = fileInputRefs.current.get(storyIdentifier);
      if (fileInput) {
        fileInput.value = '';
      }
    // };

    // COMMENTED OUT: Image error handler temporarily disabled
    // img.onerror = () => {
    //   clearTimeout(timeout);
    //   URL.revokeObjectURL(url);
    //   setItemLoading(storyIdentifier, false);
    //   showToast('Error loading image. Please try again.', 'error');
    // };

    // img.src = url;
  };

  // Handle file selection for chapters
  const handleChapterFileSelect = (files, chapterIdentifier) => {
    const file = files[0];
    if (!file) {
      showToast('No file selected', 'error');
      return;
    }

    // COMMENTED OUT: Image type validation temporarily disabled
    // const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    // if (!validTypes.includes(file.type)) {
    //   showToast('Please select a valid image file (JPEG, PNG, WebP, SVG)', 'error');
    //   return;
    // }

    // COMMENTED OUT: File size validation temporarily disabled
    // if (file.size > 5 * 1024 * 1024) {
    //   showToast('Image size should be less than 5MB', 'error');
    //   return;
    // }

    // Show loading state during validation
    setItemLoading(chapterIdentifier, true);

    // COMMENTED OUT: Image dimension validation temporarily disabled
    // const img = new Image();
    // const url = URL.createObjectURL(file);
    
    // Add timeout to prevent hanging
    // const timeout = setTimeout(() => {
    //   URL.revokeObjectURL(url);
    //   setItemLoading(chapterIdentifier, false);
    //   showToast('Image validation timed out. Please try again.', 'error');
    // }, 10000); // 10 second timeout

    // img.onload = () => {
    //   clearTimeout(timeout);
    //   URL.revokeObjectURL(url);
    //   setItemLoading(chapterIdentifier, false);
      
    //   const requiredWidth = 325;
    //   const requiredHeight = 358;
      
    //   if (img.width !== requiredWidth || img.height !== requiredHeight) {
    //     showToast(`Image dimensions must be exactly ${requiredWidth}x${requiredHeight} pixels. Current dimensions: ${img.width}x${img.height}`, 'error');
    //     return;
    //   }

      // Proceed with the upload (validation temporarily disabled)
      const previewUrl = URL.createObjectURL(file);
      
      setChapters(prev => {
        const updatedChapters = prev.map(chapter => {
          const currentChapterIdentifier = chapter.chapterId || chapter.id || `chapter_${chapter.chapterName}`;
          if (currentChapterIdentifier === chapterIdentifier) {
            return { 
              ...chapter, 
              tempImage: {
                file: file,
                url: previewUrl,
                name: file.name,
                size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`
              }
            };
          }
          return chapter;
        });
        return updatedChapters;
      });

      setEditingChapters(prev => ({ ...prev, [chapterIdentifier]: true }));
      setItemLoading(chapterIdentifier, false);
      showToast('Custom image selected. Click Save to apply or Cancel to revert.', 'success');
      
      // Clear the file input to allow re-selecting the same file
      const fileInput = fileInputRefs.current.get(chapterIdentifier);
      if (fileInput) {
        fileInput.value = '';
      }
    // };

    // COMMENTED OUT: Image error handler temporarily disabled
    // img.onerror = () => {
    //   clearTimeout(timeout);
    //   URL.revokeObjectURL(url);
    //   setItemLoading(chapterIdentifier, false);
    //   showToast('Error loading image. Please try again.', 'error');
    // };

    // img.src = url;
  };

  // Handle save for stories
  const handleStorySave = async (storyIdentifier) => {
    const story = stories.find(s => {
      const currentStoryIdentifier = s.subCategoryId || s.id || `story_${s.subCategoryName}`;
      return currentStoryIdentifier === storyIdentifier;
    });
    
    if (!story || !story.tempImage) {
      showToast('No changes to save', 'error');
      return;
    }

    setItemLoading(storyIdentifier, true);
    try {
      const formData = new FormData();
      formData.append('image', story.tempImage.file);
      
      const subCategoryId = story.subCategoryId || storyIdentifier;
      console.log('Uploading story image:', {
        subCategoryId,
        fileName: story.tempImage.name,
        fileSize: story.tempImage.size
      });
      
      const response = await storyImageService.uploadStoryImage(formData, subCategoryId);
      
      if (!response || response.status !== 200) {
        throw new Error(response?.message || 'Upload failed');
      }
      
      setStories(prev => {
        const updatedStories = prev.map(s => {
          const currentStoryIdentifier = s.subCategoryId || s.id || `story_${s.subCategoryName}`;
          if (currentStoryIdentifier === storyIdentifier) {
            return { 
              ...s, 
              icon: response.body?.icon || story.tempImage.url,
              tempImage: null
            };
          }
          return s;
        });
        return updatedStories;
      });

      setEditingStories(prev => ({ ...prev, [storyIdentifier]: false }));
      showToast('Story image updated successfully!', 'success');
    } catch (err) {
      console.error('Save error:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to save image';
      showToast(errorMessage, 'error');
    } finally {
      setItemLoading(storyIdentifier, false);
    }
  };

  // Handle save for chapters
  const handleChapterSave = async (chapterIdentifier) => {
    const chapter = chapters.find(c => {
      const currentChapterIdentifier = c.chapterId || c.id || `chapter_${c.chapterName}`;
      return currentChapterIdentifier === chapterIdentifier;
    });
    
    if (!chapter || !chapter.tempImage) {
      showToast('No changes to save', 'error');
      return;
    }

    setItemLoading(chapterIdentifier, true);
    try {
      const formData = new FormData();
      formData.append('image', chapter.tempImage.file);
      // console.log(chapter,"=============================chapter");
      const chapterId = chapter.chapterId || chapterIdentifier;
      const storyId = chapter.storyId; // Get storyId from chapter data
      const chapterName = chapter.chapterName;
      console.log('Uploading chapter image:', {
        chapterId,
        storyId,
        chapterName: chapterName,
        fileName: chapter.tempImage.name,
        fileSize: chapter.tempImage.size
      });
      
      const response = await storyImageService.uploadChapterImage(formData, chapterId, storyId, chapterName);
      
      if (!response || response.status !== 200) {
        throw new Error(response?.message || 'Upload failed');
      }
      
      setChapters(prev => {
        const updatedChapters = prev.map(c => {
          const currentChapterIdentifier = c.chapterId || c.id || `chapter_${c.chapterName}`;
          if (currentChapterIdentifier === chapterIdentifier) {
            return { 
              ...c, 
              icon: response.body?.icon || chapter.tempImage.url,
              tempImage: null
            };
          }
          return c;
        });
        return updatedChapters;
      });

      setEditingChapters(prev => ({ ...prev, [chapterIdentifier]: false }));
      showToast('Chapter image updated successfully!', 'success');
    } catch (err) {
      console.error('Save error:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to save image';
      showToast(errorMessage, 'error');
    } finally {
      setItemLoading(chapterIdentifier, false);
    }
  };

  // Handle cancel for stories
  const handleStoryCancel = (storyIdentifier) => {
    setStories(prev => {
      const updatedStories = prev.map(story => {
        const currentStoryIdentifier = story.subCategoryId || story.id || `story_${story.subCategoryName}`;
        if (currentStoryIdentifier === storyIdentifier) {
          return { ...story, tempImage: null };
        }
        return story;
      });
      return updatedStories;
    });

    setEditingStories(prev => ({ ...prev, [storyIdentifier]: false }));
    showToast('Changes cancelled', 'info');
  };

  // Handle cancel for chapters
  const handleChapterCancel = (chapterIdentifier) => {
    setChapters(prev => {
      const updatedChapters = prev.map(chapter => {
        const currentChapterIdentifier = chapter.chapterId || chapter.id || `chapter_${chapter.chapterName}`;
        if (currentChapterIdentifier === chapterIdentifier) {
          return { ...chapter, tempImage: null };
        }
        return chapter;
      });
      return updatedChapters;
    });

    setEditingChapters(prev => ({ ...prev, [chapterIdentifier]: false }));
    showToast('Changes cancelled', 'info');
  };

  // Handle image preview
  const handleImageClick = (image) => {
    setSelectedImage(image);
  };

  // Handle file input click for stories
  const handleStoryUploadClick = (story) => {
    const storyIdentifier = story.subCategoryId || story.id || `story_${story.subCategoryName}`;
    const fileInput = fileInputRefs.current.get(storyIdentifier);
    if (fileInput) {
      fileInput.click();
    }
  };

  // Handle file input click for chapters
  const handleChapterUploadClick = (chapter) => {
    const chapterIdentifier = chapter.chapterId || chapter.id || `chapter_${chapter.chapterName}`;
    const fileInput = fileInputRefs.current.get(chapterIdentifier);
    if (fileInput) {
      fileInput.click();
    }
  };

  // Filter stories
  const filteredStories = loading ? [] : (stories || []).filter(story => {
    const matchesSearch = story.subCategoryName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Filter chapters
  const filteredChapters = loading ? [] : (chapters || []).filter(chapter => {
    const matchesSearch = chapter.chapterName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });
  async function handleChapterTabClick() {
    setActiveTab('2');
    const chaptersResponse = await storyImageService.getChaptersListForPersonal();
    setChapters(chaptersResponse.body || []);
  }
  async function handleStoryTabClick() {
    setActiveTab('1');
    setChapters([]);
  }
  // Loading skeleton
  const StorySkeleton = () => (
    <div className="story-card">
      <div className="story-header loading-pulse" style={{ height: '80px' }}></div>
      <div className="story-image-section">
        <div style={{ 
          width: '100%', 
          height: '200px', 
          backgroundColor: '#e2e8f0', 
          borderRadius: '12px',
          marginBottom: '1rem',
          animation: 'pulse 1.5s ease-in-out infinite'
        }}></div>
        <div style={{ 
          width: '80%', 
          height: '40px', 
          backgroundColor: '#e2e8f0', 
          borderRadius: '8px',
          margin: '0 auto',
          animation: 'pulse 1.5s ease-in-out infinite'
        }}></div>
      </div>
    </div>
  );

  if (error) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <Alert color="danger">
              <h4 className="alert-heading">Error!</h4>
              <p>{error}</p>
            </Alert>
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
            <h3 className="page-title">VISION DATASET</h3>
            
            {/* Tab Navigation */}
            <div className="tab-nav">
              <Nav tabs>
                <NavItem >
                  <NavLink
                    className={classnames({ active: activeTab === '1' })}
                    onClick={handleStoryTabClick}
                  >
                    <i className="fas fa-book mr-2"></i>
                    Story Images
                  </NavLink>
                </NavItem>
                <NavItem >
                  <NavLink
                    className={classnames({ active: activeTab === '2' })}
                    onClick={handleChapterTabClick}
                  >
                    <i className="fas fa-list mr-2"></i>
                    Chapter Images
                  </NavLink>
                </NavItem>
              </Nav>
            </div>

            <TabContent activeTab={activeTab}>
              {/* Stories Tab */}
              <TabPane tabId="1">
                {/* Dimension Requirements */}
                {/* <div className="alert alert-primary mb-4" style={{ borderRadius: '12px', border: 'none' }}>
                  <div className="d-flex align-items-center">
                    <i className="fas fa-info-circle mr-3 alert-info-icon"></i>
                    <div>
                      <h6 className="alert-title"></h6>
                      <p className="alert-text">
                        All story images must be exactly <strong>325×358 pixels</strong> and under <strong>5MB</strong>. 
                        Images with incorrect dimensions will be rejected.
                      </p>
                    </div>
                  </div>
                </div> */}

                {/* Search Section */}
                <div className="search-section">
                  <FormGroup>
                    <Label for="search" className="search-label">Search Stories</Label>
                    <Input
                      id="search"
                      type="text"
                      className="search-input"
                      placeholder="Search by story name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </div>

                {/* Stories Grid */}
                {loading ? (
                  <div className="story-grid">
                    {[...Array(6)].map((_, index) => (
                      <StorySkeleton key={index} />
                    ))}
                  </div>
                ) : filteredStories.length > 0 ? (
                  <div className="story-grid">
                    {filteredStories.map((story) => {
                      const storyIdentifier = story.subCategoryId || story.id || `story_${story.subCategoryName}`;
                      const isEditing = editingStories[storyIdentifier];
                      const displayImage = isEditing && story.tempImage ? story.tempImage.url : story.icon;
                      
                      return (
                        <Card key={storyIdentifier} className="story-card">
                          <div className="story-header">
                            <h3 className="story-title">{story.subCategoryName}</h3>
                          </div>
                          
                          <div className="story-image-section">
                            <div className="story-image-container">
                              {displayImage ? (
                                <>
                                  <img
                                    src={displayImage}
                                    alt={story.subCategoryName}
                                    className="story-image-preview"
                                    onClick={() => handleImageClick(displayImage)}
                                  />
                                  <div className="story-image-overlay">
                                    <Button
                                      size="sm"
                                      color="primary"
                                      onClick={() => handleImageClick(displayImage)}
                                    >
                                      <i className="fas fa-eye"></i> Preview
                                    </Button>
                                  </div>
                                  {isEditing && (
                                    <Badge color="warning" className="image-status">
                                      <i className="fas fa-edit"></i> Preview
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <div className="no-image-placeholder">
                                  <i className="fas fa-image"></i>
                                  <p>No Image</p>
                                </div>
                              )}
                            </div>
                            
                            <div className="action-buttons">
                              {!isEditing ? (
                                <div className="text-center">
                                  <div className="mb-2">
                                    <small className="requirement-text">
                                      <i className="fas fa-info-circle mr-1"></i>
                                      Required: 325×358 pixels, max 5MB
                                    </small>
                                  </div>
                                  {!isViewer && (
                                    <Button
                                      color="primary"
                                      className="btn-custom-primary"
                                      onClick={() => handleStoryUploadClick(story)}
                                      disabled={getItemLoading(storyIdentifier)}
                                    >
                                      {getItemLoading(storyIdentifier) ? (
                                        <>
                                          <Spinner size="sm" className="mr-2" />
                                          Validating...
                                        </>
                                      ) : (
                                        <>
                                          <i className="fas fa-upload mr-2"></i>
                                          Upload Image
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <>
                                  {!isViewer && (
                                    <>
                                      <Button
                                        color="primary"
                                        className="btn-custom-primary"
                                        onClick={() => handleStorySave(storyIdentifier)}
                                        disabled={getItemLoading(storyIdentifier)}
                                      >
                                        {getItemLoading(storyIdentifier) ? (
                                          <>
                                            <Spinner size="sm" className="mr-2" />
                                            Saving...
                                          </>
                                        ) : (
                                          <>
                                            <i className="fas fa-save mr-2"></i>
                                            Save
                                          </>
                                        )}
                                      </Button>
                                      <Button
                                        color="secondary"
                                        className="btn-custom-secondary"
                                        onClick={() => handleStoryCancel(storyIdentifier)}
                                        disabled={getItemLoading(storyIdentifier)}
                                      >
                                        <i className="fas fa-times mr-2"></i>
                                        Cancel
                                      </Button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          
                          {/* Hidden file input for this story */}
                          <input
                            ref={(el) => {
                              if (el) {
                                const storyIdentifier = story.subCategoryId || story.id || `story_${story.subCategoryName}`;
                                fileInputRefs.current.set(storyIdentifier, el);
                              } else {
                                const storyIdentifier = story.subCategoryId || story.id || `story_${story.subCategoryName}`;
                                fileInputRefs.current.delete(storyIdentifier);
                              }
                            }}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const storyIdentifier = story.subCategoryId || story.id || `story_${story.subCategoryName}`;
                              handleStoryFileSelect(e.target.files, storyIdentifier);
                            }}
                          />
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <i className="fas fa-book"></i>
                    <h5>No stories found</h5>
                    <p>Try adjusting your search or create new stories.</p>
                  </div>
                )}
              </TabPane>

              {/* Chapters Tab */}
              <TabPane tabId="2">
                {/* Dimension Requirements */}
                {/* <div className="alert alert-primary mb-4" style={{ borderRadius: '12px', border: 'none' }}>
                  <div className="d-flex align-items-center"> */}
                    {/* <i className="fas fa-info-circle mr-3 alert-info-icon"></i> */}
                    {/* <div>
                      <h6 className="alert-title"></h6>
                      <p className="alert-text">
                        All chapter images must be exactly <strong>325×358 pixels</strong> and under <strong>5MB</strong>. 
                        Images with incorrect dimensions will be rejected.
                      </p>
                    </div> */}
                  {/* </div>
                </div> */}

                {/* Search Section */}
                <div className="search-section">
                  <FormGroup>
                    <Label for="search" className="search-label">Search Chapters</Label>
                    <Input
                      id="search"
                      type="text"
                      className="search-input"
                      placeholder="Search by chapter name"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </div>

                {/* Chapters Grid */}
                {loading ? (
                  <div className="story-grid">
                    {[...Array(6)].map((_, index) => (
                      <StorySkeleton key={index} />
                    ))}
                  </div>
                ) : filteredChapters.length > 0 ? (
                  <div className="story-grid">
                    {filteredChapters.map((chapter) => {
                      const chapterIdentifier = chapter.chapterId || chapter.id || `chapter_${chapter.chapterName}`;
                      const isEditing = editingChapters[chapterIdentifier];
                      const displayImage = isEditing && chapter.tempImage ? chapter.tempImage.url : chapter.icon;
                      
                      return (
                        <Card key={chapterIdentifier} className="story-card">
                          <div className="story-header">
                            <h3 className="story-title">{chapter.chapterName}</h3>
                          </div>
                          
                          <div className="story-image-section">
                            <div className="story-image-container">
                              {displayImage ? (
                                <>
                                  <img
                                    src={displayImage}
                                    alt={chapter.chapterName}
                                    className="story-image-preview"
                                    onClick={() => handleImageClick(displayImage)}
                                  />
                                  <div className="story-image-overlay">
                                    <Button
                                      size="sm"
                                      color="primary"
                                      onClick={() => handleImageClick(displayImage)}
                                    >
                                      <i className="fas fa-eye"></i> Preview
                                    </Button>
                                  </div>
                                  {isEditing && (
                                    <Badge color="warning" className="image-status">
                                      <i className="fas fa-edit"></i> Preview
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <div className="no-image-placeholder">
                                  <i className="fas fa-image"></i>
                                  <p>No Image</p>
                                </div>
                              )}
                            </div>
                            
                            <div className="action-buttons">
                              {!isEditing ? (
                                <div className="text-center">
                                  <div className="mb-2">
                                    <small className="requirement-text">
                                      <i className="fas fa-info-circle mr-1"></i>
                                      Required: 325×358 pixels, max 5MB
                                    </small>
                                  </div>
                                  {!isViewer && (
                                    <Button
                                      color="primary"
                                      className="btn-custom-primary"
                                      onClick={() => handleChapterUploadClick(chapter)}
                                      disabled={getItemLoading(chapterIdentifier)}
                                    >
                                      {getItemLoading(chapterIdentifier) ? (
                                        <>
                                          <Spinner size="sm" className="mr-2" />
                                          Validating...
                                        </>
                                      ) : (
                                        <>
                                          <i className="fas fa-upload mr-2"></i>
                                          Upload Image
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <>
                                  {!isViewer && (
                                    <>
                                      <Button
                                        color="primary"
                                        className="btn-custom-primary"
                                        onClick={() => handleChapterSave(chapterIdentifier)}
                                        disabled={getItemLoading(chapterIdentifier)}
                                      >
                                        {getItemLoading(chapterIdentifier) ? (
                                          <>
                                            <Spinner size="sm" className="mr-2" />
                                            Saving...
                                          </>
                                        ) : (
                                          <>
                                            <i className="fas fa-save mr-2"></i>
                                            Save
                                          </>
                                        )}
                                      </Button>
                                      <Button
                                        color="secondary"
                                        className="btn-custom-secondary"
                                        onClick={() => handleChapterCancel(chapterIdentifier)}
                                        disabled={getItemLoading(chapterIdentifier)}
                                      >
                                        <i className="fas fa-times mr-2"></i>
                                        Cancel
                                      </Button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          
                          {/* Hidden file input for this chapter */}
                          <input
                            ref={(el) => {
                              if (el) {
                                const chapterIdentifier = chapter.chapterId || chapter.id || `chapter_${chapter.chapterName}`;
                                fileInputRefs.current.set(chapterIdentifier, el);
                              } else {
                                const chapterIdentifier = chapter.chapterId || chapter.id || `chapter_${chapter.chapterName}`;
                                fileInputRefs.current.delete(chapterIdentifier);
                              }
                            }}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const chapterIdentifier = chapter.chapterId || chapter.id || `chapter_${chapter.chapterName}`;
                              handleChapterFileSelect(e.target.files, chapterIdentifier);
                            }}
                          />
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <i className="fas fa-list"></i>
                    <h5>No chapters found</h5>
                    <p>Try adjusting your search or create new chapters.</p>
                  </div>
                )}
              </TabPane>
            </TabContent>
          </div>
        </Row>

        {/* Image Preview Modal */}
        <Modal isOpen={!!selectedImage} toggle={() => setSelectedImage(null)} size="lg" centered>
          <ModalHeader toggle={() => setSelectedImage(null)} className="modal-title">
            Image Preview
          </ModalHeader>
          <ModalBody>
            {selectedImage && (
              <div className="text-center">
                <img
                  src={selectedImage}
                  alt="Preview"
                  style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }}
                />
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={() => setSelectedImage(null)} className="modal-button">
              Close
            </Button>
          </ModalFooter>
        </Modal>

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
                toast.type === "success" ? "#2dce89" : toast.type === "error" ? "#f5365c" : "#3A6D8C"
              }`,
              borderRadius: "0.375rem",
              boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.15)",
            }}
          >
            <div className="d-flex align-items-center p-3">
              <div className="mr-3">
                <i
                  className={`ni ni-${
                    toast.type === "success" ? "check-bold" : toast.type === "error" ? "alert-circle" : "info"
                  } toast-icon`}
                  style={{
                    color: toast.type === "success" ? "#2dce89" : toast.type === "error" ? "#f5365c" : "#3A6D8C",
                  }}
                />
              </div>
              <div className="flex-grow-1">
                <p className="mb-0 toast-message" style={{
                  color: toast.type === "success" ? "#2dce89" : toast.type === "error" ? "#f5365c" : "#3A6D8C",
                }}>
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                className="close ml-3 toast-close"
                onClick={() => setToast((prev) => ({ ...prev, isOpen: false }))}
                style={{
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
    </>
  );
};

export default StoryImages;
