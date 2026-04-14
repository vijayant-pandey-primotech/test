
import React from "react";
import { useLocation, Route, Routes, Navigate } from "react-router-dom";
// reactstrap components
import { Container } from "reactstrap";
// core components
import AdminNavbar from "components/Navbars/AdminNavbar.js";
import AdminFooter from "components/Footers/AdminFooter.js";
import Sidebar from "components/Sidebar/Sidebar.js";

import routes from "routes.js";

// Import components dynamically
const UserTable = React.lazy(() => import("views/All/UserTable.js"));
const SeedData = React.lazy(() => import("views/All/SeedData.js"));
const PoliciesTable = React.lazy(() => import("views/All/PoliciesTable"));
const SuggestionsTable = React.lazy(() => import("views/All/SuggestionsTable"));
const AssistantForm = React.lazy(() => import("views/All/AssistantForm"));
const AllAssistants = React.lazy(() => import("views/All/AllAssistants"));
const ArticleForm = React.lazy(() => import("views/All/ArticleForm"));
const AllArticles = React.lazy(() => import("views/All/AllArticles"));
const StoryImages = React.lazy(() => import("views/All/StoryImages"));
const DynamicFunctions = React.lazy(() => import("views/All/DynamicFunctions"));
const CreateDynamicFunction = React.lazy(() => import("views/All/CreateDynamicFunction"));
const ContentTopicDetails = React.lazy(() => import("views/All/ContentTopicDetails"));
const Platforms = React.lazy(() => import("views/All/Platforms"));
const EditPlatformData = React.lazy(() => import("views/platform/EditPlatformData.js"));
const Stories = React.lazy(() => import("views/All/Stories"));
const Chapters = React.lazy(() => import("views/All/Chapters"));
const PromptsManagement = React.lazy(() => import("views/All/PromptsManagement"));
const CreateStoryWizard = React.lazy(() => import("views/All/CreateStoryWizard"));
const Tasks = React.lazy(() => import("views/All/Tasks"));
const Widgets = React.lazy(() => import("views/widgets/Widgets"));
const ApiLogs = React.lazy(() => import("views/api_logs/ApiLogs"));
const Activities = React.lazy(() => import("views/All/Activities"));
const ContextConfig = React.lazy(() => import("views/All/ContextConfig"));
const UserActivity = React.lazy(() => import("views/api_logs/UserActivity"));
const PlatformTasks = React.lazy(() => import("views/All/PlatformTasks"));
const Admin = (props) => {
  const mainContent = React.useRef(null);
  const location = useLocation();

  React.useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
    mainContent.current.scrollTop = 0;
  }, [location]);

  const getRoutes = (routes) => {
    return routes.map((prop, key) => {
      if (prop.layout === "/admin") {
        return (
          <Route
            path={prop.path}
            element={
              <React.Suspense fallback={<div>Loading...</div>}>
                {prop.component === "UserTable" ? <UserTable /> :
                 prop.component === "SeedData" ? <SeedData /> :
                 prop.component === "PoliciesTable" ? <PoliciesTable /> :
                 prop.component === "SuggestionsTable" ? <SuggestionsTable /> :
                 prop.component === "AssistantForm" ? <AssistantForm /> :
                 prop.component === "AllAssistants" ? <AllAssistants /> :
                 prop.component === "ArticleForm" ? <ArticleForm /> :
                 prop.component === "AllArticles" ? <AllArticles /> :
                 prop.component === "StoryImages" ? <StoryImages /> :
                 prop.component === "DynamicFunctions" ? <DynamicFunctions /> :
                 prop.component === "CreateDynamicFunction" ? <CreateDynamicFunction /> :
                 prop.component === "Platforms" ? <Platforms /> :
                 prop.component === "ContentTopicDetails" ? <ContentTopicDetails /> :
                 prop.component === "EditPlatformData" ? <EditPlatformData /> :
                 prop.component === "Stories" ? <Stories /> :
                 prop.component === "Chapters" ? <Chapters /> :
                 prop.component === "PromptsManagement" ? <PromptsManagement /> :
                 prop.component === "CreateStoryWizard" ? <CreateStoryWizard /> :
                 prop.component === "Tasks" ? <Tasks /> :
                 prop.component === "Widgets" ? <Widgets /> :
                 prop.component === "ApiLogs" ? <ApiLogs /> :
                 prop.component === "Activities" ? <Activities /> :
                 prop.component === "ContextConfig" ? <ContextConfig /> : 
                 prop.component === "UserActivity" ? <UserActivity /> :
                 prop.component === "PlatformTasks" ? <PlatformTasks /> :
                 null}
              </React.Suspense>
            }
            key={key}
            exact
          />
        );
      } else {
        return null;
      }
    });
  };

  const getBrandText = (path) => {
    for (let i = 0; i < routes.length; i++) {
      if (
        location.pathname.indexOf(routes[i].layout + routes[i].path) !==
        -1
      ) {
        return routes[i].name;
      }
    }
    return "Brand";
  };

  return (
    <>
      <Sidebar
        routes={routes}
        logo={{
          innerLink: "/admin/user-details",
          imgAlt: "...",
        }}
      />
      <div className="main-content" ref={mainContent}>
        <AdminNavbar
          brandText={getBrandText(location.pathname)}
        />
        <Routes>
          {getRoutes(routes)}
          <Route path="*" element={<Navigate to="/admin/user-details" replace />} />
        </Routes>
        <Container fluid>
          <AdminFooter />
        </Container>
      </div>
    </>
  );
};

export default Admin;
