#!/usr/bin/env python3
"""
Dual JWT Token Service supporting both simple and double-encrypted JWT
Supports:
1. Simple JWT (HS256) - for current frontend
2. Double-encrypted JWT (HS512 + AES) - for Rejara frontend
"""

import os
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Tuple
from jose import JWTError, jwt
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import padding
import base64
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")
ACCESS_TOKEN_SECRET = os.getenv("ACCESS_TOKEN_SECRET", JWT_SECRET)
PAYLOAD_ENCRYPTION_KEY = os.getenv("PAYLOAD_ENCRYPTION_KEY", "")

# Algorithms
SIMPLE_ALGORITHM = "HS256"
REJARA_ALGORITHM = "HS512"

# Token Expiry
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_HOURS = 24

class DualJWTService:
    """JWT Service supporting both simple and double-encrypted tokens"""

    def __init__(self):
        self.jwt_secret = JWT_SECRET
        self.access_token_secret = ACCESS_TOKEN_SECRET
        # Store the original encryption key as-is for CryptoJS compatibility
        self.encryption_key = PAYLOAD_ENCRYPTION_KEY
        # print(f"[DEBUG] PAYLOAD_ENCRYPTION_KEY loaded: {repr(PAYLOAD_ENCRYPTION_KEY)}")
        # print(f"[DEBUG] Key length: {len(PAYLOAD_ENCRYPTION_KEY)} characters")

    # ==================== SIMPLE JWT METHODS (Current Frontend) ====================

    def create_simple_token(self, data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """
        Create a simple JWT token (HS256) for current frontend

        Args:
            data: User data to encode
            expires_delta: Optional custom expiration

        Returns:
            JWT token string
        """
        to_encode = data.copy()

        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=12)

        to_encode.update({"exp": expire, "iat": datetime.utcnow()})
        encoded_jwt = jwt.encode(to_encode, self.jwt_secret, algorithm=SIMPLE_ALGORITHM)
        return encoded_jwt

    # ==================== REJARA DOUBLE-ENCRYPTED JWT METHODS ====================

    def _aes_encrypt(self, plaintext: str) -> str:
        """
        Encrypt data using AES-256-CBC (compatible with CryptoJS)

        Args:
            plaintext: String to encrypt

        Returns:
            Base64 encoded encrypted string
        """
        # Generate random IV (16 bytes for AES)
        iv = secrets.token_bytes(16)

        # Pad the plaintext
        padder = padding.PKCS7(128).padder()
        padded_data = padder.update(plaintext.encode('utf-8')) + padder.finalize()

        # Encrypt
        cipher = Cipher(
            algorithms.AES(self.encryption_key),
            modes.CBC(iv),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(padded_data) + encryptor.finalize()

        # Combine IV and ciphertext (CryptoJS format)
        encrypted = iv + ciphertext

        # Return base64 encoded
        return base64.b64encode(encrypted).decode('utf-8')

    def _aes_decrypt(self, encrypted_text: str) -> str:
        """
        Decrypt AES-256-CBC encrypted data (compatible with CryptoJS)

        Args:
            encrypted_text: Base64 encoded encrypted string

        Returns:
            Decrypted plaintext string
        """
        try:
            # Decode base64
            encrypted_data = base64.b64decode(encrypted_text)
            # print(f"[DEBUG] Encrypted data length: {len(encrypted_data)} bytes")
            # print(f"[DEBUG] First 16 bytes: {encrypted_data[:16]}")

            # CryptoJS uses "Salted__" prefix for OpenSSL format
            if encrypted_data.startswith(b'Salted__'):
                # print(f"[DEBUG] CryptoJS OpenSSL format detected")
                # Extract salt (8 bytes after "Salted__")
                salt = encrypted_data[8:16]
                ciphertext = encrypted_data[16:]
                # print(f"[DEBUG] Salt: {salt.hex()}")
                # print(f"[DEBUG] Ciphertext length: {len(ciphertext)} bytes")

                # Derive key and IV from passphrase using EVP_BytesToKey (MD5)
                from hashlib import md5

                # Ensure passphrase is bytes
                if isinstance(self.encryption_key, str):
                    passphrase = self.encryption_key.encode('utf-8')
                else:
                    passphrase = self.encryption_key

                # print(f"[DEBUG] Passphrase for key derivation: {repr(passphrase)}")

                # EVP_BytesToKey algorithm
                key_iv = b''
                prev = b''
                while len(key_iv) < 48:  # 32 bytes key + 16 bytes IV
                    prev = md5(prev + passphrase + salt).digest()
                    key_iv += prev

                key = key_iv[:32]
                iv = key_iv[32:48]

                # print(f"[DEBUG] Derived key: {key.hex()}")
                # print(f"[DEBUG] Derived IV: {iv.hex()}")
                # print(f"[DEBUG] Derived key length: {len(key)}, IV length: {len(iv)}")

                # Decrypt
                cipher = Cipher(
                    algorithms.AES(key),
                    modes.CBC(iv),
                    backend=default_backend()
                )
                decryptor = cipher.decryptor()
                padded_plaintext = decryptor.update(ciphertext) + decryptor.finalize()
                # print(f"[DEBUG] Decrypted padded plaintext length: {len(padded_plaintext)} bytes")
                # print(f"[DEBUG] Last 16 bytes (padding): {padded_plaintext[-16:].hex()}")
            else:
                # Standard format: IV + ciphertext
                # print(f"[DEBUG] Standard AES format detected")
                iv = encrypted_data[:16]
                ciphertext = encrypted_data[16:]

                # Decrypt
                cipher = Cipher(
                    algorithms.AES(self.encryption_key),
                    modes.CBC(iv),
                    backend=default_backend()
                )
                decryptor = cipher.decryptor()
                padded_plaintext = decryptor.update(ciphertext) + decryptor.finalize()

            # Unpad
            unpadder = padding.PKCS7(128).unpadder()
            plaintext = unpadder.update(padded_plaintext) + unpadder.finalize()

            return plaintext.decode('utf-8')
        except Exception as e:
            # print(f"[DEBUG] Decryption exception: {type(e).__name__}: {str(e)}")
            raise

    def create_rejara_token(self, payload: Dict[str, Any], expires_in: timedelta = None, is_access_token: bool = False) -> str:
        """
        Create a double-encrypted JWT token (Rejara format: HS512 + AES)

        Args:
            payload: User data to encode
            expires_in: Token expiration time
            is_access_token: True for access token (30m), False for refresh token (24h)

        Returns:
            Double-encrypted JWT token string
        """
        # Determine secret and expiration
        if is_access_token:
            secret = self.access_token_secret
            expires_delta = expires_in or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        else:
            secret = self.jwt_secret
            expires_delta = expires_in or timedelta(hours=REFRESH_TOKEN_EXPIRE_HOURS)

        # Step 1: Encrypt the payload with AES
        encrypted_data = self._aes_encrypt(json.dumps(payload))

        # Step 2: Create secure payload with nonce and timestamp
        secure_payload = {
            "nonce": secrets.token_hex(16),  # 16-byte random nonce
            "iat": int(datetime.utcnow().timestamp()),
            "data": encrypted_data
        }

        # Step 3: Sign with JWT using HS512
        expire = datetime.utcnow() + expires_delta
        secure_payload["exp"] = int(expire.timestamp())

        return jwt.encode(secure_payload, secret, algorithm=REJARA_ALGORITHM)

    def create_rejara_tokens(self, payload: Dict[str, Any]) -> Tuple[str, str]:
        """
        Create both refresh and access tokens in Rejara format

        Args:
            payload: User data to encode

        Returns:
            Tuple of (refresh_token, access_token)
        """
        refresh_token = self.create_rejara_token(payload, is_access_token=False)
        access_token = self.create_rejara_token(payload, is_access_token=True)
        return refresh_token, access_token

    # ==================== TOKEN VERIFICATION (AUTO-DETECT) ====================

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify JWT token (auto-detects simple or double-encrypted)

        Args:
            token: JWT token string

        Returns:
            Dict containing user data if valid, None if invalid
        """
        # Try Rejara format first (HS512 + AES)
        payload = self._verify_rejara_token(token)
        if payload:
            return payload

        # Try simple format (HS256)
        payload = self._verify_simple_token(token)
        if payload:
            return payload

        # Try with access token secret (for Rejara access tokens)
        payload = self._verify_rejara_token(token, use_access_secret=True)
        if payload:
            return payload

        return None

    def _verify_simple_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify simple JWT token (HS256)"""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=[SIMPLE_ALGORITHM])
            return payload
        except JWTError:
            return None

    def _verify_rejara_token(self, token: str, use_access_secret: bool = False) -> Optional[Dict[str, Any]]:
        """Verify double-encrypted JWT token (HS512 + AES)"""
        try:
            # Step 1: Verify JWT signature
            secret = self.access_token_secret if use_access_secret else self.jwt_secret
            decoded = jwt.decode(token, secret, algorithms=[REJARA_ALGORITHM])

            # Step 2: Extract encrypted data
            encrypted_data = decoded.get("data")
            if not encrypted_data:
                print(f"[DEBUG] No 'data' field in decoded JWT")
                return None

            # Step 3: Decrypt AES payload
            decrypted_json = self._aes_decrypt(encrypted_data)

            # Step 4: Parse JSON
            user_data = json.loads(decrypted_json)

            # Add metadata from JWT layer
            user_data["_token_type"] = "rejara"
            user_data["_iat"] = decoded.get("iat")
            user_data["_exp"] = decoded.get("exp")

            # print(f"[DEBUG] Successfully decrypted Rejara token for user: {user_data.get('email', 'N/A')}")
            return user_data

        except JWTError as e:
            print(f"[DEBUG] JWT Error: {str(e)}")
            return None
        except json.JSONDecodeError as e:
            print(f"[DEBUG] JSON Decode Error: {str(e)}")
            return None
        except Exception as e:
            print(f"[DEBUG] General Error: {type(e).__name__}: {str(e)}")
            return None

    # ==================== UTILITY METHODS ====================

    def get_token_expiration(self, token: str) -> Optional[datetime]:
        """Get expiration time of any token (returns UTC-aware datetime)"""
        try:
            # Try simple JWT first
            payload = jwt.decode(token, self.jwt_secret, algorithms=[SIMPLE_ALGORITHM], options={"verify_signature": False})
            exp_timestamp = payload.get("exp")
            if exp_timestamp:
                return datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        except:
            pass

        try:
            # Try Rejara JWT
            payload = jwt.decode(token, self.jwt_secret, algorithms=[REJARA_ALGORITHM], options={"verify_signature": False})
            exp_timestamp = payload.get("exp")
            if exp_timestamp:
                return datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        except:
            pass

        return None

    def is_token_expired(self, token: str) -> bool:
        """Check if token is expired"""
        exp_time = self.get_token_expiration(token)
        if exp_time:
            return datetime.now(timezone.utc) > exp_time
        return True

    def detect_token_type(self, token: str) -> str:
        """
        Detect token type

        Returns:
            "simple", "rejara", or "unknown"
        """
        if self._verify_simple_token(token):
            return "simple"
        if self._verify_rejara_token(token) or self._verify_rejara_token(token, use_access_secret=True):
            return "rejara"
        return "unknown"

# Create singleton instance
dual_jwt_service = DualJWTService()
