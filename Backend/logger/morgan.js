import morgan from 'morgan';
import Logger from './logger.js';
import { db } from '../config/firebaseDb.js';

const stream = {
    write: async (message) => {
        Logger.http(message.trim());
    },
};

export const logRequestDetails = async (req, res, next) => {
    req._startTime = new Date(); // Capture start time
    const requestBody = { ...req.body };
  
    const originalSend = res.send;
    res.send = function (body) {
      try {
        res.locals.apiResponse = JSON.parse(body);
      } catch (error) {
        res.locals.apiResponse = body; // Store as-is if not JSON
      }
      return originalSend.call(this, body);
    };
  
    res.on("finish", async () => {
      const responseTime = Date.now() - req._startTime.getTime();
      const userId = req.user?.id || null;
      const now = new Date();
      const logData = {
        apiUrl: `${req.method} ${req.originalUrl}`,
        timestamp: now,
        userId,
        requestBody,
        apiResponse: res.locals.apiResponse,
        responseTime: `${responseTime} ms`,
        responseSize: res.get("Content-Length") || 0,
        responseStatus: res.statusCode,
      };
  
      try {
        // await db.collection('apiLogs').add(logData);
        console.log('Log saved to Firebase');
    } catch (error) {
        console.error('Error saving log to Firebase:', error);
    }
    });
  
    next();
  };
  
morgan.token("userId", (req) => {
  return req.user && req.user.id ? req.user.id : null;
});
const morganMiddleware = morgan(':method :url :status :res[content-length] - :response-time ms :userId', {
    stream: {
        write: async (message) => {
            Logger.http(`${message.trim()}`);
        }
    }
});

export default morganMiddleware;
