import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Card,
  CardBody,
  Badge,
  Input,
  FormGroup,
  Label,
  Spinner,
  Alert,
  Collapse
} from 'reactstrap';
import storyService from '../services/storyService';

const ChapterImportModal = ({ 
  isOpen, 
  toggle, 
  currentStoryId,
  onChaptersImported 
}) => {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState([]);
  const [expandedStories, setExpandedStories] = useState([]);
  const [copyItems, setCopyItems] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && currentStoryId) {
      loadChaptersFromOtherStories();
    }
  }, [isOpen, currentStoryId]);

  const loadChaptersFromOtherStories = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await storyService.getChaptersFromOtherStories(currentStoryId);
      setStories(response.body || []);
    } catch (error) {
      console.error('Error loading chapters:', error);
      setError('Failed to load chapters from other stories');
    } finally {
      setLoading(false);
    }
  };

  const toggleStoryExpansion = (storyId) => {
    setExpandedStories(prev => 
      prev.includes(storyId) 
        ? prev.filter(id => id !== storyId)
        : [...prev, storyId]
    );
  };

  const handleChapterSelection = (chapter, storyId) => {
    const chapterKey = `${storyId}-${chapter.chapterId}`;
    setSelectedChapters(prev => {
      const isSelected = prev.some(c => c.key === chapterKey);
      if (isSelected) {
        return prev.filter(c => c.key !== chapterKey);
      } else {
        return [...prev, {
          key: chapterKey,
          chapterId: chapter.chapterId,
          chapterName: chapter.chapterName,
          storyId: storyId,
          itemsCount: chapter.itemsCount
        }];
      }
    });
  };

  const handleSelectAllFromStory = (story) => {
    const storyChapterKeys = story.chapters.map(ch => `${story.storyId}-${ch.chapterId}`);
    const allSelected = storyChapterKeys.every(key => 
      selectedChapters.some(c => c.key === key)
    );

    if (allSelected) {
      // Deselect all chapters from this story
      setSelectedChapters(prev => 
        prev.filter(c => !storyChapterKeys.includes(c.key))
      );
    } else {
      // Select all chapters from this story
      const newChapters = story.chapters
        .filter(ch => !selectedChapters.some(c => c.key === `${story.storyId}-${ch.chapterId}`))
        .map(ch => ({
          key: `${story.storyId}-${ch.chapterId}`,
          chapterId: ch.chapterId,
          chapterName: ch.chapterName,
          storyId: story.storyId,
          itemsCount: ch.itemsCount
        }));
      
      setSelectedChapters(prev => [...prev, ...newChapters]);
    }
  };

  const handleImportChapters = async () => {
    if (selectedChapters.length === 0) {
      setError('Please select at least one chapter to import');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      // Group chapters by source story
      const chaptersByStory = selectedChapters.reduce((acc, chapter) => {
        if (!acc[chapter.storyId]) {
          acc[chapter.storyId] = [];
        }
        acc[chapter.storyId].push(chapter.chapterId);
        return acc;
      }, {});

      // Import chapters from each source story
      for (const [sourceStoryId, chapterIds] of Object.entries(chaptersByStory)) {
        await storyService.copyChaptersToStory(
          currentStoryId,
          parseInt(sourceStoryId),
          chapterIds,
          copyItems
        );
      }

      onChaptersImported();
      toggle();
      resetForm();
    } catch (error) {
      console.error('Error importing chapters:', error);
      setError(error.message || 'Failed to import chapters');
    } finally {
      setImporting(false);
    }
  };

  const resetForm = () => {
    setSelectedChapters([]);
    setExpandedStories([]);
    setCopyItems(true);
    setError(null);
  };

  const handleClose = () => {
    toggle();
    resetForm();
  };

  const isChapterSelected = (chapter, storyId) => {
    return selectedChapters.some(c => c.key === `${storyId}-${chapter.chapterId}`);
  };

  const isStoryFullySelected = (story) => {
    return story.chapters.every(ch => isChapterSelected(ch, story.storyId));
  };

  return (
    <Modal isOpen={isOpen} toggle={handleClose} size="lg">
      <ModalHeader toggle={handleClose}>
        Import Chapters from Other Stories
      </ModalHeader>
      <ModalBody>
        {error && (
          <Alert color="danger" className="mb-3">
            {error}
          </Alert>
        )}

        {/* <FormGroup check className="mb-3">
          <Label check>
            <Input
              type="checkbox"
              checked={copyItems}
              onChange={(e) => setCopyItems(e.target.checked)}
            />
            Also copy items from selected chapters
          </Label>
        </FormGroup> */}

        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
            <p className="mt-2">Loading chapters...</p>
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {stories.map((story) => (
              <Card key={story.storyId} className="mb-2">
                <CardBody className="py-2">
                  <div 
                    className="d-flex justify-content-between align-items-center cursor-pointer"
                    onClick={() => toggleStoryExpansion(story.storyId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="d-flex align-items-center">
                      <i className={`fas fa-chevron-${expandedStories.includes(story.storyId) ? 'down' : 'right'} mr-2`}></i>
                      <h5 className="mb-0">{story.storyName}</h5>
                    </div>
                    <div>
                      <Button
                        size="sm"
                        color={isStoryFullySelected(story) ? "primary" : "outline-primary"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectAllFromStory(story);
                        }}
                      >
                        {isStoryFullySelected(story) ? 'Deselect All' : 'Select All'}
                      </Button>
                      <Badge color="primary" className="ms-2">
                        {story.chapters.length} chapters
                      </Badge>
                    </div>
                  </div>

                  <Collapse isOpen={expandedStories.includes(story.storyId)}>
                    <div className="mt-2 ps-4">
                      {story.chapters.map((chapter) => (
                        <div 
                          key={chapter.chapterId}
                          className={`d-flex justify-content-between align-items-center p-2 mb-1 rounded cursor-pointer ${
                            isChapterSelected(chapter, story.storyId) ? 'bg-light border' : 'border-light'
                          }`}
                          onClick={() => handleChapterSelection(chapter, story.storyId)}
                          style={{ cursor: 'pointer',border:"1px solid #000000"}}
                        >
                          <div className="d-flex align-items-center">
                            <Input
                            style={{position:"relative",marginLeft:"0px"}}
                              type="checkbox"
                              checked={isChapterSelected(chapter, story.storyId)}
                              onChange={() => {}} // Handled by parent click
                              className="mr-2"
                            />
                            <div>
                              <span className="fw-sm" style={{fontSize:"14px"}}>{chapter.chapterName}</span>
                            </div>
                          </div>
                          <Badge color="primary">
                            {chapter.itemsCount} items
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Collapse>
                </CardBody>
              </Card>
            ))}
            {stories.length === 0 && !loading && (
              <p className="text-muted text-center py-3">No chapters available from other stories</p>
            )}
          </div>
        )}

        {selectedChapters.length > 0 && (
          <div className="mt-3 p-2 bg-light rounded">
            <small className="text-black">
              Selected: {selectedChapters.length} chapter(s) 
              {copyItems && ` with ${selectedChapters.reduce((sum, ch) => sum + ch.itemsCount, 0)} item(s)`}
            </small>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button 
          color="primary" 
          onClick={handleImportChapters}
          disabled={importing || selectedChapters.length === 0}
        >
          {importing ? (
            <>
              <Spinner size="sm" className="me-2" />
              Importing...
            </>
          ) : (
            `Import ${selectedChapters.length} Chapter(s)`
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ChapterImportModal;