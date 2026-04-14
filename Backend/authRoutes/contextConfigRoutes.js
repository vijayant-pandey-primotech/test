import express from "express";
import { getContextConfig, saveContextConfig } from "../authControllers/contextConfigController.js";
import { authorize } from "../middleware/adminAuthMiddleware.js";

const contextConfigRoutes = express.Router();

contextConfigRoutes.get("/context-config", authorize("read:context-config"), getContextConfig);
contextConfigRoutes.post("/context-config", authorize("write:context-config"), saveContextConfig);

export default contextConfigRoutes;
