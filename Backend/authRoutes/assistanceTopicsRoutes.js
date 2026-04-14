import express from "express";
import { getAllAssistanceTopics, createAssistanceTopic, updateAssistanceTopic, deleteAssistanceTopic } from "../authControllers/assistanceTopicsControllers.js";
import { authorize } from "../middleware/adminAuthMiddleware.js";

const assistanceTopicsRoutes = express.Router();

console.log('hererrererrererererrererreerr');
// Get all assistance topics
assistanceTopicsRoutes.route("/").get(authorize("read:assistance-topics"), getAllAssistanceTopics);

// === ACCEPT: Add POST route to create a new assistance topic ===
assistanceTopicsRoutes.route("/").post(authorize("write:assistance-topics"), createAssistanceTopic);

// === REJECT: Do not add POST route (keep only GET) ===
/*
// assistanceTopicsRoutes.route("/").post(authorize("write:assistance-topics"), createAssistanceTopic);
*/

// === ACCEPT: Add PUT route to update an existing assistance topic by ID ===
assistanceTopicsRoutes.route("/:id").put(authorize("write:assistance-topics"), updateAssistanceTopic);

// === ACCEPT: Add DELETE route to delete an existing assistance topic by ID ===
assistanceTopicsRoutes.route("/:id").delete(authorize("delete:assistance-topics"), deleteAssistanceTopic);

// === REJECT: Do not add PUT route (no update endpoint) ===
/*
// assistanceTopicsRoutes.route("/:id").put(authorize("write:assistance-topics"), updateAssistanceTopic);
*/

export default assistanceTopicsRoutes; 