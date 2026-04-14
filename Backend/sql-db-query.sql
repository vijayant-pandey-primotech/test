
-- 4 June 2025

CREATE TABLE adminMaster (
  userId INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  roleId INT DEFAULT 1,
  emailAddress VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(15),
  firstName VARCHAR(255),
  lastName VARCHAR(255),
  password VARCHAR(255),
  is_active INT DEFAULT 0,
  token TEXT,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL
);


CREATE TABLE adminRoles (
  id INT NOT NULL PRIMARY KEY,
  roleName VARCHAR(50) NOT NULL UNIQUE,
  roleDescription TEXT
);

INSERT INTO adminRoles (id, roleName, roleDescription) VALUES
  (1, 'viewer', 'Can only view content, no modification rights'),
  (2, 'admin', 'Has full access to manage users, roles, and content'),
  (3, 'editor', 'Can view and edit content but cannot manage users or roles');

INSERT INTO adminMaster (
  adminId,
  roleId,
  emailAddress,
  phone,
  firstName,
  lastName,
  password,
  is_active,
  token,
  createdAt,
  updatedAt
) VALUES (
  1,
  2,
  'admin@rejara.com',
  NULL,
  'Admin',
  'User',
  '$2b$10$QaY/Og.t25KIV6eWWoSJu.SwjT8lSpDezAoM3aO.94kDRq48RL95e',
  1,
  NULL,
  '2025-05-30 15:07:17',
  '2025-06-03 11:46:31'
);

-- 12 June 2025
ALTER TABLE recommendation_master 
MODIFY COLUMN targetType ENUM('Article', 'Assistant', 'Task');

-- 13 June 2025
ALTER TABLE recommendation_master DROP COLUMN category;


-- 4 July 2025
CREATE TABLE dynamic_functions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    language VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'REQUESTED',
    code LONGTEXT,
    input_schema JSON,
    output_schema JSON,
    requested_by VARCHAR(255),
    developed_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CHECK (status IN ('REQUESTED', 'IN_DEVELOPMENT', 'PENDING_TESTING', 'ACTIVE', 'ARCHIVED'))
);
 
 
 
 
CREATE TABLE rule_mappings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    function_id INT NOT NULL,
    parameters JSON,
    ui_display_type VARCHAR(50),
    execution_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 
    CONSTRAINT fk_function_id FOREIGN KEY (function_id) REFERENCES dynamic_functions(id)
);

-- 8 July 2025
Alter table recommendation_master add column callToAction text;

ALTER TABLE recommendation_master
ADD COLUMN platforms JSON 
    DEFAULT (JSON_ARRAY());


ALTER TABLE recommendation_master 
ADD COLUMN firstMessage TEXT NULL 
AFTER callToAction;

CREATE TABLE IF NOT EXISTS `widgets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `widgetName` VARCHAR(255) NOT NULL UNIQUE,
  `widgetDescription` TEXT NULL,
  `platforms` JSON NOT NULL DEFAULT ('[]'),
  `widgetKey` VARCHAR(100) NOT NULL UNIQUE COMMENT 'Unique key to identify widget in frontend',
  `displayPath` JSON NOT NULL DEFAULT ('{}') COMMENT 'Hierarchical display path: {page: "Home Screen", section: "Left Panel"}',
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_widget_key` (`widgetKey`),
  INDEX `idx_is_active` (`isActive`),
  INDEX `idx_created_at` (`createdAt`)
)


ALTER TABLE widgets DROP INDEX widgetKey;

