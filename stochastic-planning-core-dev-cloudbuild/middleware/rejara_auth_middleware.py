#!/usr/bin/env python3
"""
Rejara Authentication middleware for double-encrypted JWT tokens
Supports only Rejara frontend with HS512 + AES-256-CBC encryption
"""

from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any

from services.dual_jwt_service import dual_jwt_service
from core.logger import log_info, log_error

# HTTP Bearer token scheme
security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)  # Don't raise error if no token

class RejaraAuthMiddleware:
    """
    Authentication middleware for Rejara frontend
    Only supports double-encrypted JWT tokens (HS512 + AES-256-CBC)
    """

    @staticmethod
    async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
        """
        Extract and validate Rejara double-encrypted JWT token from Authorization header

        Args:
            credentials: HTTPAuthorizationCredentials from FastAPI security

        Returns:
            Dict containing user data from token

        Raises:
            HTTPException: If token is invalid or expired
        """
        token = credentials.credentials

        # Verify Rejara token only (try with both secrets)
        payload = dual_jwt_service._verify_rejara_token(token, use_access_secret=False)
        if not payload:
            payload = dual_jwt_service._verify_rejara_token(token, use_access_secret=True)

        if payload is None:
            log_error(f"Invalid Rejara JWT token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token. Only Rejara tokens are supported.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Check if token is expired
        if dual_jwt_service.is_token_expired(token):
            log_error(f"Rejara JWT token has expired")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired. Please login again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Normalize payload for consistent access
        normalized_payload = RejaraAuthMiddleware._normalize_payload(payload)

        log_info(f"User authenticated successfully (Rejara token, user: {normalized_payload.get('email', 'N/A')})")

        return normalized_payload

    @staticmethod
    def _normalize_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize Rejara payload fields for consistent access

        Rejara format:
            { id, email, userName, userImage, timeZone }

        Normalized format:
            { id, email, userName, firstName, user_guid, userImage, timeZone, _token_type }
        """
        normalized = payload.copy()
        normalized["_token_type"] = "rejara"

        # Ensure firstName is mapped from userName
        normalized["firstName"] = payload.get("userName", payload.get("firstName", ""))

        # Ensure user_guid exists
        if "id" in payload and "user_guid" not in payload:
            normalized["user_guid"] = str(payload["id"])

        return normalized

    @staticmethod
    async def get_current_user_optional(
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional)
    ) -> Optional[Dict[str, Any]]:
        """
        Extract and validate Rejara JWT token from Authorization header (optional)
        Returns None if no token or invalid token instead of raising exception

        Args:
            credentials: Optional HTTPAuthorizationCredentials from FastAPI security

        Returns:
            Dict containing user data from token or None
        """
        if not credentials:
            return None

        token = credentials.credentials

        # Verify Rejara token only
        payload = dual_jwt_service._verify_rejara_token(token, use_access_secret=False)
        if not payload:
            payload = dual_jwt_service._verify_rejara_token(token, use_access_secret=True)

        if payload is None or dual_jwt_service.is_token_expired(token):
            return None

        # Normalize payload
        return RejaraAuthMiddleware._normalize_payload(payload)

# Create dependency functions for easy use in routes
get_current_user = RejaraAuthMiddleware.get_current_user
get_current_user_optional = RejaraAuthMiddleware.get_current_user_optional
