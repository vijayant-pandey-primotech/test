import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import CryptoJS from "crypto-js";



export const generateToken = (payload, expiresIn = "24h") => {
  // Create a modified payload with obfuscated data
  const securePayload = {
    // Add a random nonce to each token to make them unique
    nonce: CryptoJS.lib.WordArray.random(16).toString(),
    // Current timestamp to prevent replay attacks
    iat: Math.floor(Date.now() / 1000),
    // Encrypt the actual data
    data: CryptoJS.AES.encrypt(
      JSON.stringify(payload),
      process.env.PAYLOAD_ENCRYPTION_KEY
    ).toString()
  };
  
  // Use a stronger algorithm (HS512 instead of default HS256)
  return jwt.sign(securePayload, process.env.JWT_SECRET, { 
    expiresIn,
    algorithm: 'HS512'
  });
};

export const generateAccessToken = (
  payload,
  secret = process.env.ACCESS_TOKEN_SECRET,
  expiresIn = "1h",
) => {
  // Create a modified payload with obfuscated data
  const securePayload = {
    // Add a random nonce to each token to make them unique
    nonce: CryptoJS.lib.WordArray.random(16).toString(),
    // Current timestamp to prevent replay attacks
    iat: Math.floor(Date.now() / 1000),
    // Encrypt the actual data
    data: CryptoJS.AES.encrypt(
      JSON.stringify(payload),
      process.env.PAYLOAD_ENCRYPTION_KEY
    ).toString()
  };
  
  // Sign the token with the access token secret (different from JWT_SECRET)
  return jwt.sign(securePayload, secret, {
    expiresIn,
    algorithm: 'HS512'  // Using the same algorithm for consistency
  });
};

export const decryptPassword = async (encryptedPassword) => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedPassword, "Rejara");
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error("Error decrypting password:", error);
    return null;
  }
};

export const encryptData = async (data) => {
  return CryptoJS.AES.encrypt(
    data,
    "Rejara"
  ).toString();
};

export const generate6DigitOTP = async () => {
  const otp = Math.floor(100000 + Math.random() * 900000);
  return jwt.sign({ otp }, process.env.JWT_SECRET, { expiresIn: "2m" });
};


export const verifyToken = (token) => {
  try {
     const decoded = jwt.verify(token, process.env.JWT_SECRET);
     return decoded;
  } catch (error) {
    console.error("Error verifying token:", error);
    return null;
  }
 
};