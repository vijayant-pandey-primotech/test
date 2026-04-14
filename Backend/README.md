# Rejara Admin Backend

A comprehensive Node.js backend service for the Rejara Admin Dashboard, providing APIs for user management, AI agent configuration, content management, and platform administration.

## 🏗️ Architecture Overview 

This backend follows a modular architecture with clear separation of concerns:

```
Rejara-Admin-Backend/
├── authControllers/     # Business logic controllers
├── authRoutes/         # API route definitions
├── config/            # Database and service configurations
├── helpers/           # Utility functions and middleware
├── logger/            # Logging configuration
├── middleware/        # Authentication and validation middleware
├── model/             # Database models (Sequelize ORM)
├── services/          # Business service layer
├── utils/             # Utility functions
└── server.js          # Application entry point
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MySQL database
- Google Cloud Storage account
- Firebase project (for Firestore)

### Installation

1. **Clone and navigate to the project:**

   ```bash
   cd Rejara-Admin-Backend
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root directory with the following variables:

   ```env
   # Database Configuration
   DB_HOST=your_mysql_host
   DB_NAME=your_database_name
   DB_USER=your_database_user
   DB_PASSWORD=your_database_password

   # Server Configuration
   PORT=3000

   # JWT Configuration
   JWT_SECRET=your_jwt_secret_key

   # Google Cloud Configuration
   GOOGLE_CLOUD_PROJECT_ID=your_project_id
   GOOGLE_CLOUD_STORAGE_BUCKET=your_storage_bucket

   # SendGrid Configuration (for emails)
   SENDGRID_API_KEY=your_sendgrid_api_key

   # Firebase Configuration
   FIREBASE_PROJECT_ID=your_firebase_project_id
   ```

4. **Firebase Service Account:**

   - Place your Firebase service account key file as `serviceKey.json` in the root directory
   - This file should contain your Firebase admin SDK credentials

5. **Start the development server:**
   ```bash
   npm start
   ```

The server will start on the specified PORT (default: 3000) with cluster mode enabled for better performance.

## 📚 API Documentation

### Authentication

All admin routes require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### Core API Endpoints

#### Admin Authentication

- `GET /api/admin/new-access-token` - Refresh access token
- `POST /api/admin/login` - Admin login

#### User Management

- `GET /api/admin/users` - Get all users list
- `PUT /api/admin/users/:id` - Update user by ID
- `DELETE /api/admin/users/:id` - Delete user by ID
- `GET /api/admin/api-logs/:userId` - Get API logs for specific user

#### Content Management

- `GET /api/admin/stories` - Get all stories
- `PUT /api/admin/stories/:id` - Update story
- `DELETE /api/admin/stories/:id` - Delete story
- `GET /api/admin/chapters` - Get all chapters
- `GET /api/admin/items` - Get all items
- `PUT /api/admin/items/:id` - Update item
- `DELETE /api/admin/items/:id` - Delete item

#### AI Agents & Assistants

- `GET /api/admin/assistants` - Get all AI assistants
- `GET /api/admin/assistants/:id` - Get assistant by ID
- `PUT /api/admin/assistants/:id` - Update assistant
- `DELETE /api/admin/assistants/:id` - Delete assistant

#### Platform Management

- `GET /api/platforms` - Get all platforms
- `POST /api/platforms` - Create new platform
- `PUT /api/platforms/:id` - Update platform
- `DELETE /api/platforms/:id` - Delete platform

#### Task Management

- `GET /api/admin/tasks` - Get all tasks
- `POST /api/admin/tasks` - Create new task
- `PUT /api/admin/tasks/:id` - Update task
- `DELETE /api/admin/tasks/:id` - Delete task

#### Widgets Management

- `GET /api/admin/widgets` - Get all widgets
- `POST /api/admin/widgets` - Create new widget
- `PUT /api/admin/widgets/:id` - Update widget
- `DELETE /api/admin/widgets/:id` - Delete widget

## 🗄️ Database Models

The application uses Sequelize ORM with MySQL. Key models include:

- **AdminMaster** - Admin user accounts
- **UserMasterModel** - End user accounts
- **StoriesMasters** - Story content management
- **ChapterMaster** - Story chapters
- **ItemMaster** - Story items/content pieces
- **Platform** - Platform configurations
- **TaskMaster** - Task management
- **Widgets** - Widget configurations
- **Policy** - Content policies
- **Recommendations** - AI recommendations

## 🔧 Key Features

### Cluster Mode

The application runs in cluster mode, utilizing all CPU cores for better performance and reliability.

### Logging

Comprehensive logging system using Winston:

- Request/response logging with Morgan
- Error logging
- Application logs stored in `/logs` directory

### File Upload

Support for file uploads using:

- Multer for handling multipart/form-data
- Google Cloud Storage for file storage
- Image processing with Sharp

### Authentication & Authorization

- JWT-based authentication
- Role-based access control
- Admin-specific middleware protection

### Database Connection

- Connection pooling for optimal performance
- Automatic reconnection handling
- Transaction support

## 🛠️ Development Guidelines

### Code Structure

- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic layer
- **Models**: Database schema definitions
- **Helpers**: Utility functions and common operations
- **Middleware**: Request processing and validation

### Error Handling

The application includes comprehensive error handling:

- Global error middleware
- Structured error responses
- Logging of all errors

### Security Features

- CORS configuration
- Input validation with Joi
- SQL injection prevention through Sequelize
- JWT token validation
- File upload security

## 🔍 Troubleshooting

### Common Issues

1. **Database Connection Failed**

   - Verify database credentials in `.env`
   - Ensure MySQL server is running
   - Check network connectivity

2. **JWT Token Issues**

   - Verify JWT_SECRET in environment variables
   - Check token expiration
   - Ensure proper Authorization header format

3. **File Upload Problems**

   - Verify Google Cloud Storage configuration
   - Check service account permissions
   - Ensure proper bucket configuration

4. **Port Already in Use**
   - Change PORT in `.env` file
   - Kill existing processes: `lsof -ti:3000 | xargs kill -9`

### Logs Location

- Application logs: `./logs/all.log`
- Error logs: `./logs/error.log`

## 🚀 Deployment

### Production Considerations

- Set NODE_ENV=production
- Use PM2 for process management
- Configure proper logging levels
- Set up database connection pooling
- Enable HTTPS
- Configure proper CORS origins

### Docker Support

The project includes a Dockerfile for containerized deployment.

## 🤝 Contributing

1. Follow the existing code structure
2. Add proper error handling
3. Include logging for important operations
4. Update documentation for new features
5. Test thoroughly before submitting

## 📞 Support

For technical support or questions about the codebase, please refer to the development team or create an issue in the project repository.
