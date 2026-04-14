# Rejara Admin Frontend

A modern React-based admin dashboard for managing the Rejara platform, built with React 18, Bootstrap 4, and various UI components for comprehensive platform administration.

## 🏗️ Architecture Overview 

This frontend application is built using React with a component-based architecture:

```
Rejara-Admin-Frontend/
├── public/                 # Static assets and HTML template
├── src/
│   ├── assets/            # Images, fonts, CSS, and SCSS files
│   ├── components/        # Reusable React components
│   ├── layouts/           # Page layout components
│   ├── services/          # API service layer
│   ├── utils/             # Utility functions and helpers
│   ├── variables/         # Chart configurations and constants
│   ├── views/             # Page components and views
│   ├── routes.js          # Application routing configuration
│   └── index.js           # Application entry point
└── package.json           # Dependencies and scripts
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn package manager
- Access to Rejara Admin Backend API

### Installation

1. **Navigate to the project directory:**
   ```bash
   cd Rejara-Admin-Frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Configuration:**
   Create a `.env` file in the root directory:
   ```env
   # API Configuration
   REACT_APP_API_BASE_URL=http://localhost:3000
   REACT_APP_AI_SERVICES_URL=your_ai_services_url
   REACT_APP_AUTH_SERVICE_URL=your_auth_service_url

   # Firebase Configuration
   REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
   REACT_APP_FIREBASE_PROJECT_ID=your_firebase_project_id

   # Other Configuration
   REACT_APP_ENVIRONMENT=development
   ```

4. **Start the development server:**
   ```bash
   npm start
   ```

The application will open in your browser at `http://localhost:3000`.

## 🎨 UI Components & Features

### Dashboard Layout
- **Sidebar Navigation**: Organized menu with grouped sections
- **Header**: User profile, notifications, and quick actions
- **Main Content Area**: Dynamic content based on selected route
- **Footer**: Application information and links

### Key Feature Modules

#### 🧑‍💼 User Management
- **User Table**: Complete user listing with search and filters
- **User Details**: Individual user profile management
- **API Logs**: User activity and API usage tracking

#### 🤖 AI Engine
- **Training Data Hub**: Manage stories, chapters, and content
- **Platform Agent Studio**: Configure and manage AI agents
- **Vision Dataset**: Image management for AI training
- **Rejara AI Model**: Direct access to AI model interface

#### 💡 Intelligence
- **Action Intelligence**: Manage intelligent actions and workflows
- **Agent Actions**: Configure dynamic functions for agents
- **Image Classifier**: External tool integration

#### 📝 Content Management
- **Content Generation**: External content creation tools
- **Content Topic Details**: Manage content topics and categories

#### 🏢 Platform Management
- **Platforms**: Configure and manage different platforms
- **Task Management**: Create and manage platform tasks
- **Widgets Management**: Configure dashboard widgets

## 🛠️ Technical Stack

### Core Technologies
- **React 18.2.0**: Modern React with hooks and functional components
- **React Router DOM 6.21.1**: Client-side routing
- **Bootstrap 4.6.2**: Responsive UI framework
- **Reactstrap 8.10.0**: Bootstrap components for React

### UI & Visualization
- **Chart.js 2.9.4**: Data visualization and charts
- **React Beautiful DnD**: Drag and drop functionality
- **React Icons**: Comprehensive icon library
- **RSuite**: Additional UI components

### State Management & Data
- **Axios**: HTTP client for API calls
- **Crypto-js**: Encryption utilities
- **Moment.js**: Date and time manipulation
- **js-cookie**: Cookie management

### Development Tools
- **Sass**: CSS preprocessing
- **React Scripts**: Build and development tools
- **Cross-env**: Environment variable management

## 📱 Responsive Design

The application is fully responsive and works across:
- **Desktop**: Full-featured dashboard experience
- **Tablet**: Optimized layout for medium screens
- **Mobile**: Condensed navigation and touch-friendly interface

## 🔐 Authentication & Security

### Authentication Flow
1. **Login Page**: Secure admin authentication
2. **JWT Token Management**: Automatic token refresh
3. **Protected Routes**: Route-level access control
4. **Session Management**: Automatic logout on token expiry

### Security Features
- **Encrypted Storage**: Sensitive data encryption
- **CORS Protection**: Cross-origin request security
- **Input Validation**: Client-side form validation
- **Secure API Communication**: HTTPS and token-based auth

## 🎯 Key Components

### Navigation & Layout
- **Sidebar**: `src/components/Sidebar/` - Main navigation component
- **Navbar**: `src/components/Navbars/` - Top navigation bar
- **Footer**: `src/components/Footers/` - Application footer

### Core Views
- **Dashboard**: `src/views/Index.js` - Main dashboard overview
- **User Management**: `src/views/All/` - User-related views
- **Platform Views**: `src/views/platform/` - Platform management
- **Widget Views**: `src/views/widgets/` - Widget configuration

