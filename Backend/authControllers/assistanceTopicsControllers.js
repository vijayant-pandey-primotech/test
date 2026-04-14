import { AssistanceTopics } from "../model/index.js";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../helpers/messages.js";
import { Op } from "sequelize";

// Get all assistance topics
export const getAllAssistanceTopics = async (req, res) => {
  try {
    const { 
      category, 
      assistance_type, 
      customer_journey_stage, 
      target_age_segment
    } = req.query;
    
    const whereClause = {};
    if (category) whereClause.category = { [Op.like]: `%${category}%` };
    if (assistance_type) whereClause.assistance_type = { [Op.like]: `%${assistance_type}%` };
    if (customer_journey_stage) whereClause.customer_journey_stage = { [Op.like]: `%${customer_journey_stage}%` };
    if (target_age_segment) whereClause.target_age_segment = { [Op.like]: `%${target_age_segment}%` };
    
    const rows = await AssistanceTopics.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']] // Sort by latest added first
    });
    
    const response = {
      status: 200,
      message: SUCCESS_MESSAGES.STORIES_FETCHED,
      body: {
        data: rows
      }
    };
    
    console.log('API Response:', JSON.stringify(response, null, 2));
    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching assistance topics:", error);
    return res.status(500).json({
      status: 500,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
      error: error.message,
    });
  }
};

// === ACCEPT: Create a new assistance topic (insert data) ===
export const createAssistanceTopic = async (req, res) => {
  try {
    const {
      category,
      assistance_type,
      customer_journey_stage,
      target_age_segment,
      topic,
      content,
      starting_paragraph,
      ending_paragraph
    } = req.body;

    // Basic validation (customize as needed)
    if (!topic || !content) {
      return res.status(400).json({
        status: 400,
        message: "Topic and content are required."
      });
    }

    const newTopic = await AssistanceTopics.create({
      category,
      assistance_type,
      customer_journey_stage,
      target_age_segment,
      topic,
      content,
      starting_paragraph,
      ending_paragraph
    });

    return res.status(201).json({
      status: 201,
      message: "Assistance topic created successfully.",
      body: newTopic
    });
  } catch (error) {
    console.error("Error creating assistance topic:", error);
    return res.status(500).json({
      status: 500,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
      error: error.message,
    });
  }
};

// === REJECT: Do not add createAssistanceTopic API (no change) ===
/*
// export const createAssistanceTopic = async (req, res) => {
//   return res.status(501).json({ message: "Not implemented" });
// };
*/

// === ACCEPT: Update an existing assistance topic by ID ===
export const updateAssistanceTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;
    const topic = await AssistanceTopics.findByPk(id);
    if (!topic) {
      return res.status(404).json({
        status: 404,
        message: "Assistance topic not found."
      });
    }
    await topic.update(updateFields);
    return res.status(200).json({
      status: 200,
      message: "Assistance topic updated successfully.",
      body: topic
    });
  } catch (error) {
    console.error("Error updating assistance topic:", error);
    return res.status(500).json({
      status: 500,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
      error: error.message,
    });
  }
};

// === REJECT: Do not add updateAssistanceTopic API (no change) ===
/*
// export const updateAssistanceTopic = async (req, res) => {
//   return res.status(501).json({ message: "Not implemented" });
// };
*/ 

// === ACCEPT: Delete an assistance topic by ID ===
export const deleteAssistanceTopic = async (req, res) => {
  try {
    const { id } = req.params;
    const topic = await AssistanceTopics.findByPk(id);
    if (!topic) {
      return res.status(404).json({
        status: 404,
        message: "Assistance topic not found."
      });
    }
    await topic.destroy();
    return res.status(200).json({
      status: 200,
      message: "Assistance topic deleted successfully."
    });
  } catch (error) {
    console.error("Error deleting assistance topic:", error);
    return res.status(500).json({
      status: 500,
      message: ERROR_MESSAGES.INTERNAL_SERVER,
      error: error.message,
    });
  }
};

// === REJECT: Do not add deleteAssistanceTopic API (no change) ===
/*
// export const deleteAssistanceTopic = async (req, res) => {
//   return res.status(501).json({ message: "Not implemented" });
// };
*/ 