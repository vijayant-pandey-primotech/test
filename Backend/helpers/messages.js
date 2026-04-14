export const ERROR_MESSAGES = {
  // Authentication Errors
  INVALID_CREDENTIALS: "Invalid credentials.",
  INVALID_EMAIL:"Invalid email.",
  INVALID_TOKEN: "Invalid or expired token.",
  INVALID_REFRESH_TOKEN: "Invalid or expired refresh token.",
  INVALID_OTP: "Verification Code does not match.",
  OTP_EXPIRED: "Verification Code has expired.",
  EMAIL_EXISTS: "Email ID already exists.",
  MISSING_OTP: "Verification Code is missing.",
  INVALID_OLD_PASSWORD: "Old password is Invalid.",
  SAME_PASSWORD: "New password cannot be same as old password.",
  UNAUTHORIZED: "User is not authorized.",
  FILE_SIZE_EXCEEDS_LIMIT: "File size exceeds 5MB limit.",
  SESSION_EXPIRED: "Your session has expired.",
  FILE_SIZE_EXCEEDS_LIMIT_10MB: "File size exceeds 10MB limit.",
  INVALID_FILE_TYPE: "Invalid file type. Only Excel files (.xlsx, .xls) are allowed.",
  // User Related Errors
  USER_NOT_FOUND: "User not found.",
  PROFILE_UPDATE_FAILED: "Failed to update profile.",
  PASSWORD_UPDATE_FAILED: "Failed to update password.",
  IMAGE_UPLOAD_FAILED: "Failed to upload profile picture.",
  IMAGE_DELETE_FAILED: "Failed to delete profile picture.",
  NO_IMAGE_FOUND: "Profile picture not found.",
  USER_DELETION_FAILED: "Failed to remove user data.",
  PROFILE_NOT_FOUND: "User profile not found.",
  NEW_PASS_REQUIRED:"New password is required.",
  USER_NOT_FOUND_IN_TORCH:"User not found in torch.",
  // Location Related Errors
  COUNTRY_NOT_FOUND: "Country not found.",
  STATE_NOT_FOUND: "State not found.",
  CITY_NOT_FOUND: "City not found.",
  MISSING_COUNTRY_ID: "Country id is required.",
  MISSING_STATE_ID: "State id is required.",
  NO_LOCATIONS_FOUND: "No Data found !!",

  // Story Related Errors
  STORY_CREATE_FAILED: "Failed to create story details.",
  STORY_UPDATE_FAILED: "Failed to update story.",
  STORY_NOT_FOUND: "Story not found.",
 

  // General Errors
  INTERNAL_SERVER: "Something went wrong. Please try again later.",
  INVALID_REQUEST: "Invalid request parameters.",
  MISSING_REQUIRED_FIELDS: "Required fields are missing.",
  DATABASE_ERROR: "Database error occurred.",
  FILE_UPLOAD_ERROR: "No file uploaded.",
  INVALID_EMAIL: "Enter your registered email ID.",
  EMAIL_SEND_FAILED:
    "Unable to send request at this time. Please try again later.",
    FAILED_TO_SEND_EMAIL:"Failed to send email.",

  // Migration Related Errors
  ALL_READY_EXISTS: "User already exists in our system. Please login to continue.",
};

export const SUCCESS_MESSAGES = {
  // Authentication Success
  USER_NOT_VERIFIED: "Please verify your email ID.",
  SIGNUP_SUCCESS: "Verification Code has been sent to your email ID.",
  LOGIN_SUCCESS: "Welcome! Your login was successful.",
  LOGOUT_SUCCESS: "Logout successful.",
  PASSWORD_RESET_INITIATED: "Verification Code has been sent to your email ID.",
  PASSWORD_UPDATED: "Password updated successfully.",
  OTP_VERIFIED: "Verification Code matched!",
  OTP_RESENT: "A new verification code has been sent to your email address.",
  SECURITY_CODE_SENT: "Security code sent to your email ID.",
  NO_STORIES_FOUND: "No records found.",
  // User Related Success
  PROFILE_UPDATED: "Profile updated successfully.",
  IMAGE_UPLOADED: "Profile picture updated successfully.",
  IMAGE_DELETED: "Profile picture deleted successfully.",
  USER_DELETED: "User account and associated data successfully removed.",
  PROFILE_FETCHED: "User profile data retrieved successfully.",
  USERS_FETCHED: "Users data retrieved successfully.",

  // Location Related Success
  COUNTRIES_FETCHED: "All Countries Data retrieved.",
  STATES_FETCHED: "All State Data retrieved.",
  CITIES_FETCHED: "All Cities Data retrieved.",

  // Story Related Success
  STORY_CREATED: "Story details have been successfully created.",
  STORIES_FETCHED: "Stories data retrieved successfully.",
  GATHER_ASSIST_FETCHED: "Gather assist data retrieved successfully.",
  CHAPTERS_FETCHED: "Chapters data retrieved successfully.",

  // Session Related Success
  SESSION_RESTORED: "Session restored successfully.",
  TOKEN_GENERATED: "Token generated successfully.",

  MIGRATION_MAIL_SENT: "Migration mail sent successfully.",
};

export const INFO_MESSAGES = {
  // Process Status Messages
  UPDATING_PROFILE: "Updating user profile...",
  CREATING_STORY: "Creating story details...",
  PROCESSING_REQUEST: "Processing your request...",
  FETCHING_DATA: "Fetching data...",
  DELETING_USER: "Deleting user data...",
  UPLOADING_IMAGE: "Uploading profile picture...",

  // Verification Messages
  VERIFYING_OTP: "Verifying security code...",
  VERIFYING_CREDENTIALS: "Verifying credentials...",
  CHECKING_SESSION: "Checking session status...",

  // Data Sync Messages
  SYNCING_STORY: "Syncing story data...",
  UPDATING_FIREBASE: "Updating Firebase records...",
  PROCESSING_DELETION: "Processing data deletion...",
};

export const VALIDATION_MESSAGES = {
  REQUIRED_EMAIL: "Email is required.",
  REQUIRED_PASSWORD: "Password is required.",
  REQUIRED_NAME: "Name is required.",
  REQUIRED_PHONE: "Phone number is required.",
  INVALID_EMAIL_FORMAT: "Invalid email format.",
  INVALID_PHONE_FORMAT: "Invalid phone number format.",
  INVALID_PASSWORD_FORMAT: "Password must be at least 8 characters long.",
  REQUIRED_DOB: "Date of birth is required.",
  REQUIRED_LOCATION: "Location details are required.",
  REQUIRED_TOKEN: "Token is required.",
};
