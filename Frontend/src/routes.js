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

// Import React Icons
import {
  FaUsers,
  FaRobot,
  FaNewspaper,
  FaImages,
  FaReact,
  FaKey,
  FaBrain,
  FaLightbulb,
  FaCog,
  FaExternalLinkAlt,
  FaEye,
  FaBullseye,
  FaTerminal,
} from "react-icons/fa";
import { MdGroups2 } from "react-icons/md";
import { TbMathFunction } from "react-icons/tb";
import { RiRobot2Line } from "react-icons/ri";
import { MdPolicy, MdLightbulb } from "react-icons/md";
import { FaLaptopCode, FaRegFileImage } from "react-icons/fa6";
import { FcEngineering } from "react-icons/fc";
import { FaUserCog } from "react-icons/fa";
import { PiLinkSimpleBold } from "react-icons/pi";
import { MdOutlinePersonSearch } from "react-icons/md";
import { RiRobot3Line } from "react-icons/ri";
import { RiAiGenerate2 } from "react-icons/ri";
import { MdOutlineContentPasteGo } from "react-icons/md";
import { BiSolidFileDoc } from "react-icons/bi";
import { MdOutlineDomainAdd } from "react-icons/md";
import { FaTasks } from "react-icons/fa";
import { IoApps } from "react-icons/io5";
import { MdDomain } from "react-icons/md";
import { MdOutlineSettings } from "react-icons/md";
import { FaListCheck,FaStairs } from "react-icons/fa6";
// Admin routes that will be shown in the Sidebar
export const adminRoutes = [
  {
    path: "/user-details",
    name: "User Management",
    icon: FaUsers,
    iconProps: { className: "text-primary" },
    component: "UserTable",
    layout: "/admin",
  },
  {
    path: "/training-data-hub",
    name: "Training Data Hub",
    icon: FaReact,
    iconProps: { className: "text-primary", color: "#3A6D8C" },
    component: "SeedData",
    layout: "/admin",
    group: "AI Engine",
    groupIcon: RiAiGenerate2,
  },
  {
    path: "/ai-agents",
    name: "Platform Agent Studio",
    icon: RiRobot2Line,
    iconProps: { className: "text-primary" },
    component: "AllAssistants",
    layout: "/admin",
    group: "AI Engine",
    groupIcon: FaBrain,
    // hideInSidebar: true,
  },
  // {
  //   path: "/experience-modes",
  //   name: "Experience Modes",
  //   icon: FaCog,
  //   iconProps: { className: "text-primary" },
  //   component: "ExperienceModes",
  //   layout: "/admin",
  //   group: "AI Engine",
  //   groupIcon: FaBrain,
  // },
  // {
  //   path: "/platform-goals",
  //   name: "Platform Goals",
  //   icon: FaBullseye,
  //   iconProps: { className: "text-primary" },
  //   component: "PlatformGoals",
  //   layout: "/admin",
  //   group: "AI Engine",
  //   groupIcon: FaBrain,
  // },
  {
    path: "/activities",
    name: "Functions",
    icon: FaListCheck,
    iconProps: { className: "text-primary" },
    component: "Activities",
    layout: "/admin",
    group: "AI Engine",
    groupIcon: FaBrain,
  },
  {
    path: "/vision-dataset",
    name: "Vision Dataset",
    icon: FaImages,
    iconProps: { className: "text-primary" },
    component: "StoryImages",
    layout: "/admin",
    group: "AI Engine",
    groupIcon: FaBrain,
  },
  {
    path: "/context-config",
    name: "Context Management",
    icon: MdOutlineSettings,
    iconProps: { className: "text-primary" },
    component: "ContextConfig",
    layout: "/admin",
    group: "AI Engine",
    groupIcon: RiAiGenerate2,
  },
  {
    path: "/action-intelligence",
    name: "Action Intelligence",
    icon: PiLinkSimpleBold,
    iconProps: { className: "text-primary" },
    component: "AllArticles",
    layout: "/admin",
    group: "Intelligence",
    groupIcon: FaLightbulb,
    // hideInSidebar: true,
  },
  {
    path: "/dynamic-functions",
    name: "Agent Actions",
    icon: FaUserCog,
    iconProps: { className: "text-primary" },
    component: "DynamicFunctions",
    layout: "/admin",
    group: "Intelligence",
    groupIcon: FaLightbulb,
    // hideInSidebar: true,
  },
  {
    path: "/explore-agent-studio",
    name: "Explore Agent Studio",
    icon: MdOutlinePersonSearch,
    iconProps: { className: "text-primary" },
    component: "ExternalLink",
    layout: "/admin",
    externalUrl: "https://dev.explore-agent-admin.rejara.com/",
    target: "_blank",
  },
  {
    path: "/image-classifier",
    name: "Image Classifier",
    icon: FaRegFileImage,
    iconProps: { className: "text-primary" },
    component: "ExternalLink",
    layout: "/admin",
    externalUrl:
      "https://image2text-frontend-app-1011027887079.us-central1.run.app/",
    target: "_blank",
    group: "Intelligence",
  },
  {
    path: "/content-generation",
    name: "Content Generation",
    icon: BiSolidFileDoc,
    iconProps: { className: "text-primary" },
    component: "ExternalLink",
    layout: "/admin",
    externalUrl:
      "https://content-gen-frontend-1011027887079.us-central1.run.app",
    target: "_blank",
    group: "Content Management",
    groupIcon: BiSolidFileDoc,
  },
  {
    path: "/content-topic-details-standalone",
    name: "Content Topic Details",
    icon: FaNewspaper,
    iconProps: { className: "text-primary" },
    component: "ContentTopicDetails",
    layout: "/admin",
    group: "Content Management",
    groupIcon: BiSolidFileDoc,
    hideInSidebar: true,
  },
  {
    path: "/rejara-ai-model",
    name: "Rejara AI Model",
    icon: RiAiGenerate2,
    iconProps: { className: "text-primary" },
    component: "ExternalLink",
    layout: "/admin",
    externalUrl: "https://rejara-ai-app-1011027887079.us-central1.run.app/",
    target: "_blank",
    group: "AI Engine",
  },
  {
    path: "/prompts-management",
    name: "Prompts Management",
    icon: FaTerminal,
    iconProps: { className: "text-primary" },
    component: "PromptsManagement",
    layout: "/admin",
    group: "AI Engine",
    groupIcon: FaBrain,
  },
  {
    path: "/platforms",
    name: "Platforms",
    icon: MdOutlineDomainAdd,
    groupIcon: MdDomain,
    iconProps: { className: "text-primary" },
    component: "Platforms",
    group: "Platform Management",
    layout: "/admin",
  },
  {
    path: "/plans",
    name: "Plan Management",
    icon: FaTasks,
    group: "Platform Management",
    groupIcon: MdDomain,
    iconProps: { className: "text-primary" },
    component: "Tasks",
    layout: "/admin",
  },
  {
    path: "/platform-tasks/:ActivityId",
    name: "Platform Tasks",
    icon: FaListCheck,
    iconProps: { className: "text-primary" },
    group: "Plan Management",
    groupIcon: MdDomain,
    component: "PlatformTasks",
    layout: "/admin",
    hideInSidebar: true,
    parentMenu: "/admin/plans",
  },
  {
    path: "/widgets",
    name: "Widgets Management",
    icon: IoApps,
    iconProps: { className: "text-primary" },
    group: "Platform Management",
    groupIcon: MdDomain,
    component: "Widgets",
    layout: "/admin",
  },
  {
    path: "/api-logs/:userId",
    name: "API Logs",
    icon: FaEye,
    iconProps: { className: "text-primary" },
    component: "ApiLogs",
    layout: "/admin",
    hideInSidebar: true,
  },
  {
    path: "/user-activity/:userId",
    name: "User Activity",
    icon: FaEye,
    iconProps: { className: "text-primary" },
    component: "UserActivity",
    layout: "/admin",
    hideInSidebar: true,
  },
  {
    path: "/production-environment",
    name: "Production Environment",
    icon: FaExternalLinkAlt,
    iconProps: { className: "text-primary" },
    component: "ExternalLink",
    externalUrl: "https://app.admin.rejara.com/auth/login",
    layout: "/admin",
  },
  {
    path: "/Stochastic Planning",
    name: "Stochastic Planning",
    icon: MdGroups2,
    iconProps: { className: "text-primary" },
    group:"Intelligence",
    component: "ExternalLink",
    externalUrl: "https://stochastic-planning-fe-app-1011027887079.us-central1.run.app/?user=",
    layout: "/admin",
  }
];

