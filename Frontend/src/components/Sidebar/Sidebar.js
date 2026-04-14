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
import { NavLink as NavLinkRRD, Link, useLocation } from "react-router-dom";
// nodejs library to set properties for components
import { PropTypes } from "prop-types";

// reactstrap components
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Collapse,
  DropdownMenu,
  DropdownItem,
  UncontrolledDropdown,
  DropdownToggle,
  FormGroup,
  Form,
  Input,
  InputGroupAddon,
  InputGroupText,
  InputGroup,
  Media,
  NavbarBrand,
  Navbar,
  NavItem,
  NavLink,
  Nav,
  Progress,
  Table,
  Container,
  Row,
  Col,
} from "reactstrap";

import { adminRoutes, formRoutes, additionalRoutes } from "routes";
import { FaCog } from 'react-icons/fa';

var ps;

const Sidebar = (props) => {
  const [collapseOpen, setCollapseOpen] = React.useState();
  const [collapsedGroups, setCollapsedGroups] = React.useState({
    'AI Engine': true,
    'Intelligence': true
  });
  const location = useLocation();

  // Custom styles for grouped navigation
  const customStyles = `
    /* Global icon sizing */
    .nav-link i,
    .nav-link svg,
    .nav-group-header i,
    .nav-group-header svg {
      font-size: 18px !important;
    }
    
    /* Dropdown chevron icons */
    .nav-group-header .fas.fa-chevron-down,
    .nav-group-header .fas.fa-chevron-up {
      font-size: 14px !important;
      color: #3A6D8C !important;
    }
    
    /* Remove white background on hover for pr-0 nav-link */
    .pr-0.nav-link:hover {
      background-color: transparent !important;
    }
    
    .nav-group {
      margin-bottom: 0.25rem;
    }
    
    .nav-group-header {
      cursor: pointer;
      padding: 0.45rem 0.75rem;
      margin: 0.15rem 0;
      border-radius: 0.375rem;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 400;
      font-size: 0.9375rem;
      font-family: Lato, sans-serif;
      color: black;
      background-color: transparent;
      border: 1px solid transparent;
    }
    
    .nav-group-header:hover {
      background-color: transparent;
      border-color: transparent;
    }
    
    .nav-group-header.active {
      background-color: rgb(211 231 243) !important;
      border-color: #e9ecef;
      color: black !important;
    }
    
    .nav-group-header.active i,
    .nav-group-header.active svg {
      color: black !important;
    }
    
    .nav-group-items {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .nav-group-items li {
      margin: 0.05rem 0;
    }
    
    .nav-group-items .nav-link {
      padding: 0.35rem 0.75rem 0.35rem 1.5rem;
      border-radius: 0.375rem;
      margin: 0 0.25rem;
      font-size: 0.9375rem !important;
      font-family: Lato, sans-serif;
      font-weight: 500;
      color: rgb(37, 34, 34) !important;
      text-decoration: none;
      display: block;
      transition: all 0.2s ease;
    }
    
    .nav-group-items .nav-link:hover {
      background-color:rgb(211 231 243)
  !important;
      color: black;
    }
    
    .nav-group-items .nav-link.active {
      background-color:rgb(211 231 243)
  !important;
      color: black !important;
    }
    
    .nav-group-items .nav-link.active:hover {
      background-color:rgb(211 231 243) !important;
      color: black !important;
    }
    
    .nav-group-items .nav-link.active i {
      color: black !important;
    }
    
    .nav-link:hover {
      background-color:rgb(211 231 243)!important;
      color: black;
    }
  `;

  // Enhanced activeRoute function that checks for parent-child relationships
  const activeRoute = (routeName) => {
    // Direct match
    if (location.pathname.startsWith(routeName)) {
      return "active";
    }
    
    // Check if this route is a parent of the current active route
    const currentPath = location.pathname;
    
    // Get all routes (admin + form + additional routes)
    const allRoutes = [...adminRoutes, ...formRoutes, ...additionalRoutes];
    
    // Check if current route is a child of the given route
    for (const route of allRoutes) {
      if (route.parentMenu && route.parentMenu === routeName) {
        const childRoutePath = route.layout + route.path;
        console.log(`Checking if ${currentPath} matches ${childRoutePath} for parent ${routeName}`);
        
        // Handle optional parameters in route paths
        let normalizedChildPath = childRoutePath;
        if (childRoutePath.includes('?')) {
          // Remove optional parameters for matching
          normalizedChildPath = childRoutePath.replace(/\?/g, '');
        }
        
        // Also handle dynamic parameters by removing them for matching
        normalizedChildPath = normalizedChildPath.replace(/\/:[^\/]+\?/g, ''); // Remove optional dynamic params
        normalizedChildPath = normalizedChildPath.replace(/\/:[^\/]+/g, ''); // Remove required dynamic params
        
        // Check if current path starts with the normalized child path
        if (currentPath.startsWith(normalizedChildPath)) {
          console.log(`Highlighting ${routeName} because current path ${currentPath} matches child route ${childRoutePath}`);
          return "active";
        }
      }
    }
    
    return "";
  };

  // Enhanced function to check if any route in a group is active
  const isGroupActive = (groupRoutes) => {
    const currentPath = location.pathname;
    
    // Get all routes (admin + form + additional routes)
    const allRoutes = [...adminRoutes, ...formRoutes, ...additionalRoutes];
    
    return groupRoutes.some(route => {
      // Direct match
      const routePath = route.layout + route.path;
      
      // Handle optional parameters in route paths
      let normalizedRoutePath = routePath;
      if (routePath.includes('?')) {
        // Remove optional parameters for matching
        normalizedRoutePath = routePath.replace(/\?/g, '');
      }
      
      // Also handle dynamic parameters by removing them for matching
      normalizedRoutePath = normalizedRoutePath.replace(/\/:[^\/]+\?/g, ''); // Remove optional dynamic params
      normalizedRoutePath = normalizedRoutePath.replace(/\/:[^\/]+/g, ''); // Remove required dynamic params
      
      if (currentPath.startsWith(normalizedRoutePath)) {
        return true;
      }
      
      // Check if any route has this route as its parent
      for (const childRoute of allRoutes) {
        if (childRoute.parentMenu && childRoute.parentMenu === route.layout + route.path) {
          const childRoutePath = childRoute.layout + childRoute.path;
          
          // Handle optional parameters in route paths
          let normalizedChildPath = childRoutePath;
          if (childRoutePath.includes('?')) {
            // Remove optional parameters for matching
            normalizedChildPath = childRoutePath.replace(/\?/g, '');
          }
          
          // Also handle dynamic parameters by removing them for matching
          normalizedChildPath = normalizedChildPath.replace(/\/:[^\/]+\?/g, ''); // Remove optional dynamic params
          normalizedChildPath = normalizedChildPath.replace(/\/:[^\/]+/g, ''); // Remove required dynamic params
          
          // Check if current path starts with the normalized child path
          if (currentPath.startsWith(normalizedChildPath)) {
            return true;
          }
        }
      }
      
      return false;
    });
  };

  // toggles collapse between opened and closed (true/false)
  const toggleCollapse = () => {
    setCollapseOpen((data) => !data);
  };

  // closes the collapse
  const closeCollapse = () => {
    setCollapseOpen(false);
  };

  // toggle group collapse
  const toggleGroup = (groupName) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

    // creates the grouped links that appear in the left menu / Sidebar
  const createGroupedLinks = (routes) => {
    // Filter out hidden routes for display, but keep them for highlighting logic
    const visibleRoutes = routes.filter(route => !route.hideInSidebar);
    
    // Group routes by their group property while maintaining order
    const groupedRoutes = {};
    const result = [];
    
    visibleRoutes.forEach((route, index) => {
      if (route.group) {
        // This is a grouped route
        if (!groupedRoutes[route.group]) {
          groupedRoutes[route.group] = {
            name: route.group,
            icon: route.groupIcon || FaCog,
            routes: [],
            order: index
          };
        }
        groupedRoutes[route.group].routes.push(route);
      } else {
        // This is a standalone route
        result.push({ type: 'standalone', route, order: index });
      }
    });
    
    // Add grouped routes to result
    Object.entries(groupedRoutes).forEach(([groupName, groupData]) => {
      result.push({ type: 'group', groupName, groupData, order: groupData.order });
    });
    
    // Sort by original order
    result.sort((a, b) => a.order - b.order);
    
    // Render each item in order
    return result.map((item, key) => {
      if (item.type === 'standalone') {
        const route = item.route;
        const renderIcon = () => {
          if (typeof route.icon === 'function') {
            const IconComponent = route.icon;
            return <IconComponent {...route.iconProps} style={{ marginRight: '0.5rem' }} />;
          } else {
            return <i className={route.icon} style={{ marginRight: '0.5rem' }} />;
          }
        };

        // Check if this is an external link
        if (route.externalUrl) {
          return (
            <a
              key={`item-${key}`}
              href={route.externalUrl}
              target={route.target || "_blank"}
              rel="noopener noreferrer"
              onClick={closeCollapse}
              style={{ 
                padding: '0.45rem 0.75rem',
                margin: '0.15rem 0',
                borderRadius: '0.375rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontWeight: '400',
                fontSize: '0.9375rem',
                fontFamily: 'Lato, sans-serif',
                color: 'black',
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                textDecoration: 'none',
                cursor: 'pointer'
              }}
              className="nav-link"
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {renderIcon()}
                <span>{route.name}</span>
              </div>
              <div></div>
            </a>
          );
        }

        const isActive = activeRoute(route.layout + route.path) === "active";
        
        return (
          <NavLink
            key={`item-${key}`}
            to={route.layout + route.path}
            tag={NavLinkRRD}
            onClick={closeCollapse}
            activeClassName="active"
            className={`nav-link ${activeRoute(route.layout + route.path)}`}
            style={{ 
              padding: '0.45rem 0.75rem',
              margin: '0.15rem 0',
              borderRadius: '0.375rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontWeight: '400',
              fontSize: '0.9375rem',
              fontFamily: 'Lato, sans-serif',
              color: isActive ? 'black' : 'rgb(37, 34, 34)',
              backgroundColor: isActive ? 'rgb(211 231 243)' : 'transparent',
              border: '1px solid transparent',
              textDecoration: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {renderIcon()}
              <span>{route.name}</span>
            </div>
            <div></div>
          </NavLink>
        );
      } else {
        // This is a group
        const { groupName, groupData } = item;
        const isCollapsed = collapsedGroups[groupName];
        const hasActiveRoute = isGroupActive(groupData.routes);

        return (
          <div key={`item-${key}`} className="nav-group">
            {/* Group Header */}
            <div 
              className={`nav-group-header ${hasActiveRoute ? 'active' : ''}`}
              onClick={() => toggleGroup(groupName)}
              style={{
                backgroundColor: hasActiveRoute ? 'rgb(211 231 243)' : 'transparent',
                color: hasActiveRoute ? 'black' : 'black'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: '0.5rem' }}>
                  {typeof groupData.icon === 'function' ? (
                    React.createElement(groupData.icon, { 
                      className: hasActiveRoute ? "text-black" : "text-primary",
                      style: { color: hasActiveRoute ? 'black' : undefined }
                    })
                  ) : (
                    groupData.icon
                  )}
                </span>
                <span>{groupData.name}</span>
              </div>
              <i 
                className={`fas fa-chevron-${isCollapsed ? 'down' : 'up'}`}
                style={{ 
                  fontSize: '0.75rem',
                  transition: 'transform 0.2s ease',
                  transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'
                }}
              />
            </div>

            {/* Group Routes */}
            <Collapse isOpen={!isCollapsed}>
              <ul className="nav-group-items">
                {groupData.routes.map((route, routeKey) => {
                  // Handle React Icon components vs CSS class strings
                  const renderIcon = () => {
                    if (typeof route.icon === 'function') {
                      // React Icon component
                      const IconComponent = route.icon;
                      return <IconComponent {...route.iconProps} style={{ marginRight: '8px' }} />;
                    } else {
                      // CSS class string (backward compatibility)
                      return <i className={route.icon} style={{ marginRight: '8px' }} />;
                    }
                  };

                  // Check if this is an external link
                  if (route.externalUrl) {
                    return (
                      <li key={routeKey}>
                        <a
                          style={{fontSize:".1rem"}}
                          href={route.externalUrl}
                          target={route.target || "_blank"}
                          rel="noopener noreferrer"
                          onClick={closeCollapse}
                          className="nav-link"
                        >
                          {renderIcon()}
                          {route.name}
                        </a>
                      </li>
                    );
                  }

                  const isRouteActive = activeRoute(route.layout + route.path) === "active";
                  
                  return (
                    <li key={routeKey}>
                      <NavLink
                        to={route.layout + route.path}
                        tag={NavLinkRRD}
                        onClick={closeCollapse}
                        activeClassName="active"
                        className={`nav-link ${activeRoute(route.layout + route.path)}`}
                        style={{
                          color: isRouteActive ? 'black' : 'rgb(37, 34, 34)',
                          backgroundColor: isRouteActive ? 'rgb(211 231 243)' : 'transparent'
                        }}
                      >
                        {renderIcon()}
                        {route.name}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </Collapse>
          </div>
        );
      }
    });
  };

  // Debug function to test highlighting logic
  const debugHighlighting = (testPath) => {
    console.log('=== DEBUG HIGHLIGHTING ===');
    const currentPath = testPath || location.pathname;
    console.log('Current path:', currentPath);
    console.log('Training data hub should be active:', activeRoute('/admin/training-data-hub'));
    
    const allRoutes = [...adminRoutes, ...formRoutes, ...additionalRoutes];
    console.log('Routes with parentMenu /admin/training-data-hub:');
    allRoutes.forEach(route => {
      if (route.parentMenu === '/admin/training-data-hub') {
        const childRoutePath = route.layout + route.path;
        let normalizedChildPath = childRoutePath;
        if (childRoutePath.includes('?')) {
          normalizedChildPath = childRoutePath.replace(/\?/g, '');
        }
        
        // Also handle dynamic parameters by removing them for matching
        normalizedChildPath = normalizedChildPath.replace(/\/:[^\/]+\?/g, ''); // Remove optional dynamic params
        normalizedChildPath = normalizedChildPath.replace(/\/:[^\/]+/g, ''); // Remove required dynamic params
        
        console.log(`- ${childRoutePath} (normalized: ${normalizedChildPath})`);
        console.log(`  Matches current path: ${currentPath.startsWith(normalizedChildPath)}`);
      }
    });
    console.log('=== END DEBUG ===');
  };
  
  // Expose debug function to window for testing
  React.useEffect(() => {
    window.debugSidebarHighlighting = debugHighlighting;
  }, []);

  const { brand, ...rest } = props;
  return (
    <>
      <style>{customStyles}</style>
      <Navbar
        className="navbar-vertical fixed-left navbar-light bg-white"
        expand="md"
        id="sidenav-main"
      >
        <Container fluid>
          {/* Toggler */}
          <button
            className="navbar-toggler"
            type="button"
            onClick={toggleCollapse}
          >
            <span className="navbar-toggler-icon" />
          </button>
          {/* Brand */}
          <div className="text-center mb-4">
            <img
              alt="The Torch, LLC Logo"
              src={require("../../assets/img/brand/TheTorchLogo150x116.fw_.png")}
              style={{ height: '50px', width: 'auto' }}
            />
          </div>
          {/* User */}
          <Nav className="align-items-center d-md-none">
            <UncontrolledDropdown nav>
              <DropdownToggle nav className="nav-link-icon">
                <i className="ni ni-bell-55" />
              </DropdownToggle>
              <DropdownMenu
                aria-labelledby="navbar-default_dropdown_1"
                className="dropdown-menu-arrow"
                right
              >
                <DropdownItem className="noti-title" header tag="div">
                  <h6 className="text-overflow m-0">Welcome!</h6>
                </DropdownItem>
                <DropdownItem divider />
                <DropdownItem href="#pablo" onClick={(e) => e.preventDefault()}>
                  <i className="ni ni-user-run" />
                  <span>Logout</span>
                </DropdownItem>
              </DropdownMenu>
            </UncontrolledDropdown>
          </Nav>
          {/* Collapse */}
          <Collapse navbar isOpen={collapseOpen}>
            {/* Collapse header */}
            <div className="navbar-collapse-header d-md-none">
              <Row>
                {brand ? (
                  <Col className="collapse-brand" xs="6">
                    {brand.imgSrc ? (
                      <img alt={brand.text} src={brand.imgSrc} />
                    ) : null}
                    {brand.text}
                  </Col>
                ) : null}
                <Col className="collapse-close" xs="6">
                  <button
                    className="navbar-toggler"
                    type="button"
                    onClick={toggleCollapse}
                  >
                    <span />
                    <span />
                  </button>
                </Col>
              </Row>
            </div>
            {/* Form */}
            <Form className="mt-4 mb-3 d-md-none">
              <InputGroup className="input-group-rounded input-group-merge">
                <Input
                  aria-label="Search"
                  className="form-control-rounded form-control-prepended"
                  placeholder="Search"
                  type="search"
                />
                <InputGroupAddon addonType="prepend">
                  <InputGroupText>
                    <span className="fa fa-search" />
                  </InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </Form>
            {/* Navigation */}
            <Nav navbar>{createGroupedLinks(adminRoutes)}</Nav>
            {/* Divider */}
            {/* <hr className="my-3" /> */}
            {/* Heading */}
            {/* <h6 className="navbar-heading text-muted">Documentation</h6> */}
            {/* Navigation */}
            {/* <Nav className="mb-md-3" navbar>
              <NavItem>
                <NavLink href="https://demos.creative-tim.com/argon-dashboard-react/#/documentation/overview?ref=adr-admin-sidebar">
                  <i className="ni ni-spaceship" />
                  Getting started
                </NavLink>
              </NavItem>
              <NavItem>
                <NavLink href="https://demos.creative-tim.com/argon-dashboard-react/#/documentation/colors?ref=adr-admin-sidebar">
                  <i className="ni ni-palette" />
                  Foundation
                </NavLink>
              </NavItem>
              <NavItem>
                <NavLink href="https://demos.creative-tim.com/argon-dashboard-react/#/documentation/alerts?ref=adr-admin-sidebar">
                  <i className="ni ni-ui-04" />
                  Components
                </NavLink>
              </NavItem>
            </Nav>
            <Nav className="mb-md-3" navbar>
              <NavItem className="active-pro active">
                <NavLink href="https://www.creative-tim.com/product/argon-dashboard-pro-react?ref=adr-admin-sidebar">
                  <i className="ni ni-spaceship" />
                  Upgrade to PRO
                </NavLink>
              </NavItem>
            </Nav> */}
          </Collapse>
        </Container>
      </Navbar>
    </>
  );
};

Sidebar.defaultProps = {
  routes: [{}],
};

Sidebar.propTypes = {
  // links that will be displayed inside the component
  routes: PropTypes.arrayOf(PropTypes.object),
  logo: PropTypes.shape({
    // innerHTML of the navbar brand
    innerHTML: PropTypes.string,
  }),
};

export default Sidebar;
