import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Card,
  CardBody,
  Spinner,
  Alert,
  FormGroup,
  Input,
  Label,
} from "reactstrap";
import storyService from "../services/storyService";

const StoryTemplateSelector = ({ isOpen, toggle, onTemplateSelect }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [newStoryName, setNewStoryName] = useState("");
  const [newStoryDescription, setNewStoryDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await storyService.getStoriesList();
      const stories = response?.body || response?.data?.body || [];
      setTemplates(stories);
    } catch (err) {
      setError("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setNewStoryName(`Copy of ${template.storyName}`);
    setNewStoryDescription(template.description || "");
  };

  const handleCreateFromTemplate = async () => {
    if (!newStoryName.trim()) {
      setError("Story name is required");
      return;
    }
    if (!newStoryDescription.trim()) {
      setError("Story description is required");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const response = await storyService.copyStory(
        selectedTemplate.storyId,
        newStoryName.trim(),
        newStoryDescription.trim()
      );
      if (response.status === 201) {
        onTemplateSelect(response.body.story);
        handleClose();
      } else {
        setError("Failed to create from template");
      }
    } catch (err) {
      setError("Error creating story");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    toggle();
    setSelectedTemplate(null);
    setNewStoryName("");
    setNewStoryDescription("");
    setError(null);
  };

  return (
    <Modal isOpen={isOpen} toggle={handleClose} size="lg">
      <ModalHeader toggle={handleClose}>Select a Story Template</ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}

        {/* <Button
          color="primary"
          onClick={() => {
            handleClose(); // let parent handle manual creation
          }}
          className="mb-3"
        >
          <i className="fas fa-plus mr-2" />
          Create Manually
        </Button> */}

        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
            <p className="mt-2 text-muted">Loading templates...</p>
          </div>
        ) : (
          <>
            {templates.length === 0 && (
              <p className="text-muted text-center">No templates available</p>
            )}

            {templates.map((template) => (
              <Card
                key={template.storyId}
                onClick={() => handleTemplateSelect(template)}
                className={`mb-2 cursor-pointer ${
                  selectedTemplate?.storyId === template.storyId
                    ? "border-primary bg-light"
                    : "border-light"
                }`}
                style={{ cursor: "pointer" }}
              >
                <CardBody style={{fontWeight:"300",color:"black",height:"50px",display:"flex",alignItems:"center"}}>
                  <h6 className="mb-1">{template.storyName}</h6>
                </CardBody>

                {selectedTemplate?.storyId === template.storyId && (
                  <div className="p-3 border-top">
                    <FormGroup>
                      <Label >Story Name <span className="text-danger">*</span></Label>
                      <Input
                        value={newStoryName}
                        style={{color:"black"}}
                        onChange={(e) => setNewStoryName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Enter story name"
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>Description <span className="text-danger">*</span></Label>
                      <Input
                        type="textarea"
                        rows={3}
                        style={{color:"black"}}
                        value={newStoryDescription}
                        onChange={(e) => setNewStoryDescription(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Enter description"
                      />
                    </FormGroup>
                    <Button
                      color="primary"
                      onClick={handleCreateFromTemplate}
                      disabled={creating || !newStoryName.trim() || !newStoryDescription.trim()}
                    >
                      {creating ? (
                        <>
                          <Spinner size="sm" className="me-2" /> Creating...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-check me-2" /> Create from
                          Template
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={handleClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default StoryTemplateSelector;