ALTER TABLE recommendation_master 
ADD COLUMN widgetId INT AFTER id,
ADD CONSTRAINT fk_recommendation_widget
  FOREIGN KEY (widgetId) REFERENCES widgets(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;


-- Create widget_mapping table
CREATE TABLE IF NOT EXISTS `widget_mapping` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL UNIQUE,
  `widget_id` INT NOT NULL,
  `entity_type` ENUM('Assistant', 'Plan') NOT NULL,
  `entity_id` INT NOT NULL,
  `display_path` JSON NOT NULL DEFAULT ('{}'),
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign key constraint
  CONSTRAINT `fk_widget_mapping_widget_id` 
    FOREIGN KEY (`widget_id`) 
    REFERENCES `widgets`(`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE,
    
  -- Indexes for better performance
  INDEX `idx_widget_mapping_entity` (`entity_type`, `entity_id`),
  INDEX `idx_widget_mapping_widget_id` (`widget_id`),
  INDEX `idx_widget_mapping_active` (`is_active`)
)

-- 23 September 2025
ALTER TABLE rejara_development.recommendation_master
ADD COLUMN sequence INT DEFAULT NULL;

ALTER TABLE rejara_development.recommendation_master
ADD COLUMN prerequisite_agents JSON;

-- 27 November 2025
ALTER TABLE rejara_development.recommendation_master
ADD COLUMN publishStatus ENUM('draft', 'published') NOT NULL DEFAULT 'published';

CREATE TABLE activity (
    id INT AUTO_INCREMENT PRIMARY KEY,
    activityName VARCHAR(255) NOT NULL,
    description TEXT NULL,
    status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    platforms JSON NOT NULL DEFAULT ('[]'),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE recommendation_master
ADD COLUMN activityId INT NULL,
ADD CONSTRAINT fk_assistant_activity
    FOREIGN KEY (activityId) REFERENCES activity(id)
    ON DELETE SET NULL;

-- 19 January 2026

-- Add experienceModeId and platformGoalId columns to recommendation_master
ALTER TABLE recommendation_master
ADD COLUMN experienceModeId INT NULL,
ADD COLUMN platformGoalId INT NULL,
ADD CONSTRAINT fk_assistant_experience_mode
    FOREIGN KEY (experienceModeId) REFERENCES experience_modes(id)
    ON DELETE SET NULL,
ADD CONSTRAINT fk_assistant_platform_goal
    FOREIGN KEY (platformGoalId) REFERENCES platform_goals(id)
    ON DELETE SET NULL;

-- 27 January 2026
-- Create platform_tasks table
CREATE TABLE IF NOT EXISTS `platform_tasks` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `platformId` INT NOT NULL,
  `activityId` INT NOT NULL,
  `itemId` JSON NULL DEFAULT NULL,
  `taskName` VARCHAR(255) NOT NULL COMMENT 'Name of onboarding task (e.g., Goal Selection)',
  `taskOrder` INT NOT NULL COMMENT 'Display order in onboarding flow',
  `isMandatory` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Indicates if task is mandatory',
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active' COMMENT 'Task status',
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign key constraints
  CONSTRAINT `fk_platform_task_platform` 
    FOREIGN KEY (`platformId`) 
    REFERENCES `platforms`(`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    
  CONSTRAINT `fk_platform_task_activity` 
    FOREIGN KEY (`activityId`) 
    REFERENCES `taskmaster`(`taskId`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE,
    
  -- Indexes for better performance
  INDEX `idx_platform_task_platform` (`platformId`),
  INDEX `idx_platform_task_activity` (`activityId`),
  INDEX `idx_platform_task_status` (`status`),
  INDEX `idx_platform_task_order` (`taskOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 6 March 2026 Update sample_conversation column to TEXT
ALTER TABLE items_masters 
MODIFY COLUMN sample_conversation TEXT;

-- 1 April 2026: prompts_master — multi-platform scope (array of ids; NULL = legacy single platform_id / all)
ALTER TABLE `prompts_master`
  ADD COLUMN `platform_ids` JSON NULL DEFAULT NULL
  COMMENT 'Sorted unique platform ids for multi-platform prompts'
  AFTER `platform_id`;

-- April 2026 (current app schema): prompts_master uses `prompt_type_id` (FK → prompt_type_lookup.id) and `platform_ids` JSON.
-- Redis keys: prompts:{prompt_function_name}:{platform_id}:{story_id}:{chapter_id} (platform 0 = all platforms).
-- If migrating an older DB that still has VARCHAR `prompt_type` / INT `platform_id`, backfill `prompt_type_id` from
-- prompt_type_lookup then DROP those legacy columns to match Sequelize models.

-- April 2026: immutable publish history (distinct from current is_published)
ALTER TABLE `prompts_master`
  ADD COLUMN `has_been_published` TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 once this row has been published at least once; never reset on unpublish'
  AFTER `is_published`;

UPDATE `prompts_master`
SET `has_been_published` = 1
WHERE `is_published` = 1;

-- April 2026: allow prompts without story binding (story_id optional)
ALTER TABLE `prompts_master`
  MODIFY COLUMN `story_id` INT NULL;

-- 6 April 2026
ALTER TABLE widgets ADD COLUMN widgetTemplateJson JSON DEFAULT NULL;