// Form routes that should be accessible but hidden from sidebar
export const formRoutes = [
  {
    path: "/assistant-form",
    name: "Create AI Agent",
    icon: FaRobot,
    iconProps: { className: "text-primary" },
    component: "AssistantForm",
    layout: "/admin",
    hideInSidebar: true,
    parentMenu: "/admin/ai-agents",
  },
  {
    path: "/assistant-form/edit/:id",
    name: "Edit AI Agent",
    icon: FaRobot,
    iconProps: { className: "text-primary" },
    component: "AssistantForm",
    layout: "/admin",
    hideInSidebar: true,
    parentMenu: "/admin/ai-agents",
  },
  {
    path: "/article-form",
    name: "Create Action Intelligence",
    icon: FaNewspaper,
    iconProps: { className: "text-primary" },
    component: "ArticleForm",
    layout: "/admin",
    hideInSidebar: true,
    parentMenu: "/admin/action-intelligence",
  },
  {
    path: "/article-form/edit/:id",
    name: "Edit Action Intelligence",
    icon: FaNewspaper,
    iconProps: { className: "text-primary" },
    component: "ArticleForm",
    layout: "/admin",
    hideInSidebar: true,
    parentMenu: "/admin/action-intelligence",
  },
  {
    path: "/create-dynamic-function",
    name: "Request New Action",
    icon: TbMathFunction,
    iconProps: { className: "text-primary" },
    component: "CreateDynamicFunction",
    layout: "/admin",
    hideInSidebar: true,
    parentMenu: "/admin/dynamic-functions",
  },
  {
    path: "/platform/edit-platform-data/:platformId",
    name: "Edit Platform Data",
    // icon: FaDatabase,
    iconProps: { className: "text-primary" },
    component: "EditPlatformData",
    layout: "/admin",
    hideInSidebar: true,
    parentMenu: "/admin/platforms",
  },
  {
    path: "/stories/:storyId/chapters",
    name: "Chapters Management",
    icon: FaNewspaper,
    iconProps: { className: "text-primary" },
    component: "Chapters",
    layout: "/admin",
    hideInSidebar: true,
    parentMenu: "/admin/stories",
  },
  {
    path: "/create-story-wizard/:storyId?",
    name: "Create Story Wizard",
    icon: FaNewspaper,
    iconProps: { className: "text-primary" },
    component: "CreateStoryWizard",
    group: "AI Engine",
    groupIcon: FaBrain,
    layout: "/admin",
    hideInSidebar: true,
    parentMenu: "/admin/training-data-hub",
  },
  {
    path: "/stories",
    name: "Stories Management",
    icon: FaNewspaper,
    iconProps: { className: "text-primary" },
    component: "Stories",
    layout: "/admin",
    group: "AI Engine",
    groupIcon: FaBrain,
    hideInSidebar: true,
    parentMenu: "/admin/training-data-hub",
  },
  {
    path: "/api-logs",
    name: "API Logs",
    iconProps: { className: "text-primary" },
    component: "ApiLogs",
    layout: "/admin",
    group: "User Management",
    hideInSidebar: true,
    parentMenu: "/admin/user-details",
  },
  
];

// Auth routes that won't be shown in the Sidebar
export const authRoutes = [
  {
    path: "/login",
    name: "Login",
    icon: FaKey,
    iconProps: { className: "text-info" },
    component: "Login",
    layout: "/auth",
  },
];

// Additional routes that are part of the combined routes
export const additionalRoutes = [
  {
    path: "/training-data-hub/policies/:itemId",
    name: "Policies",
    icon: MdPolicy,
    iconProps: { className: "text-primary" },
    component: "PoliciesTable",
    layout: "/admin",
    parentMenu: "/admin/training-data-hub",
  },
  {
    path: "/training-data-hub/suggestions/:itemId",
    name: "Suggestions",
    icon: MdLightbulb,
    iconProps: { className: "text-primary" },
    component: "SuggestionsTable",
    layout: "/admin",
    parentMenu: "/admin/training-data-hub",
  },
];

// Combined routes for the entire application
const routes = [
  {
    path: "/login",
    name: "Login",
    icon: FaKey,
    iconProps: { className: "text-info" },
    component: "Login",
    layout: "/auth",
  },
  ...additionalRoutes,
  ...adminRoutes,
  ...formRoutes,
];

export default routes;
