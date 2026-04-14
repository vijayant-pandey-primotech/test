import jwt from 'jsonwebtoken';
import CryptoJS from 'crypto-js';
import adminMaster from '../model/adminMaster.js';

export const jwtAuth = async (req, res, next) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Extract token from Authorization header
      const token = req.headers.authorization.split(" ")[1];
      
      // Verify the token using HS512 algorithm
      const decoded = await jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS512']
      });
      
      // Decrypt the actual data from the secure payload
      const decryptedData = CryptoJS.AES.decrypt(
        decoded.data,
        process.env.PAYLOAD_ENCRYPTION_KEY
      ).toString(CryptoJS.enc.Utf8);
      console.log("decryptedData", decryptedData)
      // Parse the decrypted JSON data
      const userData = JSON.parse(decryptedData);
      
      // Check if user exists in database
      let checkUser;
      if (userData.id) {
        checkUser = await adminMaster.findOne({ where: { adminId: userData.id } });
      } else if (userData.email) {
        // For reset password scenario when only email is provided
        checkUser = await adminMaster.findOne({ where: { emailAddress: userData.email } });
      }
      
      if (checkUser) {
        // Attach the decrypted user data to the request
        req.user = userData;
        next();
      } else {
        res.status(401).json("User not found in database");
      }
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        res.status(401).json("Token expired. Please login again.");
      } else if (err.name === 'JsonWebTokenError') {
        res.status(401).json("Invalid token. Please login again.");
      } else {
        console.error("JWT Auth Error:", err.message);
        res.status(400).json(err.message);
      }
    }
  } else {
    res.status(401).json("Not Authorized, No token, Need to Re-Login");
  }
};