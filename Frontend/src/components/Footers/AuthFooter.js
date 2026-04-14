/*!

=========================================================
* Argon Dashboard React - v1.2.4
=========================================================

* Product Page: https://www.creative-tim.com/product/argon-dashboard-react
* Copyright 2024 Creative Tim (https://www.creative-tim.com)
* Licensed under MIT (https://github.com/creativetimofficial/argon-dashboard-react/blob/master/LICENSE.md)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
/*eslint-disable*/

import React from "react";
// reactstrap components
import { NavItem, NavLink, Nav, Container, Row, Col } from "reactstrap";

const AuthFooter = () => {
  return (
    <>
      <footer className="py-0" style={{ marginTop: '-1rem' }}>
        <Container>
          <Row className="align-items-center justify-content-center">
            <Col xl="6">
              <div className="copyright text-center text-muted">
                <span className="font-weight-bold ml-1">
                  The Torch, LLC | All Rights Reserved | PATENT PENDING
                </span>
                {" "}
                © {new Date().getFullYear()}
              </div>
            </Col>
          </Row>
        </Container>
      </footer>
    </>
  );
};

export default AuthFooter;