### Services Layer
- **API Services**: `src/services/` - Centralized API communication
  - `authService.js` - Authentication APIs
  - `userService.js` - User management APIs
  - `platformService.js` - Platform APIs
  - `storyService.js` - Content management APIs
  - `widgetService.js` - Widget APIs

### Utilities
- **Auth Utils**: `src/utils/authUtils.js` - Authentication helpers
- **Axios Config**: `src/utils/axiosConfig.js` - HTTP client configuration
- **Filter Utils**: `src/utils/filterUtils.js` - Data filtering utilities

## 🔧 Development Guidelines

### Component Structure
```jsx
// Standard component structure
import React, { useState, useEffect } from 'react';
import { Container, Row, Col } from 'reactstrap';

const ComponentName = () => {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    // Component logic
  }, []);

  return (
    <Container>
      <Row>
        <Col>
          {/* Component content */}
        </Col>
      </Row>
    </Container>
  );
};

export default ComponentName;
```

### API Integration
```javascript
// Service layer example
import apiClient from '../utils/axiosConfig';

export const getUserData = async () => {
  try {
    const response = await apiClient.get('/api/admin/users');
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
};
```

### State Management
- Use React hooks for local state
- Context API for global state when needed
- Service layer for API state management

## 🎨 Styling & Theming

### SCSS Structure
- **Main Styles**: `src/assets/scss/argon-dashboard-react.scss`
- **Component Styles**: Individual component SCSS files
- **Variables**: `src/assets/scss/_variables.scss`
- **Mixins**: `src/assets/scss/_mixins.scss`

### Color Scheme
- **Primary**: Blue tones for main actions
- **Secondary**: Gray tones for secondary elements
- **Success**: Green for positive actions
- **Warning**: Orange for caution states
- **Danger**: Red for destructive actions

## 📊 Data Visualization

### Chart Components
- **Line Charts**: Trend analysis and time-series data
- **Bar Charts**: Comparative data visualization
- **Pie Charts**: Distribution and percentage data
- **Area Charts**: Volume and cumulative data

### Chart Configuration
Charts are configured in `src/variables/charts.js` with customizable:
- Colors and themes
- Animation settings
- Responsive breakpoints
- Data formatting

## 🚀 Build & Deployment

### Development Build
```bash
npm start          # Start development server
npm run build      # Create production build
npm test           # Run test suite
```

### Production Build
```bash
npm run build      # Optimized production build
```

### Docker Deployment
The project includes a Dockerfile for containerized deployment:
```bash
docker build -t rejara-admin-frontend .
docker run -p 3000:80 rejara-admin-frontend
```

## 🔍 Troubleshooting

### Common Issues

1. **API Connection Issues**
   - Verify `REACT_APP_API_BASE_URL` in `.env`
   - Check backend server status
   - Verify CORS configuration

2. **Authentication Problems**
   - Clear browser localStorage
   - Check JWT token validity
   - Verify login credentials

3. **Build Failures**
   - Clear node_modules: `rm -rf node_modules && npm install`
   - Check for dependency conflicts
   - Verify Node.js version compatibility

4. **Styling Issues**
   - Rebuild SCSS: `npm run compile:scss`
   - Clear browser cache
   - Check for CSS conflicts

### Performance Optimization
- **Code Splitting**: Implement lazy loading for routes
- **Image Optimization**: Compress and optimize images
- **Bundle Analysis**: Use webpack-bundle-analyzer
- **Caching**: Implement proper caching strategies

## 🧪 Testing

### Testing Strategy
- **Unit Tests**: Component-level testing
- **Integration Tests**: API integration testing
- **E2E Tests**: End-to-end user flow testing

### Running Tests
```bash
npm test           # Run all tests
npm test -- --coverage  # Run with coverage report
```

## 🤝 Contributing

### Development Workflow
1. **Feature Development**: Create feature branches
2. **Code Review**: Submit pull requests
3. **Testing**: Ensure all tests pass
4. **Documentation**: Update relevant documentation

### Code Standards
- **ESLint**: Follow configured linting rules
- **Prettier**: Use consistent code formatting
- **Component Naming**: Use PascalCase for components
- **File Organization**: Group related files together

## 📞 Support & Resources

### External Links
- **Production Environment**: https://app.admin.rejara.com/
- **Explore Agent Studio**: https://dev.explore-agent-admin.rejara.com/
- **Content Generation**: External content generation tools
- **Image Classifier**: AI-powered image classification

### Documentation
- **React Documentation**: https://reactjs.org/docs/
- **Bootstrap Documentation**: https://getbootstrap.com/docs/4.6/
- **Reactstrap Components**: https://reactstrap.github.io/

For technical support or questions about the frontend codebase, please refer to the development team or create an issue in the project repository.