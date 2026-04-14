import React, { useState, useEffect } from "react";
// reactstrap components
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
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
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Spinner,
  Alert,
  Pagination,
  PaginationItem,
  PaginationLink,
  CardFooter,
} from "reactstrap";
import assistanceTopicsService from "services/assistanceTopicsService";

function ContentTopicDetails() {
  const [searchTerm, setSearchTerm] = useState("");
  const [modal, setModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [contentTopics, setContentTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState(null);

  // Table styles to match Tables component
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
      whiteSpace: 'normal',
      padding: '8px 4px',
      textAlign: 'center',
      fontSize: '0.875rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      minHeight: '32px',
      lineHeight: '24px',
      verticalAlign: 'middle',
      wordBreak: 'break-word'
    }
  };

  // Fetch data from API
  const fetchTopics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await assistanceTopicsService.getAllTopics();
      setContentTopics(response || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch topics');
      console.error('Error fetching topics:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    fetchTopics();
  }, []);

  const toggleModal = () => setModal(!modal);

  const handleEdit = (item) => {
    setEditingItem(item);
    setModal(true);
  };

  const handleSave = async () => {
    if (editingItem) {
      setSubmitting(true);
      try {
        // Validate required fields
        if (!editingItem.category || !editingItem.assistance_type || !editingItem.customer_journey_stage || 
            !editingItem.target_age_segment || !editingItem.topic || !editingItem.content) {
          alert('Please fill in all required fields (Category, Assistance Type, Customer Journey Stage, Target Age Segment, Topic, and Content)');
          setSubmitting(false);
          return;
        }

        if (editingItem.id) {
          // Update existing topic
          await assistanceTopicsService.updateTopic(editingItem.id, editingItem);
          alert('Topic updated successfully!');
        } else {
          // Create new topic
          const newTopic = await assistanceTopicsService.createTopic(editingItem);
          console.log('New topic created:', newTopic);
          alert('Topic created successfully!');
        }
        setModal(false);
        setEditingItem(null);
        // Refresh the data
        fetchTopics();
      } catch (err) {
        console.error('Error saving topic:', err);
        alert(`Failed to save topic: ${err.message || 'Please try again.'}`);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleInputChange = (field, value) => {
    setEditingItem(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleDelete = async (topic) => {
    setTopicToDelete(topic);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!topicToDelete) return;
    try {
      await assistanceTopicsService.deleteTopic(topicToDelete.id);
      alert('Topic deleted successfully!');
      fetchTopics();
    } catch (err) {
      console.error('Error deleting topic:', err);
      alert(`Failed to delete topic: ${err.message || 'Please try again.'}`);
    } finally {
      setDeleteModalOpen(false);
      setTopicToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setTopicToDelete(null);
  };

  // Pagination logic
  const filteredTopics = Array.isArray(contentTopics) ? contentTopics.filter(topic =>
    Object.values(topic).some(value =>
      value && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
  ) : [];

  const totalPages = Math.ceil(filteredTopics.length / recordsPerPage);
  const paginatedTopics = filteredTopics.slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Reset to first page on search/filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, contentTopics]);

  // Pagination helpers
  const getVisiblePages = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) {
      return [1, 2, 3, 4, 5];
    }
    if (currentPage >= totalPages - 2) {
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
  };
  const shouldShowLeftArrow = () => currentPage > 1;
  const shouldShowRightArrow = () => currentPage < totalPages;
  const getEntryRange = () => {
    const start = (currentPage - 1) * recordsPerPage + 1;
    const end = Math.min(currentPage * recordsPerPage, filteredTopics.length);
    return { start, end };
  };

  const getBadgeColor = (category) => {
    const colors = {
      "Technology": "primary",
      "Health & Wellness": "success",
      "Finance": "warning",
      "Education": "info",
      "Entertainment": "secondary"
    };
    return colors[category] || "light";
  };

  // Show loading state
  if (loading) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>CONTENT TOPIC DETAILS</h3>
            <Card className="shadow">
              <CardBody className="text-center py-5">
                <Spinner color="primary" />
                <p className="mt-3 text-muted">Loading topics...</p>
              </CardBody>
            </Card>
          </div>
        </Row>
      </Container>
    );
  }

  // Show error state
  if (error) {
    return (
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>CONTENT TOPIC DETAILS</h3>
            <Alert color="danger">
              <h4 className="alert-heading">Error Loading Topics</h4>
              <p>{error}</p>
              <hr />
              <Button color="danger" onClick={fetchTopics}>
                Try Again
              </Button>
            </Alert>
          </div>
        </Row>
      </Container>
    );
  }

  return (
    <>
      {/* Page content */}
      <Container fluid className="pt-6">
        <Row>
          <div className="col">
            <h3 className="mb-4 text-white" style={{ fontSize: '1.25rem' }}>CONTENT TOPIC DETAILS</h3>
            <Card className="shadow">
              <CardHeader className="border-0">
                <Row className="mt-3">
                  <Col md="6">
                    <InputGroup>
                      <InputGroupText>
                        <i className="fas fa-search"></i>
                      </InputGroupText>
                      <Input
                        placeholder="Search topics..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-control-alternative"
                      />
                    </InputGroup>
                  </Col>
                  <Col md="6" className="text-right">
                    <Button 
                      color="primary" 
                      size="sm"
                      onClick={() => {
                        setEditingItem({});
                        setModal(true);
                      }}
                    >
                      <i className="fas fa-plus mr-1"></i>
                      Add New Topic
                    </Button>
                  </Col>
                </Row>
              </CardHeader>
              <CardBody className="px-0 pt-0 pb-2">
                <div className="table-responsive">
                  <Table className="align-items-center table-flush mb-0" style={{...tableStyles.table, position: 'relative'}}>
                    <thead className="thead-light">
                      <tr>
                        <th style={{...tableStyles.th, width: '5%'}}>#</th>
                        <th style={{...tableStyles.th, width: '12%'}}>Category</th>
                        <th style={{...tableStyles.th, width: '12%'}}>Assistance Type</th>
                        <th style={{...tableStyles.th, width: '12%'}}>Customer Journey Stage</th>
                        <th style={{...tableStyles.th, width: '10%'}}>Target Age Segment</th>
                        <th style={{...tableStyles.th, width: '15%'}}>Topic</th>
                        <th style={{...tableStyles.th, width: '15%'}}>Content</th>
                        <th style={{...tableStyles.th, width: '12%'}}>Starting Paragraph</th>
                        <th style={{...tableStyles.th, width: '12%'}}>Ending Paragraph</th>
                        <th style={{...tableStyles.th, width: '10%'}}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTopics.map((topic, index) => (
                        <tr key={topic.id}>
                          <td style={{...tableStyles.td, width: '5%'}}>
                            <strong>{(currentPage - 1) * recordsPerPage + index + 1}</strong>
                          </td>
                          <td style={{...tableStyles.td, width: '12%'}}>
                            <Badge color={getBadgeColor(topic.category)}>
                              {topic.category}
                            </Badge>
                          </td>
                          <td style={{...tableStyles.td, width: '12%'}}>{topic.assistance_type}</td>
                          <td style={{...tableStyles.td, width: '12%'}}>
                            <Badge 
                              color="warning" 
                              className="text-white"
                              style={{ backgroundColor: '#ffc107', color: '#000' }}
                            >
                              {topic.customer_journey_stage}
                            </Badge>
                          </td>
                          <td style={{...tableStyles.td, width: '10%'}}>{topic.target_age_segment}</td>
                          <td style={{...tableStyles.td, width: '15%'}}>
                            <strong>{topic.topic}</strong>
                          </td>
                          <td style={{...tableStyles.td, width: '15%'}}>
                            <div style={{ maxWidth: "200px" }}>
                              {topic.content && topic.content.length > 100 
                                ? `${topic.content.substring(0, 100)}...` 
                                : topic.content || 'N/A'
                              }
                            </div>
                          </td>
                          <td style={{...tableStyles.td, width: '12%'}}>
                            <div style={{ maxWidth: "150px" }}>
                              {topic.starting_paragraph && topic.starting_paragraph.length > 80 
                                ? `${topic.starting_paragraph.substring(0, 80)}...` 
                                : topic.starting_paragraph || 'N/A'
                              }
                            </div>
                          </td>
                          <td style={{...tableStyles.td, width: '12%'}}>
                            <div style={{ maxWidth: "150px" }}>
                              {topic.ending_paragraph && topic.ending_paragraph.length > 80 
                                ? `${topic.ending_paragraph.substring(0, 80)}...` 
                                : topic.ending_paragraph || 'N/A'
                              }
                            </div>
                          </td>
                          <td style={{...tableStyles.td, width: '10%', position: 'relative'}}>
                            <UncontrolledDropdown>
                              <DropdownToggle
                                className="btn btn-sm btn-outline-secondary"
                                href="#pablo"
                                role="button"
                                size="sm"
                                onClick={(e) => e.preventDefault()}
                              >
                                <i className="fas fa-ellipsis-v" />
                              </DropdownToggle>
                              <DropdownMenu 
                                className="dropdown-menu-arrow" 
                                right
                                container="body"
                                style={{ 
                                  minWidth: '120px',
                                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                                  border: '1px solid #e9ecef',
                                  zIndex: 9999,
                                  backgroundColor: 'white'
                                }}
                              >
                                <DropdownItem
                                  href="#pablo"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleEdit(topic);
                                  }}
                                  style={{ 
                                    padding: '8px 16px',
                                    fontSize: '14px',
                                    color: '#495057'
                                  }}
                                >
                                  <i className="fas fa-edit mr-2" style={{ color: '#007bff' }} />
                                  Edit
                                </DropdownItem>
                                <DropdownItem
                                  href="#pablo"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleDelete(topic);
                                  }}
                                  style={{ 
                                    padding: '8px 16px',
                                    fontSize: '14px',
                                    color: '#dc3545'
                                  }}
                                >
                                  <i className="fas fa-trash mr-2" style={{ color: '#dc3545' }} />
                                  Delete
                                </DropdownItem>
                              </DropdownMenu>
                            </UncontrolledDropdown>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>

                {/* Pagination Controls - CardFooter style */}
                <CardFooter className="py-4">
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="text-muted">
                      {filteredTopics.length > 0
                        ? `Showing ${getEntryRange().start} to ${getEntryRange().end} of ${filteredTopics.length} entries`
                        : 'No entries found'}
                    </div>
                    {totalPages > 1 && (
                      <nav aria-label="...">
                        <Pagination
                          className="pagination justify-content-end mb-0"
                          listClassName="justify-content-end mb-0"
                        >
                          {/* First Page */}
                          <PaginationItem disabled={currentPage === 1}>
                            <PaginationLink
                              href="#pablo"
                              onClick={e => { e.preventDefault(); handlePageChange(1); }}
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
                                onClick={e => { e.preventDefault(); handlePageChange(currentPage - 1); }}
                              >
                                <i className="fas fa-angle-left" />
                                <span className="sr-only">Previous</span>
                              </PaginationLink>
                            </PaginationItem>
                          )}
                          {/* Page Numbers */}
                          {getVisiblePages().map(pageNum => (
                            <PaginationItem key={pageNum} className={currentPage === pageNum ? 'active' : ''}>
                              <PaginationLink
                                href="#pablo"
                                onClick={e => { e.preventDefault(); handlePageChange(pageNum); }}
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
                                onClick={e => { e.preventDefault(); handlePageChange(currentPage + 1); }}
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
                              onClick={e => { e.preventDefault(); handlePageChange(totalPages); }}
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

                {filteredTopics.length === 0 && (
                  <div className="text-center py-4">
                    <i className="fas fa-inbox fa-3x text-muted mb-3"></i>
                    <h5 className="text-muted">No content topics found</h5>
                    <p className="text-muted">Try adjusting your search criteria</p>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </Row>
      </Container>

      {/* Edit Modal */}
      <Modal isOpen={modal} toggle={toggleModal} size="lg">
        <ModalHeader toggle={toggleModal}>
          <span className="custom-modal-title">
            {editingItem && editingItem.id ? "Edit Content Topic" : "Add Content Topic"}
          </span>
        </ModalHeader>
        <ModalBody>
          <Form>
              <Row>
                <Col md="6">
                  <FormGroup>
                    <Label for="category">Category</Label>
                    <Input
                      id="category"
                      type="select"
                      value={editingItem?.category || ''}
                      onChange={(e) => handleInputChange("category", e.target.value)}
                    >
                      <option value="">Select Category</option>
                      <option value="Caregiving">Caregiving</option>
                      <option value="Lifestyle">Lifestyle</option>
                      <option value="Estate planning">Estate planning</option>
                      <option value="Financial planning">Financial planning</option>
                      <option value="Legal planning">Legal planning</option>
                      <option value="Physical health">Physical health</option>
                      <option value="Mental health">Mental health</option>
                      <option value="Community">Community</option>
                      <option value="Housing">Housing</option>
                      <option value="Safety">Safety</option>
                      <option value="Tech">Tech</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label for="assistanceType">Assistance Type</Label>
                    <Input
                      id="assistanceType"
                      type="select"
                      value={editingItem?.assistance_type || ''}
                      onChange={(e) => handleInputChange("assistance_type", e.target.value)}
                    >
                      <option value="">Select Type</option>
                      <option value="Housing and Living Arrangements">Housing and Living Arrangements</option>
                      <option value="Caregiver Support">Caregiver Support</option>
                      <option value="End-of-Life Planning">End-of-Life Planning</option>
                      <option value="Environmental and Safety Concerns">Environmental and Safety Concerns</option>
                      <option value="Travel Assistance">Travel Assistance</option>
                      <option value="Relocation Assistance">Relocation Assistance</option>
                      <option value="Transportation Assistance">Transportation Assistance</option>
                      <option value="Disability and Accessibility Services">Disability and Accessibility Services</option>
                      <option value="Grief and Bereavement Support">Grief and Bereavement Support</option>
                      <option value="Aging in Place Services">Aging in Place Services</option>
                      <option value="Respite Care for Family Caregivers">Respite Care for Family Caregivers</option>
                      <option value="Estate Planning">Estate Planning</option>
                      <option value="Inheritance Distribution">Inheritance Distribution</option>
                      <option value="Execution Plan">Execution Plan</option>
                      <option value="Veteran-Specific Assistance">Veteran-Specific Assistance</option>
                      <option value="End-of-Life Planning and Dying with Dignity">End-of-Life Planning and Dying with Dignity</option>
                      <option value="Retirement Planning">Retirement Planning</option>
                      <option value="Financial Literacy and Budgeting">Financial Literacy and Budgeting</option>
                      <option value="Financial Assistance Programs">Financial Assistance Programs</option>
                      <option value="Retirement Income Security">Retirement Income Security</option>
                      <option value="Legal Protections for Aging Adults">Legal Protections for Aging Adults</option>
                      <option value="Legal and Financial Counseling">Legal and Financial Counseling</option>
                      <option value="Elder Rights Advocacy">Elder Rights Advocacy</option>
                      <option value="Social Security and Government Benefits Advocacy">Social Security and Government Benefits Advocacy</option>
                      <option value="Medications and Prescription Management">Medications and Prescription Management</option>
                      <option value="Social Isolation and Loneliness">Social Isolation and Loneliness</option>
                      <option value="Mental Health and Cognitive Decline">Mental Health and Cognitive Decline</option>
                      <option value="Community Engagement and Volunteer Opportunities">Community Engagement and Volunteer Opportunities</option>
                      <option value="Cultural and Recreational Programs">Cultural and Recreational Programs</option>
                      <option value="Spiritual and Religious Support">Spiritual and Religious Support</option>
                      <option value="Pet Care and Assistance">Pet Care and Assistance</option>
                      <option value="Mental Stimulation and Educational Opportunities">Mental Stimulation and Educational Opportunities</option>
                      <option value="Senior Employment and Reemployment">Senior Employment and Reemployment</option>
                      <option value="Intergenerational Programs">Intergenerational Programs</option>
                      <option value="Chronic Disease Management">Chronic Disease Management</option>
                      <option value="Nutrition and Hydration">Nutrition and Hydration</option>
                      <option value="Exercise and Mobility">Exercise and Mobility</option>
                      <option value="Longevity and Aging Research">Longevity and Aging Research</option>
                      <option value="Chronic Pain Management">Chronic Pain Management</option>
                      <option value="Affordable Housing for Seniors">Affordable Housing for Seniors</option>
                      <option value="Sustainable Aging and Environmental Impact">Sustainable Aging and Environmental Impact</option>
                      <option value="Elder Abuse and Fraud Protection">Elder Abuse and Fraud Protection</option>
                      <option value="Emergency Preparedness for Seniors">Emergency Preparedness for Seniors</option>
                      <option value="Home Maintenance and Safety Assistance">Home Maintenance and Safety Assistance</option>
                      <option value="Elder Abuse and Neglect Prevention">Elder Abuse and Neglect Prevention</option>
                      <option value="Senior Fraud Protection">Senior Fraud Protection</option>
                      <option value="Technology for Aging">Technology for Aging</option>
                      <option value="Digital Literacy and Technology Training">Digital Literacy and Technology Training</option>
                      <option value="Assistive Technology and Devices">Assistive Technology and Devices</option>
                    </Input>
                  </FormGroup>
                </Col>
              </Row>
              <Row>
                <Col md="6">
                  <FormGroup>
                    <Label for="customerJourneyStage">Customer Journey Stage</Label>
                    <Input
                      id="customerJourneyStage"
                      type="select"
                      value={editingItem?.customer_journey_stage || ''}
                      onChange={(e) => handleInputChange("customer_journey_stage", e.target.value)}
                    >
                      <option value="">Select Stage</option>
                      <option value="Awareness">Awareness</option>
                      <option value="Planning">Planning</option>
                      <option value="Action">Action</option>
                      <option value="Decision">Decision</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label for="targetAgeSegment">Target Age Segment</Label>
                    <Input
                      id="targetAgeSegment"
                      type="select"
                      value={editingItem?.target_age_segment || ''}
                      onChange={(e) => handleInputChange("target_age_segment", e.target.value)}
                    >
                      <option value="">Select Age</option>
                      <option value="Age Groups (55+)">Age Groups (55+)</option>
                      <option value="Age Groups (35+)">Age Groups (35+)</option>
                      <option value="Age Groups (65+)">Age Groups (65+)</option>
                      <option value="Age Groups (75+)">Age Groups (75+)</option>
                      <option value="All Ages">All Ages</option>
                    </Input>
                  </FormGroup>
                </Col>
              </Row>
              <FormGroup>
                <Label for="topic">Topic</Label>
                <Input
                  id="topic"
                  type="text"
                  value={editingItem?.topic || ''}
                  onChange={(e) => handleInputChange("topic", e.target.value)}
                  placeholder="Enter topic title"
                />
              </FormGroup>
              <FormGroup>
                <Label for="content">Content</Label>
                <Input
                  id="content"
                  type="textarea"
                  rows="4"
                  value={editingItem?.content || ''}
                  onChange={(e) => handleInputChange("content", e.target.value)}
                  placeholder="Enter content description"
                />
              </FormGroup>
              <Row>
                <Col md="6">
                  <FormGroup>
                    <Label for="startingParagraph">Starting Paragraph</Label>
                    <Input
                      id="startingParagraph"
                      type="textarea"
                      rows="3"
                      value={editingItem?.starting_paragraph || ''}
                      onChange={(e) => handleInputChange("starting_paragraph", e.target.value)}
                      placeholder="Enter starting paragraph"
                    />
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label for="endingParagraph">Ending Paragraph</Label>
                    <Input
                      id="endingParagraph"
                      type="textarea"
                      rows="3"
                      value={editingItem?.ending_paragraph || ''}
                      onChange={(e) => handleInputChange("ending_paragraph", e.target.value)}
                      placeholder="Enter ending paragraph"
                    />
                  </FormGroup>
                </Col>
              </Row>
            </Form>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggleModal} disabled={submitting}>
            Cancel
          </Button>
          <Button color="primary" onClick={handleSave} disabled={submitting}>
            {submitting ? <Spinner size="sm" color="light" /> : 'Save Changes'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} toggle={handleDeleteCancel} centered>
        <ModalHeader className="border-0 pb-0" toggle={handleDeleteCancel}>
          Delete Topic?
        </ModalHeader>
        <ModalBody className="pt-0">
          <p className="text-left mb-4">Are you sure you want to delete this topic?</p>
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
    </>
  );
}

export default ContentTopicDetails; 