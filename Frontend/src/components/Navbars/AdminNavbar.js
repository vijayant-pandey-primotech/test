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
import { Link, useNavigate } from "react-router-dom";
// reactstrap components
import {
  DropdownMenu,
  DropdownItem,
  UncontrolledDropdown,
  DropdownToggle,
  Form,
  FormGroup,
  InputGroupAddon,
  InputGroupText,
  Input,
  InputGroup,
  Navbar,
  Nav,
  Container,
  Media,
} from "reactstrap";
import { createPortal } from 'react-dom';
import { clearAuthTokens } from "utils/authUtils";

const AdminNavbar = (props) => {
  const navigate = useNavigate();
  const adminName = localStorage.getItem('adminName') || 'Admin';

  // Function to capitalize first letter of each word
  const capitalizeName = (name) => {
    if (!name) return '';
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Function to generate a random color
  const getRandomColor = () => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
      '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB',
      '#E67E22', '#2ECC71', '#1ABC9C', '#F1C40F'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Function to get admin's initial
  const getAdminInitial = (name) => {
    if (!name) return 'A';
    const names = name.split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const handleLogout = () => {
    // Remove cookies and admin name
    clearAuthTokens();
    localStorage.removeItem('adminName');
    
    // Navigate to login page
    navigate("/auth/login");
  };

  return (
    <>
      <Navbar className="navbar-top navbar-dark header pb-8" expand="md" id="navbar-main" style={{zIndex: 0, background: 'linear-gradient(87deg, #367aa3 0, #3A6D8C 100%)'}}>
        <Container fluid>
          {/* <Link
            className="h4 mb-0 text-white text-uppercase d-none d-lg-inline-block"
            to="/"
          >
            {props.brandText}
          </Link>
          <Form className="navbar-search navbar-search-dark form-inline mr-3 d-none d-md-flex ml-lg-auto">
            <FormGroup className="mb-0">
              <InputGroup className="input-group-alternative">
                <InputGroupAddon addonType="prepend">
                  <InputGroupText>
                    <i className="fas fa-search" />
                  </InputGroupText>
                </InputGroupAddon>
                <Input placeholder="Search" type="text" />
              </InputGroup>
            </FormGroup>
          </Form> */}
          <Nav className="align-items-center d-none d-md-flex ml-auto" navbar>
            <UncontrolledDropdown nav>
              <DropdownToggle className="pr-0" nav>
                <Media className="align-items-center">
                  <span className="avatar avatar-sm rounded-circle">
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: getRandomColor(),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}
                    >
                      {getAdminInitial(adminName)}
                    </div>
                  </span>
                  <Media className="ml-2 d-none d-lg-block">
                    <span className="mb-0 text-sm font-weight-bold">
                      {capitalizeName(adminName)}
                    </span>
                  </Media>
                </Media>
              </DropdownToggle>
              {createPortal(
                <DropdownMenu className="dropdown-menu-arrow" right style={{ zIndex: 1050 }}>
                  {/* <DropdownItem className="noti-title" header tag="div">
                    <h6 className="text-overflow m-0">Welcome!</h6>
                  </DropdownItem> */}
                  {/* <DropdownItem to="/admin/user-profile" tag={Link}>
                    <i className="ni ni-single-02" />
                    <span>My profile</span>
                  </DropdownItem> */}
                  {/* <DropdownItem to="/admin/user-profile" tag={Link}>
                    <i className="ni ni-settings-gear-65" />
                    <span>Settings</span>
                  </DropdownItem>
                  <DropdownItem to="/admin/user-profile" tag={Link}>
                    <i className="ni ni-calendar-grid-58" />
                    <span>Activity</span>
                  </DropdownItem>
                  <DropdownItem to="/admin/user-profile" tag={Link}>
                    <i className="ni ni-support-16" />
                    <span>Support</span>
                  </DropdownItem> */}
                  {/* <DropdownItem divider /> */}
                  <DropdownItem onClick={handleLogout}>
                    <i className="ni ni-user-run" />
                    <span>Logout</span>
                  </DropdownItem>
                </DropdownMenu>,
                document.body
              )}
            </UncontrolledDropdown>
          </Nav>
        </Container>
      </Navbar>
    </>
  );
};

export default AdminNavbar;
