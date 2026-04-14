import React from "react";
// reactstrap components
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Container,
  Row,
  Col,
  Button,
} from "reactstrap";

function ContentManagement() {
  return (
    <>
      <div className="content">
        <Container fluid>
          <Row>
            <Col md="12">
              <Card>
                <CardHeader>
                  <CardTitle tag="h4">Content Management Dashboard</CardTitle>
                </CardHeader>
                <CardBody>
                  <div className="text-center">
                    <h5>Welcome to Content Management</h5>
                    <p className="text-muted">
                      Manage your content generation and topic details from this central hub.
                    </p>
                    
                    <Row className="mt-4">
                      <Col md="6">
                        <Card className="mb-3">
                          <CardBody>
                            <h6>Content Generation</h6>
                            <p className="text-muted small">
                              Generate new content using AI-powered tools and templates.
                            </p>
                            <Button 
                              color="primary" 
                              size="sm"
                              onClick={() => window.open('https://content-gen-frontend-1011027887079.us-central1.run.app', '_blank')}
                            >
                              Open Content Generation
                            </Button>
                          </CardBody>
                        </Card>
                      </Col>
                      <Col md="6">
                        <Card className="mb-3">
                          <CardBody>
                            <h6>Content Topic Details</h6>
                            <p className="text-muted small">
                              View and manage detailed information about content topics and analytics.
                            </p>
                            <Button 
                              color="info" 
                              size="sm"
                              href="/admin/content-topic-details"
                            >
                              View Topic Details
                            </Button>
                          </CardBody>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    </>
  );
}

export default ContentManagement; 